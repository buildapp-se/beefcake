import { getDB } from '../models'

const PRESETS_KEY = 'rest-timer-presets'
const ALARM_DURATION_KEY = 'rest-timer-alarm-duration'
const DEFAULT_PRESETS = [3, 5, 8]
export const DEFAULT_REST_TIMER_ALARM_DURATION = 19
export const REST_TIMER_ALARM_DURATION_CHANGED_EVENT = 'beefcake-alarm-duration-changed'
export type RestTimerAlarmDuration = number | null

function validPresets(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 3 && value.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 60)
}

export async function loadRestTimerPresets(): Promise<number[]> {
  const db = await getDB()
  const setting = await db.get('settings', PRESETS_KEY)
  return validPresets(setting?.value) ? setting.value : [...DEFAULT_PRESETS]
}

export async function saveRestTimerPresets(presets: number[]): Promise<void> {
  if (!validPresets(presets)) {
    throw new Error('Snabbvalen måste vara tre tider på 1 till 60 minuter.')
  }
  const db = await getDB()
  await db.put('settings', { key: PRESETS_KEY, value: presets })
}

function validAlarmDuration(value: unknown): value is RestTimerAlarmDuration {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 3600)
}

export async function loadRestTimerAlarmDuration(): Promise<RestTimerAlarmDuration> {
  const db = await getDB()
  const setting = await db.get('settings', ALARM_DURATION_KEY)
  return validAlarmDuration(setting?.value) ? setting.value : DEFAULT_REST_TIMER_ALARM_DURATION
}

export async function saveRestTimerAlarmDuration(duration: RestTimerAlarmDuration): Promise<void> {
  if (!validAlarmDuration(duration)) {
    throw new Error('Alarmtiden måste vara 1 till 3 600 sekunder eller utan tidsgräns.')
  }
  const db = await getDB()
  await db.put('settings', { key: ALARM_DURATION_KEY, value: duration })
}

export async function showRestTimerNotification(): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready
      const options: NotificationOptions & { vibrate?: number[] } = {
        body: 'Vilopausen är slut. Dags för nästa set.',
        tag: 'beefcake-rest-timer',
        icon: `${import.meta.env.BASE_URL}pwa-192x192.svg`,
        vibrate: [180, 100, 180]
      }
      await registration.showNotification('Beefcake', options)
    } else {
      new Notification('Beefcake', { body: 'Vilopausen är slut. Dags för nästa set.' })
    }
  } catch {
    // The in-app signal and sound still work when notification delivery is blocked.
  }
}

export async function requestRestTimerNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.requestPermission()
}

export function startRestTimer(seconds?: number): void {
  window.dispatchEvent(new CustomEvent('beefcake-start-timer', { detail: { seconds } }))
}

export function triggerHaptic(pattern: number | number[] = 40): void {
  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern)
    } catch {
      // Ignore vibration errors if blocked by browser
    }
  }
}
