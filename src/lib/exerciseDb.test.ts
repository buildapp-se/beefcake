import { describe, expect, it } from 'vitest'
import data from '../data/exerciseDb.json'
import {
  CATEGORY_SV, EQUIPMENT_SV, EXERCISE_DB_MAP_IDS, LEVEL_SV, MUSCLE_SV, NO_STRETCH,
  dbIdForName, exerciseImageUrl, ownNamesForDbId, searchExerciseDb, type DbExercise
} from './exerciseDb'

const all = data as DbExercise[]
const ids = new Set(all.map(e => e.id))

describe('exerciseDb', () => {
  it('varje id i namnkartan finns i datan', () => {
    const missing = EXERCISE_DB_MAP_IDS.filter(id => !ids.has(id))
    expect(missing).toEqual([])
  })

  it('varje övning har svenskt namn, originalnamn och instruktioner utan tankstreck', () => {
    const bad = all.filter(e => !e.name.trim() || !e.nameEn.trim() || e.instructions.some(s => !s.trim() || s.includes('—')))
    expect(bad.map(e => e.id)).toEqual([])
  })

  it('varje muskel, utrustning, nivå och kategori i datan har en svensk etikett', () => {
    const unlabeled = new Set<string>()
    for (const e of all) {
      for (const m of [...e.primaryMuscles, ...e.secondaryMuscles]) if (!MUSCLE_SV[m]) unlabeled.add('muscle:' + m)
      if (e.equipment !== null && !EQUIPMENT_SV[e.equipment]) unlabeled.add('equipment:' + e.equipment)
      if (!LEVEL_SV[e.level]) unlabeled.add('level:' + e.level)
      if (!CATEGORY_SV[e.category]) unlabeled.add('category:' + e.category)
    }
    expect([...unlabeled]).toEqual([])
  })

  it('namnkartan är skiftlägesokänslig och går att slå upp baklänges', () => {
    expect(dbIdForName('  bänk ')).toBe('Barbell_Bench_Press_-_Medium_Grip')
    expect(dbIdForName('Okänd övning')).toBeNull()
    expect(ownNamesForDbId('Leg_Extensions').sort()).toEqual(['Benspark', 'Leg extension'])
  })

  it('sökningen kräver alla ord och filtrerar på muskel och utrustning', () => {
    const none = { q: '', muscle: '', equipment: '', category: '' }
    const hits = searchExerciseDb(all, { ...none, q: 'press bench', muscle: 'chest', equipment: 'barbell' })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every(e => /bench/i.test(e.nameEn) && /press/i.test(e.nameEn) && e.equipment === 'barbell')).toBe(true)
    expect(searchExerciseDb(all, { ...none, q: 'bänkpress', equipment: 'barbell' }).length).toBeGreaterThan(0)
    expect(searchExerciseDb(all, none)).toHaveLength(all.length)
    expect(searchExerciseDb(all, { ...none, q: 'zzzz' })).toEqual([])
  })

  it('typfiltret: allt utom stretch och en enskild typ', () => {
    const none = { q: '', muscle: '', equipment: '', category: '' }
    const stretches = all.filter(e => e.category === 'stretching').length
    const noStretch = searchExerciseDb(all, { ...none, category: NO_STRETCH })
    expect(stretches).toBeGreaterThan(0)
    expect(noStretch).toHaveLength(all.length - stretches)
    expect(noStretch.some(e => e.category === 'stretching')).toBe(false)
    const cardio = searchExerciseDb(all, { ...none, category: 'cardio' })
    expect(cardio.length).toBeGreaterThan(0)
    expect(cardio.every(e => e.category === 'cardio')).toBe(true)
  })

  it('bild-URL:en pekar på den låsta commiten', () => {
    expect(exerciseImageUrl('Barbell_Squat', 1)).toMatch(/free-exercise-db@[0-9a-f]{40}\/exercises\/Barbell_Squat\/1\.jpg$/)
  })
})
