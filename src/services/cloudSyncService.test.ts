import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SnapshotData } from '../lib/snapshot'

const { settings, storeCounts } = vi.hoisted(() => {
  vi.stubEnv('VITE_BEEFCAKE_API_URL', 'https://api.test')
  return {
    settings: new Map<string, unknown>(),
    storeCounts: new Map<string, number>()
  }
})

vi.mock('../models', () => ({
  getDB: async () => ({
    get: async (_store: string, key: string) => settings.has(key) ? { key, value: settings.get(key) } : undefined,
    put: async (_store: string, setting: { key: string; value: unknown }) => { settings.set(setting.key, setting.value) },
    count: async (store: string) => storeCounts.get(store) ?? 0
  })
}))

vi.mock('./authService', () => ({
  getCurrentUid: async () => 'u1',
  getIdToken: async () => 'token'
}))

import {
  canBrowseAsGuest,
  getCloudSyncError,
  getReminderEnabled,
  isCloudSyncConfigured,
  isLocalDataOwnedBy,
  loadSnapshotFromCloud,
  setReminderEnabled,
  subscribeToCloudSyncError,
  syncSnapshot
} from './cloudSyncService'

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
  beforeEach(() => {
    settings.clear()
    storeCounts.clear()
  })

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

  it('skickar Authorization-header med Bearer-token till servern', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ revision: 1, data: snapshot(['A']) })))
    vi.stubGlobal('fetch', fetchMock)
    await loadSnapshotFromCloud(async () => snapshot([]), vi.fn())
    expect(fetchMock).toHaveBeenCalledWith('https://api.test/api/snapshot', {
      headers: { Authorization: 'Bearer token' }
    })
  })

  it('märker en ny enhet med kontot även när servern är tom på revision 0', async () => {
    serverAnswers(0, null)
    const replace = vi.fn()
    expect(await loadSnapshotFromCloud(async () => snapshot([]), replace)).toBe(true)
    expect(replace).toHaveBeenCalledWith(snapshot([]))
    expect(settings.get('owner-uid')).toBe('u1')
  })

  it('uppdaterar revisionen när servern har ny revision även om datan är identisk', async () => {
    settings.set('owner-uid', 'u1').set('server-revision', 7)
    serverAnswers(8, snapshot(['A']))
    const replace = vi.fn()
    expect(await loadSnapshotFromCloud(async () => snapshot(['A']), replace)).toBe(true)
    expect(replace).toHaveBeenCalledWith(snapshot(['A']))
    expect(settings.get('server-revision')).toBe(8)
  })

  it('nollställer befintligt synkfel när serverns snapshot redan matchar det lokala', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Error', { status: 500 })))
    await expect(loadSnapshotFromCloud(async () => snapshot([]), vi.fn())).rejects.toThrow()
    expect(getCloudSyncError()).not.toBeNull()

    settings.set('owner-uid', 'u1').set('server-revision', 7)
    serverAnswers(7, snapshot(['A']))
    const replace = vi.fn()
    expect(await loadSnapshotFromCloud(async () => snapshot(['A']), replace)).toBe(false)
    expect(getCloudSyncError()).toBeNull()
  })

  it('nollställer befintligt synkfel när serverns snapshot ersätter det lokala', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Error', { status: 500 })))
    await expect(loadSnapshotFromCloud(async () => snapshot([]), vi.fn())).rejects.toThrow()
    expect(getCloudSyncError()).not.toBeNull()

    settings.set('owner-uid', 'u1').set('server-revision', 7)
    serverAnswers(8, snapshot(['A', 'B']))
    const replace = vi.fn()
    expect(await loadSnapshotFromCloud(async () => snapshot(['A']), replace)).toBe(true)
    expect(getCloudSyncError()).toBeNull()
  })
})

describe('canBrowseAsGuest', () => {
  beforeEach(() => {
    settings.clear()
    storeCounts.clear()
  })

  it('tillåter gäst om ägaren redan är märkt som gäst', async () => {
    settings.set('owner-uid', 'guest')
    expect(await canBrowseAsGuest()).toBe(true)
  })

  it('nekar gäst om enheten hör till ett konto', async () => {
    settings.set('owner-uid', 'u1')
    expect(await canBrowseAsGuest()).toBe(false)
  })

  it('nekar gäst om omärkt lokal data finns i någon store', async () => {
    storeCounts.set('sessions', 1)
    expect(await canBrowseAsGuest()).toBe(false)
    expect(settings.get('owner-uid')).toBeUndefined()
  })

  it('tillåter gäst och sätter guest-ägare om databasen är helt tom', async () => {
    expect(await canBrowseAsGuest()).toBe(true)
    expect(settings.get('owner-uid')).toBe('guest')
  })
})

describe('subscribeToCloudSyncError', () => {
  beforeEach(() => {
    settings.clear()
    storeCounts.clear()
  })

  it('notifierar lyssnare vid synkfel och tillåter avprenumeration', async () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToCloudSyncError(listener)
    expect(typeof unsubscribe).toBe('function')

    vi.stubGlobal('fetch', vi.fn(async () => new Response('Server error', { status: 500 })))
    await expect(loadSnapshotFromCloud(async () => snapshot([]), vi.fn())).rejects.toThrow()

    expect(listener).toHaveBeenCalledWith(expect.stringContaining('Servern kunde inte läsas (500).'))
    expect(getCloudSyncError()).toContain('Servern kunde inte läsas (500).')

    listener.mockClear()
    unsubscribe()

    vi.stubGlobal('fetch', vi.fn(async () => new Response('Server unavailable', { status: 503 })))
    await expect(loadSnapshotFromCloud(async () => snapshot([]), vi.fn())).rejects.toThrow()
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('loadSnapshotFromCloud felhantering', () => {
  beforeEach(() => {
    settings.clear()
    storeCounts.clear()
  })

  it('kastar fel med serverstatus och sätter syncError när servern svarar med felkod', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Internal error', { status: 502 })))
    await expect(loadSnapshotFromCloud(async () => snapshot([]), vi.fn()))
      .rejects.toThrow('Servern kunde inte läsas (502).')
    expect(getCloudSyncError()).toContain('Servern kunde inte läsas (502).')
  })

  it('använder fallbackmeddelande när det fångade felet saknar feltext', async () => {
    const errorWithoutMessage = new Error('')
    await expect(loadSnapshotFromCloud(async () => { throw errorWithoutMessage }, vi.fn()))
      .rejects.toThrow('D1 kunde inte läsas.')
    expect(getCloudSyncError()).toContain('D1 kunde inte läsas.')
  })

  it('bevarar ursprungligt fel som cause när det slängs vidare', async () => {
    const originalError = new Error('Disk read failure')
    const caught = await loadSnapshotFromCloud(async () => { throw originalError }, vi.fn()).catch(e => e)
    expect(caught).toBeInstanceOf(Error)
    expect(caught.cause).toBe(originalError)
  })
})

describe('isLocalDataOwnedBy', () => {
  beforeEach(() => {
    settings.clear()
    storeCounts.clear()
  })

  it('svarar true när lokal ägare matchar angiven uid', async () => {
    settings.set('owner-uid', 'u1')
    expect(await isLocalDataOwnedBy('u1')).toBe(true)
  })

  it('svarar false när lokal ägare inte matchar eller saknas', async () => {
    settings.set('owner-uid', 'u1')
    expect(await isLocalDataOwnedBy('u2')).toBe(false)

    settings.delete('owner-uid')
    expect(await isLocalDataOwnedBy('u1')).toBe(false)
  })
})

describe('syncSnapshot fel och statusar', () => {
  beforeEach(() => {
    settings.clear()
    storeCounts.clear()
  })

  function mockFetchForSync(postResponse: () => Promise<Response>) {
    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (method === 'GET') {
        return new Response(JSON.stringify({ revision: 1, data: snapshot(['A']) }))
      }
      if (method === 'POST') {
        return postResponse()
      }
      return new Response('Not found', { status: 404 })
    }))
  }

  it('kastar specifikt konfliktfel när servern svarar med status 409', async () => {
    settings.set('owner-uid', 'u1').set('server-revision', 1)
    mockFetchForSync(async () => new Response('Conflict', { status: 409 }))
    await expect(syncSnapshot(snapshot(['B'])))
      .rejects.toThrow('Servern har ändrats. Ingen lokal data skrevs över.')
  })

  it('kastar fel med statuskod när servern svarar med annan felkod än 409', async () => {
    settings.set('owner-uid', 'u1').set('server-revision', 1)
    mockFetchForSync(async () => new Response('Server error', { status: 500 }))
    await expect(syncSnapshot(snapshot(['B'])))
      .rejects.toThrow('Servern kunde inte spara (500).')
  })

  it('sparar ny revision vid lyckad POST', async () => {
    settings.set('owner-uid', 'u1').set('server-revision', 1)
    mockFetchForSync(async () => new Response(JSON.stringify({ revision: 2 }), { status: 200 }))
    await syncSnapshot(snapshot(['B']))
    expect(settings.get('server-revision')).toBe(2)
    expect(getCloudSyncError()).toBeNull()
  })

  it('tillåter första synk mot tom server (revision 0, data null) även om lokal revision är satt', async () => {
    settings.set('owner-uid', 'u1').set('server-revision', 1)
    let postBody: { expectedRevision: number; data: SnapshotData } | null = null
    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') {
        postBody = JSON.parse(init.body as string)
        return new Response(JSON.stringify({ revision: 1 }), { status: 200 })
      }
      return new Response(JSON.stringify({ revision: 0, data: null }))
    }))

    await syncSnapshot(snapshot(['A']))
    expect(postBody).toEqual({ expectedRevision: 0, data: snapshot(['A']) })
    expect(settings.get('server-revision')).toBe(1)
  })

  it('kastar serverkonflikt när serverrevision skiljer sig från lokal revision', async () => {
    settings.set('owner-uid', 'u1').set('server-revision', 1)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ revision: 2, data: snapshot(['A']) }))))
    await expect(syncSnapshot(snapshot(['B'])))
      .rejects.toThrow('Serverkonflikt: lokal revision 1, serverrevision 2.')
  })

  it('kastar fel när serverdata finns men lokal revision är 0', async () => {
    settings.set('owner-uid', 'u1').set('server-revision', 0)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ revision: 0, data: snapshot(['A']) }))))
    await expect(syncSnapshot(snapshot(['B'])))
      .rejects.toThrow('Serverdata finns men den lokala revisionen saknas. Ladda om sidan innan du sparar.')
  })

  it('kastar serverkonflikt när serverrevision är större än 0 även om serverdata är null', async () => {
    settings.set('owner-uid', 'u1').set('server-revision', 0)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ revision: 1, data: null }))))
    await expect(syncSnapshot(snapshot(['B'])))
      .rejects.toThrow('Serverkonflikt: lokal revision 0, serverrevision 1.')
  })

  it('avbryter utan POST och nollställer fel när lokal data redan är identisk med serverdata', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Error', { status: 500 })))
    await expect(syncSnapshot(snapshot(['B']))).rejects.toThrow()
    expect(getCloudSyncError()).not.toBeNull()

    settings.set('owner-uid', 'u1').set('server-revision', 1)
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ revision: 1, data: snapshot(['A']) })))
    vi.stubGlobal('fetch', fetchMock)

    await syncSnapshot(snapshot(['A']))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getCloudSyncError()).toBeNull()
  })

  it('skickar Authorization- och Content-Type-headers vid POST samt nollställer synkfel', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Error', { status: 500 })))
    await expect(syncSnapshot(snapshot(['B']))).rejects.toThrow()
    expect(getCloudSyncError()).not.toBeNull()

    settings.set('owner-uid', 'u1').set('server-revision', 1)
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (method === 'GET') {
        return new Response(JSON.stringify({ revision: 1, data: snapshot(['A']) }))
      }
      if (method === 'POST') {
        return new Response(JSON.stringify({ revision: 2 }), { status: 200 })
      }
      return new Response('Not found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await syncSnapshot(snapshot(['B']))
    expect(settings.get('server-revision')).toBe(2)
    expect(getCloudSyncError()).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith('https://api.test/api/snapshot', expect.objectContaining({
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'Content-Type': 'application/json'
      }
    }))
  })

  it('använder fallbackmeddelande vid syncSnapshot när det fångade felet saknar feltext', async () => {
    settings.set('owner-uid', 'u1').set('server-revision', 1)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('') }))
    await expect(syncSnapshot(snapshot(['B'])))
      .rejects.toThrow('D1 kunde inte spara snapshoten.')
    expect(getCloudSyncError()).toContain('D1 kunde inte spara snapshoten.')
  })

  it('bevarar ursprungligt fel som cause vid syncSnapshot', async () => {
    settings.set('owner-uid', 'u1').set('server-revision', 1)
    const originalError = new Error('Disk write failure')
    vi.stubGlobal('fetch', vi.fn(async () => { throw originalError }))
    const caught = await syncSnapshot(snapshot(['B'])).catch(e => e)
    expect(caught).toBeInstanceOf(Error)
    expect(caught.cause).toBe(originalError)
  })
})

describe('reminders inställningar', () => {
  beforeEach(() => {
    settings.clear()
    storeCounts.clear()
  })

  it('hämtar status för påminnelser', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ enabled: true }))))
    expect(await getReminderEnabled()).toBe(true)
  })

  it('kastar fel med statuskod när påminnelser inte kan läsas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Error', { status: 500 })))
    await expect(getReminderEnabled()).rejects.toThrow('Inställningen kunde inte läsas (500).')
  })

  it('sparar status för påminnelser', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await setReminderEnabled(true)
    expect(fetchMock).toHaveBeenCalledWith('https://api.test/api/reminders', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ enabled: true })
    }))
  })

  it('kastar fel med statuskod när påminnelser inte kan sparas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Error', { status: 503 })))
    await expect(setReminderEnabled(false)).rejects.toThrow('Inställningen kunde inte sparas (503).')
  })
})

describe('isCloudSyncConfigured och URL-hantering', () => {
  it('returnerar false och avbryter loadSnapshotFromCloud när molnsynk inte är konfigurerad', async () => {
    expect(isCloudSyncConfigured()).toBe(true)

    vi.resetModules()
    vi.stubEnv('VITE_BEEFCAKE_API_URL', '')
    const unconfigured = await import('./cloudSyncService')
    expect(unconfigured.isCloudSyncConfigured()).toBe(false)
    const replace = vi.fn()
    expect(await unconfigured.loadSnapshotFromCloud(async () => snapshot([]), replace)).toBe(false)
    expect(replace).not.toHaveBeenCalled()

    vi.resetModules()
    vi.stubEnv('VITE_BEEFCAKE_API_URL', 'https://api.test')
  })

  it('avbryter syncSnapshot utan nätverksanrop när molnsynk inte är konfigurerad', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_BEEFCAKE_API_URL', '')
    const unconfigured = await import('./cloudSyncService')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    await unconfigured.syncSnapshot(snapshot([]))
    expect(fetchSpy).not.toHaveBeenCalled()

    vi.resetModules()
    vi.stubEnv('VITE_BEEFCAKE_API_URL', 'https://api.test')
  })

  it('rensar avslutande snedstreck från API-URL vid anrop', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_BEEFCAKE_API_URL', 'https://api.test/')
    const serviceWithSlash = await import('./cloudSyncService')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ revision: 1, data: null })))
    vi.stubGlobal('fetch', fetchMock)

    await serviceWithSlash.loadSnapshotFromCloud(async () => snapshot([]), vi.fn())
    expect(fetchMock).toHaveBeenCalledWith('https://api.test/api/snapshot', expect.any(Object))

    vi.resetModules()
    vi.stubEnv('VITE_BEEFCAKE_API_URL', 'https://api.test')
  })
})
