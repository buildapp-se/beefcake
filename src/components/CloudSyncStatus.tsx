import { useEffect, useState } from 'preact/hooks'
import { getCloudSyncError, subscribeToCloudSyncError } from '../services/cloudSyncService'
import { saveBackupToFile } from '../services/backupService'
import { Button } from './Button'

async function saveThenReload(): Promise<void> {
  const result = await saveBackupToFile()
  if (result.success) window.location.reload()
}

export function CloudSyncStatus() {
  const [error, setError] = useState(getCloudSyncError())

  useEffect(() => subscribeToCloudSyncError(setError), [])

  if (!error) return null

  return (
    <div class="sync-error" role="alert">
      <span>
        <strong>Molnsynk misslyckades.</strong> {error}
      </span>
      {/* Omladdningen ersätter det lokala med D1:s snapshot, så det lokala sparas
          som fil först: en revisionskonflikt får inte kasta pass (OWASP 2026-09-16, A04).
          Sparningen kan avbrytas i filväljaren, då laddas sidan inte om. */}
      <Button size="sm" onClick={() => void saveThenReload()}>Spara lokal kopia och ladda om</Button>
    </div>
  )
}
