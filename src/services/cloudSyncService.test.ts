import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SnapshotData } from '../lib/snapshot'

const settings = vi.hoisted(() => {
  vi.stubEnv('VITE_BEEFCAKE_API_URL', 'https://api.test')
  return new Map<string, unknown>()
})

vi.mock('../models', () => ({
  getDB: async () => ({
    get: async (_store: string, key: string) => settings.has(key) ? { key, value: settings.get(key) } : undefined,
    put: async (_store: string, setting: { key: string; value: unknown }) => { settings.set(setting.key, setting.value) }
  })
}))

vi.mock('./authService', () => ({
  getCurrentUid: async () => 'u1',
  getIdToken: async () => 'token'
}))

import { loadSnapshotFromCloud } from './cloudSyncService'

function snapshot(templateNames: string[]): SnapshotData {
  return {
    templates: templateNames.map(name => ({ id: name, name })) as unknown as SnapshotData['templates'],
    exercises: [], sessions: [], exerciseHistory: [], bodyWeight: []
  }
}

function serverAnswers(revision: number, data: SnapshotData | null) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ revision, data }))))
}

describe('loadSnapshotFromCloud', () => {
  beforeEach(() => settings.clear())

  it('lämnar det lokala orört när enheten redan har serverns revision', async () => {
    settings.set('owner-uid', 'u1').set('server-revision', 7)
    serverAnswers(7, snapshot(['A']))
    const replace = vi.fn()
    expect(await loadSnapshotFromCloud(async () => snapshot(['A']), replace)).toBe(false)
    expect(replace).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('ersätter det lokala när en annan enhet har sparat', async () => {
    settings.set('owner-uid', 'u1').set('server-revision', 7)
    serverAnswers(8, snapshot(['A', 'B']))
    const replace = vi.fn()
    expect(await loadSnapshotFromCloud(async () => snapshot(['A']), replace)).toBe(true)
    expect(replace).toHaveBeenCalledWith(snapshot(['A', 'B']))
    expect(settings.get('server-revision')).toBe(8)
  })

  it('servern vinner över lokala ändringar som aldrig laddades upp', async () => {
    settings.set('owner-uid', 'u1').set('server-revision', 7)
    serverAnswers(7, snapshot(['A']))
    const replace = vi.fn()
    expect(await loadSnapshotFromCloud(async () => snapshot(['A', 'osynkad']), replace)).toBe(true)
    expect(replace).toHaveBeenCalledWith(snapshot(['A']))
  })

  it('skriver inte över något som sparades medan servern svarade', async () => {
    settings.set('owner-uid', 'u1').set('server-revision', 7)
    serverAnswers(8, snapshot(['A', 'B']))
    const replace = vi.fn()
    const readLocal = vi.fn()
      .mockResolvedValueOnce(snapshot(['A']))
      .mockResolvedValueOnce(snapshot(['A', 'nytt']))
    expect(await loadSnapshotFromCloud(readLocal, replace)).toBe(false)
    expect(replace).not.toHaveBeenCalled()
    expect(settings.get('server-revision')).toBe(7)
  })

  it('en ny enhet hämtar kontots snapshot och märks med kontot', async () => {
    serverAnswers(3, snapshot(['A']))
    const replace = vi.fn()
    expect(await loadSnapshotFromCloud(async () => snapshot([]), replace)).toBe(true)
    expect(replace).toHaveBeenCalledWith(snapshot(['A']))
    expect(settings.get('owner-uid')).toBe('u1')
  })
})
