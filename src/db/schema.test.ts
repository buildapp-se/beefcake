import 'fake-indexeddb/auto'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { openDB, type IDBPDatabase } from 'idb'
import { exercisesVolume } from '../lib/volume'
import type { BeefcakeDB, ExerciseHistory, LegacyExerciseHistory, LegacySession, Session, Template } from './schema'

const DB_NAME = 'beefcake-db'

// Skapar databasen som en enhet före SetEntry (före 2026-08-09) hade lämnat den:
// version 4 med samma stores, men pass, historik och mallar i det gamla formatet
// utan setEntries/defaultSetEntry.
async function createLegacyDatabase(): Promise<void> {
  const db = await openDB<BeefcakeDB>(DB_NAME, 4, {
    upgrade(db) {
      const templateStore = db.createObjectStore('templates', { keyPath: 'id' })
      templateStore.createIndex('by-name', 'name')
      templateStore.createIndex('by-updated', 'updatedAt')
      const exerciseStore = db.createObjectStore('exercises', { keyPath: 'id' })
      exerciseStore.createIndex('by-name', 'name', { unique: true })
      exerciseStore.createIndex('by-muscle', 'muscleGroup')
      const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' })
      sessionStore.createIndex('by-date', 'date')
      sessionStore.createIndex('by-template', 'templateId')
      const historyStore = db.createObjectStore('exerciseHistory', { keyPath: 'id' })
      historyStore.createIndex('by-exercise', 'exerciseId')
      historyStore.createIndex('by-date', 'date')
      historyStore.createIndex('by-session', 'sessionId')
      db.createObjectStore('settings', { keyPath: 'key' })
      db.createObjectStore('activeWorkout', { keyPath: 'id' })
      db.createObjectStore('bodyWeight', { keyPath: 'date' })
    }
  })

  const legacyTemplate = {
    id: 'tpl-1',
    name: 'Ben',
    exercises: [{ exerciseId: 'ex-1', defaultSets: 3, defaultReps: 5, defaultWeight: 100, order: 0 }],
    updatedAt: '2026-08-01T10:00:00.000Z'
  }
  const legacySession: LegacySession = {
    id: 'session-1',
    date: '2026-08-05',
    templateId: 'tpl-1',
    templateName: 'Ben',
    exercises: [{ exerciseId: 'ex-1', exerciseName: 'Benböj', sets: 3, reps: 5, weight: 100, order: 0 }],
    createdAt: '2026-08-05T10:00:00.000Z'
  }
  const legacyHistory: LegacyExerciseHistory = {
    id: 'h-1',
    date: '2026-08-05',
    exerciseId: 'ex-1',
    exerciseName: 'Benböj',
    sets: 3,
    reps: 5,
    weight: 100,
    volume: 1500,
    sessionId: 'session-1'
  }
  const newSession: Session = {
    id: 'session-2',
    date: '2026-09-01',
    templateId: 'tpl-1',
    templateName: 'Ben',
    exercises: [{ exerciseId: 'ex-1', exerciseName: 'Benböj', setEntries: [{ sets: 1, reps: 8, weight: 60 }], order: 0 }],
    createdAt: '2026-09-01T10:00:00.000Z'
  }

  await db.put('templates', legacyTemplate as unknown as Template)
  await db.put('sessions', legacySession as unknown as Session)
  await db.put('sessions', newSession)
  await db.put('exerciseHistory', legacyHistory as unknown as ExerciseHistory)
  db.close()
}

describe('getDB datamigrering', () => {
  let db: IDBPDatabase<BeefcakeDB> | null = null

  afterEach(async () => {
    db?.close()
    db = null
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME)
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
      req.onblocked = () => resolve()
    })
  })

  it('migrerar pass, historik och mallar i formatet före SetEntry utan att röra nytt format', async () => {
    await createLegacyDatabase()

    vi.resetModules()
    const { getDB } = await import('./schema')
    db = await getDB()

    const session = (await db.get('sessions', 'session-1')) as Session
    expect(session.exercises[0].setEntries).toEqual([{ sets: 3, reps: 5, weight: 100 }])
    // Kraschade före migreringen: setsVolume på undefined
    expect(exercisesVolume(session.exercises)).toBe(1500)

    const history = (await db.get('exerciseHistory', 'h-1')) as ExerciseHistory
    expect(history.setEntries).toEqual([{ sets: 3, reps: 5, weight: 100 }])
    expect(history.volume).toBe(1500)

    const template = (await db.get('templates', 'tpl-1')) as Template
    expect(template.exercises[0].defaultSetEntry).toEqual({ sets: 3, reps: 5, weight: 100 })

    const untouched = (await db.get('sessions', 'session-2')) as Session
    expect(untouched.exercises[0].setEntries).toEqual([{ sets: 1, reps: 8, weight: 60 }])
  })
})
