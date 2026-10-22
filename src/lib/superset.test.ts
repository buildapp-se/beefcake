import { describe, expect, it } from 'vitest'
import { setCompletedInSuperset, supersetGroup, unlinkAt, type SupersetExercise } from './superset'
import type { ActiveSetEntry } from '../models'

const set = (type: ActiveSetEntry['type'] = 'normal'): ActiveSetEntry => ({ sets: 1, reps: 10, weight: 20, completed: false, type })
const ex = (sets: ActiveSetEntry[], supersetWithNext = false): SupersetExercise => ({ setEntries: sets, supersetWithNext })
const done = (e: SupersetExercise) => e.setEntries.map(s => Boolean(s.completed))

describe('supersetGroup', () => {
  it('hittar hela gruppen från vilken övning som helst i den', () => {
    const list = [ex([]), ex([], true), ex([], true), ex([]), ex([])]
    expect(supersetGroup(list, 2)).toEqual([1, 2, 3])
    expect(supersetGroup(list, 3)).toEqual([1, 2, 3])
    expect(supersetGroup(list, 0)).toEqual([0])
    expect(supersetGroup(list, 4)).toEqual([4])
  })
})

describe('setCompletedInSuperset', () => {
  it('bockar samma set i den kopplade övningen', () => {
    const list = [ex([set(), set()], true), ex([set(), set()])]
    const result = setCompletedInSuperset(list, 0, 1, true)
    expect(result.map(done)).toEqual([[false, true], [false, true]])
  })

  it('räknar arbetsset, så uppvärmning på ena övningen inte flyttar kopplingen', () => {
    const list = [ex([set('warmup'), set('warmup'), set(), set()], true), ex([set(), set()])]
    expect(setCompletedInSuperset(list, 0, 2, true).map(done)).toEqual([[false, false, true, false], [true, false]])
    expect(setCompletedInSuperset(list, 1, 1, true).map(done)).toEqual([[false, false, false, true], [false, true]])
  })

  it('uppvärmning bockas bara för sig', () => {
    const list = [ex([set('warmup'), set()], true), ex([set()])]
    expect(setCompletedInSuperset(list, 0, 0, true).map(done)).toEqual([[true, false], [false]])
  })

  it('avbockning följer också med', () => {
    const list = [ex([{ ...set(), completed: true }], true), ex([{ ...set(), completed: true }])]
    expect(setCompletedInSuperset(list, 1, 0, false).map(done)).toEqual([[false], [false]])
  })

  it('partner med färre set lämnas orörd', () => {
    const list = [ex([set(), set(), set()], true), ex([set()])]
    expect(setCompletedInSuperset(list, 0, 2, true).map(done)).toEqual([[false, false, true], [false]])
  })

  it('okopplad övning bockar bara sig själv', () => {
    const list = [ex([set()]), ex([set()])]
    expect(setCompletedInSuperset(list, 0, 0, true).map(done)).toEqual([[true], [false]])
  })
})

describe('unlinkAt', () => {
  it('kopplar loss övningen från både den ovan och den under', () => {
    const list = [ex([], true), ex([], true), ex([])]
    expect(unlinkAt(list, 1).map(e => e.supersetWithNext)).toEqual([false, false, false])
    expect(unlinkAt(list, 0).map(e => e.supersetWithNext)).toEqual([false, true, false])
  })
})
