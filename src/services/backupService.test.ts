import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'

vi.mock('./dataService', () => ({ exportAllData: async () => '{"data":1}' }))

// En riktig FileSystemFileHandle går att lagra i IndexedDB, en attrapp med funktioner inte
// (fake-indexeddb klonar). Inställningarna hålls därför i en Map.
const settings = new Map<string, { key: string; value: unknown }>()
// Storen kontrolleras ändå, annars märks det inte om backupen hamnar i fel store.
const fakeDb = {
  get: async (store: string, key: string) => { expect(store).toBe('settings'); return settings.get(key) },
  put: async (store: string, row: { key: string; value: unknown }) => { expect(store).toBe('settings'); settings.set(row.key, row) },
  clear: async () => { settings.clear() }
}
vi.mock('../models', () => ({ getDB: async () => fakeDb }))

import { findLastBackupAt, saveBackupToFile } from './backupService'
import { getDB } from '../models'

const NOW = new Date('2026-11-24T10:20:30.000Z')

function fakeHandle(permission?: PermissionState) {
  const written: string[] = []
  const close = vi.fn(async () => {})
  const handle = {
    createWritable: vi.fn(async () => ({ write: async (d: string) => { written.push(d) }, close })),
    ...(permission ? { queryPermission: vi.fn(async () => permission) } : {})
  }
  return { handle, written, close }
}

async function storedTarget() {
  return (await (await getDB()).get('settings', 'backup-target'))?.value as { handle: unknown; lastBackupAt: string | null } | undefined
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await (await getDB()).clear('settings')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('findLastBackupAt', () => {
  it('ger null utan sparad backup eller med trasigt värde', async () => {
    expect(await findLastBackupAt()).toBeNull()
    await (await getDB()).put('settings', { key: 'backup-target', value: 'trasig' })
    expect(await findLastBackupAt()).toBeNull()
    await (await getDB()).put('settings', { key: 'backup-target', value: {} })
    expect(await findLastBackupAt()).toBeNull()
    await (await getDB()).put('settings', { key: 'backup-target', value: null })
    expect(await findLastBackupAt()).toBeNull()
  })

  it('läser tiden för senaste backup', async () => {
    await (await getDB()).put('settings', { key: 'backup-target', value: { handle: null, lastBackupAt: '2026-11-01T00:00:00.000Z' } })
    expect(await findLastBackupAt()).toBe('2026-11-01T00:00:00.000Z')
  })
})

describe('saveBackupToFile', () => {
  it('skriver till en sparad fil med skrivrätt utan att fråga', async () => {
    const { handle, written, close } = fakeHandle('granted')
    await (await getDB()).put('settings', { key: 'backup-target', value: { handle, lastBackupAt: null } })
    const picker = vi.fn()
    vi.stubGlobal('window', { showSaveFilePicker: picker })

    expect(await saveBackupToFile()).toEqual({ success: true })
    expect(written).toEqual(['{"data":1}'])
    expect(close).toHaveBeenCalledTimes(1)
    expect(handle.queryPermission).toHaveBeenCalledWith({ mode: 'readwrite' })
    expect(picker).not.toHaveBeenCalled()
    expect(await findLastBackupAt()).toBe(NOW.toISOString())
  })

  it('sparad fil utan queryPermission räknas som skrivbar', async () => {
    const { handle, written } = fakeHandle()
    await (await getDB()).put('settings', { key: 'backup-target', value: { handle, lastBackupAt: null } })
    vi.stubGlobal('window', {})
    expect(await saveBackupToFile()).toEqual({ success: true })
    expect(written).toEqual(['{"data":1}'])
  })

  it('utan skrivrätt till sparad fil frågas efter en ny fil med dagens namn', async () => {
    const old = fakeHandle('prompt')
    await (await getDB()).put('settings', { key: 'backup-target', value: { handle: old.handle, lastBackupAt: null } })
    const fresh = fakeHandle('granted')
    const picker = vi.fn(async () => fresh.handle)
    vi.stubGlobal('window', { showSaveFilePicker: picker })

    expect(await saveBackupToFile()).toEqual({ success: true })
    expect(old.written).toEqual([])
    expect(fresh.written).toEqual(['{"data":1}'])
    expect(picker).toHaveBeenCalledWith({
      suggestedName: 'beefcake-backup-2026-11-24.json',
      types: [{ description: 'JSON-filer', accept: { 'application/json': ['.json'] } }]
    })
    expect(await storedTarget()).toEqual({ handle: fresh.handle, lastBackupAt: NOW.toISOString() })
  })

  it('stänger filen även när skrivningen misslyckas och rapporterar felet', async () => {
    const close = vi.fn(async () => {})
    const handle = { createWritable: async () => ({ write: async () => { throw new Error('Disken full') }, close }) }
    await (await getDB()).put('settings', { key: 'backup-target', value: { handle, lastBackupAt: null } })
    vi.stubGlobal('window', {})
    expect(await saveBackupToFile()).toEqual({ success: false, error: 'Disken full' })
    expect(close).toHaveBeenCalledTimes(1)
    expect(await findLastBackupAt()).toBeNull()
  })

  it('avbruten filväljare ger ett fel, inte en sparning', async () => {
    vi.stubGlobal('window', { showSaveFilePicker: async () => { throw 'avbrutet' } })
    expect(await saveBackupToFile()).toEqual({ success: false, error: 'Okänt fel' })
    expect(await findLastBackupAt()).toBeNull()
  })

  it('stängd filväljare (AbortError) är ett avbrott, inget fel', async () => {
    vi.stubGlobal('window', { showSaveFilePicker: async () => { throw new DOMException('The user aborted a request.', 'AbortError') } })
    expect(await saveBackupToFile()).toEqual({ success: false, cancelled: true })
    expect(await findLastBackupAt()).toBeNull()
  })

  it('filnamnet har det lokala datumet, inte UTC', async () => {
    vi.setSystemTime(new Date(2026, 10, 25, 0, 30))
    const picker = vi.fn(async () => fakeHandle('granted').handle)
    vi.stubGlobal('window', { showSaveFilePicker: picker })
    await saveBackupToFile()
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: 'beefcake-backup-2026-11-25.json' }))
  })

  it('utan filväljare laddas filen ner via en länk', async () => {
    vi.stubGlobal('window', {})
    const a = { href: '', download: '', click: vi.fn() }
    const createElement = vi.fn(() => a)
    vi.stubGlobal('document', { createElement })
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    expect(await saveBackupToFile()).toEqual({ success: true })
    const blob = create.mock.calls[0][0] as Blob
    expect(blob.type).toBe('application/json')
    expect(await blob.text()).toBe('{"data":1}')
    expect(a).toMatchObject({ href: 'blob:x', download: 'beefcake-backup-2026-11-24.json' })
    expect(createElement).toHaveBeenCalledWith('a')
    expect(a.click).toHaveBeenCalledTimes(1)
    expect(revoke).toHaveBeenCalledWith('blob:x')
    expect(await storedTarget()).toEqual({ handle: null, lastBackupAt: NOW.toISOString() })
  })
})
