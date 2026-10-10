import { getDB } from '../models'
import { getCurrentUid, getIdToken } from './authService'
import {
  hasTrainingData,
  mergeGuestIntoAccount,
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
/** Kontomärket för data loggad utan konto: den enda lokala data som får följa med in i ett konto. */
const GUEST_OWNER = 'guest'
const SNAPSHOT_STORES = ['templates', 'exercises', 'sessions', 'exerciseHistory', 'bodyWeight'] as const
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

/**
 * Utan inloggad användare: får appen användas som gäst? Ja om enheten är gästens eller tom
 * (tom märks som gästens). Data som hör till ett konto, med märke eller äldre utan märke,
 * kräver inloggning som förut, så att en utgången session inte visar eller blandar kontots pass.
 */
export async function canBrowseAsGuest(): Promise<boolean> {
  const owner = await getKnownOwner()
  if (owner === GUEST_OWNER) return true
  if (owner !== null) return false
  const db = await getDB()
  const counts = await Promise.all(SNAPSHOT_STORES.map(store => db.count(store)))
  if (counts.some(count => count > 0)) return false
  await setKnownOwner(GUEST_OWNER)
  return true
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

/** Sant när enheten redan bär det här kontots D1-snapshot: appen kan visas innan servern svarat. */
export async function isLocalDataOwnedBy(uid: string): Promise<boolean> {
  return (await getKnownOwner()) === uid
}

/**
 * Läser D1 och ersätter det lokala med serverns snapshot. Svarar sant när det lokala skrevs om.
 * Går i samma kö som sparningarna: appen kan redan vara igång när servern svarar.
 */
export async function loadSnapshotFromCloud(
  readLocal: () => Promise<SnapshotData>,
  replaceLocalSnapshot: (snapshot: SnapshotData) => Promise<void>
): Promise<boolean> {
  const next = syncQueue.then(() => loadSnapshotNow(readLocal, replaceLocalSnapshot))
  syncQueue = next.then(() => undefined, () => undefined)
  return next
}

async function loadSnapshotNow(
  readLocal: () => Promise<SnapshotData>,
  replaceLocalSnapshot: (snapshot: SnapshotData) => Promise<void>
): Promise<boolean> {
  if (!isCloudSyncConfigured()) return false

  try {
    const local = await readLocal()
    const before = JSON.stringify(local)
    const server = await getServerSnapshot()
    const uid = await getCurrentUid()
    const owner = await getKnownOwner()
    // Gästens pass följer med in i kontot, sammanslagna med det som redan finns där
    const guest = owner === GUEST_OWNER && hasTrainingData(local) ? local : null
    const snapshot = guest
      ? mergeGuestIntoAccount(selectAuthoritativeSnapshot(server.data), guest)
      : selectAuthoritativeSnapshot(server.data)
    if (owner !== null && owner === uid) {
      // Vanliga fallet: enheten har redan exakt serverns snapshot, inget att skriva om
      if (server.revision === await getKnownRevision() && before === JSON.stringify(snapshot)) {
        setSyncError(null)
        return false
      }
      // Något sparades medan servern svarade: skriv inte över det. Sparningens egen synk
      // står näst i kön och visar konflikten.
      // ponytail: jämförelsen och omskrivningen är inte en transaktion, några ms glapp kvar.
      if (JSON.stringify(await readLocal()) !== before) return false
    }
    await replaceLocalSnapshot(snapshot)
    await setKnownRevision(server.revision)
    await setKnownOwner(uid)
    setSyncError(null)
    // Misslyckas uppladdningen visar synkbannern felet och nästa sparning försöker igen;
    // passen ligger redan lokalt under kontot.
    if (guest) await syncSnapshotNow(snapshot).catch(() => undefined)
    return true
  } catch (error) {
    const message = syncErrorMessage(error, 'D1 kunde inte läsas.')
    setSyncError(message)
    throw new Error(message, { cause: error })
  }
}

async function syncSnapshotNow(snapshot: SnapshotData): Promise<void> {
  if (!isCloudSyncConfigured()) return

  try {
    // Gäst: allt stannar på enheten tills ett konto loggar in (loadSnapshotFromCloud tar med det)
    const uid = await getCurrentUid()
    if (uid === null) return
    // Kontobyte utan att D1 hunnit läsas in: det lokala hör till ett annat konto och
    // får inte laddas upp under det här. Utan märke (ny enhet) räcker revisionsspärren.
    const owner = await getKnownOwner()
    if (owner !== null && owner !== uid) {
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
