import { beforeEach, describe, expect, it, vi } from 'vitest'

const settings = vi.hoisted(() => new Map<string, unknown>())

vi.mock('../models', () => ({
  getDB: async () => ({
    get: async (_store: string, key: string) => settings.has(key) ? { key, value: settings.get(key) } : undefined,
    put: async (_store: string, setting: { key: string; value: unknown }) => {
      settings.set(setting.key, setting.value)
    }
  })
}))

import {
  DEFAULT_REST_TIMER_ALARM_DURATION,
  loadRestTimerAlarmDuration,
  saveRestTimerAlarmDuration,
  loadRestTimerPresets,
  saveRestTimerPresets
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

  it('sparar null för alarm som ljuder tills det tystas', async () => {
    await saveRestTimerAlarmDuration(null)
    await expect(loadRestTimerAlarmDuration()).resolves.toBeNull()
  })

  it('avvisar tider utanför det tillåtna intervallet', async () => {
    await expect(saveRestTimerAlarmDuration(0)).rejects.toThrow('1 till 3 600 sekunder')
    await expect(saveRestTimerAlarmDuration(3601)).rejects.toThrow('1 till 3 600 sekunder')
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

