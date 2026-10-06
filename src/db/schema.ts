import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export type ExerciseKind = 'weight' | 'bodyweight' | 'time' | 'distance'

export interface Exercise {
  id: string
  name: string
  kind?: ExerciseKind
  muscleGroup?: string
  equipment?: string
  /** Höjningsförslaget mot platå, se src/lib/progression.ts. Följer med kontot i snapshoten. Sedan 2026-10-06. */
  progression?: ExerciseProgression
  createdAt: string
}

export interface ExerciseProgression {
  /** "Håll vikten med flit": toppvikten när valet gjordes. Tystar förslaget tills toppvikten ändras. */
  holdAt?: number
  /** Väntande förslag, visas vid övningen tills det tas eller avböjs. Aldrig tyst ifyllt. */
  next?: { weight: number; reps: number }
}

export interface SetEntry {
  sets: number
  reps: number
  weight: number
  /** RPE 5 till 10, valfritt. Saknas i all historik före 2026-09-01. */
  rpe?: number
}

export interface TemplateExercise {
  exerciseId: string
  defaultSetEntry: SetEntry
  order: number
}

export interface Template {
  id: string
  name: string
  exercises: TemplateExercise[]
  updatedAt: string
}

export interface SessionExercise {
  exerciseId: string
  exerciseName: string
  setEntries: SetEntry[]
  order: number
  notes?: string
}

export interface Session {
  id: string
  date: string
  templateId: string
  templateName: string
  exercises: SessionExercise[]
  createdAt: string
}

export interface ExerciseHistory {
  id: string
  date: string
  exerciseId: string
  exerciseName: string
  setEntries: SetEntry[]
  volume: number
  sessionId: string
}

/** Kroppsvikt: ett värde per dag, datumet (YYYY-MM-DD) är nyckeln. Kilo med en decimal. Sedan 2026-09-01. */
export interface BodyWeight {
  date: string
  kg: number
}

export interface AppSetting {
  key: string
  value: unknown
}

// Bakåtkompatibla typer för migrering från gammal seedData-structur
export interface LegacyTemplateExercise {
  exerciseId: string
  defaultSets: number
  defaultReps: number
  defaultWeight: number
  order: number
}

export interface LegacySessionExercise {
  exerciseId: string
  exerciseName: string
  sets: number
  reps: number
  weight: number
  order: number
}

export interface LegacySession {
  id: string
  date: string
  templateId: string
  templateName: string
  exercises: LegacySessionExercise[]
  createdAt: string
}

export interface LegacyExerciseHistory {
  id: string
  date: string
  exerciseId: string
  exerciseName: string
  sets: number
  reps: number
  weight: number
  volume: number
  sessionId: string
}

export type SetType = 'normal' | 'warmup' | 'drop' | 'failure'

export interface ActiveSetEntry extends SetEntry {
  completed?: boolean
  type?: SetType
  /** AMRAP-setet från höjningsförslagets test: när det bockas av räknas nästa pass vikt ut */
  calibration?: boolean
}

export interface ActiveExercise {
  exerciseId: string
  exerciseName: string
  setEntries: ActiveSetEntry[]
  order: number
  notes?: string
}

export interface ActiveWorkout {
  id: string
  date: string
  templateId: string
  templateName: string
  exercises: ActiveExercise[]
  startTime: string
  updatedAt: string
}

export interface BeefcakeDB extends DBSchema {
  templates: {
    key: string
    value: Template
    indexes: { 'by-name': string; 'by-updated': string }
  }
  exercises: {
    key: string
    value: Exercise
    indexes: { 'by-name': string; 'by-muscle': string }
  }
  sessions: {
    key: string
    value: Session
    indexes: { 'by-date': string; 'by-template': string }
  }
  exerciseHistory: {
    key: string
    value: ExerciseHistory
    indexes: { 'by-exercise': string; 'by-date': string; 'by-session': string }
  }
  settings: {
    key: string
    value: AppSetting
  }
  activeWorkout: {
    key: string
    value: ActiveWorkout
  }
  bodyWeight: {
    key: string
    value: BodyWeight
  }
}

const DB_NAME = 'beefcake-db'
const DB_VERSION = 4

let dbInstance: IDBPDatabase<BeefcakeDB> | null = null

export async function getDB(): Promise<IDBPDatabase<BeefcakeDB>> {
  if (dbInstance) return dbInstance

  dbInstance = await openDB<BeefcakeDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('templates')) {
        const templateStore = db.createObjectStore('templates', { keyPath: 'id' })
        templateStore.createIndex('by-name', 'name')
        templateStore.createIndex('by-updated', 'updatedAt')
      }
      if (!db.objectStoreNames.contains('exercises')) {
        const exerciseStore = db.createObjectStore('exercises', { keyPath: 'id' })
        exerciseStore.createIndex('by-name', 'name', { unique: true })
        exerciseStore.createIndex('by-muscle', 'muscleGroup')
      }
      if (!db.objectStoreNames.contains('sessions')) {
        const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' })
        sessionStore.createIndex('by-date', 'date')
        sessionStore.createIndex('by-template', 'templateId')
      }
      if (!db.objectStoreNames.contains('exerciseHistory')) {
        const historyStore = db.createObjectStore('exerciseHistory', { keyPath: 'id' })
        historyStore.createIndex('by-exercise', 'exerciseId')
        historyStore.createIndex('by-date', 'date')
        historyStore.createIndex('by-session', 'sessionId')
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('activeWorkout')) {
        db.createObjectStore('activeWorkout', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('bodyWeight')) {
        db.createObjectStore('bodyWeight', { keyPath: 'date' })
      }
    }
  })

  return dbInstance
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function nowISO(): string {
  return new Date().toISOString()
}

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Migreringsfunktioner från Legacy-typ till ny SetEntry-baserad typ
export function migrateTemplateExercise(legacy: LegacyTemplateExercise): TemplateExercise {
  return {
    exerciseId: legacy.exerciseId,
    defaultSetEntry: {
      sets: legacy.defaultSets,
      reps: legacy.defaultReps,
      weight: legacy.defaultWeight
    },
    order: legacy.order
  }
}

export function migrateSessionExercise(legacy: LegacySessionExercise): SessionExercise {
  return {
    exerciseId: legacy.exerciseId,
    exerciseName: legacy.exerciseName,
    setEntries: [{
      sets: legacy.sets,
      reps: legacy.reps,
      weight: legacy.weight
    }],
    order: legacy.order
  }
}

export function migrateSession(legacy: LegacySession): Session {
  return {
    id: legacy.id,
    date: legacy.date,
    templateId: legacy.templateId,
    templateName: legacy.templateName,
    exercises: legacy.exercises.map(migrateSessionExercise),
    createdAt: legacy.createdAt
  }
}

export function migrateExerciseHistory(legacy: LegacyExerciseHistory): ExerciseHistory {
  return {
    id: legacy.id,
    date: legacy.date,
    exerciseId: legacy.exerciseId,
    exerciseName: legacy.exerciseName,
    setEntries: [{
      sets: legacy.sets,
      reps: legacy.reps,
      weight: legacy.weight
    }],
    volume: legacy.volume,
    sessionId: legacy.sessionId
  }
}
