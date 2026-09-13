import { describe, expect, it } from 'vitest'
import { STARTER_PROGRAMS } from '../data/starterPrograms'
import { dbIdForName } from './exerciseDb'
import { muscleGroupForName } from '../services/dataService'

describe('startprogrammen', () => {
  it('varje övning har muskelgrupp och bild i databasen, så statistik och förhandsvisning fungerar från start', () => {
    const missing: string[] = []
    for (const p of STARTER_PROGRAMS) for (const t of p.templates) for (const e of t.exercises) {
      if (!muscleGroupForName(e.name)) missing.push(`grupp:${e.name}`)
      if (!dbIdForName(e.name)) missing.push(`bild:${e.name}`)
      expect(e.sets).toBeGreaterThan(0)
      expect(e.reps).toBeGreaterThan(0)
    }
    expect([...new Set(missing)]).toEqual([])
  })

  it('programnamnen är unika och varje program har en källa', () => {
    const names = STARTER_PROGRAMS.flatMap(p => p.templates.map(t => t.name))
    expect(new Set(names).size).toBe(names.length)
    for (const p of STARTER_PROGRAMS) expect(p.source.url).toMatch(/^https:\/\//)
  })
})
