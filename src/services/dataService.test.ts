import 'fake-indexeddb/auto'
import { beforeEach, describe, it, expect, vi } from 'vitest'

// En utvecklares .env.local ska inte få testet att synka mot molnet.
vi.mock('./cloudSyncService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./cloudSyncService')>()),
  syncSnapshot: async () => {},
}))

import { backfillExerciseMeta, createSession, createTemplate, deleteSession, deleteTemplate, getAllSessions, getAllTemplates, getExerciseHistory, getSession, restoreSession, saveActiveWorkout, clearActiveWorkout, getResumableWorkout, updateTemplate } from './dataService'
import { getDB } from '../models'
import type { Template } from '../models'

describe('restoreSession', () => {
  it('skriver tillbaka ett raderat pass med samma id, inklusive exerciseHistory', async () => {
    const session = await createSession('2026-10-20', 'tpl-ben', 'Ben', [
      { exerciseId: 'ex-benboj', exerciseName: 'Benböj', setEntries: [{ sets: 3, reps: 5, weight: 100 }] }
    ])

    await deleteSession(session.id)
    expect(await getSession(session.id)).toBeUndefined()
    expect(await getExerciseHistory('ex-benboj')).toHaveLength(0)

    await restoreSession(session)

    const restored = await getSession(session.id)
    expect(restored).toBeDefined()
    expect(restored?.date).toBe('2026-10-20')
    expect(restored?.templateName).toBe('Ben')
    expect(restored?.exercises).toHaveLength(1)
    expect(await getAllSessions()).toHaveLength(1)
    const history = await getExerciseHistory('ex-benboj')
    expect(history).toHaveLength(1)
    expect(history[0].sessionId).toBe(session.id)
    expect(history[0].volume).toBe(1500)
  })

  it('behåller cardio-fältet på ett återställt cardiopass', async () => {
    const session = await createSession('2026-10-21', 'cardio', 'Löpning', [])
    const cardioSession = { ...session, cardio: { minutes: 30, km: 5 } }

    await deleteSession(session.id)
    await restoreSession(cardioSession)

    const restored = await getSession(session.id)
    expect(restored?.cardio).toEqual({ minutes: 30, km: 5 })
  })
})

describe('getResumableWorkout', () => {
  it('returnerar utkastet när minst ett set är loggat', async () => {
    await saveActiveWorkout({
      date: '2026-10-10',
      templateId: 'tpl-ben',
      templateName: 'Ben',
      startTime: '2026-10-10T18:00:00.000Z',
      exercises: [
        { exerciseId: 'ex-benboj', exerciseName: 'Benböj', order: 0, setEntries: [{ sets: 1, reps: 5, weight: 100, completed: true }] }
      ]
    })

    const active = await getResumableWorkout()
    expect(active?.templateName).toBe('Ben')
    expect(active?.exercises).toHaveLength(1)
  })

  it('returnerar undefined för ett utkast där inget set är loggat än', async () => {
    await saveActiveWorkout({
      date: '2026-10-10',
      templateId: 'tpl-ben',
      templateName: 'Ben',
      startTime: '2026-10-10T18:00:00.000Z',
      exercises: [
        { exerciseId: 'ex-benboj', exerciseName: 'Benböj', order: 0, setEntries: [] }
      ]
    })

    expect(await getResumableWorkout()).toBeUndefined()
  })

  it('returnerar undefined när inget utkast finns', async () => {
    await clearActiveWorkout()
    expect(await getResumableWorkout()).toBeUndefined()
  })
})

describe('backfillExerciseMeta', () => {
  beforeEach(async () => {
    const db = await getDB()
    await db.clear('exercises')
  })

  it('fyller på saknad muscleGroup, equipment och kind utifrån övningens namn', async () => {
    const db = await getDB()
    await db.put('exercises', { id: 'ex-benboj', name: 'Benböj', createdAt: '2026-10-01T00:00:00.000Z' })
    await db.put('exercises', { id: 'ex-marklyft', name: 'Marklyft', muscleGroup: 'Bakre kedjan', createdAt: '2026-10-01T00:00:00.000Z' })
    await db.put('exercises', { id: 'ex-armhavningar', name: 'Armhävningar', muscleGroup: 'Bröst', createdAt: '2026-10-01T00:00:00.000Z' })

    const updated = await backfillExerciseMeta()

    expect(updated).toBe(3)
    const benboj = await db.get('exercises', 'ex-benboj')
    expect(benboj?.muscleGroup).toBe('Ben')
    expect(benboj?.equipment).toBe('skivstång')
    expect(benboj?.kind).toBeUndefined()
    expect(benboj?.createdAt).toBe('2026-10-01T00:00:00.000Z')
    const marklyft = await db.get('exercises', 'ex-marklyft')
    expect(marklyft?.muscleGroup).toBe('Bakre kedjan')
    expect(marklyft?.equipment).toBe('skivstång')
    const armhavningar = await db.get('exercises', 'ex-armhavningar')
    expect(armhavningar?.muscleGroup).toBe('Bröst')
    expect(armhavningar?.kind).toBe('bodyweight')
    expect(armhavningar?.equipment).toBeUndefined()
  })

  it('räknar inte övningar som redan har alla fält eller som saknar mappning', async () => {
    const db = await getDB()
    await db.put('exercises', { id: 'ex-chins', name: 'Chins', muscleGroup: 'Rygg', kind: 'bodyweight', createdAt: '2026-10-01T00:00:00.000Z' })
    await db.put('exercises', { id: 'ex-okand', name: 'Okänd övning', createdAt: '2026-10-01T00:00:00.000Z' })

    expect(await backfillExerciseMeta()).toBe(0)

    expect(await db.get('exercises', 'ex-chins')).toEqual({ id: 'ex-chins', name: 'Chins', muscleGroup: 'Rygg', kind: 'bodyweight', createdAt: '2026-10-01T00:00:00.000Z' })
    const okand = await db.get('exercises', 'ex-okand')
    expect(okand?.muscleGroup).toBeUndefined()
    expect(okand?.equipment).toBeUndefined()
    expect(okand?.kind).toBeUndefined()
  })
})

describe('mallar', () => {
  beforeEach(async () => {
    const db = await getDB()
    await db.clear('templates')
  })

  it('getAllTemplates returnerar alla mallar sorterade efter updatedAt', async () => {
    const db = await getDB()
    const mall = (id: string, updatedAt: string): Template => ({ id, name: `Mall ${id}`, exercises: [], updatedAt })
    await db.put('templates', mall('tpl-a', '2026-01-01T00:00:00.000Z'))
    await db.put('templates', mall('tpl-b', '2026-03-01T00:00:00.000Z'))
    await db.put('templates', mall('tpl-c', '2026-02-01T00:00:00.000Z'))

    const alla = await getAllTemplates()

    expect(alla.map(t => t.id)).toEqual(['tpl-a', 'tpl-c', 'tpl-b'])
  })

  it('createTemplate sparar mallen och sätter order på övningarna', async () => {
    const template = await createTemplate('Benpass', [
      { exerciseId: 'ex-1', defaultSetEntry: { sets: 3, reps: 5, weight: 100 } },
      { exerciseId: 'ex-2', defaultSetEntry: { sets: 4, reps: 8, weight: 20 }, supersetWith: 'ex-1' }
    ])

    expect(template.name).toBe('Benpass')
    expect(template.id).toBeTruthy()
    expect(template.updatedAt).toBeTruthy()
    expect(template.exercises.map(e => e.order)).toEqual([0, 1])
    expect(template.exercises[0].exerciseId).toBe('ex-1')
    expect(template.exercises[0].defaultSetEntry).toEqual({ sets: 3, reps: 5, weight: 100 })
    expect(template.exercises[1].supersetWith).toBe('ex-1')

    const sparad = (await getAllTemplates()).find(t => t.id === template.id)
    expect(sparad?.name).toBe('Benpass')
    expect(sparad?.exercises.map(e => e.order)).toEqual([0, 1])
  })

  it('updateTemplate ändrar namnet och behåller övningarna', async () => {
    const template = await createTemplate('Benpass', [
      { exerciseId: 'ex-1', defaultSetEntry: { sets: 3, reps: 5, weight: 100 } }
    ])

    const updated = await updateTemplate(template.id, { name: 'Benträning' })

    expect(updated.id).toBe(template.id)
    expect(updated.name).toBe('Benträning')
    expect(updated.exercises).toHaveLength(1)
    expect(updated.exercises[0].exerciseId).toBe('ex-1')
    expect(updated.exercises[0].order).toBe(0)
    expect((await getAllTemplates()).find(t => t.id === template.id)?.name).toBe('Benträning')
  })

  it('updateTemplate kastar när mallen inte finns', async () => {
    await expect(updateTemplate('mall-saknas', { name: 'X' })).rejects.toThrow('not found')
  })

  it('deleteTemplate tar bort mallen', async () => {
    const template = await createTemplate('Benpass', [])
    expect(await getAllTemplates()).toHaveLength(1)

    await deleteTemplate(template.id)

    expect(await getAllTemplates()).toHaveLength(0)
  })
})
