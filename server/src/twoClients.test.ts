/**
 * Två klienter mot samma D1, deterministiskt och utan nätverk. Klientens riktiga
 * dataService och cloudSyncService kör mot fake-indexeddb, Workerns riktiga
 * handler kör mot en D1-attrapp som bara kan de tre SQL-satserna i index.ts.
 * Testet ligger under server/ så att klientens tsc-projekt inte drar in Worker-typerna.
 */
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import worker from './index'

// Firebase finns inte i testet: klienten skickar en låtsastoken, Workern kör i dev-läge och läser den inte
vi.mock('../../src/services/authService', () => ({ getIdToken: async () => 'test-token' }))

interface Row { owner: string; revision: number; payload: string; created_at: string }

// ponytail: strängmatchning på satserna i index.ts, byt till sqlite om Workern får fler frågor
class FakeD1 {
  rows: Row[] = []
  reminders = new Map<string, { enabled: number; last_sent: string | null }>()
  quota = new Map<string, { day: string; count: number }>()

  prepare(sql: string) {
    const rows = this.rows
    const latest = (owner: string) => rows.filter(r => r.owner === owner).sort((a, b) => b.revision - a.revision)[0]
    // Riktig D1 tillåter first/all/run direkt på satsen, utan bind
    const statement = (args: unknown[]) => ({
        first: async () => {
          const owner = String(args[0])
          if (sql.includes('SELECT revision, payload')) return latest(owner) ?? null
          if (sql.includes('AS revision')) return { revision: latest(owner)?.revision ?? 0 }
          if (sql.includes('SELECT enabled FROM reminders')) return this.reminders.get(owner) ?? null
          if (sql.includes('INSERT INTO write_quota')) {
            const day = String(args[1])
            const q = this.quota.get(owner)
            const count = q && q.day === day ? q.count + 1 : 1
            this.quota.set(owner, { day, count })
            return { count }
          }
          throw new Error(`FakeD1 kan inte: ${sql}`)
        },
        all: async () => {
          if (!sql.includes('FROM reminders WHERE enabled = 1')) throw new Error(`FakeD1 kan inte: ${sql}`)
          return { results: [...this.reminders].filter(([, r]) => r.enabled === 1).map(([owner, r]) => ({ owner, last_sent: r.last_sent })) }
        },
        run: async () => {
          if (sql.includes('INSERT INTO reminders')) {
            const [owner, enabled] = args as [string, number]
            this.reminders.set(owner, { enabled, last_sent: this.reminders.get(owner)?.last_sent ?? null })
            return { meta: { changes: 1 } }
          }
          if (sql.includes('UPDATE reminders SET last_sent')) {
            const [lastSent, owner] = args as [string, string]
            const r = this.reminders.get(owner)
            if (r) r.last_sent = lastSent
            return { meta: { changes: r ? 1 : 0 } }
          }
          if (sql.includes('DELETE FROM snapshots')) {
            const [owner, upTo] = args as [string, number]
            const before = rows.length
            for (let i = rows.length - 1; i >= 0; i--) if (rows[i].owner === owner && rows[i].revision <= upTo) rows.splice(i, 1)
            return { meta: { changes: before - rows.length } }
          }
          if (!sql.includes('INSERT INTO snapshots')) throw new Error(`FakeD1 kan inte: ${sql}`)
          const [owner, revision, payload, createdAt, , expected] = args as [string, number, string, string, string, number]
          if ((latest(owner)?.revision ?? 0) !== expected) return { meta: { changes: 0 } }
          rows.push({ owner, revision, payload, created_at: createdAt })
          return { meta: { changes: 1 } }
        }
    })
    return { bind: (...args: unknown[]) => statement(args), ...statement([]) }
  }

  latestRevision(owner = 'local@beefcake.invalid'): number {
    return this.rows.filter(r => r.owner === owner).sort((a, b) => b.revision - a.revision)[0]?.revision ?? 0
  }

  latestSessionIds(owner = 'local@beefcake.invalid'): string[] {
    const row = this.rows.filter(r => r.owner === owner).sort((a, b) => b.revision - a.revision)[0]
    return row ? (JSON.parse(row.payload) as { sessions: { id: string }[] }).sessions.map(s => s.id) : []
  }
}

const db = new FakeD1()
const env = { DB: db, AUTH_MODE: 'dev', FRONTEND_ORIGINS: '', APP_URL: 'https://buildapp.se/beefcake/', RESEND_API_KEY: 're_test' } as unknown as Parameters<typeof worker.fetch>[1]
const resendCalls: { body: string; auth: string | null }[] = []
const API = 'http://api.test'

type Client = {
  data: typeof import('../../src/services/dataService')
  sync: typeof import('../../src/services/cloudSyncService')
}

/** En klient är en egen IndexedDB plus egna modulinstanser (revision och synkkö bor i modulerna). */
async function newClient(): Promise<Client> {
  globalThis.indexedDB = new IDBFactory()
  vi.resetModules()
  const data = await import('../../src/services/dataService')
  const sync = await import('../../src/services/cloudSyncService')
  return { data, sync }
}

function apiFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  if (url.startsWith('https://api.resend.com/')) {
    // Resend-attrapp: samlar breven, svarar som Resend gör
    resendCalls.push({ body: String(init?.body ?? ''), auth: new Headers(init?.headers).get('authorization') })
    return Promise.resolve(new Response('{"id":"x"}', { status: 200 }))
  }
  const { credentials: _credentials, ...rest } = init ?? {}
  return worker.fetch(new Request(url, rest), env)
}

async function sessionIds(client: Client): Promise<string[]> {
  return (await client.data.getAllSessions()).map(s => s.id)
}

beforeAll(() => {
  vi.stubEnv('VITE_BEEFCAKE_API_URL', API)
  vi.stubGlobal('fetch', apiFetch)
})

describe('två klienter mot D1', () => {
  it('serverradering mot stale cache, revisionskonflikt och fail-closed återhämtning', async () => {
    // Klient A startar mot tom D1: seedens pass blir revision 1
    const a = await newClient()
    await a.data.syncSeed(true)
    expect(db.latestRevision()).toBe(1)
    const seeded = await sessionIds(a)
    expect(seeded.length).toBeGreaterThan(0)

    // Klient B startar: D1 är sanningen, cachen fylls från servern
    const b = await newClient()
    await b.data.syncSeed()
    expect(await sessionIds(b)).toEqual(seeded)
    expect(db.latestRevision()).toBe(1)

    // A skapar ett pass och raderar ett gammalt, två revisioner till
    const created = await a.data.createSession('2026-09-01', 'custom', 'Testpass', [
      { exerciseId: 'x', exerciseName: 'Bänk', setEntries: [{ sets: 1, reps: 5, weight: 100 }] }
    ])
    await a.data.deleteSession(seeded[0])
    expect(db.latestRevision()).toBe(3)
    expect(db.latestSessionIds()).toContain(created.id)
    expect(db.latestSessionIds()).not.toContain(seeded[0])

    // B har fortfarande det raderade passet i cachen: en omstart får inte återuppliva det
    expect(await sessionIds(b)).toContain(seeded[0])
    await b.data.syncSeed()
    expect(await sessionIds(b)).not.toContain(seeded[0])
    expect(await sessionIds(b)).toContain(created.id)
    expect(db.latestRevision()).toBe(3)

    // Revisionskonflikt: A skriver igen, B försöker skriva på gammal revision
    await a.data.createSession('2026-09-02', 'custom', 'Pass från A', [])
    expect(db.latestRevision()).toBe(4)
    await expect(b.data.createSession('2026-09-02', 'custom', 'Pass från B', [])).rejects.toThrow('Serverkonflikt')
    expect(db.latestRevision()).toBe(4)
    expect(db.latestSessionIds()).not.toContain((await b.data.getAllSessions()).find(s => s.templateName === 'Pass från B')?.id)
    expect(b.sync.getCloudSyncError()).toContain('Serverkonflikt')

    // Fail-closed: en klient utan känd revision får inte skriva över serverdata
    const c = await newClient()
    await expect(c.data.createSession('2026-09-03', 'custom', 'Pass från C', [])).rejects.toThrow('lokala revisionen saknas')
    expect(db.latestRevision()).toBe(4)

    // Återhämtning: C läser in servern först, sedan går skrivningen igenom
    await c.data.syncSeed()
    expect((await sessionIds(c)).sort()).toEqual(db.latestSessionIds().sort())
    const fromC = await c.data.createSession('2026-09-03', 'custom', 'Pass från C', [])
    expect(db.latestRevision()).toBe(5)
    expect(db.latestSessionIds()).toContain(fromC.id)
  })

  it('Workern svarar 409 på en förlegad revision', async () => {
    const data = JSON.parse(db.rows[db.rows.length - 1].payload) as unknown
    const response = await apiFetch(`${API}/api/snapshot`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: 0, data })
    })
    expect(response.status).toBe(409)
    expect(db.latestRevision()).toBe(5)
  })
})

describe('kroppsvikt i snapshoten', () => {
  it('Workern tar emot en snapshot utan bodyWeight, en med, och avvisar en trasig', async () => {
    const base = JSON.parse(db.rows[db.rows.length - 1].payload) as Record<string, unknown>
    const post = (data: unknown) => apiFetch(`${API}/api/snapshot`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: db.latestRevision(), data })
    })
    const { bodyWeight: _bodyWeight, ...withoutBodyWeight } = base
    expect((await post(withoutBodyWeight)).status).toBe(201)
    expect((JSON.parse(db.rows[db.rows.length - 1].payload) as { bodyWeight: unknown }).bodyWeight).toEqual([])

    const rows = [{ date: '2026-09-01', kg: 82.5 }]
    expect((await post({ ...base, bodyWeight: rows })).status).toBe(201)
    expect((JSON.parse(db.rows[db.rows.length - 1].payload) as { bodyWeight: unknown }).bodyWeight).toEqual(rows)

    const revision = db.latestRevision()
    expect((await post({ ...base, bodyWeight: [{ date: 'igår', kg: 82.5 }] })).status).toBe(400)
    expect(db.latestRevision()).toBe(revision)
  })

  it('Workern behåller kroppsvikten när en äldre klient skriver utan fältet', async () => {
    // Ny klient sparar två kroppsvikter
    const fresh = await newClient()
    await fresh.data.syncSeed()
    await fresh.data.saveBodyWeight('2026-09-01', 82.5)
    await fresh.data.saveBodyWeight('2026-09-02', 82.1)
    const latestBody = () => (JSON.parse(db.rows[db.rows.length - 1].payload) as { bodyWeight: unknown }).bodyWeight
    expect(latestBody()).toHaveLength(2)

    // Gammal klient (bundeln före kroppsvikten) skriver ett pass: POST utan fältet alls
    const { bodyWeight: _omitted, ...oldClientData } = JSON.parse(db.rows[db.rows.length - 1].payload) as Record<string, unknown>
    const sessions = [...(oldClientData.sessions as unknown[]), {
      id: 'old-client-1', date: '2026-09-02', templateId: 'custom', templateName: 'Från gammal klient', createdAt: '2026-09-02T10:00:00.000Z',
      exercises: [{ exerciseId: 'x', exerciseName: 'Bänk', setEntries: [{ sets: 1, reps: 5, weight: 100 }], order: 0 }]
    }]
    const response = await apiFetch(`${API}/api/snapshot`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: db.latestRevision(), data: { ...oldClientData, sessions } })
    })
    expect(response.status).toBe(201)
    expect(latestBody()).toEqual([{ date: '2026-09-01', kg: 82.5 }, { date: '2026-09-02', kg: 82.1 }])
    expect(db.latestSessionIds()).toContain('old-client-1')

    // Ny klient laddar om: passet från den gamla klienten kom in och båda kroppsvikterna är kvar
    await fresh.data.syncSeed()
    expect(await sessionIds(fresh)).toContain('old-client-1')
    expect((await fresh.data.getBodyWeights()).map(b => b.kg)).toEqual([82.1, 82.5])

    // En ny klient som skickar tom lista har raderat: Workern respekterar det
    const { bodyWeight: _all, ...rest } = JSON.parse(db.rows[db.rows.length - 1].payload) as Record<string, unknown>
    expect((await apiFetch(`${API}/api/snapshot`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: db.latestRevision(), data: { ...rest, bodyWeight: [] } })
    })).status).toBe(201)
    expect(latestBody()).toEqual([])
  })
})

describe('latmask-mejlet', () => {
  it('inställningen sparas per konto och cronen skickar ett brev per dag från dag fyra', async () => {
    const client = await newClient()
    await client.data.syncSeed()
    expect(await client.sync.getReminderEnabled()).toBe(false)
    await client.sync.setReminderEnabled(true)
    expect(await client.sync.getReminderEnabled()).toBe(true)

    // Senaste passet i D1 är 2026-09-03 (från flödet ovan). Tre dagar senare: inget brev.
    const ctx = { waitUntil: (p: Promise<unknown>) => { pending = p }, passThroughOnException: () => {} } as unknown as ExecutionContext
    let pending: Promise<unknown> = Promise.resolve()
    const run = async (iso: string) => {
      await worker.scheduled({ scheduledTime: Date.parse(iso), cron: '0 17 * * *', noRetry: () => {} }, env, ctx)
      await pending
    }
    await run('2026-09-06T17:00:00Z')
    expect(resendCalls).toHaveLength(0)

    // Dag fyra: ett brev med antalet, till kontots adress, från underdomänen
    await run('2026-09-07T17:00:00Z')
    expect(resendCalls).toHaveLength(1)
    const mail = JSON.parse(resendCalls[0].body) as { to: string[]; subject: string; from: string }
    expect(mail.to).toEqual(['local@beefcake.invalid'])
    expect(mail.subject).toBe('Nu har du inte tränat på 4 dagar, din latmask.')
    expect(mail.from).toContain('@beefcake.buildapp.se')
    expect(resendCalls[0].auth).toBe('Bearer re_test')

    // Samma dag igen: inget dubbelbrev. Nästa dag: fem dagar.
    await run('2026-09-07T20:00:00Z')
    expect(resendCalls).toHaveLength(1)
    await run('2026-09-08T17:00:00Z')
    expect(resendCalls).toHaveLength(2)
    expect((JSON.parse(resendCalls[1].body) as { subject: string }).subject).toContain('5 dagar')

    // Avstängt: tyst
    await client.sync.setReminderEnabled(false)
    await run('2026-09-09T17:00:00Z')
    expect(resendCalls).toHaveLength(2)
  })
})

describe('tak per konto (OWASP 2026-09-16)', () => {
  it('sparar högst 20 revisioner och svarar 429 efter dagens 300 skrivningar', async () => {
    const owner = 'local@beefcake.invalid'
    if (db.latestRevision(owner) === 0) {
      const c = await newClient()
      await c.data.syncSeed(true)
    }
    const latest = db.rows.filter(r => r.owner === owner).sort((a, b) => b.revision - a.revision)[0]
    const data = JSON.parse(latest.payload) as unknown
    const post = () => worker.fetch(new Request(`${API}/api/snapshot`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
      body: JSON.stringify({ expectedRevision: db.latestRevision(owner), data })
    }), env)

    for (let i = 0; i < 30; i++) expect((await post()).status).toBe(201)
    expect(db.rows.filter(r => r.owner === owner)).toHaveLength(20)
    expect(db.latestRevision(owner)).toBe(latest.revision + 30)

    db.quota.set(owner, { day: new Date().toISOString().slice(0, 10), count: 300 })
    const blocked = await post()
    expect(blocked.status).toBe(429)
    expect(db.latestRevision(owner)).toBe(latest.revision + 30)
  })
})

describe('cors', () => {
  it('preflighten tillåter PUT, annars stoppar webbläsaren sparandet av inställningen', async () => {
    const response = await worker.fetch(new Request('https://beefcake-api.buildapp.se/api/reminders', { method: 'OPTIONS' }), env)
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('PUT')
  })
})
