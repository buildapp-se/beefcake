import { describe, expect, it } from 'vitest'
import { emptySnapshot, hasTrainingData, mergeGuestIntoAccount, selectAuthoritativeSnapshot, type SnapshotData } from './snapshot'

function snapshot(sessionName: string, extraSessionId?: string): SnapshotData {
  return {
    templates: [],
    exercises: [],
    sessions: [
      {
        id: 'shared-session',
        date: '2026-08-25',
        templateId: 'template-1',
        templateName: sessionName,
        exercises: [],
        createdAt: '2026-08-25T08:00:00.000Z'
      },
      ...(extraSessionId ? [{
        id: extraSessionId,
        date: '2026-08-24',
        templateId: 'template-1',
        templateName: 'Lokalt borttaget pass',
        exercises: [],
        createdAt: '2026-08-24T08:00:00.000Z'
      }] : [])
    ],
    exerciseHistory: [],
    bodyWeight: []
  }
}

describe('selectAuthoritativeSnapshot', () => {
  it('väljer D1 exakt och återupplivar inte lokalt kvarvarande raderingar', () => {
    const local = snapshot('Gammal lokal version', 'deleted-on-server')
    const server = snapshot('Aktuell serverversion')

    expect(selectAuthoritativeSnapshot(server)).toEqual(server)
    expect(local.sessions).toHaveLength(2)
  })

  // OWASP 2026-09-16, A01: nästa konto på enheten ärver inte förra kontots pass.
  it('startar tomt när D1 saknar snapshot, lokalt följer aldrig med', () => {
    expect(selectAuthoritativeSnapshot(null)).toEqual({
      templates: [], exercises: [], sessions: [], exerciseHistory: [], bodyWeight: []
    })
  })
})

describe('hasTrainingData', () => {
  it('är falsk för en tom snapshot och sann så fort pass, program, övning eller kroppsvikt finns', () => {
    expect(hasTrainingData(emptySnapshot())).toBe(false)
    expect(hasTrainingData(snapshot('Pass'))).toBe(true)
    expect(hasTrainingData({
      ...emptySnapshot(),
      templates: [{ id: 't-1', name: 'Push', exercises: [], updatedAt: '2026-01-01' }]
    })).toBe(true)
    expect(hasTrainingData({
      ...emptySnapshot(),
      exercises: [{ id: 'e-1', name: 'Bänk', createdAt: '2026-01-01' }]
    })).toBe(true)
    expect(hasTrainingData({
      ...emptySnapshot(),
      bodyWeight: [{ date: '2026-09-01', kg: 80 }]
    })).toBe(true)
  })
})

describe('mergeGuestIntoAccount', () => {
  const set = { sets: 1, reps: 5, weight: 60 }
  const account: SnapshotData = {
    exercises: [{ id: 'acc-bank', name: 'Bänk', createdAt: '2026-01-01' }],
    templates: [{ id: 'acc-push', name: 'Push', exercises: [{ exerciseId: 'acc-bank', defaultSetEntry: set, order: 0 }], updatedAt: '2026-01-01' }],
    sessions: [{ id: 'acc-s1', date: '2026-09-01', templateId: 'acc-push', templateName: 'Push', exercises: [{ exerciseId: 'acc-bank', exerciseName: 'Bänk', setEntries: [set], order: 0 }], createdAt: '2026-09-01' }],
    exerciseHistory: [{ id: 'acc-h1', date: '2026-09-01', exerciseId: 'acc-bank', exerciseName: 'Bänk', setEntries: [set], volume: 300, sessionId: 'acc-s1' }],
    bodyWeight: [{ date: '2026-09-01', kg: 80 }]
  }
  const guest: SnapshotData = {
    exercises: [{ id: 'g-bank', name: 'bänk ', createdAt: '2026-10-01' }, { id: 'g-bob', name: 'Benböj', createdAt: '2026-10-01' }],
    templates: [{ id: 'g-push', name: 'push', exercises: [{ exerciseId: 'g-bank', defaultSetEntry: set, order: 0 }], updatedAt: '2026-10-01' },
      { id: 'g-ben', name: 'Ben', exercises: [{ exerciseId: 'g-bob', defaultSetEntry: set, order: 0 }], updatedAt: '2026-10-01' }],
    sessions: [{ id: 'g-s1', date: '2026-10-02', templateId: 'g-push', templateName: 'push', exercises: [{ exerciseId: 'g-bank', exerciseName: 'bänk', setEntries: [set], order: 0 }], createdAt: '2026-10-02' }],
    exerciseHistory: [{ id: 'g-h1', date: '2026-10-02', exerciseId: 'g-bank', exerciseName: 'bänk', setEntries: [set], volume: 300, sessionId: 'g-s1' }],
    bodyWeight: [{ date: '2026-09-01', kg: 99 }, { date: '2026-10-02', kg: 81 }]
  }

  it('lägger gästens pass i kontot och pekar om till kontots övning och program med samma namn', () => {
    const merged = mergeGuestIntoAccount(account, guest)
    expect(merged.exercises.map(e => e.id)).toEqual(['acc-bank', 'g-bob'])
    expect(merged.templates.map(t => t.id)).toEqual(['acc-push', 'g-ben'])
    expect(merged.sessions.map(s => s.id)).toEqual(['acc-s1', 'g-s1'])
    const guestSession = merged.sessions.find(s => s.id === 'g-s1')!
    expect(guestSession.templateId).toBe('acc-push')
    expect(guestSession.exercises[0].exerciseId).toBe('acc-bank')
    expect(merged.exerciseHistory.map(h => h.id)).toEqual(['acc-h1', 'g-h1'])
    expect(merged.exerciseHistory.find(h => h.id === 'g-h1')!.exerciseId).toBe('acc-bank')
    expect(merged.bodyWeight).toEqual([{ date: '2026-09-01', kg: 80 }, { date: '2026-10-02', kg: 81 }])
  })

  it('slår ihop dubblettövningar hos gästen med olika skiftläge och hoppar över pass och historik som redan finns i kontot', () => {
    const guestWithCollisions: SnapshotData = {
      exercises: [
        { id: 'g-chins-1', name: 'Chins', createdAt: '2026-10-01' },
        { id: 'g-chins-2', name: ' chins ', createdAt: '2026-10-02' }
      ],
      templates: [],
      sessions: [
        { id: 'acc-s1', date: '2026-09-01', templateId: 'acc-push', templateName: 'Gästkopia', exercises: [], createdAt: '2026-09-01' },
        { id: 'g-s2', date: '2026-10-03', templateId: 'acc-push', templateName: 'Push', exercises: [{ exerciseId: 'g-chins-2', exerciseName: 'chins', setEntries: [set], order: 0 }], createdAt: '2026-10-03' }
      ],
      exerciseHistory: [
        { id: 'acc-h1', date: '2026-10-03', exerciseId: 'g-chins-1', exerciseName: 'Chins', setEntries: [set], volume: 300, sessionId: 'g-s2' },
        { id: 'g-h-for-acc-session', date: '2026-09-01', exerciseId: 'g-chins-1', exerciseName: 'Chins', setEntries: [set], volume: 300, sessionId: 'acc-s1' },
        { id: 'g-h2', date: '2026-10-03', exerciseId: 'g-chins-2', exerciseName: 'chins', setEntries: [set], volume: 300, sessionId: 'g-s2' }
      ],
      bodyWeight: []
    }

    const merged = mergeGuestIntoAccount(account, guestWithCollisions)
    expect(merged.exercises.map(e => e.id)).toEqual(['acc-bank', 'g-chins-1'])
    expect(merged.sessions.map(s => s.id)).toEqual(['acc-s1', 'g-s2'])
    expect(merged.sessions.find(s => s.id === 'acc-s1')!.templateName).toBe('Push')
    expect(merged.sessions.find(s => s.id === 'g-s2')!.exercises[0].exerciseId).toBe('g-chins-1')
    expect(merged.exerciseHistory.map(h => h.id)).toEqual(['acc-h1', 'g-h2'])
    expect(merged.exerciseHistory.find(h => h.id === 'acc-h1')!.sessionId).toBe('acc-s1')
    expect(merged.exerciseHistory.find(h => h.id === 'g-h2')!.exerciseId).toBe('g-chins-1')
  })

  it('ett tomt konto får gästens data oförändrad', () => {
    const empty = selectAuthoritativeSnapshot(null)
    expect(mergeGuestIntoAccount(empty, guest)).toEqual(guest)
  })
})
