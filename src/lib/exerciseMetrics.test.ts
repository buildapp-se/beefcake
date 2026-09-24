import { describe, expect, it } from 'vitest'
import { epley1RM, repRecords, sessionMetric, EXERCISE_METRIC_LABELS } from './exerciseMetrics'

const h = {
  date: '2026-08-01',
  volume: 2450,
  setEntries: [
    { sets: 1, reps: 10, weight: 80 },
    { sets: 1, reps: 8, weight: 85 },
    { sets: 1, reps: 12, weight: 70 }
  ]
}

describe('epley1RM', () => {
  it('80 kg × 10 ger 106,7', () => {
    expect(epley1RM(80, 10)).toBeCloseTo(106.67, 1)
  })
  it('kroppsvikt, noll/negativa reps och mer än 10 reps ger inget värde', () => {
    expect(epley1RM(0, 10)).toBeNull()
    expect(epley1RM(80, 0)).toBeNull()
    expect(epley1RM(80, -1)).toBeNull()
    expect(epley1RM(80, 12)).toBeNull()
  })
})

describe('sessionMetric', () => {
  it('tyngsta set, e1RM, bästa setvolym och passvolym', () => {
    expect(sessionMetric(h, 'maxWeight')).toBe(85)
    expect(sessionMetric(h, 'e1rm')).toBeCloseTo(85 * (1 + 8 / 30), 2)
    expect(sessionMetric(h, 'bestSetVolume')).toBe(840)
    expect(sessionMetric(h, 'sessionVolume')).toBe(2450)
  })
  it('e1RM är null när inget set har 10 reps eller färre', () => {
    expect(sessionMetric({ volume: 0, setEntries: [{ reps: 15, weight: 40 }] }, 'e1rm')).toBeNull()
  })
  it('e1RM är det högsta värdet av alla giltiga set, oavsett ordning', () => {
    // Mutant "m && 0" (LogicalOperator) gör att max(m, v) blir max(0, v)
    // och det sist utvärderade giltiga värdet returneras. Vi fångar det
    // genom att låta ett sämre set ligga efter det bästa.
    const history = {
      date: '2026-08-01',
      volume: 0,
      setEntries: [
        { sets: 1, reps: 5, weight: 100 }, // e1rm = 116.67 (bäst!)
        { sets: 1, reps: 5, weight: 80 }   // e1rm = 93.33 (sämre, sist!)
      ]
    }
    expect(sessionMetric(history, 'e1rm')).toBeCloseTo(100 * (1 + 5 / 30), 2)
  })
})

describe('repRecords', () => {
  it('tyngsta vikten för minst N reps, med datum, hoppar över reps utan träff', () => {
    const history = [
      { date: '2026-07-01', setEntries: [{ reps: 5, weight: 100 }, { reps: 1, weight: 120 }] },
      { date: '2026-08-01', setEntries: [{ reps: 8, weight: 90 }, { reps: 12, weight: 70 }] }
    ]
    expect(repRecords(history)).toEqual([
      { reps: 1, weight: 120, date: '2026-07-01' },
      { reps: 3, weight: 100, date: '2026-07-01' },
      { reps: 5, weight: 100, date: '2026-07-01' },
      { reps: 8, weight: 90, date: '2026-08-01' },
      { reps: 10, weight: 70, date: '2026-08-01' },
      { reps: 12, weight: 70, date: '2026-08-01' }
    ])
  })
  it('kroppsviktsset ger inget rekord', () => {
    expect(repRecords([{ date: '2026-08-01', setEntries: [{ reps: 10, weight: 0 }] }])).toEqual([])
  })
  it('behåller datumet för första gången ett rekord lyftes om vikten tangeras', () => {
    // Mutant "s.weight >= best.weight" gör att ett senare datum med samma
    // vikt skriver över det tidigare datumet.
    const history = [
      { date: '2026-07-01', setEntries: [{ reps: 1, weight: 120 }] },
      { date: '2026-08-01', setEntries: [{ reps: 1, weight: 120 }] }
    ]
    const records = repRecords(history, [1])
    expect(records).toEqual([{ reps: 1, weight: 120, date: '2026-07-01' }])
  })
})

describe('EXERCISE_METRIC_LABELS', () => {
  it('har rätt svenska etiketter', () => {
    expect(EXERCISE_METRIC_LABELS.maxWeight).toBe('Tyngsta set')
    expect(EXERCISE_METRIC_LABELS.e1rm).toBe('Estimerat 1RM')
    expect(EXERCISE_METRIC_LABELS.bestSetVolume).toBe('Bästa setvolym')
    expect(EXERCISE_METRIC_LABELS.sessionVolume).toBe('Passvolym')
  })
})
