import { getDB } from '../models'
import { getCurrentUid, getIdToken } from './authService'
import {
  selectAuthoritativeSnapshot,
  type SnapshotData
} from '../lib/snapshot'

export type { SnapshotData } from '../lib/snapshot'

interface ServerSnapshot {
  revision: number
  data: SnapshotData | null
}

const REVISION_SETTING_KEY = 'server-revision'
/** Vilket konto den lokala datan hör till. Sätts när D1 lästs in, kontrolleras före varje uppladdning. */
const OWNER_SETTING_KEY = 'owner-uid'
/** Inställningarna som töms vid utloggning, tillsammans med passen (OWASP 2026-09-16, A01). */
export const CLOUD_SETTING_KEYS = [REVISION_SETTING_KEY, OWNER_SETTING_KEY] as const
const apiUrl = typeof import.meta.env.VITE_BEEFCAKE_API_URL === 'string'
  ? import.meta.env.VITE_BEEFCAKE_API_URL.replace(/\/$/, '')
  : ''
let syncQueue: Promise<void> = Promise.resolve()
let syncError: string | null = null
const syncErrorListeners = new Set<(error: string | null) => void>()

export function isCloudSyncConfigured(): boolean {
  return apiUrl.length > 0
}

async function getKnownRevision(): Promise<number> {
  const db = await getDB()
  const setting = await db.get('settings', REVISION_SETTING_KEY)
  const value = setting?.value
  return typeof value === 'number' ? value : 0
}

async function setKnownRevision(revision: number): Promise<void> {
  const db = await getDB()
  await db.put('settings', { key: REVISION_SETTING_KEY, value: revision })
}

async function getKnownOwner(): Promise<string | null> {
  const db = await getDB()
  const value = (await db.get('settings', OWNER_SETTING_KEY))?.value
  return typeof value === 'string' ? value : null
}

async function setKnownOwner(uid: string | null): Promise<void> {
  const db = await getDB()
  await db.put('settings', { key: OWNER_SETTING_KEY, value: uid })
}

function setSyncError(error: string | null): void {
  syncError = error
  for (const listener of syncErrorListeners) listener(error)
}

export function getCloudSyncError(): string | null {
  return syncError
}

export function subscribeToCloudSyncError(listener: (error: string | null) => void): () => void {
  syncErrorListeners.add(listener)
  return () => {
    syncErrorListeners.delete(listener)
  }
}

/** Firebase ID-token i varje anrop. Workern verifierar den och läser e-postadressen ur den. */
async function authHeaders(): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${await getIdToken()}` }
}

async function getServerSnapshot(): Promise<ServerSnapshot> {
  const response = await fetch(`${apiUrl}/api/snapshot`, { headers: await authHeaders() })
  if (!response.ok) throw new Error(`Servern kunde inte läsas (${response.status}).`)
  return response.json() as Promise<ServerSnapshot>
}

export async function syncSnapshot(snapshot: SnapshotData): Promise<void> {
  const next = syncQueue.then(() => syncSnapshotNow(snapshot))
  syncQueue = next.catch(() => undefined)
  return next
}

export async function loadSnapshotFromCloud(
  local: SnapshotData,
  replaceLocalSnapshot: (snapshot: SnapshotData) => Promise<void>
): Promise<SnapshotData> {
  if (!isCloudSyncConfigured()) return local

  try {
    const server = await getServerSnapshot()
    const snapshot = selectAuthoritativeSnapshot(server.data)
    await replaceLocalSnapshot(snapshot)
    await setKnownRevision(server.revision)
    await setKnownOwner(await getCurrentUid())
    setSyncError(null)
    return snapshot
  } catch (error) {
    const message = syncErrorMessage(error, 'D1 kunde inte läsas.')
    setSyncError(message)
    throw new Error(message, { cause: error })
  }
}

async function syncSnapshotNow(snapshot: SnapshotData): Promise<void> {
  if (!isCloudSyncConfigured()) return

  try {
    // Kontobyte utan att D1 hunnit läsas in: det lokala hör till ett annat konto och
    // får inte laddas upp under det här. Utan märke (ny enhet) räcker revisionsspärren.
    const owner = await getKnownOwner()
    if (owner !== null && owner !== (await getCurrentUid())) {
      throw new Error('Datan på enheten hör till ett annat konto. Ladda om sidan.')
    }
    const knownRevision = await getKnownRevision()
    const server = await getServerSnapshot()
    const data = snapshot
    let expectedRevision = knownRevision

    if (server.revision === 0 && server.data === null) {
      expectedRevision = 0
    } else if (knownRevision === 0 && server.data) {
      throw new Error('Serverdata finns men den lokala revisionen saknas. Ladda om sidan innan du sparar.')
    } else if (server.revision !== knownRevision) {
      throw new Error(`Serverkonflikt: lokal revision ${knownRevision}, serverrevision ${server.revision}.`)
    }

    if (server.data && JSON.stringify(data) === JSON.stringify(server.data)) {
      await setKnownRevision(server.revision)
      setSyncError(null)
      return
    }

    const response = await fetch(`${apiUrl}/api/snapshot`, {
      method: 'POST',
      headers: { ...await authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision, data })
    })
    if (!response.ok) {
      if (response.status === 409) throw new Error('Servern har ändrats. Ingen lokal data skrevs över.')
      throw new Error(`Servern kunde inte spara (${response.status}).`)
    }

    const result = await response.json() as { revision: number }
    await setKnownRevision(result.revision)
    setSyncError(null)
  } catch (error) {
    const message = syncErrorMessage(error, 'D1 kunde inte spara snapshoten.')
    setSyncError(message)
    throw new Error(message, { cause: error })
  }
}

/** Latmask-mejlet, valfritt per konto. Bor i D1, inte i snapshoten: det är ingen träningsdata. */
export async function getReminderEnabled(): Promise<boolean> {
  const response = await fetch(`${apiUrl}/api/reminders`, { headers: await authHeaders() })
  if (!response.ok) throw new Error(`Inställningen kunde inte läsas (${response.status}).`)
  return ((await response.json()) as { enabled: boolean }).enabled
}

export async function setReminderEnabled(enabled: boolean): Promise<void> {
  const response = await fetch(`${apiUrl}/api/reminders`, {
    method: 'PUT',
    headers: { ...await authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled })
  })
  if (!response.ok) throw new Error(`Inställningen kunde inte sparas (${response.status}).`)
}

function syncErrorMessage(error: unknown, fallback: string): string {
  const detail = error instanceof Error && error.message ? error.message : fallback
  return `${detail} Ändringarna finns kvar på denna enhet men är inte sparade i D1.`
}
