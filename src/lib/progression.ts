import type { ExerciseKind } from '../models'
import { epley1RM } from './exerciseMetrics'
import { PLATE_WEIGHTS, barWeightFor } from './plates'

/**
 * Höjningsförslaget mot platå: en fast regel, ingen programmotor.
 *
 * Antal pass: NSCA:s 2-för-2-regel låter en förändring gälla först när den synts två pass i rad
 * ("2+ reps above their target in the last set for 2 consecutive sessions", CSCS-studieguide,
 * andrahandskälla, NSCA:s egen text ligger i läroboken:
 * https://app.achievable.me/study/cscs/learn/program-design-for-resistance-training-training-frequency-exercise-order-and-training-load-and-repetitions).
 * Ingen av källorna definierar platå. Samma fönster åt andra hållet: ett utgångspass plus två
 * pass i rad utan framsteg är tre lika pass. Två vore lika försvarbart men tjatar på den som
 * kör dubbel progression och står still ett pass.
 */
export const PLATEAU_SESSIONS = 3

/**
 * Reptak i Epley: "no more than 10 repetitions should be used in linear equations to estimate
 * 1RM" (Reynolds, Gordon & Robergs 2006, J Strength Cond Res 20(3):584-592, hela artikeln läst:
 * https://www.unm.edu/~rrobergs/478RMStrengthPrediction.pdf). Fler reps räknas som tio.
 */
export const EPLEY_MAX_REPS = 10

const DUMBBELL_STEP = 1
const DEFAULT_STEP = 2.5

interface SetLike { weight: number; reps: number }

/**
 * Bästa arbetssetet: tyngsta vikten, sedan flest reps på den. Uppvärmning är lättare och faller bort.
 * För kroppsviktsövningar är vikten det man hänger på sig, så 0 (bara kroppen) räknas.
 */
export function topSet(sets: readonly SetLike[], bodyweight = false): SetLike | null {
  let best: SetLike | null = null
  for (const s of sets) {
    if (bodyweight ? s.weight < 0 || s.reps <= 0 : s.weight <= 0) continue
    if (!best || s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps)) best = { weight: s.weight, reps: s.reps }
  }
  return best
}

/**
 * Antal pass i rad, räknat bakifrån, med samma toppvikt och utan fler reps än passet före.
 * Fler reps på samma vikt (dubbel progression) är framsteg och bryter raden. Historiken i tidsordning.
 */
export function plateauLength(history: readonly { setEntries: readonly SetLike[] }[], bodyweight = false): number {
  const tops = history.map(h => topSet(h.setEntries, bodyweight))
  if (!tops[tops.length - 1]) return 0
  let run = 1
  for (let i = tops.length - 1; i > 0; i--) {
    const cur = tops[i]
    const prev = tops[i - 1]
    if (!cur || !prev || prev.weight !== cur.weight || cur.reps > prev.reps) break
    run++
  }
  return run
}

/**
 * Platå: PLATEAU_SESSIONS pass i rad utan framsteg. Tid och distans undantas, liksom vikt 0 på
 * en vanlig viktövning. Kroppsviktsövningar räknas med (Patrik 2026-10-06): där är framsteg fler
 * reps eller mer hängvikt. "Håll vikten med flit" tystar tills toppvikten ändras.
 */
export function isPlateau(
  history: readonly { setEntries: readonly SetLike[] }[],
  exercise: { kind?: ExerciseKind; holdAt?: number } = {}
): boolean {
  if (exercise.kind === 'time' || exercise.kind === 'distance') return false
  const bodyweight = exercise.kind === 'bodyweight'
  const top = topSet(history[history.length - 1]?.setEntries ?? [], bodyweight)
  if (!top || top.weight === exercise.holdAt) return false
  return plateauLength(history, bodyweight) >= PLATEAU_SESSIONS
}

/**
 * "Höj bara ett steg". Med vikt: ett steg till på samma reps. Utan vikt (kroppsviktsövning med
 * bara kroppen) finns inget att lägga på, då är steget en rep till.
 * ponytail: +1 rep är ett eget val utan källa, försiktigt med flit. Byt här om det ska vara mer.
 */
export function nextStep(top: SetLike, step: number): SetLike {
  if (top.weight === 0) return { weight: 0, reps: top.reps + 1 }
  return { weight: Math.round((top.weight + step) * 100) / 100, reps: top.reps }
}

/** Har förra passets toppset redan nått förslaget? Då är förslaget inaktuellt. */
export function reachedTarget(top: SetLike, target: SetLike): boolean {
  return top.weight > target.weight || (top.weight === target.weight && top.reps >= target.reps)
}

/**
 * Minsta höjning som går att lägga på. Stång: två av plattkalkylatorns minsta skiva. Hantlar
 * 1 kg, allt annat (maskin, kabel, viktbälte) 2,5 kg. ACSM (2009, Med Sci Sports Exerc
 * 41(3):687-708, abstractet läst: https://pubmed.ncbi.nlm.nih.gov/19204579/) rekommenderar
 * "2-10% increase in load"; 2,5 kg på en hantel på 18,75 kg vore 13 %, därav det mindre steget.
 */
export function stepFor(equipment: string | undefined, name: string): number {
  if (barWeightFor(equipment) !== null) return 2 * Math.min(...PLATE_WEIGHTS)
  if (/hant(el|lar)/i.test(name)) return DUMBBELL_STEP
  return DEFAULT_STEP
}

/**
 * Nästa pass vikt ur ett AMRAP-set: e1RM med Epley, tillbaka till de vanliga repsen, avrundat
 * nedåt till hela steg från vikten du står på (ojämna hantelvikter stannar då på sitt eget raster).
 * Vid tio reps eller fler skiljer formeln inte längre på seten; där gäller ACSM:s regel ensam:
 * klarar du fler reps än de vanliga är det dags för ett steg.
 */
export function calibratedWeight(weight: number, amrapReps: number, usualReps: number, step: number): number {
  const e1rm = epley1RM(weight, Math.min(amrapReps, EPLEY_MAX_REPS))
  if (e1rm === null) return weight
  const target = e1rm / (1 + Math.min(usualReps, EPLEY_MAX_REPS) / 30)
  const steps = Math.max(Math.floor((target - weight) / step + 1e-9), amrapReps > usualReps ? 1 : 0)
  return Math.round((weight + steps * step) * 100) / 100
}

/**
 * Testsetets besked: nästa vikt och reps, och om testet klarades. Med vikt räknar
 * calibratedWeight. Utan vikt säger Epley ingenting (vikten är 0): fler reps än de vanliga
 * ger en rep till, samma steg som nextStep.
 */
export function calibrationTarget(weight: number, amrapReps: number, usualReps: number, step: number): SetLike & { passed: boolean } {
  if (weight === 0) {
    const passed = amrapReps > usualReps
    return { weight: 0, reps: passed ? usualReps + 1 : usualReps, passed }
  }
  const next = calibratedWeight(weight, amrapReps, usualReps, step)
  return { weight: next, reps: usualReps, passed: next > weight }
}
