import { useEffect, useMemo, useState } from 'preact/hooks'
import { Link, useLocation, useRoute, useSearch } from 'wouter'
import { Card } from '../components/Card'
import { Field } from '../components/Field'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { ExerciseAnimation } from '../components/ExerciseAnimation'
import { getAllExercises } from '../services/dataService'
import {
  CATEGORY_SV, EQUIPMENT_SV, LEVEL_SV, MUSCLE_SV, NO_STRETCH, equipmentLabel, loadExerciseDb, muscleLabel,
  ownNamesForDbId, searchExerciseDb, type DbExercise
} from '../lib/exerciseDb'
import { getDB, type Exercise } from '../models'

const PAGE = 24
// Typvalet sparas per enhet i settings-storen, samma som vilotimerns inställningar: "allt utom stretch" ska stå kvar
const CATEGORY_KEY = 'exercise-db-category'

function useExerciseDb(): DbExercise[] | null {
  const [all, setAll] = useState<DbExercise[] | null>(null)
  useEffect(() => { loadExerciseDb().then(setAll) }, [])
  return all
}

function Skeleton() {
  return (
    <div>
      <h1 class="page-title">Övningar</h1>
      <Card class="skeleton skeleton-card mb"></Card>
      <Card class="skeleton skeleton-card mb"></Card>
    </div>
  )
}

function DbExerciseDetail({ id, all }: { id: string; all: DbExercise[] }) {
  const [, navigate] = useLocation()
  const [own, setOwn] = useState<Exercise[]>([])
  const ex = all.find(e => e.id === id)
  const ownNames = useMemo(() => new Set(ownNamesForDbId(id).map(n => n.toLowerCase())), [id])

  useEffect(() => {
    getAllExercises().then(list => setOwn(list.filter(e => ownNames.has(e.name.trim().toLowerCase()))))
  }, [ownNames])

  if (!ex) {
    return (
      <EmptyState
        title="Övningen hittades inte"
        action={<Button onClick={() => navigate('/ovningar')}>Till övningarna</Button>}
      />
    )
  }

  return (
    <div>
      <button type="button" class="btn btn-sm btn-secondary mb-1 flex items-center gap-1" onClick={() => navigate('/ovningar')}>
        <svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        Övningar
      </button>
      <h1 class="page-title m-0">{ex.name}</h1>
      <p class="text-sm text-muted m-0 mb-sm" lang="en">{ex.nameEn}</p>
      <div class="flex flex-wrap gap-1 mb">
        {ex.primaryMuscles.map(m => <span key={m} class="badge badge-primary">{muscleLabel(m)}</span>)}
        {ex.secondaryMuscles.map(m => <span key={m} class="badge exdb-badge-secondary">{muscleLabel(m)}</span>)}
      </div>

      <div class="exdb-detail-grid mb">
        <Card padding="none" class="exdb-detail-media">
          <ExerciseAnimation id={ex.id} name={ex.name} class="exdb-anim-large" />
        </Card>
        <Card title="Om övningen">
          <dl class="exdb-meta">
            <dt>Utrustning</dt><dd>{equipmentLabel(ex.equipment)}</dd>
            <dt>Nivå</dt><dd>{LEVEL_SV[ex.level] ?? ex.level}</dd>
            <dt>Typ</dt><dd>{CATEGORY_SV[ex.category] ?? ex.category}</dd>
          </dl>
          {own.length > 0 && (
            <div class="mt">
              <div class="text-xs text-muted mb-1">I min katalog</div>
              {own.map(e => (
                <Link key={e.id} href={`/exercises/${encodeURIComponent(e.id)}`} class="btn btn-sm btn-secondary mb-1">{e.name}</Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Så gör du" class="mb">
        <ol class="exdb-steps">
          {ex.instructions.map((step, i) => <li key={i}>{step}</li>)}
        </ol>
        <p class="text-xs text-muted m-0 mt-2">Text och bilder ur free-exercise-db (public domain), texten översatt från engelska.</p>
      </Card>
    </div>
  )
}

function DbExerciseList({ all }: { all: DbExercise[] }) {
  const search = useSearch()
  const [q, setQ] = useState(() => new URLSearchParams(search).get('q') ?? '')
  const [muscle, setMuscle] = useState('')
  const [equipment, setEquipment] = useState('')
  const [category, setCategory] = useState('')
  const [shown, setShown] = useState(PAGE)

  useEffect(() => {
    getDB().then(db => db.get('settings', CATEGORY_KEY)).then(s => {
      if (typeof s?.value === 'string' && (s.value === NO_STRETCH || CATEGORY_SV[s.value])) setCategory(s.value)
    }).catch(() => undefined)
  }, [])

  function chooseCategory(value: string) {
    setCategory(value)
    getDB().then(db => db.put('settings', { key: CATEGORY_KEY, value })).catch(() => undefined)
  }

  const hits = useMemo(() => searchExerciseDb(all, { q, muscle, equipment, category }), [all, q, muscle, equipment, category])
  // Ny sökning börjar om från första sidan
  useEffect(() => { setShown(PAGE) }, [q, muscle, equipment, category])

  return (
    <div>
      <h1 class="page-title">Övningar</h1>
      <Card class="mb">
        <div class="exdb-filters">
          <Field label="Sök">
            <input type="search" value={q} placeholder="Namn, svenska eller engelska" enterKeyHint="search"
              onInput={(e: Event) => setQ((e.target as HTMLInputElement).value)} />
          </Field>
          <Field label="Muskel">
            <select value={muscle} onChange={(e: Event) => setMuscle((e.target as HTMLSelectElement).value)}>
              <option value="">Alla</option>
              {Object.entries(MUSCLE_SV).sort((a, b) => a[1].localeCompare(b[1], 'sv')).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Utrustning">
            <select value={equipment} onChange={(e: Event) => setEquipment((e.target as HTMLSelectElement).value)}>
              <option value="">Alla</option>
              {Object.entries(EQUIPMENT_SV).sort((a, b) => a[1].localeCompare(b[1], 'sv')).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Typ">
            <select value={category} onChange={(e: Event) => chooseCategory((e.target as HTMLSelectElement).value)}>
              <option value="">Alla</option>
              <option value={NO_STRETCH}>Allt utom stretch</option>
              {Object.entries(CATEGORY_SV).sort((a, b) => a[1].localeCompare(b[1], 'sv')).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
        <p class="text-xs text-muted m-0 mt-2" aria-live="polite">{hits.length} av {all.length} övningar</p>
      </Card>

      {hits.length === 0 ? (
        <Card><EmptyState title="Inga träffar" message="Prova ett kortare ord eller ta bort ett filter." /></Card>
      ) : (
        <div class="exdb-grid" role="list" aria-label="Övningar">
          {hits.slice(0, shown).map(e => (
            <Link key={e.id} href={`/ovningar/${e.id}`} class="exdb-card" role="listitem">
              <ExerciseAnimation id={e.id} name="" still />
              <span class="exdb-card-name">{e.name}</span>
              <span class="exdb-card-meta">{e.primaryMuscles.map(muscleLabel).join(', ')} · {equipmentLabel(e.equipment)}</span>
            </Link>
          ))}
        </div>
      )}
      {hits.length > shown && (
        <div class="flex justify-center mt">
          <Button variant="secondary" onClick={() => setShown(s => s + PAGE)}>Visa fler ({hits.length - shown} kvar)</Button>
        </div>
      )}
    </div>
  )
}

export function ExerciseDatabase() {
  const [, params] = useRoute('/ovningar/:id')
  const all = useExerciseDb()
  if (!all) return <Skeleton />
  return params?.id ? <DbExerciseDetail id={params.id} all={all} /> : <DbExerciseList all={all} />
}
