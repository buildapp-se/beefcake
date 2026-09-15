/**
 * Central datumhantering - tidszon-säker för Stockholm (UTC+2)
 * All datumhantering sker med lokal tid för att undvika UTC-buggar
 */

export const monthNames = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
export const weekdayNames =['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag']
const weekdayShortNames = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör']

/**
 * Parsa ISO-datumstring (YYYY-MM-DD) som lokal tid, inte UTC
 * Fixar buggen där new Date('2025-08-09') tolkas som UTC och visas fel i lokal tid
 */
export function parseLocalDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Formatera datum som "D Mmm YYYY" (t.ex. "9 aug 2025")
 */
export function formatDateShort(isoDate: string): string {
  const date = parseLocalDate(isoDate)
  return `${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`
}

/** Formatera en ISO-tidpunkt som svenskt datum och klockslag i Stockholm. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('sv-SE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Stockholm'
  })
}

/**
 * Formatera datum som "Ve D Mmm YYYY" (t.ex. "Lör 9 aug 2025")
 */
export function formatDateWithWeekday(isoDate: string): string {
  const date = parseLocalDate(isoDate)
  return `${weekdayShortNames[date.getDay()]} ${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`
}

/**
 * Formatera datum som "Veckodag D Mmm YYYY" (t.ex. "Lördag 9 aug 2025")
 */
export function formatDateFull(isoDate: string): string {
  const date = parseLocalDate(isoDate)
  return `${weekdayNames[date.getDay()]} ${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`
}

/**
 * Returnera månadsnyckel som "Mmm YYYY" (t.ex. "aug 2025")
 */
export function getMonthKey(date: string): string {
  const d = parseLocalDate(date)
  return `${monthNames[d.getMonth()]} ${d.getFullYear()}`
}

/**
 * Konvertera Date-objekt till ISO-datumstring (YYYY-MM-DD) med lokal tid
 */
export function localDateISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Returnera dagens datum som ISO-string (YYYY-MM-DD) i lokal tid
 */
export function todayISO(): string {
  return localDateISO(new Date())
}

/** Hela dagar mellan två lokala datum, positivt när `toISO` är senare. */
export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((parseLocalDate(toISO).getTime() - parseLocalDate(fromISO).getTime()) / 86_400_000)
}

/** "i dag", "i går", annars "för N dagar sedan". Matar "senast ..." under knapparna på Hem. */
export function daysAgoText(days: number): string {
  return days <= 0 ? 'i dag' : days === 1 ? 'i går' : `för ${days} dagar sedan`
}

/** Måndagen `weeksAgo` veckor bakåt från `fromISO` (i dag som förval), som YYYY-MM-DD. Veckan börjar på måndag i hela appen. */
export function mondayISO(weeksAgo = 0, fromISO = todayISO()): string {
  const now = parseLocalDate(fromISO)
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) - weeksAgo * 7)
  return localDateISO(monday)
}

/** ISO 8601-veckonummer för etiketten "v. 36": veckan med årets första torsdag är v. 1. */
export function isoWeek(iso: string): number {
  const d = parseLocalDate(iso)
  const thursday = new Date(d)
  thursday.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const firstThursday = new Date(thursday.getFullYear(), 0, 4)
  return 1 + Math.round(((thursday.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7)
}
