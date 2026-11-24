// GitHub Pages har ingen SPA-fallback: /beefcake/log svarar 404 för den som inte redan
// har service workern. Pages serverar däremot /log ur log.html med 200, så varje fast
// rutt får en kopia av index.html. Körs sist i `npm run build`, efter att service
// workern skrivit sin precache-lista, så kopiorna hamnar inte i den.
// Rutter med id (/history/:id, /exercises/:id, /ovningar/:id) kan inte få egna filer,
// så 404.html är också appen: Pages svarar 404 men webbläsaren renderar rätt sida, och
// en okänd adress får appens "Sidan hittades inte". Före 2026-11-24 gav en omladdning
// av ett pass eller en övning utan service worker en fristående felsida.
import { copyFileSync } from 'node:fs'

const ROUTES = ['log', 'cardio', 'templates', 'history', 'ovningar', 'stats', 'settings', 'konto']

for (const route of [...ROUTES, '404']) copyFileSync('dist/index.html', `dist/${route}.html`)
