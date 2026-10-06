import { describe, expect, it } from 'vitest'
import { calibratedWeight, isPlateau, plateauLength, stepFor, topSet } from './progression'

const pass = (...sets: [number, number][]) => ({ setEntries: sets.map(([weight, reps]) => ({ weight, reps })) })

describe('topSet', () => {
  it('tar tyngsta vikten och flest reps på den', () => {
    expect(topSet(pass([40, 8], [60, 8], [60, 9], [50, 12]).setEntries)).toEqual({ weight: 60, reps: 9 })
  })
  it('saknas när allt är kroppsvikt', () => {
    expect(topSet(pass([0, 12]).setEntries)).toBeNull()
  })
})

describe('platå', () => {
  it('tre pass i rad med samma vikt och reps är platå', () => {
    const history = [pass([60, 8]), pass([60, 8]), pass([60, 8])]
    expect(plateauLength(history)).toBe(3)
    expect(isPlateau(history)).toBe(true)
  })
  it('två pass räcker inte', () => {
    expect(isPlateau([pass([57.5, 8]), pass([60, 8]), pass([60, 8])])).toBe(false)
  })
  it('fler reps på samma vikt är framsteg (dubbel progression)', () => {
    const history = [pass([60, 8]), pass([60, 8]), pass([60, 9]), pass([60, 9])]
    expect(plateauLength(history)).toBe(2)
    expect(isPlateau(history)).toBe(false)
  })
  it('färre reps på samma vikt är ingen höjning', () => {
    expect(isPlateau([pass([60, 10]), pass([60, 8]), pass([60, 8])])).toBe(true)
  })
  it('uppvärmningsset räknas inte: bara toppsetet jämförs', () => {
    expect(isPlateau([pass([20, 8], [60, 8]), pass([30, 5], [60, 8]), pass([40, 10], [60, 8])])).toBe(true)
  })
  it('kroppsvikt undantas, både på vikt 0 och på kind', () => {
    expect(isPlateau([pass([0, 12]), pass([0, 12]), pass([0, 12])])).toBe(false)
    expect(isPlateau([pass([70, 10]), pass([70, 10]), pass([70, 10])], { kind: 'bodyweight' })).toBe(false)
  })
  it('Håll vikten tystar tills toppvikten ändras', () => {
    const history = [pass([60, 8]), pass([60, 8]), pass([60, 8])]
    expect(isPlateau(history, { holdAt: 60 })).toBe(false)
    expect(isPlateau(history, { holdAt: 57.5 })).toBe(true)
  })
  it('tom historik är ingen platå', () => {
    expect(plateauLength([])).toBe(0)
    expect(isPlateau([])).toBe(false)
  })
})

describe('stepFor', () => {
  it('stång går på två av minsta skivan', () => {
    expect(stepFor('skivstång', 'Bänk')).toBe(2.5)
    expect(stepFor('ez-stång', 'Bicepscurl ez stång')).toBe(2.5)
  })
  it('hantlar går på 1 kg', () => {
    expect(stepFor(undefined, 'Bicepscurl hantel')).toBe(1)
    expect(stepFor(undefined, 'Snedbänk hantlar')).toBe(1)
    expect(stepFor(undefined, 'Hantelpress')).toBe(1)
  })
  it('allt annat går på 2,5 kg', () => {
    expect(stepFor(undefined, 'Triceps pushdown')).toBe(2.5)
    expect(stepFor(undefined, 'Chins')).toBe(2.5)
  })
})

describe('calibratedWeight', () => {
  it('AMRAP till nästa vikt: 60 kg × 11 med vanliga 8 reps ger 62,5 kg', () => {
    // e1RM 60 × (1 + 10/30) = 80, tillbaka till 8 reps 80 / (1 + 8/30) = 63,2, nedåt till 62,5
    expect(calibratedWeight(60, 11, 8, 2.5)).toBe(62.5)
  })
  it('avrundar nedåt till hela steg, flera steg när setet räcker', () => {
    // 60 × (1 + 10/30) = 80, 80 / (1 + 5/30) = 68,6, nedåt till 67,5
    expect(calibratedWeight(60, 10, 5, 2.5)).toBe(67.5)
  })
  it('reptaket: 20 reps räknas som 10', () => {
    expect(calibratedWeight(60, 20, 8, 2.5)).toBe(calibratedWeight(60, 10, 8, 2.5))
  })
  it('över taket gäller ett steg när du klarar fler reps än de vanliga', () => {
    expect(calibratedWeight(18.75, 15, 12, 1)).toBe(19.75)
    expect(calibratedWeight(18.75, 12, 12, 1)).toBe(18.75)
  })
  it('klarar du bara de vanliga repsen ligger vikten kvar', () => {
    expect(calibratedWeight(60, 8, 8, 2.5)).toBe(60)
    expect(calibratedWeight(60, 6, 8, 2.5)).toBe(60)
  })
  it('hantelsteg från en ojämn vikt stannar på samma raster', () => {
    // 18,75 × (1 + 10/30) = 25, 25 / (1 + 8/30) = 19,74, ett helt steg på 1 kg
    expect(calibratedWeight(18.75, 10, 8, 1)).toBe(19.75)
  })
})
