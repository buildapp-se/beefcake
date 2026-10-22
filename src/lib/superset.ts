import type { ActiveSetEntry } from '../models'

/**
 * Superset: en övning med `supersetWithNext` är kopplad till övningen under. En obruten
 * följd av kopplingar är en grupp, och ett bockat arbetsset bockar samma arbetsset i hela
 * gruppen. Uppvärmning och testset bockas bara för sig: de har ingen motsvarighet.
 */
export interface SupersetExercise {
  setEntries: ActiveSetEntry[]
  supersetWithNext?: boolean
}

const isWorkSet = (s: ActiveSetEntry) => s.type !== 'warmup' && !s.calibration

/** Index för alla övningar i samma grupp som `idx`, uppifrån och ner. Ensam övning ger [idx]. */
export function supersetGroup(exercises: readonly SupersetExercise[], idx: number): number[] {
  let start = idx
  while (start > 0 && exercises[start - 1].supersetWithNext) start -= 1
  let end = idx
  while (end < exercises.length - 1 && exercises[end].supersetWithNext) end += 1
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

/**
 * Sätter `completed` på setet och på motsvarande arbetsset i gruppen. Motsvarande betyder
 * samma ordning bland arbetsseten, så tre uppvärmningsset på knäböjen flyttar inte kopplingen.
 */
export function setCompletedInSuperset<T extends SupersetExercise>(exercises: readonly T[], exIdx: number, setIdx: number, completed: boolean): T[] {
  const next = [...exercises]
  const mark = (i: number, si: number) => {
    const entries = [...next[i].setEntries]
    entries[si] = { ...entries[si], completed }
    next[i] = { ...next[i], setEntries: entries }
  }
  mark(exIdx, setIdx)
  const clicked = exercises[exIdx].setEntries[setIdx]
  if (!isWorkSet(clicked)) return next
  const order = exercises[exIdx].setEntries.slice(0, setIdx).filter(isWorkSet).length
  for (const i of supersetGroup(exercises, exIdx)) {
    if (i === exIdx) continue
    let seen = -1
    const partner = exercises[i].setEntries.findIndex(s => isWorkSet(s) && ++seen === order)
    if (partner !== -1) mark(i, partner)
  }
  return next
}

/** Kopplar loss övningen på `idx` från båda grannarna. Körs före flytt och borttagning. */
export function unlinkAt<T extends SupersetExercise>(exercises: readonly T[], idx: number): T[] {
  return exercises.map((e, i) => (i === idx || i === idx - 1) && e.supersetWithNext ? { ...e, supersetWithNext: false } : e)
}
