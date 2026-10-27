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

  it('stannar vid sista övningen även om den har supersetWithNext', () => {
    const list = [ex([], true), ex([], true)]
    expect(supersetGroup(list, 0)).toEqual([0, 1])
    expect(supersetGroup(list, 1)).toEqual([0, 1])
    expect(supersetGroup([ex([], true)], 0)).toEqual([0])
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

  it('testset (calibration) bockas bara för sig', () => {
    const calib = { ...set(), calibration: true }
    const list = [ex([calib, set()], true), ex([set()])]
    expect(setCompletedInSuperset(list, 0, 0, true).map(done)).toEqual([[true, false], [false]])
  })

  it('avbockning följer också med', () => {
    const list = [ex([{ ...set(), completed: true }], true), ex([{ ...set(), completed: true }])]
    expect(setCompletedInSuperset(list, 1, 0, false).map(done)).toEqual([[false], [false]])
  })

  it('partner med färre set lämnas orörd', () => {
    const list = [ex([set(), set(), set()], true), ex([set()])]
    const result = setCompletedInSuperset(list, 0, 2, true)
    expect(result.map(done)).toEqual([[false, false, true], [false]])
    expect(result[1].setEntries).toEqual([set()])
  })

  it('partner utan motsvarande arbetsset ändras inte i setEntries', () => {
    const list = [ex([set(), set()], true), ex([])]
    const result = setCompletedInSuperset(list, 0, 0, true)
    expect(result[1].setEntries).toEqual([])
  })

  it('partner med bara uppvärmningsset lämnas orörd när arbetsset bockas', () => {
    const list = [ex([set()], true), ex([set('warmup')])]
    const result = setCompletedInSuperset(list, 0, 0, true)
    expect(result[1].setEntries).toEqual([set('warmup')])
  })

  it('okopplad övning bockar bara sig själv', () => {
    const list = [ex([set()]), ex([set()])]
    expect(setCompletedInSuperset(list, 0, 0, true).map(done)).toEqual([[true], [false]])
  })

  it('fungerar även när sista övningen har supersetWithNext', () => {
    const list = [ex([set()], true), ex([set()], true)]
    const result = setCompletedInSuperset(list, 0, 0, true)
    expect(result.map(done)).toEqual([[true], [true]])
  })
})

describe('unlinkAt', () => {
  it('kopplar loss övningen från både den ovan och den under', () => {
    const list = [ex([], true), ex([], true), ex([])]
    expect(unlinkAt(list, 1).map(e => e.supersetWithNext)).toEqual([false, false, false])
    expect(unlinkAt(list, 0).map(e => e.supersetWithNext)).toEqual([false, true, false])
  })
})
