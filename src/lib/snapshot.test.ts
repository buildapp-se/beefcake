import { describe, expect, it } from 'vitest'
import { selectAuthoritativeSnapshot, type SnapshotData } from './snapshot'

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
