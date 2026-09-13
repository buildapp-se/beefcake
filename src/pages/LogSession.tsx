import { useState, useEffect, useRef, useCallback } from 'preact/hooks'
import {
  getAllTemplates,
  getAllExercises,
  createSession,
  getOrCreateExercise,
  getSession,
  createTemplate,
  getActiveWorkout,
  saveActiveWorkout,
  clearActiveWorkout,
  getLastPerformanceForExercise,
  getExerciseRecords
} from '../services/dataService'
import { startRestTimer, triggerHaptic } from '../services/timerService'
import { formatDateShort } from '../lib/date'
import { formatSet, formatSetCompact, formatSets, formatWeight, parseDecimal } from '../lib/format'
import { barWeightFor, formatPlatesPerSide } from '../lib/plates'
import { epley1RM } from '../lib/exerciseMetrics'
import { warmupSets } from '../lib/warmup'
import { setsVolume } from '../lib/volume'
import { todayISO, nowISO } from '../models'
import { icon } from '../icons'
import { useLocation } from 'wouter'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { Field } from '../components/Field'
import { PlateCalculatorModal } from '../components/PlateCalculator'
import { RestTimer } from '../components/RestTimer'
import type { Template, Exercise, TemplateExercise, SetEntry, ActiveSetEntry, SetType } from '../models'

// Settyp som fullt ord i pickern (bokstaven ensam var obegriplig på mobil), tom sträng för normal i brickan
const SET_TYPE_LABELS: Record<SetType, string> = { normal: 'Normal', warmup: 'Uppvärmning', drop: 'Drop', failure: 'Failure' }
const SET_TYPE_ORDER: SetType[] = ['normal', 'warmup', 'drop', 'failure']

export interface LogFormExercise {
  exerciseId: string
  exerciseName: string
  setEntries: ActiveSetEntry[]
  notes?: string
}

export function LogSession() {
  const [, navigate] = useLocation()
  const [templates, setTemplates] = useState<Template[]>([])
  const [allExercises, setAllExercises] = useState<Exercise[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [exercises, setExercises] = useState<LogFormExercise[]>([])
  const [date, setDate] = useState(() => todayISO())
  const [startTime, setStartTime] = useState(() => nowISO())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [draggedExerciseIndex, setDraggedExerciseIndex] = useState<number | null>(null)
  const [previousPerformances, setPreviousPerformances] = useState<Record<string, { date: string; setEntries: SetEntry[]; notes?: string }>>({})
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  // Rekord per övning vid passets start: ett bockat set som slår dem får PR-märket på raden
  const [records, setRecords] = useState<Record<string, { maxWeight: number; maxE1RM: number }>>({})
  const [plateCalcModal, setPlateCalcModal] = useState<{ isOpen: boolean; weight: number; barWeight: number; exIdx: number; setIdx: number }>({
    isOpen: false,
    weight: 60,
    barWeight: 20,
    exIdx: 0,
    setIdx: 0
  })
  // RPE väljs i en rad brickor under tabellen, inget tangentbord. Öppen för ett set i taget.
  const [rpePicker, setRpePicker] = useState<{ exIdx: number; setIdx: number } | null>(null)
  // Settyp väljs i en rad brickor, samma mönster som RPE: bokstaven N/W/D/F på egen hand var obegriplig på mobil.
  const [typePicker, setTypePicker] = useState<{ exIdx: number; setIdx: number } | null>(null)
  // Kg som fritext medan man skriver: value={set.weight} skulle nolla ett nyss skrivet
  // kommatecken vid omrendering (kontrollerat fält, `<input type="number">` följer dessutom
  // webbläsarens lokal för decimaltecken och godkänner bara komma ELLER punkt). Nyckel "exIdx:setIdx".
  const [weightDrafts, setWeightDrafts] = useState<Record<string, string>>({})

  const draggedExerciseIndexRef = useRef<number | null>(null)
  const activeTemplateRequestRef = useRef<string>('')
  const isInitialLoadRef = useRef(true)

  // Fetch previous performance for exercises
  const fetchPreviousPerformances = useCallback(async (exerciseIds: string[]) => {
    const missingIds = exerciseIds.filter(id => id && !id.startsWith('new-') && !previousPerformances[id])
    if (missingIds.length === 0) return

    const results = await Promise.all(
      missingIds.map(async id => {
        const [perf, rec] = await Promise.all([getLastPerformanceForExercise(id), getExerciseRecords(id)])
        return { id, perf, rec }
      })
    )

    setPreviousPerformances(prev => {
      const next = { ...prev }
      for (const res of results) {
        if (res.perf) {
          next[res.id] = res.perf
        }
      }
      return next
    })
    setRecords(prev => {
      const next = { ...prev }
      for (const res of results) next[res.id] = res.rec
      return next
    })
  }, [previousPerformances])

  // Load initial data and check for active draft
  async function initSession() {
    try {
      setLoading(true)
      setError(null)
      const urlParams = new URLSearchParams(window.location.search)
      const fromSessionId = urlParams.get('from')
      const templateParam = urlParams.get('template')
      const requestedDate = urlParams.get('date')

      if (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
        setDate(requestedDate)
      }

      const [ts, es, activeDraft] = await Promise.all([
        getAllTemplates(),
        getAllExercises(),
        getActiveWorkout()
      ])

      setTemplates(ts)
      setAllExercises(es)

      // Priority 1: explicitly requested ?from=<sessionId>
      if (fromSessionId) {
        try {
          const session = await getSession(fromSessionId)
          if (session) {
            setSelectedTemplateId(session.templateId)
            const formExercises: LogFormExercise[] = session.exercises.map(e => ({
              exerciseId: e.exerciseId,
              exerciseName: e.exerciseName,
              setEntries: e.setEntries.map(s => ({ ...s, completed: false, type: 'normal' }))
            }))
            setExercises(formExercises)
            setDate(todayISO())
            setStartTime(nowISO())
            void fetchPreviousPerformances(formExercises.map(e => e.exerciseId))
          }
        } catch (err) {
          console.error('Failed to load session for prefill:', err)
        }
      }
      // Priority 2: explicitly requested ?template=<name>
      else if (templateParam) {
        const matchedTemplate = ts.find(t => t.name.toLowerCase() === templateParam.toLowerCase())
        if (matchedTemplate) {
          setSelectedTemplateId(matchedTemplate.id)
          await loadTemplateIntoExercises(matchedTemplate, es)
        }
      }
      // Priority 3: ett faktiskt påbörjat utkast i IndexedDB
      else if (activeDraft && activeDraft.exercises.some(e => e.setEntries.length > 0)) {
        setSelectedTemplateId(activeDraft.templateId)
        setDate(activeDraft.date || todayISO())
        setStartTime(activeDraft.startTime || nowISO())
        setExercises(activeDraft.exercises)
        void fetchPreviousPerformances(activeDraft.exercises.map(e => e.exerciseId))
      }

      if (fromSessionId || templateParam || requestedDate) {
        window.history.replaceState({}, '', window.location.pathname)
      }
    } catch (err) {
      setError('Kunde inte ladda passdata. Försök igen.')
      console.error('Fel vid initiering:', err)
    } finally {
      setLoading(false)
      isInitialLoadRef.current = false
    }
  }

  async function loadTemplateIntoExercises(template: Template, allExList: Exercise[]) {
    activeTemplateRequestRef.current = template.id
    const exMap = new Map(allExList.map(e => [e.id, e.name]))
    // Ladda förra gången först: den vikten är utgångsläget vid stången, inte mallens startvärde
    const [lastPerformances, exerciseRecords] = await Promise.all([
      Promise.all(template.exercises.map((te: TemplateExercise) => getLastPerformanceForExercise(te.exerciseId))),
      Promise.all(template.exercises.map((te: TemplateExercise) => getExerciseRecords(te.exerciseId)))
    ])
    // Ett snabbare mallbyte hann före medan vi väntade: släpp det här svaret
    if (activeTemplateRequestRef.current !== template.id) return
    setRecords(prev => {
      const next = { ...prev }
      template.exercises.forEach((te: TemplateExercise, idx: number) => { next[te.exerciseId] = exerciseRecords[idx] })
      return next
    })
    const formExercises: LogFormExercise[] = template.exercises.map((te: TemplateExercise) => ({
      exerciseId: te.exerciseId,
      exerciseName: exMap.get(te.exerciseId) || '',
      // Passet börjar på noll set: du klickar upp dem under passet, förra gången syns i bannern
      setEntries: []
    }))
    setExercises(formExercises)
    setPreviousPerformances(prev => {
      const next = { ...prev }
      template.exercises.forEach((te: TemplateExercise, idx: number) => {
        const perf = lastPerformances[idx]
        if (perf) next[te.exerciseId] = perf
      })
      return next
    })
  }

  useEffect(() => {
    initSession()
  }, [])

  // Ett nytt program eller pass laddar nya set på samma exIdx:setIdx-nycklar; en kvarvarande
  // kg-draft från förra programmet skulle annars visas på fel set.
  useEffect(() => {
    setWeightDrafts({})
  }, [selectedTemplateId])

  // Auto-save to activeWorkout whenever exercises or settings change (after initial load)
  useEffect(() => {
    if (isInitialLoadRef.current || loading) return

    // Ett utkast finns först när något kan gå förlorat: minst ett set. Förvalda övningar
    // utan set är en startpunkt, inte ett pågående pass, och lämnar inget spår.
    if (!exercises.some(e => e.setEntries.length > 0)) {
      void clearActiveWorkout()
      return
    }

    const template = templates.find(t => t.id === selectedTemplateId)
    void saveActiveWorkout({
      date,
      templateId: selectedTemplateId,
      templateName: template?.name || 'Fritt pass',
      exercises: exercises.map((e, idx) => ({ ...e, order: idx })),
      startTime
    })
  }, [exercises, date, selectedTemplateId, startTime, loading, templates])

  // Kortkommandon på desktop: Ctrl+Enter slutför passet, Escape stänger det som är öppet.
  // Inget mer förrän något saknas på riktigt; fler tangenter är fler saker att glömma.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        void handleFinishSession()
      } else if (event.key === 'Escape') {
        setCancelDialogOpen(false)
        setShowSaveTemplate(false)
        setRpePicker(null)
        setTypePicker(null)
        setPlateCalcModal(prev => ({ ...prev, isOpen: false }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Template switch handler with race-condition prevention
  async function handleSelectTemplate(newTemplateId: string) {
    setSelectedTemplateId(newTemplateId)
    activeTemplateRequestRef.current = newTemplateId

    const template = templates.find(t => t.id === newTemplateId)
    if (!template) {
      setExercises([])
      return
    }

    const allEx = allExercises.length > 0 ? allExercises : await getAllExercises()
    if (activeTemplateRequestRef.current !== newTemplateId) return

    await loadTemplateIntoExercises(template, allEx)
  }

  // Slår setet övningens tyngsta set eller bästa e1RM? Uppvärmning räknas inte.
  function isRecordSet(exerciseId: string, set: ActiveSetEntry): boolean {
    const rec = records[exerciseId]
    if (!rec || !set.completed || set.weight <= 0 || set.type === 'warmup') return false
    return set.weight > rec.maxWeight || (epley1RM(set.weight, set.reps) ?? 0) > rec.maxE1RM
  }

  // Toggle set completion and trigger rest timer + haptics
  function toggleSetCompleted(exerciseIdx: number, setIdx: number) {
    const ex = exercises[exerciseIdx]
    const currentSet = ex.setEntries[setIdx]
    const nextCompleted = !currentSet.completed

    const newSetEntries = [...ex.setEntries]
    newSetEntries[setIdx] = {
      ...currentSet,
      completed: nextCompleted
    }

    const newExercises = [...exercises]
    newExercises[exerciseIdx] = { ...ex, setEntries: newSetEntries }
    setExercises(newExercises)

    if (nextCompleted) {
      // Rekordet får den långa vibrationen, samma som när passet sparas
      triggerHaptic(isRecordSet(ex.exerciseId, newSetEntries[setIdx]) ? [60, 40, 100] : 50)
      startRestTimer()
    }
  }

  // Uppvärmning: tre set före första arbetssetet, 40, 60, 80 % avrundat till 2,5 kg
  function addWarmup(exerciseIdx: number) {
    const ex = exercises[exerciseIdx]
    const working = ex.setEntries.find(s => s.type !== 'warmup' && s.weight > 0)
    if (!working) return
    const warm: ActiveSetEntry[] = warmupSets(working.weight).map(s => ({ sets: 1, reps: s.reps, weight: s.weight, completed: false, type: 'warmup' }))
    const newExercises = [...exercises]
    newExercises[exerciseIdx] = { ...ex, setEntries: [...warm, ...ex.setEntries] }
    setExercises(newExercises)
    triggerHaptic(20)
  }


  function adjustSetValues(exerciseIdx: number, setIdx: number, deltaWeight: number, deltaReps: number) {
    const ex = exercises[exerciseIdx]
    const set = ex.setEntries[setIdx]
    const newWeight = Math.max(0, Math.round((set.weight + deltaWeight) * 10) / 10)
    const newReps = Math.max(1, set.reps + deltaReps)

    const newSetEntries = [...ex.setEntries]
    newSetEntries[setIdx] = { ...set, weight: newWeight, reps: newReps }

    const newExercises = [...exercises]
    newExercises[exerciseIdx] = { ...ex, setEntries: newSetEntries }
    setExercises(newExercises)
    // Stegknappen sätter kg direkt: en kvarvarande kg-draft (mitt i skrivandet) ska inte överskugga den
    if (deltaWeight !== 0) {
      const key = `${exerciseIdx}:${setIdx}`
      setWeightDrafts(prev => {
        if (!(key in prev)) return prev
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
    triggerHaptic(20)
  }

  function updateSet(exerciseIdx: number, setIdx: number, patch: Partial<ActiveSetEntry>) {
    setExercises(current => {
      const ex = current[exerciseIdx]
      if (!ex || !ex.setEntries[setIdx]) return current
      const newSetEntries = [...ex.setEntries]
      newSetEntries[setIdx] = { ...newSetEntries[setIdx], ...patch }
      const next = [...current]
      next[exerciseIdx] = { ...ex, setEntries: newSetEntries }
      return next
    })
  }

  // "Som förra gången": fyller på med förra passets set från den plats du står på,
  // vikt och reps, obockade. Från noll set blir det hela förra passet på ett tryck.
  function fillFromLast(exerciseIdx: number) {
    const ex = exercises[exerciseIdx]
    const missing = (previousPerformances[ex.exerciseId]?.setEntries ?? []).slice(ex.setEntries.length)
    if (missing.length === 0) return
    const added: ActiveSetEntry[] = missing.map(s => ({ sets: 1, reps: s.reps, weight: s.weight, completed: false, type: 'normal' }))
    const newExercises = [...exercises]
    newExercises[exerciseIdx] = { ...ex, setEntries: [...ex.setEntries, ...added] }
    setExercises(newExercises)
    triggerHaptic(20)
  }

  function updateExerciseName(idx: number, name: string) {
    const matchedEx = allExercises.find(e => e.name.toLowerCase() === name.trim().toLowerCase())
    const exerciseId = matchedEx ? matchedEx.id : `new-${Date.now()}`

    const newExercises = [...exercises]
    newExercises[idx] = {
      ...newExercises[idx],
      exerciseId,
      exerciseName: name
    }
    setExercises(newExercises)

    if (matchedEx) {
      void fetchPreviousPerformances([matchedEx.id])
    }
  }

  function addExercise() {
    setExercises(prev => [
      ...prev,
      {
        exerciseId: `new-${Date.now()}`,
        exerciseName: '',
        setEntries: []
      }
    ])
  }

  function removeExercise(idx: number) {
    setExercises(prev => prev.filter((_, i) => i !== idx))
  }

  function addSet(exerciseIdx: number) {
    const ex = exercises[exerciseIdx]
    const lastSet = ex.setEntries[ex.setEntries.length - 1]
    // Nytt set: samma plats i förra passet, annars förra passets sista set, annars föregående rad,
    // annars programmets standardvärden (det enda stället de används sedan nollsetstarten)
    const prevSets = previousPerformances[ex.exerciseId]?.setEntries
    const programDefault = templates.find(t => t.id === selectedTemplateId)?.exercises.find(te => te.exerciseId === ex.exerciseId)?.defaultSetEntry
    const ref = prevSets?.[ex.setEntries.length] ?? prevSets?.[prevSets.length - 1] ?? lastSet ?? programDefault
    const newSet: ActiveSetEntry = {
      sets: 1,
      reps: ref?.reps || 10,
      weight: ref?.weight || 0,
      completed: false,
      type: 'normal'
    }

    const newExercises = [...exercises]
    newExercises[exerciseIdx] = {
      ...ex,
      setEntries: [...ex.setEntries, newSet]
    }
    setExercises(newExercises)
  }

  function removeSet(exerciseIdx: number, setIdx: number) {
    const ex = exercises[exerciseIdx]
    const newExercises = [...exercises]
    newExercises[exerciseIdx] = {
      ...ex,
      setEntries: ex.setEntries.filter((_, i) => i !== setIdx)
    }
    setExercises(newExercises)
  }

  function moveExercise(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= exercises.length) return
    setExercises(current => {
      const reordered = [...current]
      const [moved] = reordered.splice(fromIndex, 1)
      reordered.splice(toIndex, 0, moved)
      return reordered
    })
  }

  function startExerciseDrag(event: PointerEvent, index: number) {
    if (event.button !== 0) return
    event.preventDefault()
    const handle = event.currentTarget as HTMLButtonElement
    handle.setPointerCapture(event.pointerId)
    draggedExerciseIndexRef.current = index
    setDraggedExerciseIndex(index)
  }

  function continueExerciseDrag(event: PointerEvent) {
    const fromIndex = draggedExerciseIndexRef.current
    if (fromIndex === null) return
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-exercise-index]')
    const toIndex = Number(target?.dataset.exerciseIndex)
    if (!Number.isInteger(toIndex) || toIndex === fromIndex) return
    moveExercise(fromIndex, toIndex)
    draggedExerciseIndexRef.current = toIndex
    setDraggedExerciseIndex(toIndex)
  }

  function endExerciseDrag() {
    draggedExerciseIndexRef.current = null
    setDraggedExerciseIndex(null)
  }

  async function handleFinishSession() {
    if (totalSetsCount === 0) return
    setSaving(true)
    try {
      const template = templates.find(t => t.id === selectedTemplateId)
      const templateTitle = template?.name || 'Fritt pass'

      // Övningar utan set gjordes inte: de hör inte hemma i historiken
      const validExercises = await Promise.all(
        exercises.filter(e => e.setEntries.length > 0).map(async (e, order) => {
          let exerciseId = e.exerciseId
          if (!exerciseId || exerciseId.startsWith('new-')) {
            const ex = await getOrCreateExercise(e.exerciseName)
            exerciseId = ex.id
          }

          // Konvertera ActiveSetEntry[] till SetEntry[] för historiklagring
          const setEntries: SetEntry[] = e.setEntries.map(s => ({
            sets: s.sets || 1,
            reps: s.reps || 10,
            weight: s.weight || 0,
            ...(s.rpe ? { rpe: s.rpe } : {})
          }))

          return {
            exerciseId,
            exerciseName: e.exerciseName,
            setEntries,
            order,
            ...(e.notes?.trim() ? { notes: e.notes.trim() } : {})
          }
        })
      )

      await createSession(date, selectedTemplateId || 'custom', templateTitle, validExercises)
      setSaved(true)
      setExercises([])
      await clearActiveWorkout()
      triggerHaptic([60, 40, 100])
      setTimeout(() => {
        setSaved(false)
        navigate('/history')
      }, 1200)
    } catch (err) {
      console.error('Kunde inte spara pass:', err)
      setError('Kunde inte spara pass')
    } finally {
      setSaving(false)
    }
  }

  async function handleCancelSession() {
    await clearActiveWorkout()
    setCancelDialogOpen(false)
    setExercises([])
    navigate('/')
  }

  async function handleSaveAsTemplate() {
    if (exercises.length === 0 || !templateName.trim()) return
    try {
      const templateExercises = await Promise.all(
        exercises.map(async e => {
          let exerciseId = e.exerciseId
          if (!exerciseId || exerciseId.startsWith('new-')) {
            const ex = await getOrCreateExercise(e.exerciseName)
            exerciseId = ex.id
          }
          return {
            exerciseId,
            defaultSetEntry: {
              sets: e.setEntries.length || 3,
              reps: e.setEntries[0]?.reps || 10,
              weight: e.setEntries[0]?.weight || 0
            }
          }
        })
      )
      const newTemplate = await createTemplate(templateName.trim(), templateExercises)
      setTemplates(prev => [...prev, newTemplate].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedTemplateId(newTemplate.id)
      setShowSaveTemplate(false)
      setTemplateName('')
    } catch (err) {
      console.error('Kunde inte spara program:', err)
      setError('Kunde inte spara program')
    }
  }

  function openPlateCalculator(weight: number, barWeight: number, exIdx: number, setIdx: number) {
    setPlateCalcModal({ isOpen: true, weight, barWeight, exIdx, setIdx })
  }

  function applyPlateCalculatorWeight(newWeight: number) {
    updateSet(plateCalcModal.exIdx, plateCalcModal.setIdx, { weight: newWeight })
  }

  // Volym räknas på avbockade set: siffran ska visa vad du lyft, inte vad du planerat
  const totalVolume = exercises.reduce(
    (sum, e) => sum + setsVolume(e.setEntries.filter(s => s.completed)),
    0
  )

  const completedSetsCount = exercises.reduce((sum, e) => {
    return sum + e.setEntries.filter(s => s.completed).length
  }, 0)

  const totalSetsCount = exercises.reduce((sum, e) => sum + e.setEntries.length, 0)

  if (loading) {
    return (
      <div class="log-session-container">
        <h1 class="page-title">Logga pass</h1>
        <Card class="skeleton skeleton-card mb"></Card>
        <Card class="skeleton skeleton-card mb"></Card>
      </div>
    )
  }

  if (error) {
    return (
      <EmptyState
        title="Något gick fel"
        message={error}
        action={<Button onClick={initSession}>Försök igen</Button>}
      />
    )
  }

  const rpeOptions = Array.from({ length: 11 }, (_, i) => 5 + i * 0.5)

  return (
    <div class="log-session-layout">
      {/* Global Datalist för övningsförslag (renderas en gång för giltig HTML) */}
      <datalist id="exercise-suggestions">
        {allExercises.map(e => (
          <option key={e.id} value={e.name} />
        ))}
      </datalist>

      {/* Sidopanel med vilotimer på desktop */}
      <aside class="log-session-timer">
        <RestTimer />
      </aside>

      <div class="log-session-main">
        <div class="mb log-session-header">
          <h1 class="page-title m-0">{exercises.length > 0 ? 'Aktivt träningspass' : 'Logga pass'}</h1>
          {exercises.length > 0 && (
            <span class="text-xs text-muted">
              {completedSetsCount} av {totalSetsCount} set klara • Lyft volym: {totalVolume.toLocaleString('sv-SE')} kg
            </span>
          )}
          {/* Datum och program alltid synliga, som en slimmad rad utan etiketter (Patrik 2026-09-04, ersätter pennan från 2026-09-01) */}
          <div class="log-session-meta input-group">
            <input type="date" aria-label="Datum" value={date} onChange={(e: Event) => setDate((e.target as HTMLInputElement).value)} />
            <select aria-label="Program" value={selectedTemplateId} onChange={(e: Event) => handleSelectTemplate((e.target as HTMLSelectElement).value)}>
              <option value="">Fritt pass</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>

        {/* Övningslista */}
        <div class="exercise-section mb">
          {exercises.length === 0 ? (
            <Card>
              <EmptyState
                title="Inga övningar tillagda"
                message="Välj ett program ovan eller lägg till din första övning."
                action={<Button onClick={addExercise}>+ Lägg till övning</Button>}
              />
            </Card>
          ) : (
            <div class="exercise-cards-list">
              {exercises.map((ex, exIdx) => {
                const prev = previousPerformances[ex.exerciseId]
                const prevSets = prev?.setEntries ?? []
                const barWeight = barWeightFor(allExercises.find(e => e.id === ex.exerciseId)?.equipment)
                // En plattrad per distinkt vikt bland seten, så tre set på 82,5 ger en rad, inte tre
                const plateWeights = barWeight === null ? [] : Array.from(new Set(ex.setEntries.map(s => s.weight).filter(w => w > 0)))
                return (
                  <Card
                    key={exIdx}
                    class={`exercise-live-card mb ${draggedExerciseIndex === exIdx ? 'exercise-row-dragging' : ''}`}
                    data-exercise-index={exIdx}
                  >
                    <div class="exercise-live-header flex justify-between items-center mb-sm">
                      <div class="flex items-center gap-2 grow">
                        <button
                          type="button"
                          class="drag-handle"
                          aria-label="Flytta övning"
                          onPointerDown={e => startExerciseDrag(e, exIdx)}
                          onPointerMove={continueExerciseDrag}
                          onPointerUp={endExerciseDrag}
                          onPointerCancel={endExerciseDrag}
                        >
                          <span aria-hidden="true">⋮⋮</span>
                        </button>
                        <input
                          type="text"
                          value={ex.exerciseName}
                          onChange={(e: Event) => updateExerciseName(exIdx, (e.target as HTMLInputElement).value)}
                          placeholder="Övningsnamn..."
                          list="exercise-suggestions"
                          class="exercise-title-input"
                        />
                      </div>
                      <button
                        type="button"
                        class="btn-remove"
                        onClick={() => removeExercise(exIdx)}
                        aria-label="Ta bort övning"
                      >
                        <svg width="20" height="20" viewBox="0 0 19 19">
                          <use href={icon('trash-icon')} />
                        </svg>
                      </button>
                    </div>

                    {prev && (prevSets.length > 0 || prev.notes) && (
                      <div class="exercise-prev-banner mb-sm">
                        <span class="text-xs text-muted">
                          Förra gången ({formatDateShort(prev.date)}):{' '}
                          <strong>{formatSets(prevSets)}</strong>
                          {prev.notes && <span class="exercise-prev-notes"> · {prev.notes}</span>}
                        </span>
                      </div>
                    )}

                    <div class="set-rows-table-wrap">
                      <table class="set-rows-table">
                        <thead>
                          <tr>
                            <th class="col-type">Typ</th>
                            <th class="col-prev"><span class="prev-full">Föregående</span><span class="prev-compact">Förra</span></th>
                            <th class="col-kg">Kg</th>
                            <th class="col-reps">Reps</th>
                            <th class="col-rpe">RPE</th>
                            <th class="col-plate"></th>
                            <th class="col-check">Klar</th>
                            <th class="col-del"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {ex.setEntries.map((set, setIdx) => {
                            const prevSet = prevSets[setIdx]
                            const isCompleted = Boolean(set.completed)
                            const setType = set.type || 'normal'
                            const pickerOpen = rpePicker?.exIdx === exIdx && rpePicker.setIdx === setIdx
                            const typePickerOpen = typePicker?.exIdx === exIdx && typePicker.setIdx === setIdx
                            const isRecord = isRecordSet(ex.exerciseId, set)

                            const badgeLabel = setType === 'normal' ? `${setIdx + 1}` : SET_TYPE_LABELS[setType][0]
                            const weightKey = `${exIdx}:${setIdx}`

                            return (
                              <tr
                                key={setIdx}
                                class={`set-row ${isCompleted ? 'set-row-completed' : ''} set-type-${setType}`}
                              >
                                <td class="col-type">
                                  <button
                                    type="button"
                                    class={`set-type-badge badge-${setType}`}
                                    onClick={() => setTypePicker(typePickerOpen ? null : { exIdx, setIdx })}
                                    aria-expanded={typePickerOpen}
                                    aria-label={`Settyp: ${SET_TYPE_LABELS[setType]}, tryck för att ändra`}
                                  >
                                    {badgeLabel}
                                  </button>
                                </td>
                                {/* Telefonen visar den kompakta formen, desktop den fulla; CSS väljer */}
                                <td class="col-prev text-xs text-muted tabular-nums" aria-label={prevSet ? formatSet(prevSet) : undefined}>
                                  {prevSet ? <><span class="prev-full">{formatSet(prevSet)}</span><span class="prev-compact">{formatSetCompact(prevSet)}</span></> : '-'}
                                </td>
                                <td class="col-kg">
                                  <div class="input-with-steppers">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      enterKeyHint="next"
                                      value={weightDrafts[weightKey] ?? formatWeight(set.weight)}
                                      aria-label="Kg"
                                      onInput={(e: Event) => {
                                        const text = (e.target as HTMLInputElement).value
                                        setWeightDrafts(prev => ({ ...prev, [weightKey]: text }))
                                        const parsed = parseDecimal(text)
                                        updateSet(exIdx, setIdx, { weight: parsed !== null ? Math.max(0, Math.min(500, parsed)) : 0 })
                                      }}
                                      onBlur={() => setWeightDrafts(prev => {
                                        if (!(weightKey in prev)) return prev
                                        const next = { ...prev }
                                        delete next[weightKey]
                                        return next
                                      })}
                                      class="set-input"
                                    />
                                    <div class="stepper-buttons">
                                      <button type="button" onClick={() => adjustSetValues(exIdx, setIdx, 2.5, 0)}>+2,5</button>
                                      <button type="button" onClick={() => adjustSetValues(exIdx, setIdx, -2.5, 0)}>-2,5</button>
                                    </div>
                                  </div>
                                </td>
                                <td class="col-reps">
                                  <div class="input-with-steppers">
                                    <input
                                      type="number"
                                      min="1"
                                      max="100"
                                      inputMode="numeric"
                                      enterKeyHint="next"
                                      value={set.reps}
                                      aria-label="Reps"
                                      onChange={(e: Event) => updateSet(exIdx, setIdx, { reps: parseInt((e.target as HTMLInputElement).value, 10) || 1 })}
                                      class="set-input"
                                    />
                                    <div class="stepper-buttons">
                                      <button type="button" onClick={() => adjustSetValues(exIdx, setIdx, 0, 1)}>+1</button>
                                      <button type="button" onClick={() => adjustSetValues(exIdx, setIdx, 0, -1)}>-1</button>
                                    </div>
                                  </div>
                                </td>
                                <td class="col-rpe">
                                  <button
                                    type="button"
                                    class={`set-type-badge rpe-badge ${set.rpe ? 'rpe-set' : ''}`}
                                    aria-label={set.rpe ? `RPE ${formatWeight(set.rpe)}, ändra` : 'Välj RPE'}
                                    aria-expanded={pickerOpen}
                                    onClick={() => setRpePicker(pickerOpen ? null : { exIdx, setIdx })}
                                  >
                                    {set.rpe ? formatWeight(set.rpe) : '–'}
                                  </button>
                                </td>
                                <td class="col-plate">
                                  <button
                                    type="button"
                                    class="btn-calc"
                                    onClick={() => openPlateCalculator(set.weight, barWeight ?? 20, exIdx, setIdx)}
                                    title="Öppna plattkalkylator"
                                    aria-label="Plattkalkylator"
                                  >
                                    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                                      <use href={icon('barbell-icon')} />
                                    </svg>
                                  </button>
                                </td>
                                <td class="col-check">
                                  <button
                                    type="button"
                                    class={`btn-check-set ${isCompleted ? 'checked' : ''}`}
                                    onClick={() => toggleSetCompleted(exIdx, setIdx)}
                                    aria-label={isCompleted ? 'Markera som ej klar' : 'Markera som klar'}
                                    title={isRecord ? 'Nytt rekord för övningen' : undefined}
                                  >
                                    {isCompleted ? '✓' : ''}
                                    {isRecord && <span class="pr-badge" aria-label="Nytt rekord">PR</span>}
                                  </button>
                                </td>
                                <td class="col-del">
                                  <button
                                    type="button"
                                    class="btn-remove-sm"
                                    onClick={() => removeSet(exIdx, setIdx)}
                                    aria-label="Ta bort set"
                                  >
                                    ×
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {typePicker?.exIdx === exIdx && ex.setEntries[typePicker.setIdx] && (
                      <div class="rpe-picker mb-sm" role="group" aria-label={`Settyp för set ${typePicker.setIdx + 1}`}>
                        <span class="text-xs text-muted rpe-picker-label">Settyp set {typePicker.setIdx + 1}</span>
                        {SET_TYPE_ORDER.map(t => (
                          <button
                            key={t}
                            type="button"
                            class={`set-type-badge rpe-chip ${(ex.setEntries[typePicker.setIdx].type || 'normal') === t ? 'rpe-set' : ''}`}
                            onClick={() => { updateSet(exIdx, typePicker.setIdx, { type: t }); setTypePicker(null); triggerHaptic(20) }}
                          >
                            {SET_TYPE_LABELS[t]}
                          </button>
                        ))}
                      </div>
                    )}

                    {rpePicker?.exIdx === exIdx && ex.setEntries[rpePicker.setIdx] && (
                      <div class="rpe-picker mb-sm" role="group" aria-label={`RPE för set ${rpePicker.setIdx + 1}`}>
                        <span class="text-xs text-muted rpe-picker-label">RPE set {rpePicker.setIdx + 1}</span>
                        {rpeOptions.map(value => (
                          <button
                            key={value}
                            type="button"
                            class={`set-type-badge rpe-chip ${ex.setEntries[rpePicker.setIdx].rpe === value ? 'rpe-set' : ''}`}
                            onClick={() => { updateSet(exIdx, rpePicker.setIdx, { rpe: value }); setRpePicker(null); triggerHaptic(20) }}
                          >
                            {formatWeight(value)}
                          </button>
                        ))}
                        <button
                          type="button"
                          class="set-type-badge rpe-chip rpe-chip-none"
                          onClick={() => { updateSet(exIdx, rpePicker.setIdx, { rpe: undefined }); setRpePicker(null) }}
                        >
                          Ingen
                        </button>
                      </div>
                    )}

                    {/* Plattor per sida för stångövningar, ingen kalkylator behövs. Raden öppnar den om du vill byta stång. */}
                    {plateWeights.length > 0 && (
                      <div class="plate-lines mb-sm">
                        {plateWeights.map(w => (
                          <button
                            key={w}
                            type="button"
                            class="plate-line"
                            onClick={() => openPlateCalculator(w, barWeight ?? 20, exIdx, ex.setEntries.findIndex(s => s.weight === w))}
                          >
                            <span class="tabular-nums">{formatWeight(w)} kg:</span> {formatPlatesPerSide(w, barWeight ?? 20)}
                          </button>
                        ))}
                      </div>
                    )}

                    <div class="flex items-center gap-sm mt-sm flex-wrap">
                      <Button variant="secondary" size="sm" onClick={() => addSet(exIdx)}>
                        + Lägg till set
                      </Button>
                      {prevSets.length > ex.setEntries.length && (
                        <Button variant="secondary" size="sm" onClick={() => fillFromLast(exIdx)}>
                          Som förra gången
                        </Button>
                      )}
                      {ex.setEntries.some(s => s.type !== 'warmup' && s.weight > 0) && !ex.setEntries.some(s => s.type === 'warmup') && (
                        <Button variant="secondary" size="sm" onClick={() => addWarmup(exIdx)} title="Tre set på 40, 60 och 80 % av första arbetssetet">
                          Uppvärmning
                        </Button>
                      )}
                      <input
                        type="text"
                        class="exercise-notes-input grow"
                        value={ex.notes ?? ''}
                        placeholder="Anteckning"
                        aria-label="Anteckning för övningen"
                        onChange={(e: Event) => {
                          const newExs = [...exercises]
                          newExs[exIdx] = { ...ex, notes: (e.target as HTMLInputElement).value }
                          setExercises(newExs)
                        }}
                      />
                    </div>
                  </Card>
                )
              })}

              <Button variant="secondary" class="btn-block mt" onClick={addExercise}>
                + Lägg till övning
              </Button>
            </div>
          )}
        </div>

        {/* Slutför överst, resten av passets åtgärder under. Två knappar för samma sak förvirrade. */}
        <div class="mt mb-lg">
          <Button
            variant="primary"
            size="lg"
            class="btn-block"
            onClick={handleFinishSession}
            disabled={saving || totalSetsCount === 0}
          >
            {saving ? 'Sparar pass...' : 'Slutför och spara pass'}
          </Button>
          {totalSetsCount === 0 && !saving && (
            <p class="text-xs text-muted mt-1 m-0 log-session-hint">Lägg till minst ett set för att kunna spara passet.</p>
          )}
          <div class="flex gap-sm mt flex-wrap">
            {exercises.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => setCancelDialogOpen(true)}>
                Avbryt pass
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setShowSaveTemplate(v => !v)} disabled={exercises.length === 0}>
              {showSaveTemplate ? 'Dölj programsparning' : 'Spara som nytt program'}
            </Button>
          </div>
          {showSaveTemplate && (
            <Card class="mt">
              <form
                class="flex gap-sm items-end"
                onSubmit={e => {
                  e.preventDefault()
                  handleSaveAsTemplate()
                }}
              >
                <Field label="Programnamn" class="m-0 grow">
                  <input
                    type="text"
                    value={templateName}
                    onInput={(e: Event) => setTemplateName((e.target as HTMLInputElement).value)}
                    placeholder="T.ex. Bröst & Axlar tung"
                    autoFocus
                  />
                </Field>
                <Button type="submit" disabled={!templateName.trim() || exercises.length === 0}>
                  Spara program
                </Button>
              </form>
            </Card>
          )}
        </div>

        {saved && <div class="toast">Passet har sparats framgångsrikt!</div>}

        {/* Avbryt pass dialog */}
        {cancelDialogOpen && (
          <div class="dialog-overlay" onClick={() => setCancelDialogOpen(false)}>
            <div class="dialog" onClick={e => e.stopPropagation()}>
              <h3 class="m-0 mb-sm">Avbryt träningspass?</h3>
              <p>Om du avbryter rensas ditt påbörjade pass och ändringarna försvinner.</p>
              <div class="flex gap mt justify-end">
                <Button variant="secondary" onClick={() => setCancelDialogOpen(false)}>Fortsätt träna</Button>
                <Button variant="danger" onClick={handleCancelSession}>Avbryt pass</Button>
              </div>
            </div>
          </div>
        )}

        {/* Plattkalkylatorn monteras först när den öppnas: useState läser initialWeight bara vid första renderingen */}
        {plateCalcModal.isOpen && (
          <PlateCalculatorModal
            isOpen
            initialWeight={plateCalcModal.weight}
            initialBarWeight={plateCalcModal.barWeight}
            onClose={() => setPlateCalcModal(prev => ({ ...prev, isOpen: false }))}
            onApplyWeight={applyPlateCalculatorWeight}
          />
        )}
      </div>
    </div>
  )
}
