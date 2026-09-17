import { useEffect, useRef, useState } from 'preact/hooks'
import {
  DEFAULT_REST_TIMER_ALARM_DURATION,
  loadRestTimerAlarmDuration,
  loadRestTimerPresets,
  REST_TIMER_ALARM_DURATION_CHANGED_EVENT,
  requestRestTimerNotifications,
  saveRestTimerPresets,
  showRestTimerNotification,
  type RestTimerAlarmDuration
} from '../services/timerService'

type TimerStatus = 'idle' | 'running' | 'paused' | 'finished'

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

let activeSoundContext: AudioContext | null = null
let activeSoundRepeatTimer: number | null = null
let activeSoundStopTimer: number | null = null

function stopTimerSound(): void {
  if (activeSoundRepeatTimer !== null) window.clearInterval(activeSoundRepeatTimer)
  if (activeSoundStopTimer !== null) window.clearTimeout(activeSoundStopTimer)
  activeSoundRepeatTimer = null
  activeSoundStopTimer = null
  if (activeSoundContext) void activeSoundContext.close()
  activeSoundContext = null
}

function playChime(context: AudioContext): void {
  const frequencies = [440, 659, 880]
  frequencies.forEach((frequency, note) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const start = context.currentTime + note * 0.14
    oscillator.type = 'triangle'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.025)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(start)
    oscillator.stop(start + 0.48)
  })
}

function playTimerSound(duration: RestTimerAlarmDuration): void {
  try {
    stopTimerSound()
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const context = new AudioContextClass()
    activeSoundContext = context

    playChime(context)
    activeSoundRepeatTimer = window.setInterval(() => playChime(context), 1500)
    // Signalen ska höras genom en hörlur mitt i ett set, inte bara i tystnad.
    if (duration !== null) {
      activeSoundStopTimer = window.setTimeout(stopTimerSound, duration * 1000)
    }
  } catch {
    // Some browsers block audio until the next user gesture.
  }
}

export function RestTimer() {
  const [presets, setPresets] = useState([3, 5, 8])
  const [selectedPreset, setSelectedPreset] = useState(0)
  const [remaining, setRemaining] = useState(180)
  const [status, setStatus] = useState<TimerStatus>('idle')
  const [alarmDuration, setAlarmDuration] = useState<RestTimerAlarmDuration>(DEFAULT_REST_TIMER_ALARM_DURATION)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    'Notification' in window ? Notification.permission : 'unsupported'
  )
  const deadlineRef = useRef<number | null>(null)

  useEffect(() => {
    Promise.all([loadRestTimerPresets(), loadRestTimerAlarmDuration()]).then(([loadedPresets, loadedAlarmDuration]) => {
      setPresets(loadedPresets)
      setRemaining(loadedPresets[0] * 60)
      setAlarmDuration(loadedAlarmDuration)
    }).catch(() => undefined)
  }, [])

  useEffect(() => stopTimerSound, [])

  useEffect(() => {
    const handleAlarmDurationChange = (event: Event) => {
      setAlarmDuration((event as CustomEvent<RestTimerAlarmDuration>).detail)
    }
    window.addEventListener(REST_TIMER_ALARM_DURATION_CHANGED_EVENT, handleAlarmDurationChange)
    return () => window.removeEventListener(REST_TIMER_ALARM_DURATION_CHANGED_EVENT, handleAlarmDurationChange)
  }, [])

  useEffect(() => {
    if (status !== 'running') return

    const tick = () => {
      const deadline = deadlineRef.current
      if (!deadline) return
      const nextRemaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setRemaining(nextRemaining)
      if (nextRemaining === 0) {
        deadlineRef.current = null
        setStatus('finished')
        playTimerSound(alarmDuration)
        void showRestTimerNotification()
      }
    }

    tick()
    const interval = window.setInterval(tick, 250)
    return () => window.clearInterval(interval)
  }, [status, alarmDuration])

  // Håll skärmen tänd medan timern går: iOS söver sidans JS vid låst skärm, och då uteblir både ljud och notis.
  // ponytail: bara under 'running', inte 'finished', så en glömd telefon inte lyser för evigt.
  // Räcker inte det (annan app i förgrunden, låst skärm) är nästa steg riktig webb-push.
  useEffect(() => {
    if (status !== 'running' || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    // Webbläsaren släpper låset själv när appen döljs, så det begärs om varje gång den syns igen.
    const acquire = () => {
      if (document.visibilityState !== 'visible') return
      navigator.wakeLock.request('screen').then(sentinel => {
        if (cancelled) void sentinel.release()
        else lock = sentinel
      }).catch(() => undefined) // Nekas t.ex. i strömsparläge; timern fungerar som förut.
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', acquire)
      void lock?.release()
    }
  }, [status])

  useEffect(() => {
    const handleStart = (event: Event) => {
      const customEvent = event as CustomEvent<{ seconds?: number }>
      const seconds = customEvent.detail?.seconds ?? (presets[selectedPreset] * 60)
      setRemaining(seconds)
      deadlineRef.current = Date.now() + seconds * 1000
      setStatus('running')
    }

    window.addEventListener('beefcake-start-timer', handleStart)
    return () => window.removeEventListener('beefcake-start-timer', handleStart)
  }, [presets, selectedPreset])

  // Lämna sidan med timern igång: fråga först. beforeunload täcker flik och omladdning,
  // klickfångaren täcker appens egna länkar (wouter har ingen egen spärr).
  useEffect(() => {
    if (status !== 'running') return
    const question = 'Vilotimern är igång. Vill du lämna sidan ändå?'
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const guardLinks = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest('a[href]')
      if (link && !window.confirm(question)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', guardLinks, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', guardLinks, true)
    }
  }, [status])

  function adjustTime(deltaSeconds: number) {
    if (deadlineRef.current) {
      deadlineRef.current += deltaSeconds * 1000
    }
    setRemaining(prev => Math.max(0, prev + deltaSeconds))
  }

  function choosePreset(index: number) {
    setSelectedPreset(index)
    if (status !== 'running') {
      setRemaining(presets[index] * 60)
      setStatus('idle')
    }
  }

  function updatePreset(value: string) {
    const minutes = Math.min(60, Math.max(1, Number.parseInt(value, 10) || 1))
    const nextPresets = presets.map((preset, index) => index === selectedPreset ? minutes : preset)
    setPresets(nextPresets)
    void saveRestTimerPresets(nextPresets)
    if (status !== 'running') setRemaining(minutes * 60)
  }

  function startOrResume() {
    if (status === 'finished' || status === 'idle') {
      setRemaining(presets[selectedPreset] * 60)
    }
    deadlineRef.current = Date.now() + remaining * 1000
    setStatus('running')
  }

  function pause() {
    if (deadlineRef.current) {
      setRemaining(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)))
    }
    deadlineRef.current = null
    setStatus('paused')
  }

  function reset() {
    stopTimerSound()
    deadlineRef.current = null
    setRemaining(presets[selectedPreset] * 60)
    setStatus('idle')
  }

  async function enableNotifications() {
    const permission = await requestRestTimerNotifications()
    setNotificationPermission(permission)
  }

  const isActive = status === 'running' || status === 'paused'
  const statusLabel = status === 'finished' ? 'Klar' : status === 'paused' ? 'Pausad' : status === 'running' ? 'Pågår' : 'Redo'

  return (
    <section
      class={`rest-timer ${isActive || status === 'finished' ? 'rest-timer-active' : ''} ${status === 'finished' ? 'rest-timer-finished' : ''}`}
      aria-label="Vilotimer"
    >
      <div class="rest-timer-header">
        <div>
          <span class="rest-timer-kicker">Mellan set</span>
          <h2>Vilotimer</h2>
        </div>
        <span class="rest-timer-status">{statusLabel}</span>
      </div>

      <div class="rest-timer-display" aria-live="polite">
        <span>{formatTime(remaining)}</span>
        {isActive && (
          <div class="rest-timer-adjust-group flex gap-sm justify-center mt-1">
            <button type="button" class="btn btn-sm btn-secondary" onClick={() => adjustTime(-15)} aria-label="Minska 15 sekunder">-15s</button>
            <button type="button" class="btn btn-sm btn-secondary" onClick={() => adjustTime(30)} aria-label="Öka 30 sekunder">+30s</button>
          </div>
        )}
      </div>

      <div class="rest-timer-presets" role="group" aria-label="Snabbval för vilotid">
        {presets.map((preset, index) => (
          <button
            type="button"
            class={selectedPreset === index ? 'rest-timer-preset selected' : 'rest-timer-preset'}
            onClick={() => choosePreset(index)}
            aria-pressed={selectedPreset === index}
          >
            {preset} min
          </button>
        ))}
      </div>

      <label class="rest-timer-edit">
        <span>Ändra valt snabbval</span>
        <div class="rest-timer-input-wrap">
          <input
            type="number"
            min="1"
            max="60"
            value={presets[selectedPreset]}
            onInput={event => updatePreset((event.target as HTMLInputElement).value)}
            aria-label="Vald vilotid i minuter"
          />
          <span>min</span>
        </div>
      </label>

      <div class="rest-timer-actions">
        <button type="button" class="btn btn-primary rest-timer-main-action" onClick={status === 'running' ? pause : startOrResume}>
          {status === 'running' ? (
            <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 5h3v14H7zM14 5h3v14h-3z" /></svg>
          ) : (
            <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m8 5 11 7-11 7z" /></svg>
          )}
          {status === 'running' ? 'Pausa' : isActive ? 'Fortsätt' : status === 'finished' ? 'Kör igen' : 'Starta'}
        </button>
        <button type="button" class="btn btn-secondary rest-timer-reset" onClick={reset}>Återställ</button>
      </div>

      {notificationPermission === 'default' && (
        <button type="button" class="rest-timer-notification" onClick={enableNotifications}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6.5 10.5a5.5 5.5 0 0 1 11 0c0 6 2.5 6 2.5 7h-16c0-1 2.5-1 2.5-7Zm4 10h3" /></svg>
          Tillåt notis när tiden är slut
        </button>
      )}
      {notificationPermission === 'granted' && <span class="rest-timer-notification-ready">Notiser är aktiverade</span>}
      {notificationPermission === 'denied' && <span class="rest-timer-notification-muted">Notiser är blockerade i webbläsaren</span>}
      {status === 'finished' && <button type="button" class="rest-timer-stop-sound" onClick={stopTimerSound}>Tysta ljudet</button>}
    </section>
  )
}
