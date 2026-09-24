import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  daysBetween, daysAgoText, formatDateTime, mondayISO, isoWeek,
  formatDateShort, formatDateWithWeekday, formatDateFull, getMonthKey, todayISO
} from './date'

// Fasta datum överallt: 2026-09-01 är en tisdag.

describe('formatDateTime', () => {
  it('formaterar tidpunkten i svensk tid', () => {
    expect(formatDateTime('2026-09-02T12:03:00Z')).toBe('2 sep. 2026 14:03')
  })
})

describe('daysBetween', () => {
  it('räknar hela dagar, positivt framåt', () => {
    expect(daysBetween('2026-08-30', '2026-09-01')).toBe(2)
    expect(daysBetween('2026-09-01', '2026-09-01')).toBe(0)
    expect(daysBetween('2026-09-01', '2026-08-30')).toBe(-2)
  })

  it('påverkas inte av sommartidsskiftet', () => {
    // 2026-10-25 är sista söndagen i oktober, klockan går tillbaka: fortfarande hela dagar
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
  })
})

describe('daysAgoText', () => {
  it('i dag, i går, annars för N dagar sedan', () => {
    expect(daysAgoText(0)).toBe('i dag')
    expect(daysAgoText(-1)).toBe('i dag')
    expect(daysAgoText(1)).toBe('i går')
    expect(daysAgoText(2)).toBe('för 2 dagar sedan')
    expect(daysAgoText(14)).toBe('för 14 dagar sedan')
  })
})

describe('mondayISO', () => {
  it('ger måndagen oavsett veckodag', () => {
    expect(mondayISO(0, '2026-08-31')).toBe('2026-08-31') // måndag
    expect(mondayISO(0, '2026-09-01')).toBe('2026-08-31') // tisdag
    expect(mondayISO(0, '2026-09-06')).toBe('2026-08-31') // söndag hör till samma vecka
  })

  it('går över månadsskifte och årsskifte', () => {
    expect(mondayISO(0, '2026-10-01')).toBe('2026-09-28') // torsdag
    expect(mondayISO(0, '2027-01-02')).toBe('2026-12-28') // lördag
    expect(mondayISO(1, '2026-09-01')).toBe('2026-08-24')
    expect(mondayISO(2, '2027-01-02')).toBe('2026-12-14')
  })
})

describe('isoWeek', () => {
  it('v. 1 vid nyår', () => {
    expect(isoWeek('2026-01-01')).toBe(1) // torsdag
    expect(isoWeek('2027-01-01')).toBe(53) // fredag, hör till 2026 v. 53
    expect(isoWeek('2027-01-04')).toBe(1) // första måndagen 2027
  })

  it('v. 52 och v. 53', () => {
    expect(isoWeek('2026-12-28')).toBe(53) // 2026 har 53 veckor
    expect(isoWeek('2025-12-29')).toBe(1)  // 2025 har 52, måndagen är redan 2026 v. 1
    expect(isoWeek('2025-12-28')).toBe(52)
    expect(isoWeek('2026-08-31')).toBe(36)
  })
})

describe('formatDateShort', () => {
  it('formaterar datum', () => {
    expect(formatDateShort('2025-08-09')).toBe('9 aug 2025')
  })

  it('formaterar alla månader', () => {
    expect(formatDateShort('2026-01-01')).toBe('1 jan 2026')
    expect(formatDateShort('2026-02-01')).toBe('1 feb 2026')
    expect(formatDateShort('2026-03-01')).toBe('1 mar 2026')
    expect(formatDateShort('2026-04-01')).toBe('1 apr 2026')
    expect(formatDateShort('2026-05-01')).toBe('1 maj 2026')
    expect(formatDateShort('2026-06-01')).toBe('1 jun 2026')
    expect(formatDateShort('2026-07-01')).toBe('1 jul 2026')
    expect(formatDateShort('2026-08-01')).toBe('1 aug 2026')
    expect(formatDateShort('2026-09-01')).toBe('1 sep 2026')
    expect(formatDateShort('2026-10-01')).toBe('1 okt 2026')
    expect(formatDateShort('2026-11-01')).toBe('1 nov 2026')
    expect(formatDateShort('2026-12-01')).toBe('1 dec 2026')
  })
})

describe('formatDateWithWeekday', () => {
  it('formaterar med kort veckodag för alla veckodagar', () => {
    expect(formatDateWithWeekday('2026-08-30')).toBe('Sön 30 aug 2026')
    expect(formatDateWithWeekday('2026-08-31')).toBe('Mån 31 aug 2026')
    expect(formatDateWithWeekday('2026-09-01')).toBe('Tis 1 sep 2026')
    expect(formatDateWithWeekday('2026-09-02')).toBe('Ons 2 sep 2026')
    expect(formatDateWithWeekday('2026-09-03')).toBe('Tor 3 sep 2026')
    expect(formatDateWithWeekday('2026-09-04')).toBe('Fre 4 sep 2026')
    expect(formatDateWithWeekday('2026-09-05')).toBe('Lör 5 sep 2026')
  })
})

describe('formatDateFull', () => {
  it('formaterar med lång veckodag för alla veckodagar', () => {
    expect(formatDateFull('2026-08-30')).toBe('Söndag 30 aug 2026')
    expect(formatDateFull('2026-08-31')).toBe('Måndag 31 aug 2026')
    expect(formatDateFull('2026-09-01')).toBe('Tisdag 1 sep 2026')
    expect(formatDateFull('2026-09-02')).toBe('Onsdag 2 sep 2026')
    expect(formatDateFull('2026-09-03')).toBe('Torsdag 3 sep 2026')
    expect(formatDateFull('2026-09-04')).toBe('Fredag 4 sep 2026')
    expect(formatDateFull('2026-09-05')).toBe('Lördag 5 sep 2026')
  })
})

describe('getMonthKey', () => {
  it('returnerar månadsnyckel', () => {
    expect(getMonthKey('2025-08-09')).toBe('aug 2025')
  })
})

describe('todayISO', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returnerar dagens datum', () => {
    vi.setSystemTime(new Date('2026-09-01T12:00:00.000+02:00'))
    expect(todayISO()).toBe('2026-09-01')
  })
})
