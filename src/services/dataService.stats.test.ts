import 'fake-indexeddb/auto'
import { beforeEach, describe, it, expect, vi } from 'vitest'

// Ingen synk mot molnet och ingen Firebase i testet.
const syncSnapshot = vi.fn(async () => {})
// loadSnapshotFromCloud är den riktiga om inte ett test byter ut den (serverns snapshot utan moln).
type LoadFromCloud = typeof import('./cloudSyncService').loadSnapshotFromCloud
let loadFromCloud: LoadFromCloud | null = null
vi.mock('./cloudSyncService', async (importOriginal) => {
  const original = await importOriginal<typeof import('./cloudSyncService')>()
  return {
    ...original,
    syncSnapshot: (...args: unknown[]) => (syncSnapshot as (...a: unknown[]) => Promise<void>)(...args),
    loadSnapshotFromCloud: (...args: Parameters<LoadFromCloud>) => (loadFromCloud ?? original.loadSnapshotFromCloud)(...args),
  }
})
const signOutUser = vi.fn(async () => {})
vi.mock('./authService', () => ({ signOutUser: () => signOutUser() }))

import {
  clearAllData, createCardioSession, createSession, createTemplate, deleteBodyWeight, exportAllData, exportSessionsCSV,
  getBodyWeights, getEstimated1RM, getExercise, getExerciseRecords, getExerciseTrainingCounts, getFrequencyPerTemplate,
  getLastPerformanceForExercise, getOrCreateExercise, getPRs, getSessionYears, getVolumeByMuscleGroup, getVolumeOverTime,
  getWeeklyHardSetsPerMuscleGroup, importAllData, muscleGroupForName, saveActiveWorkout, saveBodyWeight,
  saveExerciseProgression, signOutAndClear, syncSeed, updateSession, getActiveWorkout, getExerciseHistory, getAllTemplates,
  getAllExercises, getSession, getAllSessions
} from './dataService'
import { getDB } from '../models'
import type { Exercise, ExerciseHistory, Session } from '../models'
import { seedExercises } from '../db/seedData'
import { STARTER_PROGRAMS } from '../data/starterPrograms'
import { barWeightFor } from '../lib/plates'

const STORES = ['templates', 'exercises', 'sessions', 'exerciseHistory', 'bodyWeight', 'settings', 'activeWorkout'] as const

beforeEach(async () => {
  const db = await getDB()
  for (const s of STORES) await db.clear(s)
  syncSnapshot.mockClear()
  signOutUser.mockClear()
  loadFromCloud = null
})

function hist(id: string, exerciseId: string, date: string, sets: [number, number][], extra: Partial<ExerciseHistory> = {}): ExerciseHistory {
  const setEntries = sets.map(([weight, reps]) => ({ sets: 1, reps, weight }))
  return { id, date, exerciseId, exerciseName: `Övning ${exerciseId}`, setEntries, volume: setEntries.reduce((s, e) => s + e.weight * e.reps, 0), sessionId: `s-${id}`, ...extra }
}

function session(id: string, date: string, templateName: string, exercises: Session['exercises'] = []): Session {
  return { id, date, templateId: `tpl-${templateName}`, templateName, exercises, createdAt: '2026-01-01T00:00:00.000Z' }
}

describe('getOrCreateExercise', () => {
  it('skapar en ny övning med grupp, utrustning och typ ur namnkartorna', async () => {
    const ex = await getOrCreateExercise('Chins')
    expect(ex).toMatchObject({ name: 'Chins', muscleGroup: 'Rygg', kind: 'bodyweight' })
    expect(ex).not.toHaveProperty('equipment')
    const bank = await getOrCreateExercise('Bänk')
    expect(bank).toMatchObject({ muscleGroup: 'Bröst', equipment: 'skivstång' })
    expect(bank).not.toHaveProperty('kind')
    expect(await getExercise(ex.id)).toEqual(ex)
  })

  it('angiven grupp vinner över kartan, okänt namn får ingen grupp', async () => {
    expect((await getOrCreateExercise('Benböj', 'Bakre kedjan')).muscleGroup).toBe('Bakre kedjan')
    const okand = await getOrCreateExercise('Okänd')
    expect(okand.muscleGroup).toBeUndefined()
    expect(okand).not.toHaveProperty('equipment')
    expect(okand).not.toHaveProperty('kind')
  })

  it('returnerar befintlig övning och fyller bara på saknad grupp', async () => {
    const forst = await getOrCreateExercise('Okänd')
    const igen = await getOrCreateExercise('Okänd', 'Mage')
    expect(igen.id).toBe(forst.id)
    expect((await getExercise(forst.id))?.muscleGroup).toBe('Mage')
    const tredje = await getOrCreateExercise('Okänd', 'Rygg')
    expect(tredje.muscleGroup).toBe('Mage')
    expect((await getExercise(forst.id))?.muscleGroup).toBe('Mage')
    expect(await getAllExercises()).toHaveLength(1)
  })

  it('muscleGroupForName läser kartan', () => {
    expect(muscleGroupForName('Benböj')).toBe('Ben')
    expect(muscleGroupForName('Finns inte')).toBeUndefined()
  })

  it('namnkartorna ger seedens och startprogrammens övningar grupp, stång och typ', async () => {
    const names = [...new Set([...seedExercises.map(e => e.name), ...STARTER_PROGRAMS.flatMap(p => p.templates.flatMap(t => t.exercises.map(e => e.name)))])].sort()
    const meta: Record<string, string> = {}
    for (const name of names) {
      const e = await getOrCreateExercise(name)
      if (e.equipment) expect(barWeightFor(e.equipment), name).not.toBeNull()
      meta[name] = [e.muscleGroup, e.equipment, e.kind].filter(Boolean).join(' / ')
    }
    // Namnkartorna som data: en ändring här ska vara avsiktlig. Tre seedövningar saknar grupp och visas som Övrigt.
    expect(meta).toMatchSnapshot()
  })
})

describe('saveExerciseProgression', () => {
  it('sparar valet, tar bort fältet när valet är tomt och synkar', async () => {
    const ex = await getOrCreateExercise('Bänk')
    await saveExerciseProgression(ex.id, { holdAt: 0 })
    expect((await getExercise(ex.id))?.progression).toEqual({ holdAt: 0 })
    await saveExerciseProgression(ex.id, { next: { weight: 62.5, reps: 10 } })
    expect((await getExercise(ex.id))?.progression).toEqual({ next: { weight: 62.5, reps: 10 } })
    await saveExerciseProgression(ex.id, {})
    expect(await getExercise(ex.id)).not.toHaveProperty('progression')
    expect(syncSnapshot).toHaveBeenCalledTimes(3)
  })

  it('kastar när övningen saknas', async () => {
    await expect(saveExerciseProgression('saknas', { holdAt: 1 })).rejects.toThrow('Exercise saknas not found')
  })
})

describe('createSession och updateSession', () => {
  it('createSession uppdaterar programmets standardset med passets första set och rensar utkastet', async () => {
    const tpl = await createTemplate('Ben', [
      { exerciseId: 'ex-a', defaultSetEntry: { sets: 3, reps: 5, weight: 50 } },
      { exerciseId: 'ex-b', defaultSetEntry: { sets: 3, reps: 8, weight: 20 } }
    ])
    await saveActiveWorkout({ date: '2026-11-01', templateId: tpl.id, templateName: 'Ben', startTime: 'x', exercises: [] })
    const s = await createSession('2026-11-01', tpl.id, 'Ben', [
      { exerciseId: 'ex-a', exerciseName: 'A', setEntries: [{ sets: 1, reps: 6, weight: 60 }, { sets: 1, reps: 5, weight: 70 }] },
      { exerciseId: 'ex-b', exerciseName: 'B', setEntries: [] },
      { exerciseId: 'ex-c', exerciseName: 'C', setEntries: [{ sets: 2, reps: 10, weight: 10 }] }
    ])
    expect(s.exercises.map(e => e.order)).toEqual([0, 1, 2])
    const saved = (await getAllTemplates())[0]
    expect(saved.exercises[0].defaultSetEntry).toEqual({ sets: 1, reps: 6, weight: 60 })
    expect(saved.exercises[1].defaultSetEntry).toEqual({ sets: 3, reps: 8, weight: 20 })
    expect(saved.updatedAt >= tpl.updatedAt).toBe(true)
    expect(await getActiveWorkout()).toBeUndefined()
    const h = await getExerciseHistory('ex-c')
    expect(h).toHaveLength(1)
    expect(h[0]).toMatchObject({ date: '2026-11-01', exerciseName: 'C', volume: 200, sessionId: s.id })
  })

  it('updateSession skriver om historiken och behåller id', async () => {
    const s = await createSession('2026-11-01', 'tpl-x', 'X', [
      { exerciseId: 'ex-a', exerciseName: 'A', setEntries: [{ sets: 1, reps: 5, weight: 100 }] },
      { exerciseId: 'ex-b', exerciseName: 'B', setEntries: [{ sets: 1, reps: 5, weight: 10 }] }
    ])
    const updated = await updateSession(s.id, {
      id: 'annat-id',
      date: '2026-11-02',
      exercises: [{ exerciseId: 'ex-a', exerciseName: 'A', setEntries: [{ sets: 1, reps: 5, weight: 110 }], order: 0 }]
    })
    expect(updated.id).toBe(s.id)
    expect(updated.templateName).toBe('X')
    expect(await getExerciseHistory('ex-b')).toHaveLength(0)
    const a = await getExerciseHistory('ex-a')
    expect(a).toEqual([{ id: `${s.id}-0`, date: '2026-11-02', exerciseId: 'ex-a', exerciseName: 'A', setEntries: [{ sets: 1, reps: 5, weight: 110 }], volume: 550, sessionId: s.id }])
    expect((await getSession(s.id))?.date).toBe('2026-11-02')
    expect(await getSession('annat-id')).toBeUndefined()
  })

  it('updateSession kastar när passet saknas', async () => {
    await expect(updateSession('saknas', {})).rejects.toThrow('Session saknas not found')
  })

  it('createCardioSession sparar ett pass utan övningar och synkar', async () => {
    const s = await createCardioSession('2026-11-03', 'Promenad', { minutes: 45, km: 3.2 })
    expect(await getSession(s.id)).toEqual({ id: s.id, date: '2026-11-03', templateId: 'cardio', templateName: 'Promenad', exercises: [], createdAt: s.createdAt, cardio: { minutes: 45, km: 3.2 } })
    expect(syncSnapshot).toHaveBeenCalledTimes(1)
  })
})

describe('statistik', () => {
  it('getAllSessions sorterar nyast först', async () => {
    const db = await getDB()
    await db.put('sessions', session('a', '2026-01-02', 'X'))
    await db.put('sessions', session('b', '2026-03-01', 'X'))
    await db.put('sessions', session('c', '2026-02-01', 'X'))
    expect((await getAllSessions()).map(s => s.id)).toEqual(['b', 'c', 'a'])
  })

  it('historik och volym över tid sorteras äldst först', async () => {
    const db = await getDB()
    // Id i omvänd datumordning: indexet ger id-ordning, bara sorteringen ger datumordning
    await db.put('exerciseHistory', hist('1', 'ex', '2026-02-01', [[10, 10]]))
    await db.put('exerciseHistory', hist('2', 'ex', '2026-01-01', [[10, 5]]))
    await db.put('exerciseHistory', hist('3', 'annan', '2026-01-15', [[10, 5]]))
    expect(await getVolumeOverTime('ex')).toEqual([{ date: '2026-01-01', volume: 50 }, { date: '2026-02-01', volume: 100 }])
  })

  it('getLastPerformanceForExercise tar senaste raden och passets anteckning', async () => {
    expect(await getLastPerformanceForExercise('ex')).toBeNull()
    const db = await getDB()
    await db.put('exerciseHistory', hist('1', 'ex', '2026-01-01', [[10, 5]], { sessionId: 's-old' }))
    await db.put('exerciseHistory', hist('2', 'ex', '2026-02-01', [[20, 5]], { sessionId: 's-new' }))
    expect(await getLastPerformanceForExercise('ex')).toEqual({ date: '2026-02-01', setEntries: [{ sets: 1, reps: 5, weight: 20 }] })
    // Passet finns men övningen står inte i det: ingen anteckning, inget fel
    await db.put('sessions', session('s-new', '2026-02-01', 'X', []))
    expect(await getLastPerformanceForExercise('ex')).toEqual({ date: '2026-02-01', setEntries: [{ sets: 1, reps: 5, weight: 20 }] })
    await db.put('sessions', session('s-new', '2026-02-01', 'X', [
      { exerciseId: 'annan', exerciseName: 'Annan', setEntries: [], order: 0, notes: 'fel övning' },
      { exerciseId: 'ex', exerciseName: 'Ex', setEntries: [], order: 1, notes: 'säte 4' }
    ]))
    expect(await getLastPerformanceForExercise('ex')).toEqual({ date: '2026-02-01', setEntries: [{ sets: 1, reps: 5, weight: 20 }], notes: 'säte 4' })
  })

  it('getFrequencyPerTemplate räknar inom inklusiva gränser och hoppar över mallen undefined', async () => {
    const db = await getDB()
    await db.put('sessions', session('1', '2026-01-01', 'Ben'))
    await db.put('sessions', session('2', '2026-01-10', 'Ben'))
    await db.put('sessions', session('3', '2026-01-31', 'Rygg'))
    await db.put('sessions', session('4', '2026-02-01', 'Rygg'))
    await db.put('sessions', session('5', '2026-01-15', 'undefined'))
    await db.put('sessions', session('6', '2026-01-15', ''))
    await db.put('sessions', session('7', '2026-01-20', 'Rygg'))
    await db.put('sessions', session('8', '2026-01-21', 'Rygg'))
    expect(await getFrequencyPerTemplate()).toEqual([{ templateName: 'Rygg', count: 4 }, { templateName: 'Ben', count: 2 }])
    expect(await getFrequencyPerTemplate('2026-01-10', '2026-01-31')).toEqual([{ templateName: 'Rygg', count: 3 }, { templateName: 'Ben', count: 1 }])
  })

  it('getSessionYears ger unika år nyast först', async () => {
    const db = await getDB()
    await db.put('sessions', session('1', '2024-05-01', 'X'))
    await db.put('sessions', session('2', '2026-01-01', 'X'))
    await db.put('sessions', session('3', '2025-01-01', 'X'))
    await db.put('sessions', session('4', '2026-06-01', 'X'))
    expect(await getSessionYears()).toEqual([2026, 2025, 2024])
  })

  it('getExerciseTrainingCounts räknar från och med datumet', async () => {
    const db = await getDB()
    await db.put('exerciseHistory', hist('1', 'a', '2026-01-01', [[1, 1]]))
    await db.put('exerciseHistory', hist('2', 'a', '2026-01-02', [[1, 1]]))
    await db.put('exerciseHistory', hist('3', 'a', '2026-01-03', [[1, 1]]))
    await db.put('exerciseHistory', hist('5', 'a', '2026-01-04', [[1, 1]]))
    await db.put('exerciseHistory', hist('4', 'b', '2025-12-31', [[1, 1]]))
    expect(await getExerciseTrainingCounts('2026-01-02')).toEqual(new Map([['a', 3]]))
  })

  it('getPRs håller maxvikt och maxvolym med sina datum', async () => {
    const db = await getDB()
    await db.put('exerciseHistory', hist('1', 'a', '2026-01-01', [[50, 10], [60, 3]]))
    await db.put('exerciseHistory', hist('2', 'a', '2026-01-02', [[55, 20]]))
    await db.put('exerciseHistory', hist('3', 'a', '2026-01-03', [[60, 1]]))
    await db.put('exerciseHistory', hist('4', 'a', '2026-01-04', [[20, 1], [70, 1]]))
    // Lika tungt eller lika stor volym senare flyttar inte rekordets datum, en lättare rad rör inget
    await db.put('exerciseHistory', hist('5', 'b', '2026-01-01', [[80, 1]]))
    await db.put('exerciseHistory', hist('6', 'b', '2026-01-02', [[80, 1]]))
    await db.put('exerciseHistory', hist('7', 'b', '2026-01-03', [[50, 1]]))
    const prs = await getPRs()
    expect(prs).toEqual([
      { exerciseId: 'a', exerciseName: 'Övning a', maxWeight: 70, maxVolume: 1100, maxWeightDate: '2026-01-04', maxVolumeDate: '2026-01-02' },
      { exerciseId: 'b', exerciseName: 'Övning b', maxWeight: 80, maxVolume: 80, maxWeightDate: '2026-01-01', maxVolumeDate: '2026-01-01' }
    ])
  })

  it('getExerciseRecords och getEstimated1RM räknar Epley upp till tio reps', async () => {
    expect(await getExerciseRecords('a')).toEqual({ maxWeight: 0, maxE1RM: 0 })
    expect(await getEstimated1RM('a')).toBeNull()
    const db = await getDB()
    // Första setet saknar e1RM (över tio reps), ett lika bra senare set flyttar inte datumet
    await db.put('exerciseHistory', hist('1', 'a', '2026-01-01', [[60, 30], [100, 3]]))
    await db.put('exerciseHistory', hist('2', 'a', '2026-01-02', [[90, 10]]))
    await db.put('exerciseHistory', hist('3', 'a', '2026-01-03', [[100, 3]]))
    await db.put('exerciseHistory', hist('4', 'a', '2026-01-04', [[90, 10]]))
    expect(await getExerciseRecords('a')).toEqual({ maxWeight: 100, maxE1RM: 120 })
    expect(await getEstimated1RM('a')).toEqual({ exerciseName: 'Övning a', estimated1RM: 120, date: '2026-01-02' })
  })

  it('getVolumeByMuscleGroup summerar per grupp, okända som Övrigt, flest kg först', async () => {
    const db = await getDB()
    await db.put('exercises', { id: 'a', name: 'A', muscleGroup: 'Ben', createdAt: 'x' } as Exercise)
    await db.put('exercises', { id: 'b', name: 'B', createdAt: 'x' } as Exercise)
    // Den minsta gruppen läses först, så ordningen kommer av sorteringen
    await db.put('exerciseHistory', hist('1', 'b', '2026-01-02', [[10, 5]], { sessionId: 's2' }))
    await db.put('exerciseHistory', hist('2', 'a', '2026-01-01', [[10, 10]], { sessionId: 's1' }))
    await db.put('exerciseHistory', hist('3', 'a', '2026-01-02', [[10, 10]], { sessionId: 's1' }))
    await db.put('exerciseHistory', hist('4', 'z', '2026-01-02', [[10, 1]], { sessionId: 's3' }))
    expect(await getVolumeByMuscleGroup()).toEqual([
      { muscleGroup: 'Ben', volume: 200, sessions: 1 },
      { muscleGroup: 'Övrigt', volume: 60, sessions: 2 }
    ])
  })

  it('getWeeklyHardSetsPerMuscleGroup räknar måndag till söndag, set saknas som 1', async () => {
    const db = await getDB()
    await db.put('exercises', { id: 'a', name: 'A', muscleGroup: 'Ben', createdAt: 'x' } as Exercise)
    const ex = (exerciseId: string, sets: number[]) => ({ exerciseId, exerciseName: exerciseId, order: 0, setEntries: sets.map(n => ({ sets: n, reps: 5, weight: 10 })) })
    await db.put('sessions', session('1', '2026-11-16', 'X', [ex('okand', [1]), ex('a', [3, 0])]))
    await db.put('sessions', session('2', '2026-11-22', 'X', [ex('a', [2])]))
    await db.put('sessions', session('3', '2026-11-15', 'X', [ex('a', [9])]))
    await db.put('sessions', session('4', '2026-11-23', 'X', [ex('a', [9])]))
    expect(await getWeeklyHardSetsPerMuscleGroup('2026-11-16')).toEqual([
      { muscleGroup: 'Ben', sets: 6 },
      { muscleGroup: 'Övrigt', sets: 1 }
    ])
  })
})

describe('kroppsvikt', () => {
  it('sparar avrundat till en decimal, nyast först, samma datum skriver över, radering', async () => {
    await saveBodyWeight('2026-01-01', 80.04)
    await saveBodyWeight('2026-02-01', 81.26)
    await saveBodyWeight('2026-01-15', 79)
    await saveBodyWeight('2026-01-15', 79.5)
    expect(await getBodyWeights()).toEqual([{ date: '2026-02-01', kg: 81.3 }, { date: '2026-01-15', kg: 79.5 }, { date: '2026-01-01', kg: 80 }])
    await deleteBodyWeight('2026-01-15')
    expect((await getBodyWeights()).map(b => b.date)).toEqual(['2026-02-01', '2026-01-01'])
    expect(syncSnapshot).toHaveBeenCalledTimes(5)
  })
})

describe('export, import och rensning', () => {
  it('exportAllData och importAllData ger samma data tillbaka och ersätter allt lokalt', async () => {
    const ex = await getOrCreateExercise('Bänk')
    await createSession('2026-11-01', 'tpl', 'Bröst', [{ exerciseId: ex.id, exerciseName: 'Bänk', setEntries: [{ sets: 1, reps: 5, weight: 80 }] }])
    await saveBodyWeight('2026-11-01', 80)
    const json = await exportAllData()
    const parsed = JSON.parse(json)
    expect(Object.keys(parsed)).toEqual(['templates', 'exercises', 'sessions', 'exerciseHistory', 'bodyWeight'])
    expect(json).toContain('\n  "templates"')

    await createCardioSession('2026-11-02', 'Löpning', { minutes: 20 })
    syncSnapshot.mockClear()
    await importAllData(json)
    expect(JSON.parse(await exportAllData())).toEqual(parsed)
    expect(syncSnapshot).toHaveBeenCalledTimes(1)
  })

  it('importAllData utan bodyWeight tömmer kroppsvikten, ogiltig JSON rör inget', async () => {
    await saveBodyWeight('2026-11-01', 80)
    await expect(importAllData('{"templates": []}')).rejects.toThrow()
    expect(await getBodyWeights()).toHaveLength(1)
    await importAllData(JSON.stringify({ templates: [], exercises: [], sessions: [], exerciseHistory: [] }))
    expect(await getBodyWeights()).toHaveLength(0)
  })

  it('clearAllData tömmer snapshotens samlingar men inte utkastet', async () => {
    await createCardioSession('2026-11-02', 'Löpning', { minutes: 20 })
    await saveBodyWeight('2026-11-01', 80)
    await saveActiveWorkout({ date: '2026-11-01', templateId: 't', templateName: 'T', startTime: 'x', exercises: [] })
    await clearAllData()
    expect(JSON.parse(await exportAllData())).toEqual({ templates: [], exercises: [], sessions: [], exerciseHistory: [], bodyWeight: [] })
    expect(await getActiveWorkout()).toBeDefined()
  })

  it('signOutAndClear loggar ut och tömmer passen, utkastet och molnmärkena men inte andra inställningar', async () => {
    const db = await getDB()
    await createCardioSession('2026-11-02', 'Löpning', { minutes: 20 })
    await saveBodyWeight('2026-11-01', 80)
    await saveActiveWorkout({ date: '2026-11-01', templateId: 't', templateName: 'T', startTime: 'x', exercises: [] })
    await db.put('settings', { key: 'server-revision', value: 3 })
    await db.put('settings', { key: 'owner-uid', value: 'uid' })
    await db.put('settings', { key: 'backup-target', value: 'kvar' })
    await signOutAndClear()
    expect(signOutUser).toHaveBeenCalledTimes(1)
    expect(JSON.parse(await exportAllData())).toEqual({ templates: [], exercises: [], sessions: [], exerciseHistory: [], bodyWeight: [] })
    expect(await getActiveWorkout()).toBeUndefined()
    expect((await db.getAll('settings')).map(s => s.key)).toEqual(['backup-target'])
  })

  it('exportSessionsCSV ger en rad per set med citerade namn och volym', async () => {
    const db = await getDB()
    await db.put('sessions', session('1', '2026-01-01', 'Ben', [{ exerciseId: 'a', exerciseName: 'Benböj', order: 0, setEntries: [{ sets: 2, reps: 5, weight: 100 }, { sets: 1, reps: 10, weight: 0 }] }]))
    await db.put('sessions', session('2', '2026-01-02', 'Rygg', [{ exerciseId: 'b', exerciseName: 'Chins', order: 0, setEntries: [{ sets: 1, reps: 8, weight: 10 }] }]))
    expect(await exportSessionsCSV()).toBe([
      'Datum,Pass,Övning,Set,Reps,Vikt (kg),Volym',
      '2026-01-02,"Rygg","Chins",1,8,10,80',
      '2026-01-01,"Ben","Benböj",2,5,100,1000',
      '2026-01-01,"Ben","Benböj",1,10,0,0'
    ].join('\n'))
  })
})

describe('syncSeed', () => {
  it('seedar en tom databas utan moln, en gång, utan mallen undefined', async () => {
    const result = await syncSeed(true)
    expect(result.replaced).toBe(false)
    expect(result.exercisesAdded).toBe(33)
    expect(result.sessionsAdded).toBe(418)
    const templates = await getAllTemplates()
    expect(templates.map(t => t.name)).not.toContain('undefined')
    expect(templates).toHaveLength(8)
    // Varje programövning pekar på en övning som finns, med standardset utan tomma fält
    const exerciseIds = new Set((await getAllExercises()).map(e => e.id))
    for (const t of templates) for (const te of t.exercises) {
      expect(exerciseIds.has(te.exerciseId)).toBe(true)
      expect(Object.keys(te.defaultSetEntry).sort()).toEqual(['reps', 'sets', 'weight'])
    }
    // Standardseten bär seedens tal, inte nollor
    expect(templates.flatMap(t => t.exercises).some(te => te.defaultSetEntry.sets > 0 && te.defaultSetEntry.reps > 0 && te.defaultSetEntry.weight > 0)).toBe(true)
    const benboj = (await getAllExercises()).find(e => e.name === 'Benböj')
    expect(benboj).toMatchObject({ muscleGroup: 'Ben', equipment: 'skivstång' })
    expect((await getAllExercises()).find(e => e.name === 'Chins')?.kind).toBe('bodyweight')
    // Historiken pekar på passen och har volymen räknad
    const sessions = await getAllSessions()
    const sessionIds = new Set(sessions.map(s => s.id))
    const history = await (await getDB()).getAll('exerciseHistory')
    expect(history.length).toBeGreaterThan(sessions.length)
    for (const h of history) expect(sessionIds.has(h.sessionId)).toBe(true)
    const withVolume = history.find(h => h.volume > 0)!
    expect(withVolume.volume).toBe(withVolume.setEntries.reduce((s, e) => s + (e.weight > 0 ? e.sets * e.reps * e.weight : 0), 0))
    for (const s of sessions.slice(0, 20)) for (const e of s.exercises) expect(exerciseIds.has(e.exerciseId)).toBe(true)
    expect(syncSnapshot).toHaveBeenCalledTimes(1)

    syncSnapshot.mockClear()
    expect(await syncSeed(true)).toEqual({ sessionsAdded: 0, exercisesAdded: 0, replaced: false })
    expect(syncSnapshot).not.toHaveBeenCalled()
  })

  it('seedar som förval när moln inte är konfigurerat', async () => {
    expect((await syncSeed()).sessionsAdded).toBe(418)
  })

  it('serverns snapshot utan bodyWeight ersätter det lokala och tömmer kroppsvikten', async () => {
    await saveBodyWeight('2026-01-01', 80)
    loadFromCloud = async (_readLocal, replace) => {
      await replace({ templates: [], exercises: [{ id: 'srv', name: 'Benböj', createdAt: 'x' }], sessions: [], exerciseHistory: [] } as unknown as Parameters<typeof replace>[0])
      return true
    }
    expect(await syncSeed(false)).toEqual({ sessionsAdded: 0, exercisesAdded: 0, replaced: true })
    expect(await getBodyWeights()).toEqual([])
    expect((await getAllExercises()).map(e => [e.id, e.muscleGroup])).toEqual([['srv', 'Ben']])
  })

  it('seedar inte med moln, men synkar en backfill', async () => {
    const db = await getDB()
    expect(await syncSeed(false)).toEqual({ sessionsAdded: 0, exercisesAdded: 0, replaced: false })
    expect(await getAllSessions()).toHaveLength(0)
    expect(syncSnapshot).not.toHaveBeenCalled()
    await db.put('exercises', { id: 'x', name: 'Benböj', createdAt: 'x' })
    await syncSeed(false)
    expect((await getExercise('x'))?.muscleGroup).toBe('Ben')
    expect(syncSnapshot).toHaveBeenCalledTimes(1)
  })
})
