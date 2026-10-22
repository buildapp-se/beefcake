import type { CardioEntry } from '../models'

/** Förslagen i aktivitetsfältet. Fritext går också, "Annat" är bara ett förslag bland andra. */
export const CARDIO_ACTIVITIES = ['Promenad', 'Löpning', 'Cykling', 'Simning', 'Annat']

/** "45 min · 3,2 km", raden som ersätter "övningar · kg" för ett cardiopass. */
export function cardioSummary(c: CardioEntry): string {
  return c.km ? `${c.minutes} min · ${c.km.toLocaleString('sv-SE')} km` : `${c.minutes} min`
}
