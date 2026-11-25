/// <reference types="vite-plugin-pwa/client" />
import { render } from 'preact'
import { registerSW } from 'virtual:pwa-register'
import { App } from './app.tsx'
import { announceUpdate } from './components/UpdateBanner'
import { syncSeed } from './services/dataService'
import { isCloudSyncConfigured } from './services/cloudSyncService'

// Service workern hämtar nya byggen men aktiverar dem inte själv: bannern frågar först.
// Bara när en äldre worker styr sidan: Firefox kallar första installationen "extern" om en
// ny sida laddas medan den pågår, och bannern visades då för en helt ny besökare.
const updateSW = registerSW({
  onNeedRefresh() { if (navigator.serviceWorker.controller) announceUpdate(() => updateSW(true)) }
})

const root = document.getElementById('app')!

if (isCloudSyncConfigured()) {
  // Med moln hämtas snapshoten först när Firebase har gett en inloggad användare
  // (LoginGate kör syncSeed då). Att hämta här, före inloggningen, gav "Du är inte
  // inloggad" och en tom app eftersom inget hämtade om efteråt.
  render(<App />, root)
} else {
  syncSeed()
    .then(({ sessionsAdded, exercisesAdded }) => {
      if (sessionsAdded || exercisesAdded) {
        console.info(`Seed: +${sessionsAdded} pass, +${exercisesAdded} övningar`)
      }
    })
    .catch(err => console.error('Seed misslyckades:', err))
    .finally(() => render(<App />, root))
}
