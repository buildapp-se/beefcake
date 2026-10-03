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
 * en ny adress (OWASP 2026-09-16, A01). Enda undantaget är gästens data, märkt som
 * gästens i enheten, som slås ihop med kontot (mergeGuestIntoAccount, beslut 2026-10-03).
 * Utan moln körs den här aldrig.
 */
export function selectAuthoritativeSnapshot(server: SnapshotData | null): SnapshotData {
  return server ?? emptySnapshot()
}

export function hasTrainingData(s: SnapshotData): boolean {
  return s.sessions.length + s.templates.length + s.exercises.length + s.bodyWeight.length > 0
}

/**
 * Pass loggade utan konto följer med när gästen loggar in. Kontot vinner vid krock:
 * övningar och program med samma namn används i stället för gästens (gästens pass pekas om
 * till dem), kroppsvikt med samma datum behåller kontots värde. Pass och historik läggs till.
 */
export function mergeGuestIntoAccount(account: SnapshotData, guest: SnapshotData): SnapshotData {
  const key = (name: string) => name.trim().toLowerCase()
  const exerciseByName = new Map(account.exercises.map(e => [key(e.name), e.id]))
  const exerciseId = new Map<string, string>()
  const exercises = [...account.exercises]
  for (const e of guest.exercises) {
    const existing = exerciseByName.get(key(e.name))
    exerciseId.set(e.id, existing ?? e.id)
    if (!existing) {
      exercises.push(e)
      exerciseByName.set(key(e.name), e.id)
    }
  }
  const remapExercise = <T extends { exerciseId: string }>(x: T): T => ({ ...x, exerciseId: exerciseId.get(x.exerciseId) ?? x.exerciseId })

  const templateByName = new Map(account.templates.map(t => [key(t.name), t.id]))
  const templateId = new Map<string, string>()
  const templates = [...account.templates]
  for (const t of guest.templates) {
    const existing = templateByName.get(key(t.name))
    templateId.set(t.id, existing ?? t.id)
    if (!existing) templates.push({ ...t, exercises: t.exercises.map(remapExercise) })
  }

  const sessionIds = new Set(account.sessions.map(s => s.id))
  const sessions = [...account.sessions, ...guest.sessions
    .filter(s => !sessionIds.has(s.id))
    .map(s => ({ ...s, templateId: templateId.get(s.templateId) ?? s.templateId, exercises: s.exercises.map(remapExercise) }))]

  const historyIds = new Set(account.exerciseHistory.map(h => h.id))
  const exerciseHistory = [...account.exerciseHistory, ...guest.exerciseHistory
    .filter(h => !historyIds.has(h.id) && !sessionIds.has(h.sessionId))
    .map(remapExercise)]

  const weightDates = new Set(account.bodyWeight.map(b => b.date))
  const bodyWeight = [...account.bodyWeight, ...guest.bodyWeight.filter(b => !weightDates.has(b.date))]

  return { templates, exercises, sessions, exerciseHistory, bodyWeight }
}
