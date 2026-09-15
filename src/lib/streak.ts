import { localDateISO, monthNames, parseLocalDate, weekdayNames } from './date'

/**
 * Beefcake-nivån: hur muskulös Cartman är i headern.
 *
 * Streaken bygger på träningstakten "varannan dag", alltså ungefär fyra pass i
 * veckan. Ett glapp på upp till tre dagar håller kedjan vid liv, mer än tre
 * bryter den och du börjar om som tjock Cartman.
 */
export const MAX_GAP_DAYS = 3

export type BeefcakeLevel = 1 | 2 | 3 | 4

export interface BeefcakeStreak {
  level: BeefcakeLevel
  /** Antal pass i den obrutna kedjan, räknat bakåt från senaste passet. */
  streak: number
  /** Dagar sedan senaste passet, null om det inte finns något pass alls. */
  daysSinceLast: number | null
  /** Första passet i den obrutna kedjan, null när kedjan är bruten eller saknas. */
  startDate: string | null
  /** Sista dagen ett pass håller kedjan vid liv (senaste passet plus MAX_GAP_DAYS), null när kedjan är bruten eller saknas. */
  deadline: string | null
}

const DAY_MS = 86_400_000

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((parseLocalDate(toISO).getTime() - parseLocalDate(fromISO).getTime()) / DAY_MS)
}

/** Nivån stegas upp med kedjans längd. Trappan är medvetet snål i toppen. */
function levelForStreak(streak: number): BeefcakeLevel {
  if (streak >= 10) return 4
  if (streak >= 4) return 3
  return 2
}

/**
 * @param dates passdatum som `YYYY-MM-DD`, i valfri ordning, dubbletter tillåtna
 * @param todayISO dagens datum
 */
export function beefcakeStreak(dates: string[], todayISO: string): BeefcakeStreak {
  const days = Array.from(new Set(dates)).sort().reverse()
  if (days.length === 0) return { level: 1, streak: 0, daysSinceLast: null, startDate: null, deadline: null }

  const daysSinceLast = daysBetween(days[0], todayISO)
  // Ett pass daterat i framtiden ska inte straffas, därför Math.max mot 0.
  if (Math.max(0, daysSinceLast) > MAX_GAP_DAYS) {
    return { level: 1, streak: 0, daysSinceLast, startDate: null, deadline: null }
  }

  let streak = 1
  for (let i = 1; i < days.length; i += 1) {
    if (daysBetween(days[i], days[i - 1]) > MAX_GAP_DAYS) break
    streak += 1
  }

  const deadline = parseLocalDate(days[0])
  deadline.setDate(deadline.getDate() + MAX_GAP_DAYS)
  return { level: levelForStreak(streak), streak, daysSinceLast, startDate: days[streak - 1], deadline: localDateISO(deadline) }
}

/**
 * "28 dagars streak. Träna senast i dag, tisdag 15 sep, annars bryts den."
 * Dagarna räknas från kedjans första pass till och med i dag.
 */
function streakDeadlineText(startDate: string, deadline: string, todayISO: string): string {
  const days = Math.max(1, daysBetween(startDate, todayISO) + 1)
  const d = parseLocalDate(deadline)
  const date = `${weekdayNames[d.getDay()].toLowerCase()} ${d.getDate()} ${monthNames[d.getMonth()]}`
  const left = daysBetween(todayISO, deadline)
  const when = left <= 0 ? `i dag, ${date}` : left === 1 ? `i morgon, ${date}` : date
  return `${days} ${days === 1 ? 'dags' : 'dagars'} streak. Träna senast ${when}, annars bryts den.`
}

export const BEEFCAKE_LABELS: Record<BeefcakeLevel, string> = {
  1: 'Weight Gain 4000',
  2: 'På gång',
  3: 'Beefcake',
  4: 'BEEFCAAAAKE!'
}

/**
 * Statusraden bredvid Cartman. Första raden är nivåns namn, andra raden
 * förklaringen. Radbrytningen är en del av formatet: texten renderas med
 * `white-space: pre-line`, så slå aldrig ihop raderna till en enda mening.
 */
export function beefcakeStatusText(streak: BeefcakeStreak, todayISO: string): string {
  const label = BEEFCAKE_LABELS[streak.level]
  if (streak.daysSinceLast === null) {
    return `${label}\nInga pass loggade än. Dags att börja.`
  }
  if (streak.level === 1) {
    // Påminnelsen bor här, inte i en egen banner på Hem: en text, inte två som sa samma sak
    return `${label}\n${streak.daysSinceLast} dagar sedan senaste passet, din jävla latmask. Kedjan bruten, träna inom ${MAX_GAP_DAYS} dagar nästa gång.`
  }
  const chain = `${label}\n${streak.streak} pass i rad utan mer än ${MAX_GAP_DAYS} dagars uppehåll.`
  if (!streak.startDate || !streak.deadline) return chain
  return `${chain}\n${streakDeadlineText(streak.startDate, streak.deadline, todayISO)}`
}
