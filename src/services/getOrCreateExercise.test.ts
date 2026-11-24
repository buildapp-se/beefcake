import 'fake-indexeddb/auto'
import { describe, it, expect, vi } from 'vitest'

vi.mock('./cloudSyncService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./cloudSyncService')>()),
  syncSnapshot: async () => {},
}))

import { exportAllData, getAllExercises, getOrCreateExercise } from './dataService'
import { validateSnapshot } from '../lib/importValidation'

// 2026-11-24: en tom övningsrad i programredigeraren eller loggvyn skapade en övning med
// tomt namn. validateSnapshot avvisar den, så Workern svarade 400 på varje synk efteråt.
describe('getOrCreateExercise', () => {
  it('vägrar ett tomt namn och lämnar snapshoten giltig', async () => {
    await expect(getOrCreateExercise('')).rejects.toThrow('Övningen saknar namn')
    await expect(getOrCreateExercise('   ')).rejects.toThrow('Övningen saknar namn')
    const snapshot = JSON.parse(await exportAllData())
    expect(() => validateSnapshot(snapshot)).not.toThrow()
  })

  it('trimmar namnet så att "Bänkpress " blir samma övning som "Bänkpress"', async () => {
    const a = await getOrCreateExercise('Bänkpress')
    const b = await getOrCreateExercise('  Bänkpress ')
    expect(b.id).toBe(a.id)
    expect((await getAllExercises()).filter(e => e.name.startsWith('Bänkpress'))).toHaveLength(1)
  })
})
