import { describe, expect, it } from 'vitest'
import { CARDIO_ACTIVITIES, cardioSummary } from './cardio'

describe('cardioSummary', () => {
  it('visar minuter och km med decimalkomma', () => {
    expect(cardioSummary({ minutes: 45, km: 3.2 })).toBe('45 min · 3,2 km')
  })

  it('visar bara minuter utan km eller med 0 km', () => {
    expect(cardioSummary({ minutes: 30 })).toBe('30 min')
    expect(cardioSummary({ minutes: 30, km: 0 })).toBe('30 min')
  })
})

describe('CARDIO_ACTIVITIES', () => {
  it('föreslår de fem aktiviteterna i ordning', () => {
    expect(CARDIO_ACTIVITIES).toEqual(['Promenad', 'Löpning', 'Cykling', 'Simning', 'Annat'])
  })
})
