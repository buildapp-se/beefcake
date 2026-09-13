import { getDB, generateId, nowISO, migrateSession, migrateTemplateExercise } from '../models'
import type {
  Template,
  TemplateExercise,
  Exercise,
  Session,
  SessionExercise,
  ExerciseHistory,
  SetEntry,
  LegacySession,
  LegacyTemplateExercise,
  ActiveWorkout,
  BodyWeight
} from '../models'
import type { SnapshotData } from '../lib/snapshot'
import { isCloudSyncConfigured, loadSnapshotFromCloud, syncSnapshot } from './cloudSyncService'
import { parseImportData } from '../lib/importValidation'
import { setVolume, setsVolume } from '../lib/volume'
import { localDateISO, parseLocalDate } from '../lib/date'
import { epley1RM } from '../lib/exerciseMetrics'

// Active Workout Service (pågående pass sparat lokalt i realtid)
export async function getActiveWorkout(): Promise<ActiveWorkout | undefined> {
  const db = await getDB()
  return db.get('activeWorkout', 'current')
}

export async function saveActiveWorkout(workout: Omit<ActiveWorkout, 'id' | 'updatedAt'>): Promise<ActiveWorkout> {
  const db = await getDB()
  const active: ActiveWorkout = {
    ...workout,
    id: 'current',
    updatedAt: nowISO()
  }
  await db.put('activeWorkout', active)
  return active
}

export async function clearActiveWorkout(): Promise<void> {
  const db = await getDB()
  await db.delete('activeWorkout', 'current')
}

// Exercise name → muscle group mapping for seed data and new exercises
const MUSCLE_GROUP_MAP: Record<string, string> = {
  'Armhävningar': 'Bröst', 'Axlar baksida rep': 'Axlar', 'Axlar sidolyft': 'Axlar',
  'Axlar sidolyft bakåt': 'Axlar', 'Benböj': 'Ben', 'Benlyft mage': 'Mage',
  'Benspark': 'Ben', 'Benspark baksida': 'Ben', 'Bicepscurl bänk': 'Biceps',
  'Bicepscurl ez stång': 'Biceps', 'Bicepscurl hantel': 'Biceps', 'Bänk': 'Bröst',
  'Chins': 'Rygg', 'Hantelpress': 'Axlar', 'Hantelrodd': 'Rygg',
  'Hip-thrusts': 'Bakre kedjan', 'Hopprep': 'Kondition', 'Hängande benlyft': 'Mage',
  'Marklyft': 'Bakre kedjan', 'Militärpress': 'Axlar', 'Situps': 'Mage',
  'Skivstångsrodd': 'Rygg', 'Snedbänk': 'Bröst', 'Snedbänk hantlar': 'Bröst',
  'Triceps pushdown': 'Triceps', 'Triceps stång': 'Triceps', 'Triceps övning': 'Triceps',
  'Vadpress skivstång': 'Ben', 'Vadpress maskin': 'Ben', 'Ab roller': 'Mage',
  'Axelpress maskin': 'Axlar', 'Latsdrag': 'Rygg', 'Leg curl': 'Ben',
  'Leg extension': 'Ben',
  // Startprogrammens övningar som inte fanns i katalogen (src/data/starterPrograms.ts)
  'Kabelrodd': 'Rygg', 'Face pull': 'Axlar', 'Hammercurl': 'Biceps', 'Triceps över huvudet': 'Triceps',
  'Rumänsk marklyft': 'Bakre kedjan', 'Benpress': 'Ben'
}

export function muscleGroupForName(name: string): string | undefined {
  return MUSCLE_GROUP_MAP[name]
}

// Övningar med stång: styr plattraden i loggvyn. Ingen övning i seeden har equipment satt,
// så fältet fylls här av namnet, samma väg som muskelgruppen. Stångvikter i src/lib/plates.ts.
const EQUIPMENT_MAP: Record<string, string> = {
  'Benböj': 'skivstång', 'Bänk': 'skivstång', 'Marklyft': 'skivstång', 'Militärpress': 'skivstång',
  'Skivstångsrodd': 'skivstång', 'Snedbänk': 'skivstång', 'Vadpress skivstång': 'skivstång',
  'Hip-thrusts': 'skivstång', 'Bicepscurl ez stång': 'ez-stång', 'Triceps stång': 'ez-stång', 'Rumänsk marklyft': 'skivstång'
}

// Fyll på muscleGroup och equipment där de saknas, ur namnkartorna. Additivt: ett satt värde rörs aldrig.
export async function backfillExerciseMeta(): Promise<number> {
  const db = await getDB()
  const exercises = await db.getAll('exercises')
  let updated = 0
  const tx = db.transaction(['exercises'], 'readwrite')
  for (const e of exercises) {
    const mg = e.muscleGroup ? undefined : MUSCLE_GROUP_MAP[e.name]
    const eq = e.equipment ? undefined : EQUIPMENT_MAP[e.name]
    if (mg || eq) {
      await tx.objectStore('exercises').put({ ...e, ...(mg ? { muscleGroup: mg } : {}), ...(eq ? { equipment: eq } : {}) })
      updated++
    }
  }
  await tx.done
  return updated
}

// Template Service
export async function getAllTemplates(): Promise<Template[]> {
  const db = await getDB()
  return db.getAllFromIndex('templates', 'by-updated')
}

export async function createTemplate(name: string, exercises: Omit<TemplateExercise, 'order'>[]): Promise<Template> {
  const db = await getDB()
  const template: Template = {
    id: generateId(),
    name,
    exercises: exercises.map((e, i) => ({ ...e, order: i })),
    updatedAt: nowISO()
  }
  await db.put('templates', template)
  await syncCloudData()
  return template
}

export async function updateTemplate(id: string, updates: Partial<Template>): Promise<Template> {
  const db = await getDB()
  const existing = await db.get('templates', id)
  if (!existing) throw new Error(`Template ${id} not found`)
  const updated = { ...existing, ...updates, updatedAt: nowISO() }
  await db.put('templates', updated)
  await syncCloudData()
  return updated
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['templates'], 'readwrite')
  await tx.objectStore('templates').delete(id)
  await tx.done
  await syncCloudData()
}

// Exercise Service
export async function getAllExercises(): Promise<Exercise[]> {
  const db = await getDB()
  return db.getAllFromIndex('exercises', 'by-name')
}

export async function getExercise(id: string): Promise<Exercise | undefined> {
  const db = await getDB()
  return db.get('exercises', id)
}

export async function getOrCreateExercise(name: string, muscleGroup?: string): Promise<Exercise> {
  const db = await getDB()
  const existing = await db.getFromIndex('exercises', 'by-name', name)
  if (existing) {
    if (muscleGroup && !existing.muscleGroup) {
      existing.muscleGroup = muscleGroup
      await db.put('exercises', existing)
    }
    return existing
  }
  const equipment = EQUIPMENT_MAP[name]
  const exercise: Exercise = {
    id: generateId(),
    name,
    muscleGroup: muscleGroup ?? MUSCLE_GROUP_MAP[name],
    ...(equipment ? { equipment } : {}),
    createdAt: nowISO()
  }
  await db.put('exercises', exercise)
  return exercise
}

// Session Service
export async function getAllSessions(): Promise<Session[]> {
  const db = await getDB()
  const sessions = await db.getAllFromIndex('sessions', 'by-date')
  return sessions.sort((a: Session, b: Session) => b.date.localeCompare(a.date))
}

export async function getSession(id: string): Promise<Session | undefined> {
  const db = await getDB()
  return db.get('sessions', id)
}

export async function createSession(
  date: string,
  templateId: string,
  templateName: string,
  exercises: Omit<SessionExercise, 'order'>[]
): Promise<Session> {
  const db = await getDB()
  const session: Session = {
    id: generateId(),
    date,
    templateId,
    templateName,
    exercises: exercises.map((e, i) => ({ ...e, order: i })),
    createdAt: nowISO()
  }

  const history: ExerciseHistory[] = exercises.map(e => {
    const totalVolume = setsVolume(e.setEntries)
    return {
      id: generateId(),
      date,
      exerciseId: e.exerciseId,
      exerciseName: e.exerciseName,
      setEntries: e.setEntries,
      volume: totalVolume,
      sessionId: session.id
    }
  })

  // Hämta den befintliga templaten för att uppdatera default-värden
  const template = await db.get('templates', templateId)
  if (template) {
    for (const e of exercises) {
      const ex = template.exercises.find(te => te.exerciseId === e.exerciseId)
      if (ex && e.setEntries.length > 0) {
        ex.defaultSetEntry = { ...e.setEntries[0] }
        template.updatedAt = nowISO()
      }
    }
  }

  // Atomär transaktion som skriver till alla tre stores
  const tx = db.transaction(['sessions', 'exerciseHistory', 'templates'], 'readwrite')
  await tx.objectStore('sessions').put(session)
  for (const h of history) {
    await tx.objectStore('exerciseHistory').put(h)
  }
  if (template) {
    await tx.objectStore('templates').put(template)
  }
  await tx.done
  await clearActiveWorkout()
  await syncCloudData()

  return session
}

export async function updateSession(id: string, updates: Partial<Session>): Promise<Session> {
  const db = await getDB()
  const existing = await db.get('sessions', id)
  if (!existing) throw new Error(`Session ${id} not found`)
  const updated = { ...existing, ...updates, id }

  const history: ExerciseHistory[] = updated.exercises.map((e, i) => {
    const totalVolume = setsVolume(e.setEntries)
    return {
      id: `${id}-${i}`,
      date: updated.date,
      exerciseId: e.exerciseId,
      exerciseName: e.exerciseName,
      setEntries: e.setEntries,
      volume: totalVolume,
      sessionId: id
    }
  })

  const stale = await db.getAllFromIndex('exerciseHistory', 'by-session', id)
  const tx = db.transaction(['sessions', 'exerciseHistory'], 'readwrite')
  for (const h of stale) await tx.objectStore('exerciseHistory').delete(h.id)
  for (const h of history) await tx.objectStore('exerciseHistory').put(h)
  await tx.objectStore('sessions').put(updated)
  await tx.done
  await syncCloudData()

  return updated
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['sessions', 'exerciseHistory'], 'readwrite')
  
  const history = await tx.objectStore('exerciseHistory').index('by-session').getAll(id)
  for (const h of history) {
    await tx.objectStore('exerciseHistory').delete(h.id)
  }
  
  await tx.objectStore('sessions').delete(id)
  await tx.done
  await syncCloudData()
}

// Stats Service
export async function getExerciseHistory(exerciseId: string): Promise<ExerciseHistory[]> {
  const db = await getDB()
  const history = await db.getAllFromIndex('exerciseHistory', 'by-exercise', exerciseId)
  return history.sort((a: ExerciseHistory, b: ExerciseHistory) => a.date.localeCompare(b.date))
}

export async function getVolumeOverTime(exerciseId: string): Promise<{ date: string; volume: number }[]> {
  const history = await getExerciseHistory(exerciseId)
  return history.map(h => ({ date: h.date, volume: h.volume }))
}

/** Förra gången övningen kördes: set, datum och passets anteckning (den bor bara på Session, inte i historiken). */
export async function getLastPerformanceForExercise(exerciseId: string): Promise<{ date: string; setEntries: SetEntry[]; notes?: string } | null> {
  const history = await getExerciseHistory(exerciseId)
  if (history.length === 0) return null
  const latest = history[history.length - 1]
  const db = await getDB()
  const session = await db.get('sessions', latest.sessionId)
  const notes = session?.exercises.find(e => e.exerciseId === exerciseId)?.notes
  return {
    date: latest.date,
    setEntries: latest.setEntries,
    ...(notes ? { notes } : {})
  }
}

/**
 * Antal pass per mall. Utan datumgränser räknas hela historiken.
 * `fromISO` och `toISO` är inklusive, formatet är `YYYY-MM-DD`.
 */
export async function getFrequencyPerTemplate(fromISO?: string, toISO?: string): Promise<{ templateName: string; count: number }[]> {
  const db = await getDB()
  const sessions = await db.getAll('sessions')
  const map = new Map<string, number>()
  for (const s of sessions) {
    if (fromISO && s.date < fromISO) continue
    if (toISO && s.date > toISO) continue
    // Passen från den trasiga mallen "undefined" i seeden ska inte få en egen
    // stapel, se CONTEXT.md om mallen som filtreras bort i syncSeed.
    if (!s.templateName || s.templateName === 'undefined') continue
    map.set(s.templateName, (map.get(s.templateName) || 0) + 1)
  }
  return Array.from(map.entries())
    .map(([templateName, count]) => ({ templateName, count }))
    .sort((a, b) => b.count - a.count)
}

/** Kalenderår som har minst ett pass, nyast först. Matar årsfiltret i Statistik. */
export async function getSessionYears(): Promise<number[]> {
  const db = await getDB()
  const sessions = await db.getAll('sessions')
  const years = new Set(sessions.map(s => Number(s.date.slice(0, 4))))
  return Array.from(years).sort((a, b) => b - a)
}

/**
 * Hur många gånger varje övning körts sedan `fromISO`, som `exerciseId -> antal`.
 * Används för att sortera de övningar du faktiskt tränar överst, istället för
 * bokstavsordning där armhävningar alltid hamnade först.
 */
export async function getExerciseTrainingCounts(fromISO: string): Promise<Map<string, number>> {
  const db = await getDB()
  const history = await db.getAll('exerciseHistory')
  const counts = new Map<string, number>()
  for (const h of history) {
    if (h.date < fromISO) continue
    counts.set(h.exerciseId, (counts.get(h.exerciseId) || 0) + 1)
  }
  return counts
}

export async function getPRs(): Promise<{ exerciseId: string; exerciseName: string; maxWeight: number; maxVolume: number; maxWeightDate: string; maxVolumeDate: string }[]> {
  const db = await getDB()
  const history = await db.getAll('exerciseHistory')
  const map = new Map<string, { exerciseName: string; maxWeight: number; maxVolume: number; maxWeightDate: string; maxVolumeDate: string }>()

  for (const h of history) {
    const maxWeight = Math.max(...h.setEntries.map(s => s.weight))
    const totalVolume = h.volume
    
    const existing = map.get(h.exerciseId)
    if (!existing) {
      map.set(h.exerciseId, {
        exerciseName: h.exerciseName,
        maxWeight,
        maxVolume: totalVolume,
        maxWeightDate: h.date,
        maxVolumeDate: h.date
      })
    } else {
      if (maxWeight > existing.maxWeight) {
        existing.maxWeight = maxWeight
        existing.maxWeightDate = h.date
      }
      if (totalVolume > existing.maxVolume) {
        existing.maxVolume = totalVolume
        existing.maxVolumeDate = h.date
      }
    }
  }

  return Array.from(map.entries()).map(([exerciseId, data]) => ({ exerciseId, ...data }))
}

/** Övningens rekord hittills: tyngsta set och bästa e1RM. Loggvyn jämför bockade set mot dem. */
export async function getExerciseRecords(exerciseId: string): Promise<{ maxWeight: number; maxE1RM: number }> {
  const history = await getExerciseHistory(exerciseId)
  let maxWeight = 0
  let maxE1RM = 0
  for (const h of history) {
    for (const set of h.setEntries) {
      maxWeight = Math.max(maxWeight, set.weight)
      maxE1RM = Math.max(maxE1RM, epley1RM(set.weight, set.reps) ?? 0)
    }
  }
  return { maxWeight, maxE1RM }
}

// Bästa estimerade 1RM över hela historiken. Formeln bor i src/lib/exerciseMetrics.ts.
export async function getEstimated1RM(exerciseId: string): Promise<{ exerciseName: string; estimated1RM: number; date: string } | null> {
  const history = await getExerciseHistory(exerciseId)
  let best: { exerciseName: string; estimated1RM: number; date: string } | null = null
  for (const h of history) {
    for (const set of h.setEntries) {
      const rm = epley1RM(set.weight, set.reps)
      if (rm !== null && (!best || rm > best.estimated1RM)) {
        best = { exerciseName: h.exerciseName, estimated1RM: rm, date: h.date }
      }
    }
  }
  return best
}

// Get volume per muscle group
export async function getVolumeByMuscleGroup(): Promise<{ muscleGroup: string; volume: number; sessions: number }[]> {
  const db = await getDB()
  const [exercises, history] = await Promise.all([
    db.getAll('exercises'),
    db.getAll('exerciseHistory')
  ])
  
  const exerciseMuscleMap = new Map(exercises.map(e => [e.id, e.muscleGroup || 'Övrigt']))
  const map = new Map<string, { volume: number; sessionIds: Set<string> }>()
  
  for (const h of history) {
    const mg = exerciseMuscleMap.get(h.exerciseId) || 'Övrigt'
    const existing = map.get(mg) || { volume: 0, sessionIds: new Set() }
    existing.volume += h.volume
    existing.sessionIds.add(h.sessionId)
    map.set(mg, existing)
  }
  
  return Array.from(map.entries())
    .map(([muscleGroup, data]) => ({ muscleGroup, volume: data.volume, sessions: data.sessionIds.size }))
    .sort((a, b) => b.volume - a.volume)
}

// Hypertrofi: Hårda set per muskelgrupp för en given vecka
export async function getWeeklyHardSetsPerMuscleGroup(weekStartDate: string): Promise<{ muscleGroup: string; sets: number }[]> {
  const db = await getDB()
  const [sessions, exercises] = await Promise.all([
    db.getAll('sessions'),
    db.getAll('exercises')
  ])

  const exerciseMuscleMap = new Map(exercises.map(e => [e.id, e.muscleGroup || 'Övrigt']))
  const weekEndDate = parseLocalDate(weekStartDate)
  weekEndDate.setDate(weekEndDate.getDate() + 6)
  const weekEndISO = localDateISO(weekEndDate)

  const map = new Map<string, number>()
  for (const s of sessions) {
    if (s.date >= weekStartDate && s.date <= weekEndISO) {
      for (const ex of s.exercises) {
        const mg = exerciseMuscleMap.get(ex.exerciseId) || 'Övrigt'
        // Räkna antal set (varje setEntry i ett pass representerar 1 eller fler set)
        const totalSets = ex.setEntries.reduce((sum, set) => sum + (set.sets || 1), 0)
        map.set(mg, (map.get(mg) || 0) + totalSets)
      }
    }
  }

  return Array.from(map.entries())
    .map(([muscleGroup, sets]) => ({ muscleGroup, sets }))
    .sort((a, b) => b.sets - a.sets)
}

// Kroppsvikt: ett värde per dag, samma datum skriver över. Nyast först.
export async function getBodyWeights(): Promise<BodyWeight[]> {
  const db = await getDB()
  return (await db.getAll('bodyWeight')).sort((a, b) => b.date.localeCompare(a.date))
}

export async function saveBodyWeight(date: string, kg: number): Promise<void> {
  const db = await getDB()
  await db.put('bodyWeight', { date, kg: Math.round(kg * 10) / 10 })
  await syncCloudData()
}

export async function deleteBodyWeight(date: string): Promise<void> {
  const db = await getDB()
  await db.delete('bodyWeight', date)
  await syncCloudData()
}

// Export/Import. Snapshotens samlingar: de fyra i domänmodellen plus kroppsvikten.
const SNAPSHOT_STORES = ['templates', 'exercises', 'sessions', 'exerciseHistory', 'bodyWeight'] as const

export async function exportAllData(): Promise<string> {
  const db = await getDB()
  const tx = db.transaction(SNAPSHOT_STORES, 'readonly')
  const [templates, exercises, sessions, history, bodyWeight] = await Promise.all([
    tx.objectStore('templates').getAll(),
    tx.objectStore('exercises').getAll(),
    tx.objectStore('sessions').getAll(),
    tx.objectStore('exerciseHistory').getAll(),
    tx.objectStore('bodyWeight').getAll()
  ])
  await tx.done
  return JSON.stringify({ templates, exercises, sessions, exerciseHistory: history, bodyWeight }, null, 2)
}

export async function importAllData(json: string): Promise<void> {
  await replaceDataInLocal(parseImportData(json))
  await syncCloudData()
}

/** Ersätt den lokala cachen med en hel snapshot: D1:s auktoritativa eller en importerad JSON. */
async function replaceDataInLocal(data: SnapshotData): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(SNAPSHOT_STORES, 'readwrite')
  await Promise.all(SNAPSHOT_STORES.map(store => tx.objectStore(store).clear()))
  for (const t of data.templates) await tx.objectStore('templates').put(t)
  for (const e of data.exercises) await tx.objectStore('exercises').put(e)
  for (const s of data.sessions) await tx.objectStore('sessions').put(s)
  for (const h of data.exerciseHistory) await tx.objectStore('exerciseHistory').put(h)
  // Serverns snapshot kommer råa: en äldre D1-snapshot saknar bodyWeight
  for (const b of data.bodyWeight ?? []) await tx.objectStore('bodyWeight').put(b)
  await tx.done
}

function exerciseKey(name: string): string {
  return name.trim().toLowerCase()
}

function sessionKey(date: string, templateName: string): string {
  return `${date} ${templateName}`
}

/** @param seedEmpty seeda en tom databas med Excel-historiken. Förval: bara utan moln, en ny användare i D1 startar tom. */
export async function syncSeed(seedEmpty = !isCloudSyncConfigured()): Promise<{ sessionsAdded: number; exercisesAdded: number }> {
  await loadSnapshotFromCloud(JSON.parse(await exportAllData()) as SnapshotData, replaceDataInLocal)
  await backfillExerciseMeta()

  const db = await getDB()
  const { seedTemplates, seedExercises, seedSessions } = await import('../db/seedData')

  const [existingExercises, existingTemplates, existingSessions] = await Promise.all([
    db.getAll('exercises'),
    db.getAll('templates'),
    db.getAll('sessions')
  ])

  // Seeden är en engångsimport i en tom databas. Den var additiv vid varje uppstart,
  // och då kom varje raderat seedpass tillbaka nästa gång appen laddades.
  if (!seedEmpty || existingExercises.length || existingTemplates.length || existingSessions.length) {
    await syncCloudData()
    return { sessionsAdded: 0, exercisesAdded: 0 }
  }

  const exerciseIdByName = new Map(existingExercises.map(e => [exerciseKey(e.name), e.id]))
  const templateIdByName = new Map(existingTemplates.map(t => [exerciseKey(t.name), t.id]))
  const haveSession = new Set(existingSessions.map(s => sessionKey(s.date, s.templateName)))
  const seedNameById = new Map(seedExercises.map(e => [e.id, e.name]))

  const newExercises: Exercise[] = []
  for (const e of seedExercises) {
    if (exerciseIdByName.has(exerciseKey(e.name))) continue
    exerciseIdByName.set(exerciseKey(e.name), e.id)
    const mg = MUSCLE_GROUP_MAP[e.name]
    const eq = EQUIPMENT_MAP[e.name]
    newExercises.push({ ...e, ...(mg ? { muscleGroup: mg } : {}), ...(eq ? { equipment: eq } : {}) })
  }

  const newTemplates: Template[] = []
  for (const t of seedTemplates) {
    if (templateIdByName.has(exerciseKey(t.name))) continue
    if (t.name === 'undefined') continue
    templateIdByName.set(exerciseKey(t.name), t.id)
    newTemplates.push({
      ...t,
      exercises: t.exercises.map(te => {
        const migrated = migrateTemplateExercise(te as unknown as LegacyTemplateExercise)
        const cleanMigrated = {
          ...migrated,
          exerciseId: exerciseIdByName.get(exerciseKey(seedNameById.get(te.exerciseId) ?? '')) ?? te.exerciseId,
          defaultSetEntry: {
            sets: migrated.defaultSetEntry.sets || 0,
            reps: migrated.defaultSetEntry.reps || 0,
            weight: migrated.defaultSetEntry.weight || 0
          }
        }
        return cleanMigrated
      })
    })
  }

  const newSessions: Session[] = []
  const newHistory: ExerciseHistory[] = []
  for (const s of seedSessions) {
    if (haveSession.has(sessionKey(s.date, s.templateName))) continue
    const migratedSession = migrateSession(s as LegacySession)
    migratedSession.templateId = templateIdByName.get(exerciseKey(s.templateName)) ?? s.templateId
    
    migratedSession.exercises = migratedSession.exercises.map(e => ({
      ...e,
      exerciseId: exerciseIdByName.get(exerciseKey(e.exerciseName)) ?? e.exerciseId
    }))
    
    newSessions.push(migratedSession)
    
    for (const e of migratedSession.exercises) {
      const totalVolume = setsVolume(e.setEntries)
      newHistory.push({
        id: `${s.id}-${e.order}`,
        date: s.date,
        exerciseId: e.exerciseId,
        exerciseName: e.exerciseName,
        setEntries: e.setEntries,
        volume: totalVolume,
        sessionId: s.id
      })
    }
  }

  if (!newExercises.length && !newTemplates.length && !newSessions.length) {
    await syncCloudData()
    return { sessionsAdded: 0, exercisesAdded: 0 }
  }

  const tx = db.transaction(['templates', 'exercises', 'sessions', 'exerciseHistory'], 'readwrite')
  for (const e of newExercises) await tx.objectStore('exercises').put(e)
  for (const t of newTemplates) await tx.objectStore('templates').put(t)
  for (const s of newSessions) await tx.objectStore('sessions').put(s)
  for (const h of newHistory) await tx.objectStore('exerciseHistory').put(h)
  await tx.done

  await syncCloudData()

  return { sessionsAdded: newSessions.length, exercisesAdded: newExercises.length }
}

export async function exportSessionsCSV(): Promise<string> {
  const sessions = await getAllSessions()
  const headers = ['Datum', 'Pass', 'Övning', 'Set', 'Reps', 'Vikt (kg)', 'Volym']
  const rows = [headers.join(',')]
  for (const s of sessions) {
    for (const e of s.exercises) {
      for (const set of e.setEntries) {
        rows.push([
          s.date,
          `"${s.templateName}"`,
          `"${e.exerciseName}"`,
          set.sets,
          set.reps,
          set.weight,
          setVolume(set)
        ].join(','))
      }
    }
  }
  return rows.join('\n')
}

export async function clearAllData(): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(SNAPSHOT_STORES, 'readwrite')
  await Promise.all(SNAPSHOT_STORES.map(store => tx.objectStore(store).clear()))
  await tx.done
  await syncCloudData()
}

async function syncCloudData(): Promise<void> {
  await syncSnapshot(JSON.parse(await exportAllData()) as SnapshotData)
}
