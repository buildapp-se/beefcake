import { getDB } from '../models'
import { todayISO } from '../lib/date'

interface BackupFileHandle {
  createWritable: () => Promise<BackupWritable>
  queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>
}

interface BackupWritable {
  write: (data: string) => Promise<void>
  close: () => Promise<void>
}

interface SaveFilePickerOptions {
  suggestedName?: string
  types?: Array<{
    description: string
    accept: Record<string, string[]>
  }>
}

declare global {
  interface Window {
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<BackupFileHandle>
  }
}

interface BackupTarget {
  handle: BackupFileHandle | null
  lastBackupAt: string | null
}

const BACKUP_SETTING_KEY = 'backup-target'

async function getBackupTarget(): Promise<BackupTarget> {
  const db = await getDB()
  const setting = await db.get('settings', BACKUP_SETTING_KEY)
  const value = setting?.value
  if (!value || typeof value !== 'object') {
    return { handle: null, lastBackupAt: null }
  }

  const stored = value as { handle?: BackupFileHandle | null; lastBackupAt?: string | null }
  return {
    handle: stored.handle ?? null,
    lastBackupAt: stored.lastBackupAt ?? null
  }
}

export async function findLastBackupAt(): Promise<string | null> {
  return (await getBackupTarget()).lastBackupAt
}

async function saveBackupTarget(target: BackupTarget): Promise<void> {
  const db = await getDB()
  await db.put('settings', { key: BACKUP_SETTING_KEY, value: target })
}

async function hasWritePermission(handle: BackupFileHandle): Promise<boolean> {
  if (!handle.queryPermission) return true
  return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted'
}

async function writeBackup(handle: BackupFileHandle, json: string): Promise<void> {
  const writable = await handle.createWritable()
  try {
    await writable.write(json)
  } finally {
    await writable.close()
  }
}

async function writeConfiguredBackup(json: string): Promise<boolean> {
  const target = await getBackupTarget()
  if (!target.handle || !(await hasWritePermission(target.handle))) return false

  await writeBackup(target.handle, json)
  await saveBackupTarget({ ...target, lastBackupAt: new Date().toISOString() })
  return true
}

/** `cancelled`: användaren stängde filväljaren, inget fel att visa. */
export async function saveBackupToFile(): Promise<{ success: boolean; error?: string; cancelled?: true }> {
  try {
    const { exportAllData } = await import('./dataService')
    const json = await exportAllData()
    if (await writeConfiguredBackup(json)) return { success: true }

    // Lokalt datum: toISOString gav gårdagens datum i filnamnet mellan midnatt och 01/02
    const filename = `beefcake-backup-${todayISO()}.json`
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: 'JSON-filer',
          accept: { 'application/json': ['.json'] }
        }]
      })
      const target = { handle, lastBackupAt: null }
      await writeBackup(handle, json)
      await saveBackupTarget({ ...target, lastBackupAt: new Date().toISOString() })
      return { success: true }
    }

    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    await saveBackupTarget({ handle: null, lastBackupAt: new Date().toISOString() })
    return { success: true }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return { success: false, cancelled: true }
    const error = err instanceof Error ? err.message : 'Okänt fel'
    return { success: false, error }
  }
}
