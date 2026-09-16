import type { BodyWeight, Exercise, ExerciseHistory, Session, Template } from '../models'

export interface SnapshotData {
  templates: Template[]
  exercises: Exercise[]
  sessions: Session[]
  exerciseHistory: ExerciseHistory[]
  /** Valfri i indata (äldre snapshots saknar den), alltid en lista efter validateSnapshot */
  bodyWeight: BodyWeight[]
}

export function emptySnapshot(): SnapshotData {
  return { templates: [], exercises: [], sessions: [], exerciseHistory: [], bodyWeight: [] }
}

/**
 * Med moln är D1 sanningen, alltid. Saknar kontot snapshot startar det tomt: det som
 * råkar ligga lokalt hör till förra kontot på enheten och får aldrig laddas upp under
 * en ny adress (OWASP 2026-09-16, A01). Utan moln körs den här aldrig.
 */
export function selectAuthoritativeSnapshot(server: SnapshotData | null): SnapshotData {
  return server ?? emptySnapshot()
}
