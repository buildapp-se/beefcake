import { describe, expect, it } from 'vitest'
import { beefcakeStatusText, beefcakeStreak } from './streak'

describe('beefcakeStatusText', () => {
  it('sätter nivåns namn på egen rad före förklaringen och streaken', () => {
    const text = beefcakeStatusText(beefcakeStreak(['2026-08-19', '2026-08-21'], '2026-08-21'), '2026-08-21')
    expect(text.split('\n')).toEqual([
      'På gång',
      '2 pass i rad utan mer än 3 dagars uppehåll.',
      '3 dagars streak. Träna senast måndag 24 aug, annars bryts den.'
    ])
  })

  it('sista dagen står som i dag eller i morgon när den är nära', () => {
    const dates = ['2026-08-18']
    expect(beefcakeStatusText(beefcakeStreak(dates, '2026-08-21'), '2026-08-21').split('\n')[2])
      .toBe('4 dagars streak. Träna senast i dag, fredag 21 aug, annars bryts den.')
    expect(beefcakeStatusText(beefcakeStreak(dates, '2026-08-20'), '2026-08-20').split('\n')[2])
      .toBe('3 dagars streak. Träna senast i morgon, fredag 21 aug, annars bryts den.')
  })

  it('pass i dag som första i kedjan ger en dags streak', () => {
    expect(beefcakeStatusText(beefcakeStreak(['2026-08-21'], '2026-08-21'), '2026-08-21').split('\n')[2])
      .toBe('1 dags streak. Träna senast måndag 24 aug, annars bryts den.')
  })

  it('streak och sista dag över ett månadsskifte', () => {
    const result = beefcakeStreak(['2026-08-29', '2026-08-31'], '2026-09-01')
    expect(result.startDate).toBe('2026-08-29')
    expect(result.deadline).toBe('2026-09-03')
    expect(beefcakeStatusText(result, '2026-09-01').split('\n')[2])
      .toBe('4 dagars streak. Träna senast torsdag 3 sep, annars bryts den.')
  })

  it('bruten kedja förklarar hur länge det var sedan', () => {
    const text = beefcakeStatusText(beefcakeStreak(['2026-08-01'], '2026-08-21'), '2026-08-21')
    expect(text.split('\n')).toEqual([
      'Weight Gain 4000',
      '20 dagar sedan senaste passet, din jävla latmask. Kedjan bruten, träna inom 3 dagar nästa gång.'
    ])
  })

  it('utan pass står det att man inte börjat', () => {
    const text = beefcakeStatusText(beefcakeStreak([], '2026-08-21'), '2026-08-21')
    expect(text.split('\n')).toEqual(['Weight Gain 4000', 'Inga pass loggade än. Dags att börja.'])
  })

  it('skriver ut rätt namn för nivå 3 och 4', () => {
    const text3 = beefcakeStatusText({ level: 3, streak: 4, daysSinceLast: 0, startDate: '2026-08-15', deadline: '2026-08-24' }, '2026-08-21')
    expect(text3.split('\n')[0]).toBe('Beefcake')

    const text4 = beefcakeStatusText({ level: 4, streak: 10, daysSinceLast: 0, startDate: '2026-08-03', deadline: '2026-08-24' }, '2026-08-21')
    expect(text4.split('\n')[0]).toBe('BEEFCAAAAKE!')
  })

  it('faller tillbaka till att bara visa kedjan om startdatum eller deadline saknas', () => {
    const base = { level: 2 as const, streak: 2, daysSinceLast: 1, startDate: '2026-08-19', deadline: '2026-08-24' }
    const expected = 'På gång\n2 pass i rad utan mer än 3 dagars uppehåll.'
    expect(beefcakeStatusText({ ...base, startDate: null }, '2026-08-21')).toBe(expected)
    expect(beefcakeStatusText({ ...base, deadline: null }, '2026-08-21')).toBe(expected)
  })
})

describe('beefcakeStreak', () => {
  it('utan pass står Cartman kvar på nivå 1', () => {
    expect(beefcakeStreak([], '2026-08-21')).toEqual({ level: 1, streak: 0, daysSinceLast: null, startDate: null, deadline: null })
  })

  it('mer än tre dagars uppehåll faller tillbaka till nivå 1', () => {
    const result = beefcakeStreak(['2026-08-10', '2026-08-12', '2026-08-14', '2026-08-16'], '2026-08-21')
    expect(result.level).toBe(1)
    expect(result.streak).toBe(0)
    expect(result.daysSinceLast).toBe(5)
  })

  it('exakt tre dagars uppehåll håller kedjan vid liv', () => {
    expect(beefcakeStreak(['2026-08-18'], '2026-08-21').level).toBe(2)
  })

  it('varannan dag stegar upp: 4 pass ger nivå 3', () => {
    const dates = ['2026-08-15', '2026-08-17', '2026-08-19', '2026-08-21']
    expect(beefcakeStreak(dates, '2026-08-21')).toEqual({ level: 3, streak: 4, daysSinceLast: 0, startDate: '2026-08-15', deadline: '2026-08-24' })
  })

  it('tio pass i rad ger nivå 4', () => {
    const dates = Array.from({ length: 10 }, (_, i) => `2026-08-${String(3 + i * 2).padStart(2, '0')}`)
    expect(beefcakeStreak(dates, '2026-08-21')).toMatchObject({ level: 4, streak: 10, daysSinceLast: 0, startDate: '2026-08-03' })
  })

  it('kedjan bryts vid det första för långa glappet, äldre pass räknas inte', () => {
    const dates = ['2026-07-01', '2026-07-03', '2026-08-19', '2026-08-21']
    expect(beefcakeStreak(dates, '2026-08-21').streak).toBe(2)
  })

  it('dubbletter av samma datum räknas som ett pass', () => {
    const dates = ['2026-08-21', '2026-08-21', '2026-08-19']
    expect(beefcakeStreak(dates, '2026-08-21').streak).toBe(2)
  })

  it('ett pass daterat i framtiden bryter inte kedjan', () => {
    expect(beefcakeStreak(['2026-08-25'], '2026-08-21').level).toBe(2)
  })

  it('exakt tre dagars uppehåll mellan två historiska pass håller kedjan vid liv', () => {
    const dates = ['2026-08-15', '2026-08-18', '2026-08-21']
    expect(beefcakeStreak(dates, '2026-08-21').streak).toBe(3)
  })

  it('datum i oordning sorteras före beräkning av streak', () => {
    const dates = ['2026-08-19', '2026-08-15', '2026-08-21', '2026-08-17']
    expect(beefcakeStreak(dates, '2026-08-21').streak).toBe(4)
  })
})
