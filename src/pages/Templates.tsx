import { useState, useEffect } from 'preact/hooks'
import { getAllTemplates, getAllExercises, createTemplate, updateTemplate, deleteTemplate, getOrCreateExercise } from '../services/dataService'
import { formatWeight, parseDecimal } from '../lib/format'
import { icon } from '../icons'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { Field } from '../components/Field'
import { ExerciseAnimation } from '../components/ExerciseAnimation'
import { dbIdForName } from '../lib/exerciseDb'
import { Link } from 'wouter'
import { STARTER_PROGRAMS, type StarterProgram } from '../data/starterPrograms'
import type { Template, Exercise, SetEntry } from '../models'

interface FormExercise {
  exerciseId: string
  exerciseName: string
  defaultSetEntry: SetEntry
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

export function Templates() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [allExercises, setAllExercises] = useState<Exercise[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formExercises, setFormExercises] = useState<FormExercise[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{ id: string; name: string } | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  // Vikt som fritext medan man skriver, nyckel radens index. Samma mönster som kg i Logga pass:
  // `<input type="number">` följer webbläsarens/OS-lokal för decimaltecken och godkänner bara
  // komma ELLER punkt, aldrig båda, och ett kontrollerat fält nollar ett nyss skrivet kommatecken.
  const [weightDrafts, setWeightDrafts] = useState<Record<number, string>>({})

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      setError(null)
      const [ts, es] = await Promise.all([getAllTemplates(), getAllExercises()])
      setTemplates(ts)
      setAllExercises(es)
    } catch (err) {
      setError('Kunde inte ladda program. Försök igen.')
      console.error('Fel vid laddning av mallar:', err)
    } finally {
      setLoading(false)
    }
  }

  function startEdit(template: Template) {
    setEditingId(template.id)
    setWeightDrafts({})
    setFormName(template.name)
    const exercises: FormExercise[] = template.exercises.map(te => {
      const ex = allExercises.find(e => e.id === te.exerciseId)
      return {
        exerciseId: te.exerciseId,
        exerciseName: ex?.name || '',
        defaultSetEntry: te.defaultSetEntry
      }
    })
    setFormExercises(exercises)
    setShowForm(true)
  }

  function startCreate() {
    setEditingId(null)
    setWeightDrafts({})
    setFormName('')
    setFormExercises([{ exerciseId: '', exerciseName: '', defaultSetEntry: { sets: 3, reps: 10, weight: 0 } }])
    setShowForm(true)
  }

  function cancelEdit() {
    setEditingId(null)
    setShowForm(false)
  }

  async function handleSave() {
    if (!formName.trim() || formExercises.length === 0) return

    const validExercises = await Promise.all(
      formExercises.map(async (fe, i) => {
        let exerciseId = fe.exerciseId
        if (!exerciseId || exerciseId.startsWith('new-')) {
          const ex = await getOrCreateExercise(fe.exerciseName)
          exerciseId = ex.id
        }
        return {
          exerciseId,
          defaultSetEntry: fe.defaultSetEntry,
          order: i
        }
      })
    )

    if (editingId) {
      await updateTemplate(editingId, { name: formName, exercises: validExercises })
    } else {
      await createTemplate(formName, validExercises)
    }
    await loadData()
    cancelEdit()
  }

  async function handleDelete(id: string) {
    const template = templates.find(t => t.id === id)
    if (template) {
      setDeleteDialog({ id, name: template.name })
    }
  }

  async function confirmDelete() {
    if (!deleteDialog) return
    setDeleteDialog(null)
    try {
      await deleteTemplate(deleteDialog.id)
      setToastMessage(`Programmet "${deleteDialog.name}" raderat.`)
      await loadData()
    } catch (err) {
      console.error('Kunde inte radera mall:', err)
      setToastMessage('Kunde inte radera programmet. Försök igen.')
    }
  }

  function dismissDeleteDialog() {
    setDeleteDialog(null)
  }

  function updateFormExercise(idx: number, field: keyof FormExercise, value: string | number | SetEntry) {
    const newExercises = [...formExercises]
    newExercises[idx] = { ...newExercises[idx], [field]: value }
    setFormExercises(newExercises)
  }

  function addFormExercise() {
    setFormExercises([...formExercises, { exerciseId: `new-${Date.now()}`, exerciseName: '', defaultSetEntry: { sets: 3, reps: 10, weight: 0 } }])
  }

  function removeFormExercise(idx: number) {
    setFormExercises(formExercises.filter((_, i) => i !== idx))
    setWeightDrafts({}) // indexen skiftar när en rad tas bort, en kvarvarande draft skulle hamna på fel rad
  }

  function handleInputChange(e: Event, idx: number, field: keyof FormExercise, nestedField?: keyof SetEntry) {
    const target = e.target as HTMLInputElement
    const value = target.type === 'number' ? (parseFloat(target.value) || 0) : target.value
    
    if (nestedField && field === 'defaultSetEntry') {
      updateFormExercise(idx, field, { ...formExercises[idx].defaultSetEntry, [nestedField]: value })
    } else {
      updateFormExercise(idx, field, value)
    }
  }

  function handleNameChange(e: Event) {
    const target = e.target as HTMLInputElement
    setFormName(target.value)
  }

  function dismissToast() {
    setToastMessage(null)
  }

  // Ett startprogram blir vanliga program i katalogen: samma createTemplate som formuläret,
  // övningarna hämtas eller skapas på namn. Pass som redan finns med samma namn hoppas över.
  async function addStarterProgram(p: StarterProgram) {
    try {
      const existing = new Set(templates.map(t => t.name))
      let added = 0
      for (const t of p.templates) {
        if (existing.has(t.name)) continue
        const exercises = []
        for (const e of t.exercises) {
          const ex = await getOrCreateExercise(e.name)
          exercises.push({ exerciseId: ex.id, defaultSetEntry: { sets: e.sets, reps: e.reps, weight: 0 } })
        }
        await createTemplate(t.name, exercises)
        added++
      }
      await loadData()
      setToastMessage(added === 0 ? `${p.name}: passen finns redan.` : `${added} pass tillagda från ${p.name}.`)
    } catch (err) {
      console.error('Kunde inte lägga till startprogram:', err)
      setToastMessage('Kunde inte lägga till programmet. Försök igen.')
    }
  }

  if (loading) {
    return (
      <div>
        <div class="flex justify-between items-center mb">
          <h1 class="page-title m-0">Program</h1>
          <Button disabled>+ Nytt program</Button>
        </div>
        <Card class="skeleton skeleton-card"></Card>
        {toastMessage && <Toast message={toastMessage} onDismiss={dismissToast} />}
      </div>
    )
  }

  if (error) {
    return (
      <EmptyState
        title="Fel vid laddning"
        message={error}
        action={<Button onClick={loadData}>Försök igen</Button>}
      />
    )
  }

  return (
    <div>
      <div class="flex justify-between items-center mb">
        <h1 class="page-title m-0">Program</h1>
        <Button onClick={startCreate}>+ Nytt program</Button>
      </div>

      {showForm && (
        <Card>
          <h3 class="mb">{editingId ? 'Redigera program' : 'Nytt program'}</h3>

          <Field label="Programnamn" class="mb">
            <input type="text" value={formName} onChange={handleNameChange} placeholder="T.ex. Bröst, axlar & biceps" />
          </Field>

          <h4 class="mb-sm">Övningar</h4>
          {/* Ett id per dokument: datalisten renderas en gång, inte per rad */}
          <datalist id="template-exercise-suggestions">
            {allExercises.map(e => <option key={e.id} value={e.name} />)}
          </datalist>
          {formExercises.map((fe, idx) => {
            const dbId = dbIdForName(fe.exerciseName)
            return (
            <div key={idx} class="template-exercise-row mb">
              {/* Förhandsvisning ur övningsdatabasen när namnet har en koppling, annars tom plats så kolumnerna står still */}
              <div class="exdb-thumb-slot">
                {dbId && (
                  <Link href={`/ovningar/${dbId}`} class="exdb-thumb-link" aria-label={`Visa ${fe.exerciseName} i övningsdatabasen`}>
                    <ExerciseAnimation id={dbId} name="" class="exdb-anim-thumb" />
                  </Link>
                )}
              </div>
              <Field label="Övning" class="m-0 template-exercise-name">
                <input
                  type="text"
                  value={fe.exerciseName}
                  onChange={e => handleInputChange(e, idx, 'exerciseName')}
                  placeholder="Skriv övningsnamn..."
                  list="template-exercise-suggestions"
                />
              </Field>
              <Field label="Set" class="m-0">
                <input type="number" min="1" max="20" value={fe.defaultSetEntry.sets} onChange={e => handleInputChange(e, idx, 'defaultSetEntry', 'sets')} />
              </Field>
              <Field label="Reps" class="m-0">
                <input type="number" min="1" max="50" value={fe.defaultSetEntry.reps} onChange={e => handleInputChange(e, idx, 'defaultSetEntry', 'reps')} />
              </Field>
              <Field label="Vikt (kg)" class="m-0">
                <input
                  type="text"
                  inputMode="decimal"
                  value={weightDrafts[idx] ?? formatWeight(fe.defaultSetEntry.weight)}
                  onInput={e => {
                    const text = (e.target as HTMLInputElement).value
                    setWeightDrafts(prev => ({ ...prev, [idx]: text }))
                    const parsed = parseDecimal(text)
                    updateFormExercise(idx, 'defaultSetEntry', { ...fe.defaultSetEntry, weight: parsed !== null ? Math.max(0, Math.min(500, parsed)) : 0 })
                  }}
                  onBlur={() => setWeightDrafts(prev => {
                    if (!(idx in prev)) return prev
                    const next = { ...prev }
                    delete next[idx]
                    return next
                  })}
                />
              </Field>
              <div class="m-0">
                <button
                  type="button"
                  class="btn-remove"
                  onClick={() => removeFormExercise(idx)}
                  aria-label={`Ta bort övning ${idx + 1}`}
                >
                  <svg width="20" height="20" viewBox="0 0 19 19">
                    <use href={icon('trash-icon')} />
                  </svg>
                </button>
              </div>
            </div>
            )
          })}

          <Button variant="secondary" class="mb" onClick={addFormExercise}>+ Lägg till övning</Button>

          <div class="flex gap">
            <Button onClick={handleSave}>Spara</Button>
            <Button variant="secondary" onClick={cancelEdit}>Avbryt</Button>
          </div>
        </Card>
      )}

      <Card padding="none">
        {templates.length === 0 ? (
          <EmptyState
            title="Inga program ännu"
            message="Skapa ditt första program för att komma igång."
            action={<Button onClick={startCreate}>+ Nytt program</Button>}
          />
        ) : (
          <>
          {/* Telefon: ett kort per program. Tabellen krävde sidled-scroll och bröt namnen på tre rader. */}
          <div class="history-list-cards" style="padding: var(--space-4)">
            {templates.map(t => (
              <div
                key={t.id}
                class="history-card"
                role="button"
                tabIndex={0}
                aria-label={`Redigera program ${t.name}`}
                onClick={() => startEdit(t)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    startEdit(t)
                  }
                }}
              >
                <div class="history-card-header">
                  <span class="history-card-date">{t.name}</span>
                  <button
                    type="button"
                    class="btn-remove"
                    onClick={event => {
                      event.stopPropagation()
                      handleDelete(t.id)
                    }}
                    aria-label={`Radera program ${t.name}`}
                  >
                    <svg width="20" height="20" viewBox="0 0 19 19">
                      <use href={icon('trash-icon')} />
                    </svg>
                  </button>
                </div>
                <div class="history-card-body">
                  <span>{t.exercises.length} övningar</span>
                  <span class="tabular-nums">{new Date(t.updatedAt).toLocaleDateString('sv-SE')}</span>
                </div>
              </div>
            ))}
          </div>
          <div class="history-list-table table-wrap table-rows" style="padding: var(--space-6) var(--space-6) var(--space-6) var(--space-6)">
            <table>
              <thead>
                <tr>
                  <th>Namn</th>
                  <th>Övningar</th>
                  <th>Uppdaterad</th>
                  <th class="text-right">Åtgärder</th>
                </tr>
              </thead>
              <tbody>
                {templates.map(t => (
                  <tr
                    key={t.id}
                    class="template-row-clickable"
                    onClick={() => startEdit(t)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        startEdit(t)
                      }
                    }}
                    tabIndex={0}
                    aria-label={`Redigera program ${t.name}`}
                  >
                    <td><strong>{t.name}</strong></td>
                    <td>{t.exercises.length}</td>
                    <td>{new Date(t.updatedAt).toLocaleDateString('sv-SE')}</td>
                    <td class="text-right">
                      <div class="flex gap-sm justify-end">
                        <button
                          type="button"
                          class="btn-remove"
                          onClick={event => {
                            event.stopPropagation()
                            handleDelete(t.id)
                          }}
                          aria-label={`Radera program ${t.name}`}
                        >
                          <svg width="20" height="20" viewBox="0 0 19 19">
                            <use href={icon('trash-icon')} />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>

      {/* Startprogram: etablerade upplägg med källa, blir vanliga program med ett tryck */}
      <Card title="Startprogram" class="mt">
        <p class="text-sm text-muted m-0 mb">Färdiga nybörjarupplägg med källa. Vikten är 0 tills du sätter den, loggvyn förifyller sedan från förra passet.</p>
        <div class="starter-list" role="list" aria-label="Startprogram">
          {STARTER_PROGRAMS.map(p => (
            <div key={p.id} class="starter-item" role="listitem">
              <div class="starter-text">
                <h4 class="m-0">{p.name}</h4>
                <p class="text-sm m-0 mt-1">{p.description}</p>
                <p class="text-sm text-muted m-0 mt-1"><strong>Progression:</strong> {p.progression}</p>
                <p class="text-xs text-muted m-0 mt-1">
                  {p.author} · <a href={p.source.url} target="_blank" rel="noopener noreferrer" class="exercise-link">{p.source.label}</a>
                  {' · '}{p.templates.map(t => t.name).join(', ')}
                </p>
              </div>
              <Button variant="secondary" onClick={() => addStarterProgram(p)}>Lägg till ({p.templates.length} pass)</Button>
            </div>
          ))}
        </div>
      </Card>

      {/* Delete dialog */}
      <DeleteDialog
        isOpen={deleteDialog !== null}
        onClose={dismissDeleteDialog}
        onConfirm={confirmDelete}
        title="Radera program"
        message={`Är du säker på att du vill radera programmet "${deleteDialog?.name}"? Det går inte att ångra.`}
      />

      {toastMessage && <Toast message={toastMessage} onDismiss={dismissToast} />}
    </div>
  )
}
