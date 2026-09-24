import { describe, expect, it } from 'vitest'
import { barWeightFor, calculatePlates, formatPlatesPerSide } from './plates'

describe('calculatePlates', () => {
  it('82,5 kg på 20 kg stång är 25 + 5 + 1,25 per sida, tyngsta skivan först', () => {
    expect(calculatePlates(82.5, 20)).toEqual({
      platesPerSide: [{ weight: 25, count: 1 }, { weight: 5, count: 1 }, { weight: 1.25, count: 1 }],
      remainingWeight: 0
    })
  })

  it('vikt som inte går jämnt ut lämnar en rest', () => {
    expect(calculatePlates(21, 20).remainingWeight).toBe(1)
  })

  it('vikt under stångens vikt kräver inga skivor och ger ingen rest', () => {
    expect(calculatePlates(10, 20)).toEqual({
      platesPerSide: [],
      remainingWeight: 0
    })
  })
})

describe('formatPlatesPerSide', () => {
  it('skriver skivorna med decimalkomma', () => {
    expect(formatPlatesPerSide(82.5, 20)).toBe('25 + 5 + 1,25 per sida')
  })

  it('upprepar skivor som sitter flera gånger', () => {
    expect(formatPlatesPerSide(120, 20)).toBe('25 + 25 per sida')
  })

  it('bara stången när vikten inte överstiger den', () => {
    expect(formatPlatesPerSide(20, 20)).toBe('bara stången (20 kg)')
  })

  it('säger vad som saknas när skivorna inte räcker', () => {
    expect(formatPlatesPerSide(21, 20)).toBe('bara stången (20 kg)')
    expect(formatPlatesPerSide(23.5, 20)).toBe('1,25 per sida, 1 kg saknas')
  })
})

describe('barWeightFor', () => {
  it('skivstång 20, ez-stång 10, annat ingen stång', () => {
    expect(barWeightFor('skivstång')).toBe(20)
    expect(barWeightFor('ez-stång')).toBe(10)
    expect(barWeightFor('hantlar')).toBeNull()
    expect(barWeightFor(undefined)).toBeNull()
  })
})
