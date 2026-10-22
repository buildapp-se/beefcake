import type { BodyWeight, Exercise, ExerciseHistory, ExerciseKind, SetEntry, Session, Template } from '../models'
import type { SnapshotData } from './snapshot'

export type ImportData = SnapshotData

const EXERCISE_KINDS: ExerciseKind[] = ['weight', 'bodyweight', 'time', 'distance']

export function parseImportData(json: string): ImportData {
  return validateSnapshot(JSON.parse(json))
}

/**
 * Hela domänmodellen, inte bara samlingar och ID:n. Delas av JSON-importen i
 * klienten och Worker-API:t, så D1 och IndexedDB avvisar samma saker.
 * Okända fält släpps igenom: äldre klienter ska inte stoppas av nya fält.
 */
export function validateSnapshot(parsed: unknown): SnapshotData {
  if (!isRecord(parsed)) throw new Error('Importen har fel format')

  const templates = readCollection<Template>(parsed.templates, 'templates', validateTemplate)
  const exercises = readCollection<Exercise>(parsed.exercises, 'exercises', validateExercise)
  const sessions = readCollection<Session>(parsed.sessions, 'sessions', validateSession)
  const exerciseHistory = readCollection<ExerciseHistory>(parsed.exerciseHistory, 'exerciseHistory', validateHistory)

  // Historik utan pass är en föräldralös rad: den kan aldrig raderas via passet
  const sessionIds = new Set(sessions.map(s => s.id))
  for (const h of exerciseHistory) {
    if (!sessionIds.has(h.sessionId)) throw new Error(`Importen har fel format: exerciseHistory ${h.id} pekar på ett pass som saknas`)
  }

  // Kroppsvikt kom 2026-09-01. Äldre snapshots i D1 och äldre klienter saknar fältet: då är listan tom.
  const bodyWeight = parsed.bodyWeight === undefined ? [] : readBodyWeights(parsed.bodyWeight)

  return { templates, exercises, sessions, exerciseHistory, bodyWeight }
}

function readBodyWeights(value: unknown): BodyWeight[] {
  if (!Array.isArray(value)) throw new Error('Importen har fel format: bodyWeight')
  const dates = new Set<string>()
  for (const item of value) {
    if (!isRecord(item) || typeof item.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || !isNumber(item.kg) || item.kg <= 0) {
      throw new Error('Importen har fel format: bodyWeight')
    }
    if (dates.has(item.date)) throw new Error('Importen innehåller dubbletter: bodyWeight')
    dates.add(item.date)
  }
  return value as BodyWeight[]
}

function readCollection<T extends { id: string }>(value: unknown, name: string, validate: (item: Record<string, unknown>) => boolean): T[] {
  if (!Array.isArray(value)) throw new Error(`Importen har fel format: ${name}`)

  const ids = new Set<string>()
  for (const item of value) {
    if (!isRecord(item) || !isText(item.id) || !validate(item)) {
      throw new Error(`Importen har fel format: ${name}`)
    }
    if (ids.has(item.id)) throw new Error(`Importen innehåller dubbletter: ${name}`)
    ids.add(item.id)
  }

  return value as T[]
}

function validateExercise(e: Record<string, unknown>): e is Record<string, unknown> & Exercise {
  return isText(e.name)
    && typeof e.createdAt === 'string'
    && (e.kind === undefined || EXERCISE_KINDS.includes(e.kind as ExerciseKind))
    && (e.muscleGroup === undefined || typeof e.muscleGroup === 'string')
}

function validateTemplate(t: Record<string, unknown>): t is Record<string, unknown> & Template {
  return isText(t.name)
    && typeof t.updatedAt === 'string'
    && Array.isArray(t.exercises)
    && t.exercises.every(te => isRecord(te) && isText(te.exerciseId) && isSetEntry(te.defaultSetEntry) && isNumber(te.order))
}

function validateSession(s: Record<string, unknown>): s is Record<string, unknown> & Session {
  return typeof s.date === 'string'
    && typeof s.templateId === 'string'
    && typeof s.templateName === 'string'
    && typeof s.createdAt === 'string'
    && Array.isArray(s.exercises)
    && s.exercises.every(e => isRecord(e) && isText(e.exerciseId) && typeof e.exerciseName === 'string' && isSetEntries(e.setEntries) && isNumber(e.order) && (e.notes === undefined || typeof e.notes === 'string'))
    && (s.cardio === undefined || (isRecord(s.cardio) && isNumber(s.cardio.minutes) && (s.cardio.km === undefined || isNumber(s.cardio.km)) && (s.cardio.notes === undefined || typeof s.cardio.notes === 'string')))
}

function validateHistory(h: Record<string, unknown>): h is Record<string, unknown> & ExerciseHistory {
  return typeof h.date === 'string'
    && isText(h.exerciseId)
    && typeof h.exerciseName === 'string'
    && isSetEntries(h.setEntries)
    && isNumber(h.volume)
    && isText(h.sessionId)
}

function isSetEntries(value: unknown): value is SetEntry[] {
  return Array.isArray(value) && value.every(isSetEntry)
}

function isSetEntry(value: unknown): value is SetEntry {
  return isRecord(value) && isNumber(value.sets) && isNumber(value.reps) && isNumber(value.weight) && (value.rpe === undefined || isNumber(value.rpe))
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
