import { useState, useEffect, useCallback } from 'preact/hooks'
import { useLocation, Link } from 'wouter'
import { 
  getSession, 
  getAllExercises, 
  getAllTemplates,
  updateSession, 
  deleteSession,
  getOrCreateExercise,
  createTemplate,
  updateTemplate
} from '../services/dataService'
import { icon } from '../icons'
import { formatDateCompact, formatDateShort } from '../lib/date'
import { formatSets, restoreIfEmpty } from '../lib/format'
import { setsVolume, exercisesVolume } from '../lib/volume'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { Field } from '../components/Field'
import type { Session, Exercise, SessionExercise, SetEntry, Template } from '../models'

interface FormExercise {
  exerciseId: string
  exerciseName: string
  setEntries: SetEntry[]
  notes?: string
}

function calculateExerciseVolume(ex: FormExercise | SessionExercise): number {
  return setsVolume(ex.setEntries)
}

function calculateTotalVolume(exercises: (FormExercise | SessionExercise)[]): number {
  return exercisesVolume(exercises)
}

// Delete confirmation dialog
function DeleteDialog({
  isOpen,
  onClose,
  onConfirm,
  sessionName,
  sessionDate
}: {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  sessionName: string
  sessionDate: string
}) {
  if (!isOpen) return null

  return (
    <div class="dialog-overlay" onClick={onClose}>
      <div class="dialog" onClick={e => e.stopPropagation()}>
        <div class="flex justify-between items-center mb">
          <h3 class="m-0">Radera pass</h3>
          <button class="banner-dismiss" onClick={onClose} aria-label="Stäng">
            <svg width="16" height="16" viewBox="0 0 19 19"><use href={icon('x-icon')} /></svg>
          </button>
        </div>
        <p>
          Är du säker på att du vill radera pass <strong>"{sessionName}"</strong> från {sessionDate}?
          <br />
          Det går inte att ångra.
        </p>
        <div class="flex gap mt justify-end">
          <Button variant="secondary" onClick={onClose}>Avbryt</Button>
          <Button variant="danger" onClick={onConfirm}>Radera</Button>
        </div>
      </div>
    </div>
  )
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

export function SessionDetail() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [allExercises, setAllExercises] = useState<Exercise[]>([])
  const [allTemplates, setAllTemplates] = useState<Template[]>([])
  const [formDate, setFormDate] = useState('')
  const [formTemplateId, setFormTemplateId] = useState('')
  const [formExercises, setFormExercises] = useState<FormExercise[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [, navigate] = useLocation()
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')

  const getSessionId = useCallback((): string | null => {
    const pathParts = window.location.pathname.split('/')
    const idIndex = pathParts.findIndex(p => p === 'history') + 1
    return idIndex > 0 && idIndex < pathParts.length ? pathParts[idIndex] : null
  }, [])

  useEffect(() => {
    async function load() {
      const sessionId = getSessionId()
      if (!sessionId) {
        setNotFound(true)
        setLoading(false)
        return
      }

      try {
        const [sess, es, ts] = await Promise.all([
          getSession(sessionId),
          getAllExercises(),
          getAllTemplates()
        ])
        
        if (!sess) {
          setNotFound(true)
        } else {
          setSession(sess)
          setAllExercises(es)
          setAllTemplates(ts)
          setFormDate(sess.date)
          setFormTemplateId(sess.templateId)
          const formEx: FormExercise[] = sess.exercises.map(e => ({
            exerciseId: e.exerciseId,
            exerciseName: e.exerciseName,
            setEntries: e.setEntries,
            notes: e.notes
          }))
          setFormExercises(formEx)
        }
      } catch (err) {
        console.error('Failed to load session:', err)
        setError('Kunde inte ladda passet. Försök igen.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [getSessionId])

  useEffect(() => {
    if (saved) {
      const timer = setTimeout(() => setSaved(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [saved])

  function dismissToast() {
    setToastMessage(null)
  }

  function handleTemplateChange(e: Event) {
    const target = e.target as HTMLSelectElement
    setFormTemplateId(target.value)
  }

  async function handleSave() {
    if (formExercises.length === 0) return
    setSaving(true)
    
    try {
      const sessionId = getSessionId()
      if (!sessionId || !session) return

      const validExercises = await Promise.all(
        formExercises.map(async (e, i) => {
          let exerciseId = e.exerciseId
          if (!exerciseId || exerciseId.startsWith('new-')) {
            const ex = await getOrCreateExercise(e.exerciseName)
            exerciseId = ex.id
          }
          return {
            exerciseId,
            exerciseName: e.exerciseName,
            setEntries: e.setEntries,
            order: i,
            ...(e.notes ? { notes: e.notes } : {})
          }
        })
      )

      const selectedTemplate = allTemplates.find(t => t.id === formTemplateId)
      const templateName = selectedTemplate?.name || session.templateName
      const templateId = selectedTemplate?.id || session.templateId

      await updateSession(session.id, {
        date: formDate,
        templateId,
        templateName,
        exercises: validExercises
      })
      
      const updatedSession = {
        ...session,
        date: formDate,
        templateId,
        templateName,
        exercises: validExercises
      }
      setSession(updatedSession)
      setFormExercises(validExercises.map(e => ({
        exerciseId: e.exerciseId,
        exerciseName: e.exerciseName,
        setEntries: e.setEntries,
        notes: e.notes
      })))
      setEditing(false)
      setSaved(true)
      setToastMessage(`Pass "${session.templateName}" uppdaterat.`)
    } catch (err) {
      console.error('Failed to save session:', err)
    } finally {
      setSaving(false)
    }
  }

  // Spara ändringar i övningarna till den valda mallen
  async function handleUpdateTemplate() {
    if (!session) return
    const template = allTemplates.find(t => t.id === formTemplateId)
    if (!template) {
      setToastMessage('Programmet finns inte längre, välj ett annat eller spara som nytt.')
      return
    }
    try {
      const templateExercises = await Promise.all(
        formExercises.map(async (e, i) => {
          let exerciseId = e.exerciseId
          if (!exerciseId || exerciseId.startsWith('new-')) {
            const ex = await getOrCreateExercise(e.exerciseName)
            exerciseId = ex.id
          }
          return {
            exerciseId,
            defaultSetEntry: e.setEntries[0] || { sets: 3, reps: 10, weight: 0 },
            order: i
          }
        })
      )
      await updateTemplate(template.id, { exercises: templateExercises })
      setToastMessage(`Programmet "${template.name}" uppdaterat med nuvarande övningar.`)
    } catch (err) {
      console.error('Failed to update template:', err)
      setToastMessage('Kunde inte uppdatera programmet.')
    }
  }

  // Spara nuvarande övningar som en ny mall
  async function handleSaveAsNewTemplate() {
    if (!session || !newTemplateName.trim()) return
    try {
      const templateExercises = await Promise.all(
        formExercises.map(async e => {
          let exerciseId = e.exerciseId
          if (!exerciseId || exerciseId.startsWith('new-')) {
            const ex = await getOrCreateExercise(e.exerciseName)
            exerciseId = ex.id
          }
          return {
            exerciseId,
            defaultSetEntry: e.setEntries[0] || { sets: 3, reps: 10, weight: 0 }
          }
        })
      )
      const newTemplate = await createTemplate(newTemplateName.trim(), templateExercises)
      setAllTemplates(prev => [...prev, newTemplate].sort((a, b) => a.name.localeCompare(b.name)))
      setFormTemplateId(newTemplate.id)
      setShowSaveTemplate(false)
      setNewTemplateName('')
      setToastMessage(`Programmet "${newTemplate.name}" skapat.`)
    } catch (err) {
      console.error('Failed to create template:', err)
      setToastMessage('Kunde inte skapa programmet.')
    }
  }

  async function handleDelete() {
    const sessionId = getSessionId()
    if (!sessionId || !session) return
    
    setDeleteDialogOpen(false)
    setLoading(true)
    
    try {
      await deleteSession(sessionId)
      setToastMessage(`Pass "${session.templateName}" (${session.date}) raderat.`)
      setTimeout(() => {
        navigate('/history')
      }, 500)
    } catch (err) {
      console.error('Failed to delete session:', err)
      setLoading(false)
    }
  }

  function handleRunAgain() {
    if (!session) return
    navigate(`/log?from=${session.id}`)
  }

  function toggleEdit() {
    setEditing(!editing)
    if (!editing) {
      setSaved(false)
      if (session) {
        setFormDate(session.date)
        setFormTemplateId(session.templateId)
        setFormExercises(session.exercises.map(e => ({
          exerciseId: e.exerciseId,
          exerciseName: e.exerciseName,
          setEntries: e.setEntries,
          notes: e.notes
        })))
      }
    }
  }

  function cancelEdit() {
    setEditing(false)
    if (session) {
      setFormDate(session.date)
      setFormTemplateId(session.templateId)
      setFormExercises(session.exercises.map(e => ({
        exerciseId: e.exerciseId,
        exerciseName: e.exerciseName,
        setEntries: e.setEntries,
        notes: e.notes
      })))
    }
  }

  // Form handlers
  function updateExercise(idx: number, field: keyof FormExercise, value: string | number | SetEntry[]) {
    const newExercises = [...formExercises]
    newExercises[idx] = { ...newExercises[idx], [field]: value }
    setFormExercises(newExercises)
  }

  function addExercise() {
    setFormExercises([...formExercises, {
      exerciseId: `new-${Date.now()}`,
      exerciseName: '',
      setEntries: [{ sets: 3, reps: 10, weight: 0 }]
    }])
  }

  function addSetToExercise(exerciseIdx: number) {
    const newExercises = [...formExercises]
    newExercises[exerciseIdx] = {
      ...newExercises[exerciseIdx],
      setEntries: [...newExercises[exerciseIdx].setEntries, { sets: 1, reps: 10, weight: 0 }]
    }
    setFormExercises(newExercises)
  }

  function removeSetFromExercise(exerciseIdx: number, setIdx: number) {
    const newExercises = [...formExercises]
    if (newExercises[exerciseIdx].setEntries.length > 1) {
      newExercises[exerciseIdx] = {
        ...newExercises[exerciseIdx],
        setEntries: newExercises[exerciseIdx].setEntries.filter((_, i) => i !== setIdx)
      }
      setFormExercises(newExercises)
    }
  }

  function removeExercise(idx: number) {
    const newExercises = formExercises.filter((_, i) => i !== idx)
    setFormExercises(newExercises)
  }

  function handleInputChange(e: Event, idx: number, field: keyof FormExercise, setIdx?: number, nestedField?: keyof SetEntry) {
    const target = e.target as HTMLInputElement
    // Ett tömt sifferfält sparas inte: annars skrevs 0 in direkt och 7 blev "07". restoreIfEmpty sätter tillbaka värdet.
    if (target.type === 'number' && target.value === '') return
    const value = target.type === 'number' ? (parseFloat(target.value) || 0) : target.value

    if (field === 'setEntries' && setIdx !== undefined && nestedField) {
      const exercise = formExercises[idx]
      const newSetEntries = [...exercise.setEntries]
      newSetEntries[setIdx] = { ...newSetEntries[setIdx], [nestedField]: value }
      updateExercise(idx, 'setEntries', newSetEntries)
    } else {
      updateExercise(idx, field, value)
    }
  }

  function handleDateChange(e: Event) {
    const target = e.target as HTMLInputElement
    setFormDate(target.value)
  }

  // Render loading state
  if (loading) {
    return (
      <div>
        <h1 class="page-title">Passdetaljer</h1>
        <Card class="skeleton skeleton-card"></Card>
      </div>
    )
  }

  // Render error state
  if (error) {
    return (
      <div>
        <h1 class="page-title">Passdetaljer</h1>
        <EmptyState
          title="Fel vid laddning"
          message={error}
          action={<Button onClick={() => window.location.reload()}>Försök igen</Button>}
        />
      </div>
    )
  }

  // Render not found state
  if (notFound || !session) {
    return (
      <div>
        <h1 class="page-title">Passdetaljer</h1>
        <EmptyState
          title="Passet hittades inte"
          action={<Button href="/history">Tillbaka till historik</Button>}
        />
      </div>
    )
  }

  // Render empty state
  if (session.exercises.length === 0) {
    return (
      <div>
        <h1 class="page-title">Passdetaljer</h1>
        <EmptyState
          title="Passet har inga övningar"
          action={<Button href="/history">Tillbaka till historik</Button>}
        />
      </div>
    )
  }

  // Render read mode (default)
  if (!editing) {
    return (
      <div>
        <Button href="/history" variant="secondary" size="sm">‹ Historik</Button>
        <h1 class="page-title">Passdetaljer</h1>

        <Card>
          <div class="flex justify-between items-center mb session-detail-head">
            <div>
              <h2 class="mb-1">{session.templateName}</h2>
              <p class="m-0 text-muted">{formatDateCompact(session.date)}</p>
            </div>
            <div class="flex gap-sm flex-wrap session-detail-actions">
              <Button size="sm" onClick={handleRunAgain}>Kör igen</Button>
              <Button variant="secondary" size="sm" onClick={toggleEdit}>Redigera</Button>
            </div>
          </div>
        </Card>

        <Card>
          <h3 class="mb-sm">Övningar</h3>
          {/* Telefon: ett kort per övning, samma mönster som Historik. Tabellen gömdes
              under 767 px utan ersättare, så kortet "Övningar" var tomt på mobilen. */}
          <div class="history-list-cards">
            {session.exercises.map((ex, idx) => (
              <div key={idx} class="history-card session-detail-card">
                <div class="history-card-header">
                  <span class="history-card-date">
                    {ex.exerciseId
                      ? <Link href={`/exercises/${ex.exerciseId}`} class="exercise-link">{ex.exerciseName}</Link>
                      : ex.exerciseName}
                  </span>
                  <span class="history-card-volume tabular-nums">{calculateExerciseVolume(ex).toLocaleString('sv-SE')} kg</span>
                </div>
                <div class="history-card-body">
                  <span class="tabular-nums">{formatSets(ex.setEntries)}</span>
                </div>
                {ex.notes && <div class="text-xs text-muted mt-1">{ex.notes}</div>}
              </div>
            ))}
            <div class="flex justify-between items-center mt-sm">
              <span class="font-semibold">Totalt</span>
              <span class="volume-hero">{calculateTotalVolume(session.exercises).toLocaleString('sv-SE')} kg</span>
            </div>
          </div>
          <div class="history-list-table session-detail-exercise-list">
            <div class="session-detail-table table-rows">
              <table>
                <thead>
                  <tr>
                    <th>Övning</th>
                    <th>Set</th>
                    <th>Set &amp; reps</th>
                    <th>Volym</th>
                  </tr>
                </thead>
                <tbody>
                  {session.exercises.map((ex, idx) => (
                    <tr key={idx}>
                      <td>
                        {ex.exerciseId
                          ? <Link href={`/exercises/${ex.exerciseId}`} class="exercise-link">{ex.exerciseName}</Link>
                          : ex.exerciseName}
                        {ex.notes && <div class="text-xs text-muted">{ex.notes}</div>}
                      </td>
                      <td class="tabular-nums">
                        {ex.setEntries.reduce((n, s) => n + (s.sets || 1), 0)}
                      </td>
                      <td class="tabular-nums">{formatSets(ex.setEntries)}</td>
                      <td class="volume-hero">{calculateExerciseVolume(ex).toLocaleString('sv-SE')} kg</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} class="text-right font-semibold">Totalt</td>
                    <td class="tabular-nums font-semibold">{calculateTotalVolume(session.exercises).toLocaleString('sv-SE')} kg</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </Card>

        <button type="button" class="template-delete-link" onClick={() => setDeleteDialogOpen(true)}>Radera pass</button>

        {/* Delete dialog */}
        <DeleteDialog
          isOpen={deleteDialogOpen}
          onClose={() => setDeleteDialogOpen(false)}
          onConfirm={handleDelete}
          sessionName={session.templateName}
          sessionDate={formatDateShort(session.date)}
        />

        {/* Toast */}
        {toastMessage && <Toast message={toastMessage} onDismiss={dismissToast} />}
      </div>
    )
  }

  // Render edit mode
  return (
    <div>
      <h1 class="page-title">Redigera pass</h1>

      <Card>
        <div class="flex justify-between items-center mb">
          <h2 class="m-0">{session.templateName}</h2>
          <div class="flex gap-sm">
            <Button variant="secondary" size="sm" onClick={cancelEdit}>Avbryt</Button>
            <Button 
              size="sm" 
              onClick={handleSave} 
              disabled={saving || formExercises.length === 0}
            >
              {saving ? 'Sparar...' : 'Spara'}
            </Button>
          </div>
        </div>

        <Field label="Datum" class="mb">
          <input type="date" value={formDate} onChange={handleDateChange} />
        </Field>

        <Field label="Program" class="mb">
          <select value={formTemplateId} onChange={handleTemplateChange}>
            {allTemplates.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </Field>

        <div class="flex gap-sm mb">
          <Button variant="secondary" size="sm" onClick={handleUpdateTemplate} disabled={!formTemplateId}>
            Spara övningarna till programmet
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowSaveTemplate(v => !v)}>
            Spara som nytt program
          </Button>
        </div>

        {showSaveTemplate && (
          <div class="card mb">
            <form
              class="flex gap-sm items-end"
              onSubmit={e => {
                e.preventDefault()
                handleSaveAsNewTemplate()
              }}
            >
              <Field label="Programnamn" class="m-0 grow">
                <input
                  type="text"
                  value={newTemplateName}
                  onInput={(e: Event) => setNewTemplateName((e.target as HTMLInputElement).value)}
                  placeholder="t.ex. Bröst, axlar & triceps lång"
                  autoFocus
                />
              </Field>
              <Button type="submit" disabled={!newTemplateName.trim() || formExercises.length === 0}>
                Skapa program
              </Button>
            </form>
          </div>
        )}

        <h3 class="mb-sm">Övningar</h3>
        
        <datalist id="session-exercise-suggestions">
          {allExercises.map(e => (
            <option key={e.id} value={e.name} />
          ))}
        </datalist>

        <div class="exercise-list">
          <div class="exercise-list-cards">
            {formExercises.map((ex, idx) => (
              <div key={idx} class="exercise-card">
                <div class="exercise-card-header">
                  <h4>Övning {idx + 1}</h4>
                  <button class="btn-remove" onClick={() => removeExercise(idx)} aria-label="Ta bort">
                    <svg width="20" height="20" viewBox="0 0 19 19">
                      <use href={icon('trash-icon')} />
                    </svg>
                  </button>
                </div>
                <div class="exercise-card-fields">
                  <div class="input-group">
                    <label>Övning</label>
                    <input
                      type="text"
                      value={ex.exerciseName}
                      onChange={e => handleInputChange(e, idx, 'exerciseName')}
                      placeholder="Skriv övningsnamn..."
                      list="session-exercise-suggestions"
                    />
                  </div>
                  {ex.setEntries.map((set, setIdx) => (
                    <div key={setIdx} class="input-group grid-3">
                      <div>
                        <label>Set {setIdx + 1}</label>
                        <input type="number" min="1" max="20" value={set.sets} onChange={e => handleInputChange(e, idx, 'setEntries', setIdx, 'sets')} onBlur={restoreIfEmpty(set.sets)} />
                      </div>
                      <div>
                        <label>Reps</label>
                        <input type="number" min="1" max="50" value={set.reps} onChange={e => handleInputChange(e, idx, 'setEntries', setIdx, 'reps')} onBlur={restoreIfEmpty(set.reps)} />
                      </div>
                      <div>
                        <label>Vikt (kg)</label>
                        <input type="number" min="0" step="0.5" max="500" value={set.weight} onChange={e => handleInputChange(e, idx, 'setEntries', setIdx, 'weight')} onBlur={restoreIfEmpty(set.weight)} />
                      </div>
                      {ex.setEntries.length > 1 && (
                        <div class="m-0">
                          <Button variant="danger" size="sm" class="h-full" onClick={() => removeSetFromExercise(idx, setIdx)}>Ta bort</Button>
                        </div>
                      )}
                    </div>
                  ))}
                  <Button variant="secondary" size="sm" class="mt-1" onClick={() => addSetToExercise(idx)}>+ Lägg till set</Button>
                </div>
              </div>
            ))}
          </div>
          <Button variant="secondary" class="mt" onClick={addExercise}>+ Lägg till övning</Button>
        </div>
      </Card>

      {saved && (
        <div class="toast">Pass sparat!</div>
      )}

      {/* Delete dialog */}
      <DeleteDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        sessionName={session.templateName}
        sessionDate={formatDateShort(session.date)}
      />

      {/* Toast */}
      {toastMessage && <Toast message={toastMessage} onDismiss={dismissToast} />}
    </div>
  )
}
