// GitHub Pages har ingen SPA-fallback: /beefcake/log svarar 404 för den som inte redan
// har service workern. Pages serverar däremot /log ur log.html med 200, så varje fast
// rutt får en kopia av index.html. Körs sist i `npm run build`, efter att service
// workern skrivit sin precache-lista, så kopiorna hamnar inte i den.
// ponytail: bara de fasta rutterna i src/app.tsx. Rutter med id (/history/:id,
// /exercises/:id, /ovningar/:id) ger fortfarande 404 vid första besöket; lägg till en
// omdirigering i public/404.html om det blir ett problem.
import { copyFileSync } from 'node:fs'

const ROUTES = ['log', 'templates', 'history', 'ovningar', 'stats', 'settings', 'konto']

for (const route of ROUTES) copyFileSync('dist/index.html', `dist/${route}.html`)
