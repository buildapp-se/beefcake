import { useState, useEffect } from 'preact/hooks'
import { useLocation } from 'wouter'
import { createCardioSession, getSession, updateSession } from '../services/dataService'
import { CARDIO_ACTIVITIES } from '../lib/cardio'
import { todayISO } from '../lib/date'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { Field } from '../components/Field'
import { EmptyState } from '../components/EmptyState'

// Utkast av ett nytt cardiopass, så det som skrivits överlever en omladdning. Datumet följer inte
// med: ett gammalt utkast ska inte logga på fel dag.
// ponytail: sessionStorage, dör med fliken; localStorage om utkast ska överleva att appen stängs
// (måste då rensas vid utloggning, anteckningen är kontots).
const DRAFT_KEY = 'beefcake-cardio-draft'
type CardioDraft = { activity: string; minutes: string; km: string; notes: string }

function readDraft(): CardioDraft | null {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null') as CardioDraft | null } catch { return null }
}

function writeDraft(draft: CardioDraft | null): void {
  try {
    if (draft) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    else sessionStorage.removeItem(DRAFT_KEY)
  } catch { /* Utan sessionStorage finns inget utkast, formuläret fungerar som förut */ }
}

/** Logga eller redigera ett cardiopass. `?date=` förväljer datum (kalendern), `?id=` redigerar ett befintligt. */
export function LogCardio() {
  const [, navigate] = useLocation()
  const params = new URLSearchParams(window.location.search)
  const editId = params.get('id')
  const [draft] = useState(() => editId ? null : readDraft())
  const [activity, setActivity] = useState(draft?.activity ?? 'Promenad')
  const [date, setDate] = useState(params.get('date') || todayISO())
  const [minutes, setMinutes] = useState(draft?.minutes ?? '30')
  const [km, setKm] = useState(draft?.km ?? '')
  const [notes, setNotes] = useState(draft?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!editId) return
    // Raderat pass (bakåt efter Radera) eller ett styrkepass: Spara skulle misslyckas eller göra om det till cardio
    getSession(editId).then(s => {
      if (!s?.cardio) { setNotFound(true); return }
      setActivity(s.templateName)
      setDate(s.date)
      setMinutes(String(s.cardio.minutes))
      setKm(s.cardio.km ? s.cardio.km.toLocaleString('sv-SE') : '')
      setNotes(s.cardio.notes || '')
    })
  }, [editId])

  useEffect(() => {
    if (!editId) writeDraft({ activity, minutes, km, notes })
  }, [editId, activity, minutes, km, notes])

  // Decimalkomma i km-fältet: "3,2" ska bli 3.2, inte NaN
  const minutesValue = Number(minutes)
  const kmValue = km.trim() ? Number(km.replace(',', '.')) : undefined
  const valid = activity.trim() !== '' && Number.isFinite(minutesValue) && minutesValue > 0 && (kmValue === undefined || (Number.isFinite(kmValue) && kmValue >= 0))

  async function handleSave(e: Event) {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    setError(null)
    const cardio = { minutes: minutesValue, ...(kmValue ? { km: kmValue } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}) }
    try {
      const session = editId
        ? await updateSession(editId, { date, templateName: activity.trim(), cardio })
        : await createCardioSession(date, activity.trim(), cardio)
      if (!editId) writeDraft(null)
      navigate(`/history/${session.id}`)
    } catch (err) {
      console.error('Kunde inte spara cardiopass:', err)
      setError('Kunde inte spara passet. Försök igen.')
      setSaving(false)
    }
  }

  if (notFound) {
    return (
      <div>
        <h1 class="page-title">Redigera cardio</h1>
        <EmptyState title="Cardiopasset hittades inte" action={<Button href="/history">Tillbaka till historik</Button>} />
      </div>
    )
  }

  return (
    <div>
      <h1 class="page-title">{editId ? 'Redigera cardio' : 'Logga cardio'}</h1>
      <Card>
        <form onSubmit={handleSave}>
          <datalist id="cardio-activities">
            {CARDIO_ACTIVITIES.map(a => <option key={a} value={a} />)}
          </datalist>
          <Field label="Aktivitet" class="mb">
            <input type="text" list="cardio-activities" value={activity} onInput={e => setActivity((e.target as HTMLInputElement).value)} />
          </Field>
          <Field label="Datum" class="mb">
            <input type="date" value={date} onInput={e => setDate((e.target as HTMLInputElement).value)} />
          </Field>
          <div class="grid grid-2 gap-sm mb">
            <Field label="Minuter" class="m-0">
              <input type="number" min="1" inputMode="numeric" value={minutes} onInput={e => setMinutes((e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="Kilometer (valfritt)" class="m-0">
              <input type="text" inputMode="decimal" placeholder="t.ex. 3,5" value={km} onInput={e => setKm((e.target as HTMLInputElement).value)} />
            </Field>
          </div>
          <Field label="Anteckning (valfritt)" class="mb">
            <input type="text" value={notes} onInput={e => setNotes((e.target as HTMLInputElement).value)} />
          </Field>
          {error && <p class="field-error">{error}</p>}
          <div class="flex gap-sm justify-end">
            <Button variant="secondary" onClick={() => { if (!editId) writeDraft(null); history.back() }}>Avbryt</Button>
            <Button type="submit" disabled={!valid || saving}>{saving ? 'Sparar…' : 'Spara'}</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
