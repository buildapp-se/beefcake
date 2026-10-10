import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const settings = vi.hoisted(() => new Map<string, unknown>())

vi.mock('../models', () => ({
  getDB: async () => ({
    get: async (store: string, key: string) => {
      if (store !== 'settings') throw new Error(`Wrong store: ${store}`)
      return settings.has(key) ? { key, value: settings.get(key) } : undefined
    },
    put: async (store: string, setting: { key: string; value: unknown }) => {
      if (store !== 'settings') throw new Error(`Wrong store: ${store}`)
      settings.set(setting.key, setting.value)
    }
  })
}))

import {
  DEFAULT_REST_TIMER_ALARM_DURATION,
  loadRestTimerAlarmDuration,
  saveRestTimerAlarmDuration,
  loadRestTimerPresets,
  saveRestTimerPresets,
  showRestTimerNotification,
  requestRestTimerNotifications,
  startRestTimer,
  triggerHaptic
} from './timerService'

describe('vilotimerns alarmtid', () => {
  beforeEach(() => settings.clear())

  it('använder den tidigare fasta tiden som standard', async () => {
    await expect(loadRestTimerAlarmDuration()).resolves.toBe(DEFAULT_REST_TIMER_ALARM_DURATION)
  })

  it('sparar en vald tid i sekunder', async () => {
    await saveRestTimerAlarmDuration(30)
    await expect(loadRestTimerAlarmDuration()).resolves.toBe(30)
  })

  it('sparar gränsvärden 1 och 3600 sekunder', async () => {
    await saveRestTimerAlarmDuration(1)
    await expect(loadRestTimerAlarmDuration()).resolves.toBe(1)
    
    await saveRestTimerAlarmDuration(3600)
    await expect(loadRestTimerAlarmDuration()).resolves.toBe(3600)
  })

  it('sparar null för alarm som ljuder tills det tystas', async () => {
    await saveRestTimerAlarmDuration(null)
    await expect(loadRestTimerAlarmDuration()).resolves.toBeNull()
  })

  it('avvisar tider utanför det tillåtna intervallet', async () => {
    await expect(saveRestTimerAlarmDuration(0)).rejects.toThrow('1 till 3 600 sekunder')
    await expect(saveRestTimerAlarmDuration(3601)).rejects.toThrow('1 till 3 600 sekunder')
  })

  it('avvisar decimaltal för larmtiden', async () => {
    await expect(saveRestTimerAlarmDuration(1.5)).rejects.toThrow('1 till 3 600 sekunder')
  })
})

describe('vilotimerns snabbval (presets)', () => {
  beforeEach(() => settings.clear())

  it('returnerar standardvalen om inget är sparat', async () => {
    await expect(loadRestTimerPresets()).resolves.toEqual([3, 5, 8])
  })

  it('sparar och laddar giltiga snabbval', async () => {
    await saveRestTimerPresets([1, 2, 60])
    await expect(loadRestTimerPresets()).resolves.toEqual([1, 2, 60])
  })

  it('sparar halva minuter', async () => {
    await saveRestTimerPresets([1.5, 5, 8])
    await expect(loadRestTimerPresets()).resolves.toEqual([1.5, 5, 8])
  })

  it('avvisar om arrayen inte har exakt tre element', async () => {
    await expect(saveRestTimerPresets([1, 2])).rejects.toThrow('1 till 60 minuter')
    await expect(loadRestTimerPresets()).resolves.toEqual([3, 5, 8])

    await expect(saveRestTimerPresets([1, 2, 3, 4])).rejects.toThrow('1 till 60 minuter')
    await expect(loadRestTimerPresets()).resolves.toEqual([3, 5, 8])
  })

  it('avvisar värden utanför 1 till 60', async () => {
    await expect(saveRestTimerPresets([0, 5, 8])).rejects.toThrow('1 till 60 minuter')
    await expect(loadRestTimerPresets()).resolves.toEqual([3, 5, 8])

    await expect(saveRestTimerPresets([3, 5, 61])).rejects.toThrow('1 till 60 minuter')
    await expect(loadRestTimerPresets()).resolves.toEqual([3, 5, 8])
  })

  it('avvisar om värdena inte är ändliga nummer', async () => {
    await expect(saveRestTimerPresets([NaN, 5, 8])).rejects.toThrow('1 till 60 minuter')
    await expect(loadRestTimerPresets()).resolves.toEqual([3, 5, 8])

    await expect(saveRestTimerPresets([Infinity, 5, 8])).rejects.toThrow('1 till 60 minuter')
    await expect(loadRestTimerPresets()).resolves.toEqual([3, 5, 8])
    
    await expect(saveRestTimerPresets(["3", 5, 8] as unknown as number[])).rejects.toThrow('1 till 60 minuter')
    await expect(loadRestTimerPresets()).resolves.toEqual([3, 5, 8])
  })

  it('ignorerar skadad data i databasen', async () => {
    settings.set('rest-timer-presets', 'inte en array')
    await expect(loadRestTimerPresets()).resolves.toEqual([3, 5, 8])

    settings.set('rest-timer-presets', { length: 3, 0: 1, 1: 2, 2: 3 })
    await expect(loadRestTimerPresets()).resolves.toEqual([3, 5, 8])

    settings.set('rest-timer-presets', [3, null, 8])
    await expect(loadRestTimerPresets()).resolves.toEqual([3, 5, 8])
  })
})

const REST_OVER = 'Vilopausen är slut. Dags för nästa set.'

function installNotification(permission: NotificationPermission) {
  const created: Array<{ title: string; options?: NotificationOptions }> = []
  const requestPermission = vi.fn(async (): Promise<NotificationPermission> => 'denied')
  class FakeNotification {
    static permission = permission
    static requestPermission = requestPermission
    constructor(title: string, options?: NotificationOptions) {
      created.push({ title, options })
    }
  }
  vi.stubGlobal('Notification', FakeNotification)
  return { created, requestPermission }
}

function installServiceWorker(showNotification: (title: string, options: NotificationOptions & { vibrate?: number[] }) => Promise<void>) {
  vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({ showNotification }) } })
}

describe('notis när vilopausen är slut', () => {
  beforeEach(() => {
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('navigator', {})
  })
  afterEach(() => vi.unstubAllGlobals())

  it('visar notisen via service workern med text, tagg, ikon och vibration', async () => {
    const { created } = installNotification('granted')
    const showNotification = vi.fn(async () => {})
    installServiceWorker(showNotification)

    await showRestTimerNotification()

    expect(showNotification).toHaveBeenCalledTimes(1)
    expect(showNotification).toHaveBeenCalledWith('Beefcake', {
      body: REST_OVER,
      tag: 'beefcake-rest-timer',
      icon: `${import.meta.env.BASE_URL}pwa-192x192.svg`,
      vibrate: [180, 100, 180]
    })
    expect(created).toEqual([])
  })

  it('faller tillbaka på en vanlig notis utan service worker', async () => {
    const { created } = installNotification('granted')

    await showRestTimerNotification()

    expect(created).toEqual([{ title: 'Beefcake', options: { body: REST_OVER } }])
  })

  it('visar ingen notis när tillståndet inte är beviljat', async () => {
    for (const permission of ['denied', 'default'] as const) {
      const { created } = installNotification(permission)
      const showNotification = vi.fn(async () => {})
      installServiceWorker(showNotification)

      await showRestTimerNotification()

      expect(showNotification).not.toHaveBeenCalled()
      expect(created).toEqual([])
    }
  })

  it('gör ingenting i en webbläsare utan notiser', async () => {
    const showNotification = vi.fn(async () => {})
    installServiceWorker(showNotification)

    await expect(showRestTimerNotification()).resolves.toBeUndefined()
    expect(showNotification).not.toHaveBeenCalled()
  })

  it('sväljer fel när notisen blockeras', async () => {
    installNotification('granted')
    installServiceWorker(async () => { throw new Error('blockerad') })

    await expect(showRestTimerNotification()).resolves.toBeUndefined()
  })
})

describe('begäran om notistillstånd', () => {
  beforeEach(() => vi.stubGlobal('window', globalThis))
  afterEach(() => vi.unstubAllGlobals())

  it('returnerar webbläsarens svar', async () => {
    const { requestPermission } = installNotification('default')

    await expect(requestRestTimerNotifications()).resolves.toBe('denied')
    expect(requestPermission).toHaveBeenCalledTimes(1)
  })

  it('returnerar unsupported utan notisstöd', async () => {
    await expect(requestRestTimerNotifications()).resolves.toBe('unsupported')
  })
})

describe('startRestTimer', () => {
  beforeEach(() => {
    vi.stubGlobal('window', new EventTarget())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('skickar ett event med angivet antal sekunder', () => {
    let receivedEvent: CustomEvent | undefined
    window.addEventListener('beefcake-start-timer', (e) => {
      receivedEvent = e as CustomEvent
    })
    startRestTimer(120)
    expect(receivedEvent).toBeDefined()
    expect(receivedEvent?.detail).toEqual({ seconds: 120 })
  })

  it('skickar ett event utan angivna sekunder', () => {
    let receivedEvent: CustomEvent | undefined
    window.addEventListener('beefcake-start-timer', (e) => {
      receivedEvent = e as CustomEvent
    })
    startRestTimer()
    expect(receivedEvent).toBeDefined()
    expect(receivedEvent?.detail).toEqual({ seconds: undefined })
  })
})

describe('triggerHaptic', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('anropar navigator.vibrate med standardmönster om det stöds', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', { vibrate })
    
    triggerHaptic()
    
    expect(vibrate).toHaveBeenCalledWith(40)
  })

  it('anropar navigator.vibrate med angivet mönster', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', { vibrate })
    
    triggerHaptic([100, 50, 100])
    
    expect(vibrate).toHaveBeenCalledWith([100, 50, 100])
  })

  it('kraschar inte om window saknas (exempelvis på server)', () => {
    const originalWindow = globalThis.window
    const originalNavigator = globalThis.navigator
    // @ts-expect-error test purpose
    delete globalThis.window
    // @ts-expect-error test purpose
    delete globalThis.navigator

    try {
      expect(() => triggerHaptic()).not.toThrow()
    } finally {
      globalThis.window = originalWindow
      globalThis.navigator = originalNavigator
    }
  })

  it('kraschar inte om vibrate saknas i navigator', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', {})
    
    expect(() => triggerHaptic()).not.toThrow()
  })

  it('sväljer eventuella fel från navigator.vibrate', () => {
    const vibrate = vi.fn(() => { throw new TypeError('Not allowed') })
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', { vibrate })
    
    expect(() => triggerHaptic()).not.toThrow()
    expect(vibrate).toHaveBeenCalled()
  })
})


describe('vilans sluttid över en omstart', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value) },
      removeItem: (key: string) => { store.delete(key) }
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('en sluttid i framtiden finns kvar efter omstart', async () => {
    const { loadRestDeadline, saveRestDeadline } = await import('./timerService')
    const deadline = Date.now() + 60_000
    saveRestDeadline(deadline)
    expect(loadRestDeadline()).toBe(deadline)
  })

  it('en vila som gått ut eller stoppats glöms', async () => {
    const { loadRestDeadline, saveRestDeadline } = await import('./timerService')
    saveRestDeadline(Date.now() - 1000)
    expect(loadRestDeadline()).toBeNull()
    saveRestDeadline(Date.now() + 60_000)
    saveRestDeadline(null)
    expect(loadRestDeadline()).toBeNull()
  })

  it('utan localStorage går timern som förut', async () => {
    const { loadRestDeadline, saveRestDeadline } = await import('./timerService')
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } })
    expect(() => saveRestDeadline(Date.now() + 1000)).not.toThrow()
    expect(loadRestDeadline()).toBeNull()
  })
})
