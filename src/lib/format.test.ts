import { describe, it, expect } from 'vitest'
import { formatWeight, parseDecimal, formatSet, formatSets, formatSetCompact } from './format'

// Non-breaking space: svensk tusentalsavgränsare i Intl är U+00A0, inte mellanslag.
const NBSP = ' '

describe('formatWeight', () => {
  it('använder decimalkomma', () => {
    expect(formatWeight(82.5)).toBe('82,5')
  })

  it('skriver heltal utan decimaler', () => {
    expect(formatWeight(80)).toBe('80')
  })

  it('använder mellanslag som tusentalsavgränsare', () => {
    expect(formatWeight(1897.5)).toBe(`1${NBSP}897,5`)
  })

  it('avrundar till max två decimaler', () => {
    expect(formatWeight(82.125)).toBe('82,13')
  })
})

describe('parseDecimal', () => {
  it('tolkar text med decimalkomma', () => {
    expect(parseDecimal('82,5')).toBe(82.5)
  })

  it('tolkar text med decimalpunkt', () => {
    expect(parseDecimal('82.5')).toBe(82.5)
  })

  it('trimmar blanksteg', () => {
    expect(parseDecimal('  82,5  ')).toBe(82.5)
  })

  it('förstår svensk tusentalsavgränsare, vanligt och hårt mellanslag', () => {
    expect(parseDecimal('1 000,5')).toBe(1000.5)
    expect(parseDecimal(`1${NBSP}000,5`)).toBe(1000.5)
  })

  it('returnerar null för ogiltig text', () => {
    expect(parseDecimal('abc')).toBeNull()
    expect(parseDecimal('')).toBeNull()
  })
})

describe('formatSet', () => {
  it('skriver vikt gånger reps', () => {
    expect(formatSet({ weight: 82.5, reps: 8 })).toBe('82,5 kg × 8')
  })

  it('skriver bara reps när vikten är 0', () => {
    expect(formatSet({ weight: 0, reps: 12 })).toBe('12 reps')
  })

  it('lägger RPE sist när det finns', () => {
    expect(formatSet({ weight: 100, reps: 5, rpe: 8.5 })).toBe('100 kg × 5 @8,5')
    expect(formatSet({ weight: 100, reps: 5, rpe: 0 })).toBe('100 kg × 5')
  })
})

describe('formatSets', () => {
  it('separerar med komma och mellanslag', () => {
    expect(formatSets([
      { weight: 82.5, reps: 8 },
      { weight: 82.5, reps: 7 }
    ])).toBe('82,5 kg × 8, 82,5 kg × 7')
  })
})

describe('formatSetCompact', () => {
  it('skriver vikt gånger reps utan enhet', () => {
    expect(formatSetCompact({ weight: 27.5, reps: 10 })).toBe('27,5×10')
  })

  it('skriver kroppsvikt som reps', () => {
    expect(formatSetCompact({ weight: 0, reps: 12 })).toBe('12 reps')
  })
})
