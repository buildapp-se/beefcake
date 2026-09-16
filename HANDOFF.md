---
schemaVersion: 1
status: active
currentGoal: Övningsdatabasen på svenska med stillbilder i översikten, byggd och verifierad 2026-09-15; före det övningsdatabas och startprogram 2026-09-13
nextAction: Latmask-brevet har inte gått, med rätta: Patriks senaste pass är 2026-09-12 (inte 2 sep), så dag fyra är 2026-09-16 och första möjliga brev 19:00 den dagen om inget pass loggas. Cronen körde 13 och 14 sep utan `reminders_skipped`, alltså finns en icke-tom nyckel; att den är giltig bevisas först av ett brev (`last_sent` i `reminders`, https://resend.com/emails). Sedan Program på telefonen (startprogram, miniatyrer, animation, de sju gissade namnkopplingarna) och Firebase sign-up-kontrollen
blockers:
  - Firebase: Julia kan logga in på buildapp.se, så domänen fungerar; det är inte verifierat om sign-up är avstängt
reviewedAt: 2026-09-16
---

## Recent work

**2026-09-16, granskningsbatchen (chunkläge).** Två P2 och två P3 rättade:
utloggning tömmer enheten (`signOutAndClear`), D1 är sanningen även när kontot
saknar snapshot, ett kontomärke `owner-uid` stoppar uppladdning under fel konto;
konfliktbannern sparar den lokala kopian som fil (`saveBackupToFile`) före
omladdningen; 401/403/409 loggas, tak på reminders-kroppen, credentials-headern
borta; `<main>` på inloggningssidan. Fem commits `6e757f0` till `90b9bcc`, 97
tester gröna, lint och build gröna. Pages via CI, Workern med `wrangler deploy`.
**Ägar-QA:** logga ut och in igen på telefonen, passen ska komma tillbaka från D1.

**2026-09-16, första UX-granskningen (Laws of UX).** Provkörning av den nya globala skillen `ux-audit` (`~/.claude/skills/ux-audit`), UX-kolumnen i cockpitens Audits-flik. Skriptet på sju vyer i 390 px med `--interact`: varning, 3 av 8 godkända (Chunking, Doherty vid klick, sidfel). Fynden står som fem poster under Öppet i BACKLOG. Godkänt vid bedömning av skärmdumpar: kg-fältet tar `12,5` och skriver om `12.5` till `12,5` (Postel), "0 av 0 set klara" (Goal-Gradient), tomläget i Logga pass säger vad man ska göra, Förra-kolumnen gör att man inte behöver minnas förra vikten, datum och Fritt pass är förval. Zeigarnik-varningen gällde ett fält i Inställningar och är inget fynd, påbörjat pass sparas redan som utkast. Ej bedömt: slutförandet av ett pass och synkindikatorn, eftersom granskningen kördes utan moln. **Enklare sätt att köra utan moln:** i Bash tömmer `VITE_BEEFCAKE_API_URL= npx vite` variabeln så att grinden försvinner (till skillnad från PowerShell, se fällan 2026-09-15). Ingen kod ändrad.

**2026-09-15 eftermiddag, streak-rad, typfilter och klickbart märke.** Tre beställningar från Patrik, godkända samlat. Detaljer i BACKLOG under Byggt. Streak-raden syns bara vid hel kedja; dev-seeden har inga färska pass, så raden är layoutmätt i Chromium med insatt text och logiken testad i `streak.test.ts`, inte sedd med riktig data. Kolla Hem på telefonen.

**2026-09-15, övningsdatabasen på svenska och stillbilder i översikten.** Patrik: "gör det" på P3-posten, plus "fundera på om bilderna ska vara animerade i översikten". Beslut efter förslag: stillbild i översikten och programredigerarens miniatyrer, animation där en övning är vald. Översättningen gjordes av nio Sonnet-agenter med gemensam ordlista, sammanslagen och kontrollerad (samma id-mängd, samma stegantal, noll engelskklingande steg, en namndubblett rättad för hand). Detaljer i BACKLOG under Byggt. Språket är maskinöversatt: säg till om ett namn låter fel, rättelsen görs i `scripts/exerciseDbSv.json` och generatorn körs om. **Fälla vid lokal verifiering:** `.env.local` sätter API-URL:en i alla Vite-lägen (även `--mode test`), och `$env:VAR=''` i PowerShell tar bort variabeln i stället för att tömma den, så appen stannar i inloggningen. Det som fungerade: en tillfällig `vite.nocloud.config.mts` utanför repot som importerar `C:/dev/beefcake/vite.config.ts` och sätter `envDir` till en tom mapp (`.ts` gav cjs-fel med preact-presetet, `.mts` gick).

**2026-09-13 kväll, Resend kopplat och CORS-buggen (`2d59c4a`).** Patrik la till `beefcake.buildapp.se` i Resend (eu-west-1, spårning av) med auto-configure via Cloudflare: DKIM-TXT, SPF-TXT och MX på `send.beefcake` landade i zonen direkt, domänen Verified. `RESEND_API_KEY` satt som Worker-secret. **Fälla:** `! npx wrangler secret put` i Claude Codes `!`-skal frågar inte efter värdet (ingen interaktiv stdin) och laddar upp en tom secret med "Success"; kör kommandot i ett vanligt terminalfönster. Kryssrutan i Inställningar gav "Kunde inte spara inställningen": preflighten svarade `Allow-Methods: GET,POST,OPTIONS` utan PUT, så webbläsaren stoppade anropet innan Workern. En rad i `server/src/index.ts` plus ett preflight-test i `twoClients.test.ts` (90 tester). Worker deployad som `8d6105db`, curl mot produktion visar PUT, Patriks konto står som `enabled = 1` i `reminders`. Första riktiga brevet är inte sett ännu: cronen går 19:00.

**2026-09-13, startprogram (`0880e37`).** Patrik: "gör startprogram och hänvisa till källor, eller hitta open source-databas". Sökning gav ingen öppen programdatabas med ren licens (Liftosaur AGPL med Liftoscript, Boostcamp proprietärt, övriga är övningsdatabaser), så tre upplägg skrevs ur thefitness.wiki: Basic Beginner Routine, GZCLP steg 1, Reddit PPL, med författare, progression och länk i kortet "Startprogram" längst ned på Program. Verifierat i Chromium: PPL gav 3 pass och 6 nya övningar med rätt muskelgrupp (Rumänsk marklyft även skivstång), andra trycket gav "passen finns redan", redigeraren visade 6 av 6 miniatyrer, 390 px utan sidled-scroll med knapparna 44 px och full bredd. Sets och reps är källans fasta tal; "+" (AMRAP) står bara i beskrivningen.

**2026-09-13, förhandsvisningarna flyttade.** Patrik: bort med miniatyrerna i Logga pass, lägg dem under Program, och radbrytet i programredigeraren. Miniatyrkolumnen ligger nu först i programredigerarens övningsrad, som fick klassen `template-exercise-row` med ett eget rutnät (`66px 2fr 1fr 1fr 1fr 44px`, telefon åtta kolumner med talen på rad två). Radbrytet var `grid grid-4` med fem barn: papperskorgen föll ner på en egen rad. Mätt i Chromium 1440 (alla sex på en rad) och 390 (Set 87, Reps 80, Vikt 105 px, ingen sidled-scroll). Loggvyn har inga databasimporter kvar. Lint, 87 tester och build gröna. Standardprogram: free-exercise-db har inga, bara övningar.

**2026-09-13, övningsdatabasen (`b2dd172`).** Patrik: "bygg en övningsdatabas med bilder och animationer". Källa free-exercise-db (public domain, 873 övningar, två bildrutor var), inte exercisedb-api som Patrik föreslog under arbetet: den är en betald RapidAPI-produkt med media under egna villkor, och playgrounden svarade 429 bakom Vercels checkpoint. Byggt: `/ovningar` med sök och filter, `/ovningar/:id` med animation och steg för steg, namnkarta för 40 egna namn (seedens 33 plus katalogens senare, sju av dem gissade: se dagsnoten 2026-09-13 i vaulten och namnkartan i `src/lib/exerciseDb.ts`), miniatyr i loggvyn, Teknik-kort på övningssidan, Övningar i sidebar, rail och mobilheaderns ikoner (bottennavigeringen är oförändrad). Konventioner följda: tokens (ny `--exdb-photo-bg`), 44 px tryckytor, `role="list"`, inga hex i tsx. Verifierat: lint, 87 tester, build, Chromium 1440 och 390 utan konsolfel eller sidled-scroll, bilder laddade (48 av 48), animationen mätt (opacitet 1 → 0 efter 850 ms), `?q=bench press` gav 21 träffar. Firebase sign-up: en sond mot `accounts:signUp` med ett för kort lösenord gav `WEAK_PASSWORD`, inte `ADMIN_ONLY_OPERATION`, vilket tyder på att sign-up fortfarande är påslaget men inte bevisar det (kontrollordningen är okänd). Kvar för Patrik: bekräfta i Firebase-konsolen, Resend.

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

## Granskning 2026-09-16

Cross-project audit run from elwyn-dash (session 5 in the daily note). Results written to `## Audits` in CONTEXT.md, findings appended to BACKLOG.md under `## Granskning 2026-09-16`. Headers on buildapp.se and the TLS grade are zone-level and are fixed once in Cloudflare, not here. OWASP by a read-only subagent, 12 live requests, findings in BACKLOG P1 to P3.

## Tak på snapshots, 2026-09-16

OWASP-rundans P1, på Patriks linje (registreringen förblir öppen): `MAX_PAYLOAD_BYTES`
2 MB (största riktiga snapshot var 568 KB), `KEEP_REVISIONS` 20 (äldre rader raderas
efter varje insert), `MAX_WRITES_PER_DAY` 300 per konto i tabellen `write_quota`
(migration 0003, upsert med RETURNING, 429 `write_quota` över taket). Test i
`twoClients.test.ts`: 30 skrivningar ger 20 rader, 301:a ger 429. Verifierat: 96
tester, lint, dry-run; migration applicerad remote; Worker `71ae15bd`; live health
och POST utan token ger 401. Kvar från rundan: P2 kontobyte och konfliktbannern.
