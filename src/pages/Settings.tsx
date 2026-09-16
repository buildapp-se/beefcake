import { useState, useEffect, useRef } from 'preact/hooks'
import { getAllTemplates, exportAllData, importAllData, exportSessionsCSV, clearAllData, getBodyWeights, saveBodyWeight, deleteBodyWeight, signOutAndClear } from '../services/dataService'
import { formatDateTime, formatDateWithWeekday, todayISO } from '../lib/date'
import { formatWeight, parseDecimal } from '../lib/format'
import { findLastBackupAt, saveBackupToFile } from '../services/backupService'
import { icon } from '../icons'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { useAuthUser } from '../components/LoginGate'
import { getReminderEnabled, setReminderEnabled } from '../services/cloudSyncService'
import {
  DEFAULT_REST_TIMER_ALARM_DURATION,
  loadRestTimerAlarmDuration,
  REST_TIMER_ALARM_DURATION_CHANGED_EVENT,
  saveRestTimerAlarmDuration,
  type RestTimerAlarmDuration
} from '../services/timerService'
import { EmptyState } from '../components/EmptyState'
import { Field } from '../components/Field'
import type { Template, BodyWeight } from '../models'

/** Kroppsvikt: "82,5" eller "82.5" till tal med en decimal, 0 eller ogiltigt ger null. */
function parseKg(text: string): number | null {
  const n = parseDecimal(text)
  if (n === null) return null
  const kg = Math.round(n * 10) / 10
  return kg > 0 ? kg : null
}

function parseAlarmSeconds(text: string): number | null {
  if (!/^\d+$/.test(text)) return null
  const seconds = Number.parseInt(text, 10)
  return seconds >= 1 && seconds <= 3600 ? seconds : null
}

// Toast component
function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div class="toast" onClick={onDismiss}>
      {message}
    </div>
  )
}

// Delete confirmation dialog
function DeleteDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message
}: {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
}) {
  if (!isOpen) return null

  return (
    <div class="dialog-overlay" onClick={onClose}>
      <div class="dialog" onClick={e => e.stopPropagation()}>
        <div class="flex justify-between items-center mb">
          <h3 class="m-0">{title}</h3>
          <button class="banner-dismiss" onClick={onClose} aria-label="Stäng">
            <svg width="16" height="16" viewBox="0 0 19 19"><use href={icon('x-icon')} /></svg>
          </button>
        </div>
        <p>{message}</p>
        <div class="flex gap mt justify-end">
          <Button variant="secondary" onClick={onClose}>Avbryt</Button>
          <Button variant="danger" onClick={onConfirm}>Radera</Button>
        </div>
      </div>
    </div>
  )
}

export function Settings() {
  const [importing, setImporting] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [clearConfirmText, setClearConfirmText] = useState('')
  // Kroppsvikt: datum förvalt i dag, kilo som text så decimalkomma fungerar i alla tangentbord
  const [bodyWeights, setBodyWeights] = useState<BodyWeight[]>([])
  const [bwDate, setBwDate] = useState(() => todayISO())
  const [bwKg, setBwKg] = useState('')
  const bwKgRef = useRef<HTMLInputElement>(null)
  const authUser = useAuthUser()
  // Latmask-mejlet: null tills servern svarat
  const [reminders, setReminders] = useState<boolean | null>(null)
  const [alarmDuration, setAlarmDuration] = useState<RestTimerAlarmDuration>(DEFAULT_REST_TIMER_ALARM_DURATION)
  const [alarmSeconds, setAlarmSeconds] = useState(String(DEFAULT_REST_TIMER_ALARM_DURATION))
  const [alarmSaving, setAlarmSaving] = useState(false)

  useEffect(() => {
    if (!authUser) return
    getReminderEnabled().then(setReminders).catch(err => {
      console.error('Fel vid läsning av påminnelsen:', err)
      setError('Kunde inte läsa inställningen för mejl. Försök igen.')
    })
  }, [authUser])

  async function handleReminders(enabled: boolean) {
    setReminders(enabled)
    try {
      await setReminderEnabled(enabled)
      setToastMessage(enabled ? 'Latmask-mejlet är på' : 'Latmask-mejlet är av')
    } catch (err) {
      console.error('Fel vid sparande av påminnelsen:', err)
      setReminders(!enabled)
      setError('Kunde inte spara inställningen för mejl. Försök igen.')
    }
  }

  async function loadData() {
    try {
      setLoading(true)
      setError(null)
      const [ts, bws, backupAt, savedAlarmDuration] = await Promise.all([
        getAllTemplates(),
        getBodyWeights(),
        findLastBackupAt(),
        loadRestTimerAlarmDuration()
      ])
      setTemplates(ts)
      setBodyWeights(bws)
      setLastBackupAt(backupAt)
      setAlarmDuration(savedAlarmDuration)
      if (savedAlarmDuration !== null) setAlarmSeconds(String(savedAlarmDuration))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Okänt fel')
      console.error('Fel vid laddning av inställningar:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  async function handleSaveAlarmDuration() {
    const seconds = parseAlarmSeconds(alarmSeconds)
    if (seconds === null) return
    try {
      setAlarmSaving(true)
      await saveRestTimerAlarmDuration(seconds)
      setAlarmDuration(seconds)
      window.dispatchEvent(new CustomEvent<RestTimerAlarmDuration>(REST_TIMER_ALARM_DURATION_CHANGED_EVENT, { detail: seconds }))
      setToastMessage(`Alarmet ljuder i ${seconds} sekunder`)
    } catch (err) {
      console.error('Fel vid sparande av alarmtid:', err)
      setError('Kunde inte spara alarmtiden. Försök igen.')
    } finally {
      setAlarmSaving(false)
    }
  }

  async function handleAlarmUntilStopped(enabled: boolean) {
    const nextDuration = enabled
      ? null
      : (parseAlarmSeconds(alarmSeconds) ?? DEFAULT_REST_TIMER_ALARM_DURATION)
    try {
      setAlarmSaving(true)
      await saveRestTimerAlarmDuration(nextDuration)
      setAlarmDuration(nextDuration)
      window.dispatchEvent(new CustomEvent<RestTimerAlarmDuration>(REST_TIMER_ALARM_DURATION_CHANGED_EVENT, { detail: nextDuration }))
      if (nextDuration !== null) setAlarmSeconds(String(nextDuration))
      setToastMessage(enabled ? 'Alarmet ljuder tills du tystar det' : `Alarmet ljuder i ${nextDuration} sekunder`)
    } catch (err) {
      console.error('Fel vid sparande av alarmtid:', err)
      setError('Kunde inte spara alarmtiden. Försök igen.')
    } finally {
      setAlarmSaving(false)
    }
  }

  async function handleSaveBodyWeight() {
    const kg = parseKg(bwKg)
    if (!kg || !/^\d{4}-\d{2}-\d{2}$/.test(bwDate)) return
    try {
      await saveBodyWeight(bwDate, kg)
      setBodyWeights(await getBodyWeights())
      setBwKg('')
      bwKgRef.current?.focus() // nästa värde utan att leta upp fältet igen
      setToastMessage('Kroppsvikt sparad')
    } catch (err) {
      console.error('Fel vid sparande av kroppsvikt:', err)
      setError('Kunde inte spara kroppsvikten. Försök igen.')
    }
  }

  // Egen kroppsviktsdata, ett värde: ingen bekräftelsedialog
  async function handleDeleteBodyWeight(date: string) {
    try {
      await deleteBodyWeight(date)
      setBodyWeights(await getBodyWeights())
    } catch (err) {
      console.error('Fel vid borttagning av kroppsvikt:', err)
      setError('Kunde inte ta bort kroppsvikten. Försök igen.')
    }
  }

  async function handleExportJSON() {
    try {
      const json = await exportAllData()
      downloadFile(json, 'beefcake-backup.json', 'application/json')
    } catch (err) {
      console.error('Fel vid export:', err)
      setError('Kunde inte exportera data. Försök igen.')
    }
  }

  async function handleExportCSV() {
    try {
      const csv = await exportSessionsCSV()
      downloadFile(csv, 'beefcake-sessions.csv', 'text/csv')
    } catch (err) {
      console.error('Fel vid export:', err)
      setError('Kunde inte exportera data. Försök igen.')
    }
  }

  async function handleBackup() {
    try {
      const result = await saveBackupToFile()
      if (!result.success) throw new Error(result.error ?? 'Okänt fel')
      setLastBackupAt(await findLastBackupAt())
      setToastMessage('Manuell backup sparad')
    } catch (err) {
      console.error('Fel vid backup:', err)
      setError('Kunde inte spara backup. Försök igen.')
    }
  }

  function downloadFile(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleFileImport(e: Event) {
    const target = e.target as HTMLInputElement
    const file = target.files?.[0]
    if (file) {
      setImportFile(file)
      setImportDialogOpen(true)
    }
  }

  function dismissImportDialog() {
    setImportDialogOpen(false)
    setImportFile(null)
  }

  async function confirmImport() {
    if (!importFile) return
    setImportDialogOpen(false)
    setImporting(true)
    try {
      const text = await importFile.text()
      await importAllData(text)
      setToastMessage('Import klart! Laddar om sidan...')
      setTimeout(() => {
        window.location.reload()
      }, 500)
    } catch (err) {
      console.error(err)
      setToastMessage('Import misslyckades')
    } finally {
      setImporting(false)
      setImportFile(null)
    }
  }

  function dismissClearDialog() {
    setClearDialogOpen(false)
    setClearConfirmText('')
  }

  async function confirmClearAll() {
    if (clearConfirmText !== 'RADERA') {
      setToastMessage('Bekräftelse misslyckades')
      dismissClearDialog()
      return
    }
    setClearDialogOpen(false)
    setClearConfirmText('')
    await clearAllData()
    setToastMessage('All data raderad. Laddar om...')
    setTimeout(() => {
      window.location.reload()
    }, 500)
  }

  function handleClearAll() {
    setClearDialogOpen(true)
  }

  function handleClearConfirmChange(e: Event) {
    const target = e.target as HTMLInputElement
    setClearConfirmText(target.value)
  }

  function dismissError() {
    setError(null)
    loadData()
  }

  function dismissToast() {
    setToastMessage(null)
  }

  if (loading) {
    return (
      <div>
        <h1 class="page-title">Inställningar</h1>
        <Card class="skeleton skeleton-card"></Card>
        <Card class="skeleton skeleton-card"></Card>
        <Card class="skeleton skeleton-card"></Card>
        {toastMessage && <Toast message={toastMessage} onDismiss={dismissToast} />}
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <h1 class="page-title">Inställningar</h1>
        <EmptyState
          title="Något gick fel"
          message={error}
          action={<Button onClick={dismissError}>Försök igen</Button>}
        />
        {toastMessage && <Toast message={toastMessage} onDismiss={dismissToast} />}
      </div>
    )
  }

  return (
    <div>
      <h1 class="page-title">Inställningar</h1>

      {templates.length === 0 ? (
        <Card class="mb">
          <EmptyState
            title="Inga program ännu"
            message="Skapa ditt första program för att komma igång."
            action={<Button href="/templates">Skapa program</Button>}
          />
        </Card>
      ) : null}

      <Card title="Kroppsvikt">
        <form class="flex gap-sm items-end flex-wrap" onSubmit={e => { e.preventDefault(); void handleSaveBodyWeight() }}>
          <Field label="Datum" class="m-0">
            <input type="date" value={bwDate} max={todayISO()} onChange={(e: Event) => setBwDate((e.target as HTMLInputElement).value)} />
          </Field>
          <Field label="Kg" class="m-0">
            <input
              type="text"
              inputMode="decimal"
              class="input-short"
              ref={bwKgRef}
              value={bwKg}
              placeholder="82,5"
              aria-label="Kroppsvikt i kilo"
              onInput={(e: Event) => setBwKg((e.target as HTMLInputElement).value)}
            />
          </Field>
          <Button type="submit" disabled={parseKg(bwKg) === null}>Spara</Button>
        </form>
        {bodyWeights.length > 0 && (
          <div class="table-wrap mt">
            <table>
              <tbody>
                {bodyWeights.slice(0, 10).map(b => (
                  <tr key={b.date}>
                    <td>{formatDateWithWeekday(b.date)}</td>
                    <td class="tabular-nums font-600">{formatWeight(b.kg)} kg</td>
                    <td class="remove-cell">
                      <button type="button" class="btn-remove" onClick={() => handleDeleteBodyWeight(b.date)} aria-label={`Ta bort kroppsvikt ${b.date}`}>
                        <svg width="20" height="20" viewBox="0 0 19 19"><use href={icon('trash-icon')} /></svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p class="text-xs text-muted m-0 mt-sm">Ett värde per dag, samma datum skriver över. De tio senaste visas här, kurvan finns i Statistik.</p>
      </Card>

      <Card title="Vilotimer">
        <label class="toggle-row mb">
          <input
            type="checkbox"
            checked={alarmDuration === null}
            disabled={alarmSaving}
            onChange={(e: Event) => void handleAlarmUntilStopped((e.target as HTMLInputElement).checked)}
          />
          <span>Låt alarmet fortsätta tills jag trycker på Tysta ljudet.</span>
        </label>
        <form class="flex gap-sm items-end flex-wrap" onSubmit={e => { e.preventDefault(); void handleSaveAlarmDuration() }}>
          <Field label="Annars tystnar alarmet efter" class="m-0">
            <div class="flex gap-sm items-center">
              <input
                type="number"
                min="1"
                max="3600"
                step="1"
                class="input-short"
                value={alarmSeconds}
                disabled={alarmDuration === null || alarmSaving}
                onInput={(e: Event) => setAlarmSeconds((e.target as HTMLInputElement).value)}
                aria-label="Alarmtid i sekunder"
              />
              <span>sekunder</span>
            </div>
          </Field>
          <Button type="submit" disabled={alarmDuration === null || alarmSaving || parseAlarmSeconds(alarmSeconds) === null}>Spara</Button>
        </form>
        <p class="text-xs text-muted m-0 mt-sm">Inställningen sparas på den här enheten.</p>
      </Card>

      <Card title="Export / Import">
        <div class="flex gap mb">
          <Button variant="secondary" onClick={handleExportJSON}>Export JSON (hela DB)</Button>
          <Button variant="secondary" onClick={handleExportCSV}>Export CSV (passlista)</Button>
        </div>
        <div class="flex gap mb">
          <Button onClick={handleBackup}>Spara manuell backup</Button>
        </div>
        <p class="text-xs text-muted m-0 mt-sm">
          {lastBackupAt ? `Senaste manuella backup: ${formatDateTime(lastBackupAt)}` : 'Ingen manuell backup sparad än'}
        </p>
        <p class="mb text-muted">
          Export och import är en manuell nödräddning. D1 är appens ordinarie lagring.
        </p>
        <Field label="Import JSON" class="m-0">
          <input
            type="file"
            accept=".json"
            onChange={handleFileImport}
            disabled={importing}
          />
        </Field>
      </Card>

      {authUser && (
        <Card title="Konto">
          <p class="mb text-muted">Inloggad som <strong>{authUser.email}</strong>. Passen sparas i D1 under den adressen.</p>
          <label class="toggle-row mb">
            <input
              type="checkbox"
              checked={reminders === true}
              disabled={reminders === null}
              onChange={(e: Event) => void handleReminders((e.target as HTMLInputElement).checked)}
            />
            <span>Mejla mig varje dag jag inte har tränat, från dag fyra. "Nu har du inte tränat på 4 dagar, din latmask."</span>
          </label>
          <Button variant="secondary" onClick={() => void signOutAndClear()}>Logga ut</Button>
        </Card>
      )}

      <Card title="Data">
        <p class="mb text-muted">
          D1 är sanningskällan. IndexedDB är lokal cache och serverkopplingen kräver inloggning.
        </p>
        <Button variant="danger" onClick={handleClearAll}>Radera ALL data</Button>
      </Card>

      <Card title="Om">
        <p>Beefcake, träningslogg för styrketräning</p>
        <p class="text-sm text-muted m-0">
          Byggd med Preact, TypeScript, IndexedDB, Chart.js, Workbox PWA.
        </p>
      </Card>

      {/* Import confirmation dialog */}
      <DeleteDialog
        isOpen={importDialogOpen}
        onClose={dismissImportDialog}
        onConfirm={confirmImport}
        title="Import JSON"
        message="Detta kommer att ersätta ALL data. Är du säker?"
      />

      {/* Clear all data dialog with text confirmation */}
      {clearDialogOpen && (
        <div class="dialog-overlay" onClick={dismissClearDialog}>
          <div class="dialog" onClick={e => e.stopPropagation()}>
            <div class="flex justify-between items-center mb">
              <h3 class="m-0">Radera ALL data</h3>
              <button class="banner-dismiss" onClick={dismissClearDialog} aria-label="Stäng">
                <svg width="16" height="16" viewBox="0 0 19 19"><use href={icon('x-icon')} /></svg>
              </button>
            </div>
            <p>VARNING: Detta raderar ALL data permanent. Är du helt säker?</p>
            <p class="mt">Skriv "RADERA" för att bekräfta:</p>
            <div class="input-group mt">
              <input
                type="text"
                value={clearConfirmText}
                onChange={handleClearConfirmChange}
                placeholder="RADERA"
              />
            </div>
            <div class="flex gap mt justify-end">
              <Button variant="secondary" onClick={dismissClearDialog}>Avbryt</Button>
              <Button variant="danger" onClick={confirmClearAll}>Radera</Button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && <Toast message={toastMessage} onDismiss={dismissToast} />}
    </div>
  )
}
