# Beefcake — kontext

Personlig träningslogg för styrketräning, ersätter ett Excel-ark. Svenskt gränssnitt, bara kilo. Två användare i praktiken: Patrik på dator, hans tjej på mobil. D1 är sanningskälla och IndexedDB är lokal cache.

Live på https://buildapp.se/beefcake/ (GitHub Pages i orgen `buildapp-se`, bas-sökväg `/beefcake/`). Push till `master` bygger och deployar. Server-API:t är deployat som `https://beefcake-api.buildapp.se` (samma namnmönster som `recept-api`) och använder D1 bakom Firebase-inloggning. Flyttat från orgutveckling.se 2026-09-04.

**Den här filen äger domänmodellen och konventionerna.** Upprepa dem inte i andra filer, länka hit. `AGENTS.md` beskriver hur man arbetar i repot, `BACKLOG.md` vad som är kvar, `HANDOFF.md` var arbetet står just nu.

## Kärnuppgiften

> Öppna appen, välj dagens pass, se vad du lyfte förra gången, justera vikterna, spara. Sedan se att du blir starkare.

## Begrepp

- **Exercise** är en övning i katalogen. Har id, så ett namnbyte inte splittrar historiken.
- **Template** är ett färdigt pass: namn plus lista av övningar med standardvärden.
- **Session** är ett genomfört pass: datum, mall, och per övning de set som faktiskt kördes.
- **ExerciseHistory** är en denormaliserad kopia av passens övningar. Det är den statistiken läser.

Ordet **mall** används både om övningsprogram och passtyp i gränssnittet. Det är känt otydligt, se `BACKLOG.md`.

## Datamodell

Sju object stores i IndexedDB `beefcake-db` (version 4 sedan 2026-09-01). Typerna bor i `src/db/schema.ts` och återexporteras via `src/models/index.ts`.

```ts
SetEntry         { sets, reps, weight, rpe? }
ExerciseKind     'weight' | 'bodyweight' | 'time' | 'distance'
Exercise         { id, name, kind?, muscleGroup?, equipment?, createdAt }
TemplateExercise { exerciseId, defaultSetEntry: SetEntry, order }
Template         { id, name, exercises: TemplateExercise[], updatedAt }
SessionExercise  { exerciseId, exerciseName, setEntries: SetEntry[], order, notes? }
Session          { id, date (YYYY-MM-DD), templateId, templateName, exercises: SessionExercise[], createdAt }
ExerciseHistory  { id, date, exerciseId, exerciseName, setEntries: SetEntry[], volume, sessionId }
ActiveSetEntry   SetEntry plus { completed?, type?: 'normal'|'warmup'|'drop'|'failure' }
ActiveWorkout    { id, date, templateId, templateName, exercises: ActiveExercise[], startTime, updatedAt }
BodyWeight       { date (YYYY-MM-DD, nyckel), kg }
```

`bodyWeight` är kroppsvikten: ett värde per dag med datumet som nyckel, kilo med en decimal, samma datum skriver över. Matas in i Inställningar, ritas i Statistik när minst två värden finns. Ingen historik före 2026-09-01 och ingen migrering.

`setEntries` är en lista, så olika vikt eller reps per set fungerar. `Legacy*`-typerna och `migrate*`-funktionerna i `src/models/` konverterar gammal seed-struktur och får inte tas bort så länge `seedData.ts` har den gamla formen.

`activeWorkout` håller **ett** påbörjat pass, sparat vid varje ändring i loggvyn **så snart minst ett set finns** (sedan 2026-09-04). Förvalda övningar utan set är en startpunkt, inte ett utkast: de lämnar inget spår, annars blev varje öppning av loggvyn ett "pågående pass" på Hem. Det är utkastet, inte ett pass: det blir en `Session` först när passet slutförs, och rensas då.

Loggvyn öppnas tom när användaren går direkt till `/log`. Ett program laddas bara genom ett uttryckligt `?template=`, ett tidigare pass genom `?from=`, eller ett faktiskt utkast med minst ett set. Hem-kortet "Nästa pass" använder `src/lib/nextPrograms.ts`: de tre senast körda programmen visas med det som väntat längst först, men förvalet förs aldrig över till loggvyn utan ett klick.

Volym räknas alltid genom `src/lib/volume.ts`. Vikt 0 betyder kroppsvikt eller kondition och ger volym 0. Skriv aldrig `sets * reps * weight` på nytt ställe.

**Skriv aldrig till `sessions` direkt.** `createSession`, `updateSession` och `deleteSession` håller ihop passet och dess historikrader i en transaktion. Skriver du ett pass utan att skriva om historiken blir graferna tyst fel.

## Data och seed

- **All träningsdata är verklig**, från 2024 till 2026-07-28. Radera eller skriv aldrig om historisk data, varken i seed, i IndexedDB eller i en migrering. Additivt eller inget.
- `src/db/seedData.ts` är **genererad**, aldrig handredigerad. Bygg om med `python scripts/generate-seed.py`.
- Källan är `C:\dev\Styrkepass v2.xlsx` och den öppnas **bara för läsning**.
- `syncSeed()` seedar bara en tom databas **utan moln** (`seedEmpty` är `!isCloudSyncConfigured()`, sedan 2026-09-02). I produktion startar en ny användare tom: Patriks historik ligger redan i D1 under hans adress, och ett andra konto ska inte få hans pass. Seeden var additiv vid varje uppstart fram till 2026-09-01, men med D1 som sanningskälla kom varje raderat seedpass tillbaka. Ny seeddata läses in via en tömd lokal klient med moln avstängt och sprids sedan via D1. Matchningen inne i seeden är kvar: pass på `(datum, passnamn)`, övningar på gemener, aldrig på `seed-N`-id.
- Ett spökpass 2025-11-19 "Bröst, axlar & biceps" finns med flit, en artefakt av `=TODAY()`-drift i arket. Städa inte bort det.
- Seeden innehåller 33 övningar, 9 mallar och 418 pass. Mallen med namnet `undefined` filtreras bort i `syncSeed`, så åtta laddas.

## Lagring och nödräddning

D1 lagrar versionsnumrerade snapshots per **e-postadress** (Firebase-kontots bekräftade adress, gemener) och är sanningskälla. Två konton är två helt skilda spår i samma tabell, inget delas. Klienten hämtar serverns snapshot **efter inloggningen**: `LoginGate` kör `syncSeed()` när Firebase gett en bekräftad användare och visar "Hämtar dina pass…" tills det är klart (sedan 2026-09-04; att hämta i `main.tsx` före render gav "Du är inte inloggad" och en tom app). Utan moln kör `main.tsx` seeden före render som förut. IndexedDB är lokal cache. Efter varje mutation synkar `syncCloudData()` snapshoten till D1. Workern och JSON-importen validerar hela domänmodellen med samma `validateSnapshot()` i `src/lib/importValidation.ts`, inklusive att varje historikrad pekar på ett pass som finns. Snapshoten har fyra obligatoriska samlingar (`templates`, `exercises`, `sessions`, `exerciseHistory`) och `bodyWeight` som **valfri samling**: äldre snapshots i D1 och äldre klienter saknar fältet, då blir det en tom lista i klienten. Workern skiljer på saknat och tomt: skriver en klient en snapshot **utan** `bodyWeight` (fältet är `undefined`) kopierar `writeSnapshot` listan från ägarens senaste revision innan valideringen, så en äldre bundel inte nollar kroppsvikten. En **tom lista** är ett medvetet "raderat" från en ny klient och sparas som den är.

- Varje anrop bär `Authorization: Bearer <Firebase ID-token>` (`getIdToken()` i `authService`, SDK:n förnyar den själv) och skrivning är vanlig JSON-POST. Workern svarar 401 på saknad eller ogiltig token och 403 på obekräftad adress.
- Skrivning kräver senaste revision, så en gammal klient får 409 i stället för att skriva över nyare data.
- Synkfel visas beständigt i appen och får inte sväljas av `autoBackup()`.
- Export och import av JSON är endast manuell nödräddning i Inställningar. Filbackup används aldrig automatiskt.

## PWA och uppdatering

Service workern (Workbox via vite-plugin-pwa) precachar hela bundeln, så appen fungerar offline. `registerType` är `'prompt'` sedan 2026-09-01: en ny version hämtas och installeras i bakgrunden men aktiveras **aldrig av sig själv**. `main.tsx` registrerar med `registerSW` från `virtual:pwa-register`; `onNeedRefresh` anropar `announceUpdate()` i `src/components/UpdateBanner.tsx`, som sparar omladdningsfunktionen (service workern kan bli klar innan appen har renderats) och skickar `beefcake-update-available` på `window`. Bannern "Ny version av Beefcake finns" ligger överst i `<main>` i flödet, ovanför synkfelet, och knappen "Ladda om" kör `updateSW(true)`: service workern får `SKIP_WAITING` och sidan laddas om med nya bundeln. `onOfflineReady` gör ingenting. Mitt i ett pass händer alltså inget förrän användaren själv trycker. Ett aktivt pass ligger i `activeWorkout` och överlever omladdningen.

## Latmask-mejlet

Valfritt per konto (kryssruta i Inställningar under Konto), lagrat i D1-tabellen `reminders` (`owner`, `enabled`, `last_sent`), inte i snapshoten: det är ingen träningsdata. En cron i Workern (`0 17 * * *` UTC, 19:00 sommartid och 18:00 vintertid) går igenom påslagna konton, läser senaste snapshoten och räknar dagar sedan senaste passet i svensk tid (`stockholmToday`). Regeln bor i `server/src/reminders.ts` och delar `MAX_GAP_DAYS` med Cartman: över tre dagars glapp ger ett brev, alltså från dag fyra och sedan **varje dag**: "Nu har du inte tränat på N dagar, din latmask." `last_sent` hindrar dubbelbrev samma dag. Ingen historik alls ger inget brev.

Brevet går via Resend från `latmask@beefcake.buildapp.se` (`server/src/email.ts`), en egen underdomän på buildapp.se som Familjehubben-mönstret: aldrig apexdomänen, och ingen data delas mellan apparna. Innehållet är bara antalet dagar och en länk, inget ur passen. `RESEND_API_KEY` är en Worker-secret; saknas den loggar cronen `reminders_skipped` och skickar inget.

## Beefcake-nivån

Cartman speglar träningskedjan. I full storlek med statustexten bara på Hem (sedan 2026-09-01), på övriga sidor som 40 px avatar i headern, sidebaren och railen. `src/lib/streak.ts` äger regeln, och är det enda stället: ett glapp på över **tre dagar** bryter kedjan och sätter nivå 1, annars stegas nivån upp med kedjans längd (1-3 pass ger 2, 4-9 ger 3, 10 eller fler ger 4). Takten motsvarar "varannan dag", ungefär fyra pass i veckan. Streak-kortet i Statistik och alla andra läsningar går genom samma funktion. Hel kedja ger en tredje rad (sedan 2026-09-15): dagar från kedjans första pass till och med i dag, och sista dag att träna (senaste passet plus tre dagar, "i dag" eller "i morgon" när den är nära). Märket (avatar plus ordet) länkar till Hem i header, sidebar och rail.

`beefcakeStatusText()` returnerar två rader: nivåns namn och förklaringen. Radbrytningen är en del av formatet, texten renderas med `white-space: pre-line`. Påminnelsen om latmasken efter mer än tre dagar bor i nivå 1-textens andra rad; det finns ingen separat banner.

Avatarerna i `src/assets/beefcake/` och ikonerna `favicon.ico`, `apple-touch-icon.png` och `pwa-*.png` i `public/` är **genererade**, aldrig handredigerade. Originalen ligger i `assets-source/` och byggs om med `python scripts/generate-beefcake-assets.py`. Favicon är huvudet ur `beefcake3.jpg`.

## Muskelgrupper

`MUSCLE_GROUP_MAP` och `EQUIPMENT_MAP` i `dataService.ts` mappar övningsnamn till muskelgrupp respektive stång (`skivstång` 20 kg, `ez-stång` 10 kg, stångvikterna i `src/lib/plates.ts`). `backfillExerciseMeta()` körs i `syncSeed` och fyller på det som saknas, aldrig över ett satt värde. Övningar utan mappning visas som "Övrigt" i statistiken och får ingen plattrad i loggvyn. Både grupp och utrustning härleds ur namnet, de väljs aldrig av användaren vid loggning.

## Övningsdatabasen

873 övningar ur free-exercise-db (public domain, Unlicense), låsta till en commit i både `scripts/generate-exercise-db.py` och `EXERCISE_DB_COMMIT` i `src/lib/exerciseDb.ts` så text och bild aldrig glider isär. `src/data/exerciseDb.json` är **genererad**, aldrig handredigerad (701 kB, egen chunk som bara laddas på `/ovningar` och via `loadExerciseDb()`). Bilderna (två rutor per övning, 850 × 567) hämtas i körtid från jsDelivr och cachas av service workern (`exercise-images`, 400 senaste, 180 dagar), så sedda övningar finns offline. Animationen är ren CSS: slutrutan ligger över startrutan och växlar opacitet var 0,8 sekund, stilla under `prefers-reduced-motion`. Animationen visas bara där en övning är vald (databasens detaljsida, Teknik-kortet); översiktens kort och programredigerarens miniatyrer har `still` och laddar bara startrutan (Patrik 2026-09-15: 24 blinkande kort stör sökningen och laddar dubbelt).

**Startprogram** (`src/data/starterPrograms.ts`) är tre nybörjarupplägg med källa som Program-sidan skapar som vanliga `Template`-poster med ett tryck: samma `createTemplate` som formuläret, övningar via `getOrCreateExercise` (som sedan 2026-09-13 sätter muskelgrupp och utrustning ur namnkartorna direkt). Progressionen står som text, Beefcake räknar inte ut vikter.

Databasen är **inte** en del av datamodellen: `Exercise` får inget nytt fält. Egna övningar kopplas via `EXERCISE_DB_MAP` i `src/lib/exerciseDb.ts` (övningsnamn → databas-id, jämfört på gemener och trimmat, samma mönster som muskelgruppskartan). En övning med rad i kartan får miniatyr i programredigeraren och Teknik-kort på `/exercises/:id`; en utan får en länk som söker på namnet. Loggvyn visar inga bilder: gymmet är inte stället att titta på teknik (Patrik 2026-09-13). Namn och instruktioner är svenska ur `scripts/exerciseDbSv.json` (maskinöversatt 2026-09-15 med gemensam ordlista, handredigerbar, generatorn stoppar om ett id saknas eller stegantalet skiljer); originalnamnet ligger kvar som `nameEn` och sökningen matchar båda. Filtret Typ har "Allt utom stretch" (`NO_STRETCH`) och sparas per enhet i IndexedDB-storen `settings` (`exercise-db-category`), muskel och utrustning sparas inte. Muskel, utrustning, nivå och kategori har svenska etiketter i samma fil, och testet kräver att varje värde i datan har en etikett och att varje id i kartan finns.

## Arkitektur

Vite 8 · Preact 10 · TypeScript strict · wouter · `idb` · Chart.js (lazy) · vite-plugin-pwa (Workbox) · Cloudflare Worker · D1 · Access. Cirka 2 000 rader klientkod.

```
src/main.tsx              entry, registerSW (prompt), syncSeed sedan render
src/app.tsx               Router, navigering, rutter
src/app.css               all styling, tokens överst
src/components/           Button, Card, Stat, EmptyState, Field, LoginGate (inloggning, useAuthUser), RestTimer, PlateCalculator, CloudSyncStatus, UpdateBanner (ny version väntar), BeefcakeBadge (märke, avatar, useBeefcakeStreak), ExerciseAnimation (två bildrutor som växlar)
src/db/schema.ts          IndexedDB-schema och typer
src/db/seedData.ts        GENERERAD, all träningshistorik
src/lib/date.ts           all datumhantering, tidszonssäker (även mondayISO, isoWeek). Använd den, aldrig new Date() rakt av
src/lib/format.ts         vikt och set som text, svensk notation
src/lib/volume.ts         volymformeln, enda stället
src/lib/hypertrophy.ts    set per vecka mot bandet 10-20
src/lib/streak.ts         beefcake-nivån ur passdatumen
src/lib/nextPrograms.ts   nästa pass i rotationen ur historiken för Hem
src/lib/plates.ts         skivor per sida och stångvikt per utrustning
src/lib/exerciseMetrics.ts Epley-1RM, grafens mått per genomförande, rekord per repsantal
src/lib/warmup.ts         uppvärmningsset ur första arbetssetet
src/lib/exerciseDb.ts     övningsdatabasen: laddning, svenska etiketter, sökning, namnkarta egna övningar → databas-id
src/data/exerciseDb.json  GENERERAD ur free-exercise-db, se scripts/generate-exercise-db.py
src/assets/beefcake/      GENERERADE avatarer, se assets-source/ och scripts/
src/services/authService.ts   Firebase Auth från gstatic-CDN, ingen npm-beroende, svenska felmeddelanden
src/services/dataService.ts   alla läsningar, skrivningar och statistik
src/services/timerService.ts  vilotimerns presets, notiser och start-event
server/src/auth.ts          Firebase ID-token verifierad med jose mot Googles JWKS, kräver email_verified
server/src/index.ts         snapshot-API med revisionslås, /api/reminders och cronen sendLazyReminders
server/src/email.ts         latmask-brevet via Resend
server/src/reminders.ts     lazyDays (regeln) och stockholmToday
server/migrations/          D1-schema för versionsnumrerade snapshots och reminders
src/pages/                Home, LogSession, Templates, History, SessionDetail, ExerciseDetail, ExerciseDatabase (/ovningar), Stats, Settings (export, import, kroppsvikt)
```

Rutter: `/` · `/log` (stödjer `?from=<sessionId>`, `?template=<namn>` och `?date=<YYYY-MM-DD>`) · `/templates` · `/history` · `/history/:id` · `/exercises/:id` (egen övning, statistik) · `/ovningar` (databasen, stödjer `?q=`) · `/ovningar/:id` · `/stats` · `/settings`.

Loggvyn startar timern genom att skicka `beefcake-start-timer` på `window`; `RestTimer` lyssnar. Det håller avbockning och timer i olika komponenter utan delad state. Alarmtiden lagras lokalt per enhet i IndexedDB-inställningarna: standard är 19 sekunder, användaren kan välja 1 till 3 600 sekunder eller låta ljudet fortsätta tills det tystas manuellt.

## Konventioner

- TypeScript strict, ingen `any`, funktioner lyckas eller kastar.
- Svenskt gränssnitt. Decimalkomma (12,5), mellanslag som tusentalsavgränsare (12 500), **aldrig tankstreck**.
- Desktop är den primära upplevelsen, mobilen ska ändå vara fullvärdig. Brytpunkter: mobil under 768 px, tablet 768 till 1199 px, desktop från 1200 px. Tryckytor på mobil minst 44 × 44 px; enda undantaget är settypsbrickan i loggvyn (32 px, trycks sällan). Tabeller som inte ryms på telefon renderas som kort med `.history-list-cards` och `.history-list-table`, aldrig med sidled-scroll.
- Loggvyn på telefon: inga stegknappar, inget tangentbordsbyte (`inputMode` decimal på kg, numeric på reps), RPE som bricka, plattor som text under tabellen. Tablet (768 till 1199 px) är finger, inte mus, och får samma kompakta Föregående och samma frånvaro av stegknappar; settabellen måste rymmas i kortet utan inre sidled-scroll på 768 px (574 px). Vilotimern är det enda som får `--font-mono`.
- Alla vyer byggs med komponenterna i `src/components/`, aldrig ad-hoc `class="card"`.
- Listor som inte är `<ul>` (stapellistan, muskelgruppschipsen) får `role="list"` med aria-label och `role="listitem"` per rad, så skärmläsare läser antalet. Kompakt text som "27,5×10" får aria-label med den fulla texten på cellen.
- Färger kommer alltid från tokens i `app.css`, också utanför `:root`: settypsbrickor, timern och plattkalkylatorn har egna tokens med mörk variant, `--on-accent` för text på fyllda ytor. Hårdkodad hex i `.tsx` är förbjudet (undantag: skivornas IPF-färger i PlateCalculator, en fysisk egenskap), Chart.js läser via `getCSSVar()`. Ljust läge är AA-räknat 2026-09-01: text, muted, accent, success, warning och danger håller minst 4,5:1 mot surface och surface-raised. Nya tokens dokumenteras med kommentar i `app.css`.
- Typografi: Geist, self-hostad. Rubriker 800 med `-0.02em`, brödtext `line-height: 1.7`, `tabular-nums` på allt numeriskt. Geist Mono bara i vilotimerns siffror.
- `.card` är stilla; lyft vid hover hör bara till klickbara kort (`.history-card`).
- `alert()`, `confirm()` och `prompt()` är förbjudna. De blockerar appen och gör automatiserad testning omöjlig.
- Minsta ändring som helt löser uppgiften. Inga refaktoreringar på vägen.
- `npm test` (Vitest) täcker de rena beräkningarna i `src/lib/`. Den kör före `npm run build` i deploy-workflowen, så ett rött test stoppar deployen.

## Inloggning och säkerhet

Firebase Auth i ett eget projekt för Beefcake (inte grammats `grammat-78450`, beslut 2026-09-02), Google eller e-post med lösenord, samma mönster som grammat och sipdeck. `src/config.ts` bär de publika identifierarna (apiKey, authDomain, projectId), tomt projectId betyder ingen inloggning. `LoginGate` sitter framför hela appen när moln är konfigurerat; utan `VITE_BEEFCAKE_API_URL` finns ingen grind alls (lokal utveckling). Workern verifierar ID-token med `jose` mot Googles JWKS och kräver `email_verified`, eftersom D1-datan ligger under adressen: utan kravet kunde vem som helst registrera någon annans adress med lösenord och läsa dennes pass. E-postkonton får Firebase eget bekräftelsemejl, grinden visar "Jag har bekräftat" tills adressen är bekräftad. Firebase-SDK:n cachas av service workern (`runtimeCaching` på gstatic) så appen startar offline med sparad inloggning.

Den gamla lösenordsgrinden (`PasswordGate`, `AUTH_HASH` i bundlen) och Cloudflare Access framför API:t är borttagna 2026-09-02. IndexedDB är okrypterat, och GitHub Pages kan inte sätta CSP-headers.

## Audits
- UX: 2026-09-16, warn, 3 of 8 script checks pass, targets under 44 px on log and history
- OWASP Top 10: 2026-09-16, warn, 0 high, 2 medium open, snapshot caps deployed (2 MB, 20 revisions, 300 writes per day per account); account switch on one device still leaks data, conflict banner still discards local edits
- Headers: 2026-09-16, warn, 6 of 6 on buildapp.se/beefcake, beefcake.buildapp.se 1 of 6 (HSTS only), beefcake-api 1 of 6
- TLS: 2026-09-16, pass, SSL Labs A+ on beefcake.buildapp.se (GitHub Pages) and on buildapp.se (TLS 1.2 minimum since today)
- Lighthouse: 2026-09-16, warn, a11y 98 (no main landmark), best practices 100, SEO 60 by design (noindex), CLS 0,83 (mobile, no perf)
- Markup: 2026-09-16, pass, W3C 0 errors, 7 warnings, 0 broken links
- npm audit: 2026-09-16, pass, 0 in production, 4 high 2 moderate in the dev chain (wrangler, miniflare, sharp, fast-uri)
