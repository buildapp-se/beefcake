---
schemaVersion: 1
status: active
currentGoal: Logga pass öppnas tomt utan automatiskt program, månadskalendern visar veckonummer, datum och program alltid synliga som en slimmad rad, kg-fält skriver med komma och settyp visas som fulla ord. Allt pushat 2026-09-04 kväll
nextAction: Logga in med Google skarpt på buildapp.se/beefcake och bekräfta att rutan säger "Fortsätt till buildapp.se" och att passen finns kvar. Kontrollera sedan att "Enable create (sign-up)" är avstängt i Firebase, därefter Resend (BACKLOG P0)
blockers:
  - Firebase: Julia kan logga in på buildapp.se, så domänen fungerar; det är inte verifierat om sign-up är avstängt
  - Resend: beefcake.buildapp.se ska verifieras och RESEND_API_KEY sättas som secret (regel 1, Patrik)
reviewedAt: 2026-09-08
---

## Recent work

**2026-09-08, egen authDomain `beefcake.buildapp.se`: klart, live.** Googles inloggningsruta sa `beefcake-4865a.firebaseapp.com`, eftersom Google visar authDomain tills appens branding är verifierad och authDomain är `<projekt-id>.firebaseapp.com`. Projekt-id går inte att ändra efter skapandet. Källor och alternativen: `Firebase Consent Screen` i vaulten. Vald väg var egen domän, samma som grammat med `auth.buildapp.se`. **Rutan säger nu "Fortsätt till buildapp.se"** (Google kortar till registrerbar toppdomän).

Gjort och verifierat:
- `authhost/` (Firebase Hosting-site `beefcake-4865a`, placeholder-sida) deployad, `beefcake-4865a.web.app/__/auth/handler` svarar 200.
- Custom domain `beefcake.buildapp.se` skapad via Hosting-API:t (`firebase-tools` saknar kommando för custom domains; scriptet använde CLI:ns egen inloggning). `hostState: HOST_ACTIVE`, `ownershipState: OWNERSHIP_ACTIVE`.
- Cloudflare, zonen `buildapp.se`: `CNAME beefcake -> beefcake-4865a.web.app` **DNS only** (proxad post gör att Firebase aldrig kan minta certifikatet), plus TXT `_acme-challenge.beefcake` för certvalideringen. Certifikatet gick till `CERT_PROPAGATING` kl. 15:10.

- Certifikatet klart efter 10 minuter, `https://beefcake.buildapp.se/__/auth/handler` svarar 200.
- **De två allowlists som krävs, båda satta av Patrik 2026-09-08:** `https://beefcake.buildapp.se/__/auth/handler` under Authorized redirect URIs på OAuth-klienten `138081999329-0btvi4n7okqs5eaidkfcirupbd322b6e` i Cloud Console, och `beefcake.buildapp.se` under Firebase → Authentication → Settings → Authorized domains (verifierad via publika `getProjectConfig`). Olika listor, båda krävs. Den första fällde grammats första försök med `400 redirect_uri_mismatch`.
- `authDomain` bytt i `src/config.ts` (`bfdc71a`). Lint, 82 tester och build gröna.
- **Skarpt verifierat före deploy:** lokal preview av den nya bundeln, klick på Google-knappen gav Googles inloggningssida med `redirect_uri=https://beefcake.buildapp.se/__/auth/handler` och texten "Fortsätt till buildapp.se". Inget mismatch-fel.

**Fälla som kostade en felsökning:** första försöket gav `redirect_uri_mismatch` med den *gamla* domänen i felet. Orsaken var appens egen service worker, som serverade en cachad äldre bundle på samma preview-port. Rensa alltid SW och cache (`getRegistrations().unregister()` plus `caches.delete`) och ladda om utan cache innan en auth-ändring bedöms lokalt, annars mäter du gammal kod.

**Revert om något ändå fallerar:** sätt tillbaka `authDomain: 'beefcake-4865a.firebaseapp.com'` i `src/config.ts` och pusha, ute via Pages på någon minut.

2026-09-08, Google-knappen: "Logga in med Google" i `LoginGate` följer nu Googles branding-riktlinjer (vit, 1 px `#747775`, färgad G-logga som inline-SVG, medium 14/20, Roboto bara om den finns lokalt eftersom appen självhostar Geist). Patrik tyckte den generiska knappen såg oseriös ut, samma ändring gjord i Grammat och Sipdeck. Lint, 82 tester och build gröna, verifierad i Chromium via `vite preview` på 400 px utan konsolfel. OAuth-brandingen (appnamn i consentskärmen) för `beefcake-4865a` kvarstår, bara Patrik kan göra den i Cloud Console.

2026-09-04 kväll, kg och settyp: rotorsaken till "kan bara ändra ett kg i taget" och "komma eller punkt ger inga decimaler" var `<input type="number">` (webbläsarlokal för decimaltecken, kontrollerat fält nollar ett nyss skrivet kommatecken). Kg i Logga pass och Templates är nu text med delad `parseDecimal()`-parser och en per-fält draft, settypsbokstäverna är nu en picker med fulla ord. Detaljer i BACKLOG under Byggt. Lint, 82 tester och build gröna, verifierat i Chromium: kommatecken bevaras, sparat 82,5 kg återöppnas som 82,5.

2026-09-04 kväll, loggvyn: datum och program syns alltid som en slimmad rad (Patrik: pennan var ett klick för mycket). Detaljer i BACKLOG under Byggt. Lint, 82 tester och build gröna, Chromium 390 px verifierat lokalt.

2026-09-04 kväll: automatvalet av nästa program togs bort från direktnavigering till Logga pass. Bara `?template=`, `?from=` eller ett sparat utkast med minst ett set laddar innehåll; tomvyn heter "Logga pass", visar "Inget program valt" och har ingen Avbryt-knapp. Historikens månadskalender har nu en egen `V.`-kolumn med ISO-veckonummer. 82 tester, lint och build gröna. På Patriks begäran gjordes ingen webbläsarverifiering före modellbyte; commit, push och Pages-deploy återstår.

2026-09-04 kväll: Patriks 10 program och 33 övningar kopierades additivt till Julia genom en ny D1-revision 2; hennes pass, historik och kroppsvikt är fortfarande tomma och exakt JSON-likhet mot Patriks revision 17 är verifierad. Fokusfelet i Logga pass berodde på att ett nytt tidsbaserat `exerciseId` också användes som React-nyckel vid varje tecken, vilket monterade om fältet; nyckeln är nu stabil. Inställningar har nu alarmtid för vilotimern, 1 till 3 600 sekunder eller tills ljudet tystas, lokalt per enhet och med 19 sekunder som standard. 82 tester, lint och build gröna. Chrome-verifiering: `Kettlebell` gick att skriva med fokus kvar, 7 sekunder och oändligt alarm sparades över omladdning, Tysta ljudet stoppade alarmet, noll konsolfel. Codex webbläsarkontroll återanslöts via Browser-inställningen och användes för verifieringen. Commit `2f0c2a9` pushad till `master`; Pages-körning `33895507996` grön och livegrinden renderad på buildapp.se.

2026-09-04 kväll, flytten: repot överfört `Elwyndaz/beefcake` → `buildapp-se/beefcake` (`gh api repos/.../transfer`), Pages-inställningen följde med (workflow-bygge, URL buildapp.se/beefcake). `wrangler.jsonc`: route `beefcake-api.buildapp.se` (samma mönster som `recept-api`), `FRONTEND_ORIGINS` buildapp.se och www, `APP_URL` buildapp.se/beefcake; `deploy.yml` bygger med nya API-URL:en (`375faef`). Worker `2e869cc8`: wrangler skapade den nya custom-domänen och tog bort `api.orgutveckling.se` (DNS-posten borta, gamla adressen svarar inte). Verifierat: nya API:t 401 utan token, preflight från buildapp.se 204, Pages-bygget grönt, bundeln pekar bara på nya API:t, grinden renderad i Chrome via Playwright-MCP:n utan konsolfel (Playwright är inte installerat i repot). orgutveckling.se/beefcake ger 404. Ingen inloggning genomförd: Google-inloggning på buildapp.se kräver att Patrik auktoriserar domänen i Firebase först. buildapp.se:s startsida listar projekt för hand, Beefcake syns inte där.

2026-09-04 sent: Patriks första inloggning med Google gav "Molnsynk misslyckades. Du är inte inloggad" och 0 pass: `main.tsx` hämtade D1 före render, innan Firebase svarat, och inget hämtade om. Fix `10e681c`: med moln renderas appen direkt och `LoginGate` kör `syncSeed()` per bekräftad användare. Verifierat av Patrik live: 428 pass, senaste 2 sep, nivå 2. D1 kontrollerad direkt under tiden: revision 17 orörd, inget skrevs över. Popupen för Google öppnas på primärskärmen, värt att veta med två skärmar.

2026-09-04 kväll, allt pushat och live: Firebase-projektet `beefcake-4865a` skapat av Patrik (Google och e-post/lösenord påslagna, `orgutveckling.se` auktoriserad), nycklarna i `src/config.ts` och `FIREBASE_PROJECT_ID` i `wrangler.jsonc` (`f77c989`). Access-appen "beefcake" raderad av Patrik i Zero Trust (API:t svarar 401 i stället för 302). Migrering `0002_reminders` körd mot D1. Worker deployad som `6d8ef727`, master pushad (`7b21996..f77c989`, fem commits), Pages-bygget grönt. Live verifierat i Chromium efter rensad service worker: grinden visar Google, e-post, Skapa konto och Glömt lösenordet, ingen inloggning genomförd (kräver Patriks konto). Fynd: `syncSeed` kör före grinden och loggar "Seed misslyckades: Du är inte inloggad" i konsolen vid utloggat läge, kosmetiskt, i BACKLOG.

2026-09-04 (lokal commit, ej pushad): buggen att Logga pass startade ett benpass av sig självt rättad (utkast kräver minst ett set) och loggvyn förväljer nästa pass i rotationen genom `src/lib/nextPrograms.ts`, flyttad ur Hem. 78 tester, lint, build och Chromium gröna. Samma dag: Stitch-designunderlag i vaulten (`Beefcake Designgenomlysning/stitch/`), ingen kod.

2026-09-02 eftermiddag (lokal commit, ej pushad): senaste manuella backup visas under knappen i Inställningar. Första leveransen genom AI-fabrikens Omnigent-flöde: Codex skrev kandidaten i en WSL-klon, en separat Codex-session granskade, build, lint, 74 tester och Chromium-prov gröna här. Mätning och fynd i `C:\dev\aifabriken\runs\2026-09-02-backupstatus\LEVERANS.md`.

2026-09-02, inloggning (lokal commit, ej pushad): `PasswordGate` och Access borta, Firebase Auth i klient och Worker, seeden bara utan moln, tvåanvändarfrågan löst via ett D1-spår per adress. Beslut: eget Firebase-projekt (inte grammats), appen flyttar till buildapp.se med repot, Resend-underdomän `beefcake.buildapp.se` (gratisnivån tillåter 3 domäner, Familjehubben använder en). Samma dag latmask-mejlet: cron, `reminders`-tabell, API och kryssruta, testat med attrapp. Kryssrutan är inte sedd i webbläsare: Konto-kortet visas bara inloggad.

Tredje passet 2026-09-01, chunkläge. **Chunk D klar**: Workern kopierar senaste revisionens `bodyWeight` när en klient POST:ar utan fältet (tom lista respekteras), tvåklientstestet har fallet, Worker deployad som `40e6fc76`. `isoWeek` flyttad till `src/lib/date.ts`, `mondayISO(weeksAgo, fromISO)` testbar med fasta datum, `src/lib/date.test.ts` ny (68 tester totalt). **Chunk E klar**: tablet-svep på 768×1024 och 1024×768 hittade att settabellen klippte kolumnen Ta bort bakom en inre sidled-scroll (619 px tabell i 574 px kort); tabletbrytpunkten fick telefonens kompakta Föregående och inga stegknappar, plattraden 44 px. Roller på stapellistan och chipsen, aria-label på Föregående-cellen, fokus till kg-fältet efter Spara. Åtta skärmbilder `-tablet` och `-tablet-liggande` i `efter-2/`. **Chunk F klar**: uppdateringsbanner för PWA:n (`registerType: 'prompt'`, `UpdateBanner`), verifierad i preview med två byggen, skärmbild `uppdateringsbanner-mobil-light.png`.

Andra passet 2026-09-01, chunkläge. **Chunk A klar** (`0f17c24`): Föregående-kolumnen kompakt på telefon (kg 56 px, 1 px cellpadding, mätt 336 av 340 px), "Nästa pass" på Hem pekar ut det program som väntat längst med dagar sedan under varje knapp. **Chunk B klar** (`09f2d15`): pass per vecka som HTML-staplar i Statistik, kortet "Denna vecka" på Hem med text och muskelgruppschips. **Chunk C klar** (`4408e64`): kroppsvikt som egen store, valfri samling i snapshoten, inmatning i Inställningar, kurva i Statistik, Workern deployad som `16aa6c7d` med den delade valideringen. Alla tre pushade, Pages grön.

Genomlysningens byggpass 2026-09-01 i chunkläge, 14 commits efter `4f36f07` (`68303eb` till `034b331`, inklusive den här docs-rättningen), alla pushade och byggda av Pages.

- **Backloggen**: de två parallella genomlysningsblocken sammanslagna till ett, 24 poster, P1 till P3. 16 av dem byggda i det här passet och markerade `[x]`, allt byggt står under Byggt.
- **Buggar och tokens**: passdetaljen på telefon visar övningarna som kort, streak-kortet läser `streak.ts` (`getCurrentStreak` borta), set- och anteckningsfält från tokens i mörkt läge, AA-färger i ljust läge, all hex utanför `:root` är tokens med mörk variant, `--radius-md` och `--border-strong` finns, kortlyft bara på klickbara kort, etiketter i bottennavigeringen.
- **Loggvyn**: "Som förra gången", RPE-bricka, plattor per sida som text (`equipment` via `EQUIPMENT_MAP`), anteckning i bannern, hopfälld datum/program-rad, Avbryt och Spara program under Slutför, telefonens settabell med sex kolumner och 44 px tryckytor. Cartman bara på Hem, avatar i navigeringen, latmasken i märkets text, "Nästa pass" först på Hem.
- **Statistik**: 30-dagarstal, 8 veckors set per muskelgrupp, frekvens som lista, kort på telefon, rekord per repsantal och valbart mått på övningssidan.
- **P3**: PR-märke på bocken med lång vibration, uppvärmning på ett tryck.

## Verification

- Tredje passet: 68 tester, lint, build, `server:check` gröna. Chromium 768×1024 och 1024×768 ljust: railen synlig, noll sidled-scroll på dokumentet och i settabellens kort, volymkurvan 576 respektive 376 px bred, alla tryckytor i de nya ytorna minst 44 px, Escape på alla fyra sidorna utan fel, fokus i kg-fältet efter Spara verifierat. Efterstäd 2026-09-02: RPE-brickan, plattkalkylatorknappen och anteckningsfältet 44 px på tablet, mätt om i Chromium 768 och 1024. Kvar under 44 på tablet: draghandtaget 40 brett, settypsbrickan 32 (dokumenterat undantag), övningslänkarna i statistiktabellerna 19 px höga (textlänkar i tabellrader, lämnade).
- Andra passet: `npm test` 60 tester gröna (formatSetCompact, kroppsvikt i validering och Worker nya), `npm run lint`, `npm run build` och `server:check` gröna. Chromium 390×844 och 1440×900, ljust och mörkt: noll konsolfel, noll sidled-scroll, settabellen 336 av 340 px, tryckytor i loggvyn och Inställningar minst 44 px utom settypsbrickan. Kroppsviktsflödet (två värden, ladda om, kurva, export, töm, import) kört grönt. Skärmbilder i vaulten under `Beefcake Designgenomlysning/efter-2/`. Inga nya färger, kontrasten oförändrad (24 par, minst 4,5:1).
- Första passet: 55 tester, samma Chromium-metod, skärmbilder under `efter/`.
- Cartman nivå 2 till 4 fortfarande bara enhetstestade. PR-märket, plattraden och kroppsviktsinmatningen är testade i Chromium, inte på en telefon.

## Unresolved details

- Chunk D till F godkända av Patrik 2026-09-02 ("fortsätt" på granskningen). Båda tidigare passen godkända 2026-09-01 ("ja" på helheten). Beslut tagna åt Patrik står i dagsnoten och i rapportens "## Efter" och "## Efter 2".
- Alla genomlysningsposter är byggda. Kvar i backloggen: Web Push, Cloudflare Pages med Access, tvåanvändarstöd.
- Workern behåller kroppsvikten vid skrivning utan fältet sedan `40e6fc76` (chunk D). Testat i tvåklientstestet, inte mot produktions-D1.
- Ingen autentiserad POST mot produktions-D1 sedan `f3f1bb10`; `16aa6c7d` och `40e6fc76` är bara testade via tvåklientstestet.
- Access-sessionen för `beefcake` är 1 månad sedan 2026-08-21.
- Spökpasset 2025-11-19 "Bröst, axlar & biceps" är kvar med flit.

## Resume here

Prova loggvyn och kroppsvikten på telefonen innan något mer byggs. Sedan chunk F visar appen själv bannern "Ny version av Beefcake finns" när ett nytt bygge väntar; den första deployen efter `7a4b0c3` går fortfarande via den gamla autoUpdate-workern (den nya bundeln aktiveras som förut, utan banner), därefter gäller bannern. IndexedDB uppgraderas till version 4 automatiskt. Två användare, Web Push och Cloudflare Pages med Access kräver beslut eller infrastruktur.
