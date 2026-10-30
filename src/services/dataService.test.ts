import 'fake-indexeddb/auto'
import { describe, it, expect, vi } from 'vitest'

// En utvecklares .env.local ska inte få testet att synka mot molnet.
vi.mock('./cloudSyncService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./cloudSyncService')>()),
  syncSnapshot: async () => {},
}))

import { createSession, deleteSession, getAllSessions, getExerciseHistory, getSession, restoreSession } from './dataService'

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
