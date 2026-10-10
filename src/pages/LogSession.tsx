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
  getExerciseRecords,
  getExerciseHistory,
  saveExerciseProgression
} from '../services/dataService'
import { startRestTimer, triggerHaptic } from '../services/timerService'
import { formatDateShort } from '../lib/date'
import { formatSet, formatSetCompact, formatSets, formatWeight, parseDecimal } from '../lib/format'
import { barWeightFor, formatPlatesPerSide } from '../lib/plates'
import { epley1RM } from '../lib/exerciseMetrics'
import { warmupSets } from '../lib/warmup'
import { calibrationTarget, isPlateau, nextStep, plateauLength, reachedTarget, stepFor, topSet } from '../lib/progression'
import { setsVolume } from '../lib/volume'
import { getDB, todayISO, nowISO } from '../models'
import { icon } from '../icons'
import { useLocation } from 'wouter'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { Field } from '../components/Field'
import { PlateCalculatorModal } from '../components/PlateCalculator'
import { RestTimer } from '../components/RestTimer'
import { PlateauDialog, type PlateauChoice, type PlateauItem } from '../components/PlateauDialog'
import { Celebration } from '../components/Celebration'
import { beefcakeImage, useBeefcakeStreak } from '../components/BeefcakeBadge'
import { isCloudSyncConfigured } from '../services/cloudSyncService'
import { announceGuestSave, useIsGuest } from '../components/LoginGate'
import type { Template, Exercise, ExerciseProgression, TemplateExercise, SetEntry, ActiveSetEntry, SetType } from '../models'

// Knapptext för ett förslag: vikten, eller repsen när det är bara kroppen
function targetLabel(target: { weight: number; reps: number }): string {
  return target.weight > 0 ? `${formatWeight(target.weight)} kg` : `${target.reps} reps`
}

// Höjningsfrågan ställs en gång per pass: datum och program, sparat per enhet så en omladdning inte frågar igen
const PLATEAU_ASKED_KEY = 'plateau-asked'

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
  const guest = useIsGuest()
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
  const [activeExerciseIndex, setActiveExerciseIndex] = useState(0)
  const [focusedSet, setFocusedSet] = useState<{ exIdx: number; setIdx: number } | null>(null)
  const [setMenuOpen, setSetMenuOpen] = useState(false)
  const [exerciseMenuOpen, setExerciseMenuOpen] = useState<number | null>(null)
  const [notesOpen, setNotesOpen] = useState<number | null>(null)
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
  // Kg och reps som fritext medan man skriver: value={set.weight} skulle nolla ett nyss skrivet
  // kommatecken vid omrendering (kontrollerat fält, `<input type="number">` följer dessutom
  // webbläsarens lokal för decimaltecken och godkänner bara komma ELLER punkt), och reps gick
  // inte att tömma, ett tomt fält skrevs genast om till 1. Nyckel "kg:exIdx:setIdx" eller "reps:exIdx:setIdx".
  const [inputDrafts, setInputDrafts] = useState<Record<string, string>>({})
  function dropDraft(key: string) {
    setInputDrafts(prev => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  // Övningar på platå som dialogen "Vill du höja?" listar, null när den är stängd
  const [plateauItems, setPlateauItems] = useState<PlateauItem[] | null>(null)
  const plateauCheckedRef = useRef('')
  const [celebrating, setCelebrating] = useState(false)
  // Cartman visas bara inloggad, i den nivå kedjan ger just nu
  const beefcakeLevel = useBeefcakeStreak().level
  const showCartman = isCloudSyncConfigured() && !guest

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
      const exerciseParam = urlParams.get('exercise')
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
      // Explicit "Lägg till i pass" från övningsdatabasen. Pågående utkast behålls.
      else if (exerciseParam) {
        const existing = es.find(e => e.name.trim().toLocaleLowerCase('sv-SE') === exerciseParam.trim().toLocaleLowerCase('sv-SE'))
        const added: LogFormExercise = { exerciseId: existing?.id || `new-${Date.now()}`, exerciseName: existing?.name || exerciseParam, setEntries: [] }
        const draftExercises = activeDraft?.exercises.some(e => e.setEntries.length > 0) ? activeDraft.exercises : []
        setExercises([...draftExercises, added])
        setActiveExerciseIndex(draftExercises.length)
        if (activeDraft && draftExercises.length > 0) {
          setSelectedTemplateId(activeDraft.templateId)
          setDate(activeDraft.date)
          setStartTime(activeDraft.startTime)
        }
        if (existing) void fetchPreviousPerformances([existing.id])
      }
      // Priority 3: ett faktiskt påbörjat utkast i IndexedDB
      else if (activeDraft && activeDraft.exercises.some(e => e.setEntries.length > 0)) {
        setSelectedTemplateId(activeDraft.templateId)
        setDate(activeDraft.date || todayISO())
        setStartTime(activeDraft.startTime || nowISO())
        setExercises(activeDraft.exercises)
        setActiveExerciseIndex(Math.max(0, activeDraft.exercises.findIndex(e => e.setEntries.some(s => !s.completed))))
        void fetchPreviousPerformances(activeDraft.exercises.map(e => e.exerciseId))
      }

      if (fromSessionId || templateParam || exerciseParam || requestedDate) {
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
    setActiveExerciseIndex(0)
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
    setInputDrafts({})
  }, [selectedTemplateId])

  // Auto-save to activeWorkout whenever exercises or settings change (after initial load)
  useEffect(() => {
    // Ett fel visar felsidan med tom övningslista: det är inte ett tomt pass, utkastet får ligga kvar
    if (isInitialLoadRef.current || loading || error) return

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
  }, [exercises, date, selectedTemplateId, startTime, loading, templates, error])

  // Platå: när ett pass öppnas och minst en övning stått still i PLATEAU_SESSIONS pass frågar
  // dialogen en gång. En övning med ett väntande förslag frågas inte om igen.
  const plateauKey = `${date}|${selectedTemplateId}`
  const knownExerciseIds = exercises.map(e => e.exerciseId).filter(id => id && !id.startsWith('new-')).join(',')
  useEffect(() => {
    if (loading || !knownExerciseIds || plateauCheckedRef.current === plateauKey) return
    plateauCheckedRef.current = plateauKey
    let cancelled = false
    void (async () => {
      const asked = await (await getDB()).get('settings', PLATEAU_ASKED_KEY)
      if (asked?.value === plateauKey) return
      const items: PlateauItem[] = []
      for (const id of knownExerciseIds.split(',')) {
        const meta = allExercises.find(e => e.id === id)
        const history = await getExerciseHistory(id)
        const bodyweight = meta?.kind === 'bodyweight'
        const top = topSet(history[history.length - 1]?.setEntries ?? [], bodyweight)
        if (!meta || !top || meta.progression?.next || !isPlateau(history, { kind: meta.kind, holdAt: meta.progression?.holdAt })) continue
        items.push({ exerciseId: id, name: meta.name, weight: top.weight, reps: top.reps, run: plateauLength(history, bodyweight), step: stepFor(meta.equipment, meta.name) })
      }
      if (!cancelled && items.length > 0) setPlateauItems(items)
    })().catch(err => console.error('Kunde inte läsa platåer:', err))
    return () => { cancelled = true }
  }, [loading, knownExerciseIds, plateauKey])

  function setProgression(exerciseId: string, progression: ExerciseProgression) {
    setAllExercises(prev => prev.map(e => {
      if (e.id !== exerciseId) return e
      const next: Exercise = { ...e }
      delete next.progression
      if (progression.holdAt !== undefined || progression.next) next.progression = progression
      return next
    }))
    // Synkfel visas av synkbannern; valet ligger redan lokalt
    saveExerciseProgression(exerciseId, progression).catch(err => console.error('Kunde inte spara höjningsförslaget:', err))
  }

  function handlePlateauChoice(choice: PlateauChoice, heldIds: string[]) {
    const items = plateauItems ?? []
    setPlateauItems(null)
    void getDB().then(db => db.put('settings', { key: PLATEAU_ASKED_KEY, value: plateauKey })).catch(() => undefined)
    for (const item of items.filter(i => heldIds.includes(i.exerciseId))) setProgression(item.exerciseId, { holdAt: item.weight })
    const chosen = items.filter(i => !heldIds.includes(i.exerciseId))
    if (choice === 'step') {
      for (const item of chosen) setProgression(item.exerciseId, { next: nextStep(item, item.step) })
    }
    if (choice === 'test') {
      // AMRAP-setet först bland arbetsseten, efter eventuell uppvärmning, på samma vikt som nu
      setExercises(current => current.map(ex => {
        const item = chosen.find(i => i.exerciseId === ex.exerciseId)
        if (!item || ex.setEntries.some(s => s.calibration)) return ex
        const firstWork = ex.setEntries.findIndex(s => s.type !== 'warmup')
        const at = firstWork === -1 ? ex.setEntries.length : firstWork
        const amrap: ActiveSetEntry = { sets: 1, reps: item.reps, weight: item.weight, completed: false, type: 'failure', calibration: true }
        return { ...ex, setEntries: [...ex.setEntries.slice(0, at), amrap, ...ex.setEntries.slice(at)] }
      }))
      const first = exercises.findIndex(ex => chosen.some(i => i.exerciseId === ex.exerciseId))
      if (first !== -1) setActiveExerciseIndex(first)
    }
  }

  // Förra passets toppset. Kroppsviktsövningar räknar även 0 kg (bara kroppen).
  function previousTop(exerciseId: string) {
    const bodyweight = allExercises.find(e => e.id === exerciseId)?.kind === 'bodyweight'
    return topSet(previousPerformances[exerciseId]?.setEntries ?? [], bodyweight)
  }

  // Övningens vanliga reps och steg: det AMRAP-setet räknas mot
  function calibrationResult(ex: LogFormExercise, set: ActiveSetEntry) {
    const meta = allExercises.find(e => e.id === ex.exerciseId)
    const usualReps = previousTop(ex.exerciseId)?.reps ?? set.reps
    return calibrationTarget(set.weight, set.reps, usualReps, stepFor(meta?.equipment, ex.exerciseName))
  }

  // Antal arbetsset förra gången: raderna på toppvikten. Pass ur Excel-seeden har en rad med sets: 3.
  function previousWorkSetCount(exerciseId: string): number {
    const prevSets = previousPerformances[exerciseId]?.setEntries ?? []
    const prevTop = previousTop(exerciseId)
    return prevSets.filter(s => s.weight === prevTop?.weight).reduce((sum, s) => sum + (s.sets || 1), 0)
  }

  // Ett förslag på ett obockat set: vikten byts, och utan vikt (bara kroppen) är det repsen som höjs
  function applyTarget(s: ActiveSetEntry, target: { weight: number; reps: number }): ActiveSetEntry {
    return target.weight === 0 ? { ...s, weight: 0, reps: target.reps } : { ...s, weight: target.weight }
  }

  // Obockade arbetsset: det som "Ta förslaget" och "Resten på" får byta vikt på
  function isOpenWorkSet(s: ActiveSetEntry): boolean {
    return !s.completed && s.type !== 'warmup' && !s.calibration
  }

  // "Resten på N kg" efter testsetet: resten av dagens set på testets vikt och de vanliga repsen.
  // Tar du en höjning i dag är passet loggat på nya vikten, så förslaget till nästa gång rensas.
  function fillAfterTest(exerciseIdx: number) {
    const ex = exercises[exerciseIdx]
    const test = ex.setEntries.find(s => s.calibration)
    const meta = allExercises.find(e => e.id === ex.exerciseId)
    if (!test) return
    const result = calibrationResult(ex, test)
    const setEntries: ActiveSetEntry[] = ex.setEntries.some(isOpenWorkSet)
      ? ex.setEntries.map(s => isOpenWorkSet(s) ? applyTarget(s, result) : s)
      : [...ex.setEntries, ...Array.from({ length: Math.max(1, previousWorkSetCount(ex.exerciseId) - 1) }, () => ({ sets: 1, reps: result.reps, weight: result.weight, completed: false, type: 'normal' as const }))]
    const newExercises = [...exercises]
    newExercises[exerciseIdx] = { ...ex, setEntries }
    setExercises(newExercises)
    setInputDrafts({})
    if (meta && result.passed) setProgression(meta.id, { holdAt: meta.progression?.holdAt })
    triggerHaptic(20)
  }

  // "Ta förslaget": vikten sätts på de arbetsset som är kvar, eller läggs in som lika många set som förra gången
  function takeSuggestion(exerciseIdx: number) {
    const ex = exercises[exerciseIdx]
    const meta = allExercises.find(e => e.id === ex.exerciseId)
    const next = meta?.progression?.next
    if (!meta || !next) return
    const setEntries: ActiveSetEntry[] = ex.setEntries.length === 0
      ? Array.from({ length: Math.max(1, previousWorkSetCount(ex.exerciseId)) }, () => ({ sets: 1, reps: next.reps, weight: next.weight, completed: false, type: 'normal' as const }))
      : ex.setEntries.map(s => isOpenWorkSet(s) ? applyTarget(s, next) : s)
    const newExercises = [...exercises]
    newExercises[exerciseIdx] = { ...ex, setEntries }
    setExercises(newExercises)
    setInputDrafts({})
    setProgression(meta.id, { holdAt: meta.progression?.holdAt })
    triggerHaptic(20)
  }

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
    setActiveExerciseIndex(0)
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

    // Testsetet bockat: nästa pass vikt sparas som förslag. Avbockat igen: förslaget tas bort.
    const meta = allExercises.find(e => e.id === ex.exerciseId)
    if (currentSet.calibration && meta) {
      const result = calibrationResult(ex, currentSet)
      const passed = nextCompleted && result.passed
      setProgression(meta.id, passed ? { next: { weight: result.weight, reps: result.reps } } : {})
      if (passed) setCelebrating(true)
    }

    if (nextCompleted) {
      // Rekordet får den långa vibrationen, samma som när passet sparas
      triggerHaptic(isRecordSet(ex.exerciseId, newSetEntries[setIdx]) ? [60, 40, 100] : 50)
      startRestTimer()
      // Efter testsetet stannar kortet öppet: resultatet och "Resten på N kg" står där
      if (!currentSet.calibration && newSetEntries.every(s => s.completed)) {
        const nextIndex = newExercises.findIndex((candidate, index) => index > exerciseIdx && (candidate.setEntries.length === 0 || candidate.setEntries.some(s => !s.completed)))
        if (nextIndex !== -1) setActiveExerciseIndex(nextIndex)
      }
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
    // Stegknappen sätter värdet direkt: en kvarvarande draft (mitt i skrivandet) ska inte överskugga den
    if (deltaWeight !== 0) dropDraft(`kg:${exerciseIdx}:${setIdx}`)
    if (deltaReps !== 0) dropDraft(`reps:${exerciseIdx}:${setIdx}`)
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
    setActiveExerciseIndex(exercises.length)
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
    setActiveExerciseIndex(current => current >= idx ? Math.max(0, current - 1) : current)
  }

  function addSet(exerciseIdx: number) {
    const ex = exercises[exerciseIdx]
    const lastSet = ex.setEntries[ex.setEntries.length - 1]
    // Nytt set: dagens sista set vinner (du ändrade 40 till 60 och vill ha 60 på nästa), annars förra
    // passets första set, annars programmets standardvärden (det enda stället de används sedan
    // nollsetstarten). Förra passets hela trappa hämtas med "Som förra gången", inte set för set.
    const prevSets = previousPerformances[ex.exerciseId]?.setEntries
    const programDefault = templates.find(t => t.id === selectedTemplateId)?.exercises.find(te => te.exerciseId === ex.exerciseId)?.defaultSetEntry
    // Efter ett bockat testset gäller testets vikt och de vanliga repsen, inte en kopia av testsetet
    const ref = lastSet?.calibration && lastSet.completed ? calibrationResult(ex, lastSet) : lastSet ?? prevSets?.[0] ?? programDefault
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
    setFocusedSet({ exIdx: exerciseIdx, setIdx: ex.setEntries.length })
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
    setActiveExerciseIndex(toIndex)
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
      // Gästen påminns efter varje pass: passen finns bara på enheten tills ett konto skapas
      if (guest) announceGuestSave()
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
          <div class="log-title-row">
            <h1 class="page-title m-0">{exercises.length > 0 ? (templates.find(t => t.id === selectedTemplateId)?.name || 'Fritt pass') : 'Logga pass'}</h1>
            {exercises.length > 0 && <details class="log-actions-menu">
              <summary aria-label="Fler passåtgärder">⋯</summary>
              <div class="log-actions-list">
                <button type="button" onClick={() => setShowSaveTemplate(v => !v)}>{showSaveTemplate ? 'Dölj programsparning' : 'Spara som nytt program'}</button>
                <button type="button" class="text-danger" onClick={() => setCancelDialogOpen(true)}>Avbryt pass</button>
              </div>
            </details>}
          </div>
          {exercises.length > 0 && (
            <span class="text-xs text-muted">
              {completedSetsCount} av {totalSetsCount} set klara • Lyft volym: {totalVolume.toLocaleString('sv-SE')} kg
            </span>
          )}
          {exercises.length > 0 && <div class="log-progress" role="progressbar" aria-label="Klara set" aria-valuenow={completedSetsCount} aria-valuemin={0} aria-valuemax={totalSetsCount || 1}>
            <span style={{ width: `${totalSetsCount ? completedSetsCount / totalSetsCount * 100 : 0}%` }} />
          </div>}
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
                const exerciseMeta = allExercises.find(e => e.id === ex.exerciseId)
                const barWeight = barWeightFor(exerciseMeta?.equipment)
                const prevTop = previousTop(ex.exerciseId)
                const bodyweight = exerciseMeta?.kind === 'bodyweight'
                const suggestion = exerciseMeta?.progression?.next
                const calibrationSet = ex.setEntries.find(s => s.calibration)
                const calibrated = calibrationSet?.completed ? calibrationResult(ex, calibrationSet) : null
                // En plattrad per distinkt vikt bland seten, så tre set på 82,5 ger en rad, inte tre
                const plateWeights = barWeight === null ? [] : Array.from(new Set(ex.setEntries.map(s => s.weight).filter(w => w > 0)))
                const expanded = activeExerciseIndex === exIdx
                const doneCount = ex.setEntries.filter(s => s.completed).length
                return (
                  <Card
                    key={exIdx}
                    class={`exercise-live-card mb ${draggedExerciseIndex === exIdx ? 'exercise-row-dragging' : ''}`}
                    data-exercise-index={exIdx}
                  >
                    <button type="button" class="exercise-collapse-toggle" aria-expanded={expanded} onClick={() => setActiveExerciseIndex(exIdx)}>
                      <span>{ex.exerciseName || 'Ny övning'}</span>
                      <span>{doneCount} av {ex.setEntries.length} klara</span>
                    </button>
                    <div class={expanded ? 'exercise-live-body' : 'exercise-live-body exercise-live-body-collapsed'}>
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
                      <button type="button" class="exercise-more-button" aria-label={`Fler val för ${ex.exerciseName}`} aria-expanded={exerciseMenuOpen === exIdx} onClick={() => setExerciseMenuOpen(exerciseMenuOpen === exIdx ? null : exIdx)}>⋯</button>
                    </div>
                    {exerciseMenuOpen === exIdx && <div class="exercise-options">
                      <button type="button" onClick={() => { setNotesOpen(exIdx); setExerciseMenuOpen(null) }}>Anteckning</button>
                      <button type="button" class="text-danger" onClick={() => { removeExercise(exIdx); setExerciseMenuOpen(null) }}>Ta bort övning</button>
                    </div>}

                    {prev && (prevSets.length > 0 || prev.notes) && (
                      <div class="exercise-prev-banner mb-sm">
                        <span class="text-xs text-muted">
                          Förra gången ({formatDateShort(prev.date)}):{' '}
                          <strong>{formatSets(prevSets)}</strong>
                          {prev.notes && <span class="exercise-prev-notes"> · {prev.notes}</span>}
                        </span>
                      </div>
                    )}

                    {bodyweight && <p class="text-xs text-muted m-0 mb-sm">Kg är extra vikt, 0 är bara kroppen.</p>}
                    {suggestion && !calibrationSet && (!prevTop || !reachedTarget(prevTop, suggestion)) && (
                      <div class="progression-line mb-sm">
                        <span>Förslag: <strong class="tabular-nums">{formatSet(suggestion)}</strong></span>
                        <Button size="sm" onClick={() => takeSuggestion(exIdx)}>Ta {targetLabel(suggestion)}</Button>
                        <Button size="sm" variant="secondary" onClick={() => setProgression(ex.exerciseId, { holdAt: exerciseMeta?.progression?.holdAt })}>Nej tack</Button>
                      </div>
                    )}
                    {calibrationSet && (
                      <div class="progression-line mb-sm" role="status">
                        {!calibrationSet.completed
                          ? <span>Testset: så många reps du klarar med god form. På stång: stanna när nästa rep känns osäker. Skriv antalet och bocka av.</span>
                          : calibrated?.passed
                            ? <span><strong>{calibrationSet.reps} reps! Du klarade det.</strong> Nytt mål: <strong class="tabular-nums">{formatSet(calibrated)}</strong></span>
                            : <span><strong>{calibrationSet.reps} reps.</strong> Du ligger rätt: stanna på {calibrated ? formatSet(calibrated) : ''} en gång till.</span>}
                        {calibrated && (!ex.setEntries.some(s => !s.calibration && s.type !== 'warmup') || ex.setEntries.some(s => isOpenWorkSet(s) && (s.weight !== calibrated.weight || (calibrated.weight === 0 && s.reps !== calibrated.reps)))) && (
                          <Button size="sm" onClick={() => fillAfterTest(exIdx)}>Resten på {targetLabel(calibrated)}</Button>
                        )}
                      </div>
                    )}

                    <div class="set-rows-table-wrap">
                      <table class="set-rows-table">
                        <thead>
                          <tr>
                            <th class="col-type">Set</th>
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
                            const weightKey = `kg:${exIdx}:${setIdx}`
                            const repsKey = `reps:${exIdx}:${setIdx}`

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
                                      value={inputDrafts[weightKey] ?? formatWeight(set.weight)}
                                      aria-label="Kg"
                                      placeholder={prevSet ? formatWeight(prevSet.weight) : undefined}
                                      onFocus={() => { setFocusedSet({ exIdx, setIdx }); setSetMenuOpen(false) }}
                                      onInput={(e: Event) => {
                                        const text = (e.target as HTMLInputElement).value
                                        setInputDrafts(prev => ({ ...prev, [weightKey]: text }))
                                        const parsed = parseDecimal(text)
                                        updateSet(exIdx, setIdx, { weight: parsed !== null ? Math.max(0, Math.min(500, parsed)) : 0 })
                                      }}
                                      onBlur={() => dropDraft(weightKey)}
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
                                      type="text"
                                      inputMode="numeric"
                                      enterKeyHint="next"
                                      value={inputDrafts[repsKey] ?? String(set.reps)}
                                      aria-label="Reps"
                                      placeholder={prevSet ? String(prevSet.reps) : undefined}
                                      onFocus={() => { setFocusedSet({ exIdx, setIdx }); setSetMenuOpen(false) }}
                                      onInput={(e: Event) => {
                                        const text = (e.target as HTMLInputElement).value
                                        setInputDrafts(prev => ({ ...prev, [repsKey]: text }))
                                        // Tomt eller 0 sparas inte: fältet går tillbaka till förra värdet när det lämnas
                                        const reps = Number.parseInt(text, 10)
                                        if (reps >= 1) updateSet(exIdx, setIdx, { reps: Math.min(100, reps) })
                                      }}
                                      onBlur={() => dropDraft(repsKey)}
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
                                    {set.rpe ? formatWeight(set.rpe) : 'Saknas'}
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
                                    onClick={() => { setFocusedSet({ exIdx, setIdx }); toggleSetCompleted(exIdx, setIdx) }}
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
                    {focusedSet?.exIdx === exIdx && ex.setEntries[focusedSet.setIdx] && (
                      <div class="mobile-set-tools" role="group" aria-label={`Ändra set ${focusedSet.setIdx + 1}`}>
                        <button type="button" onClick={() => adjustSetValues(exIdx, focusedSet.setIdx, -2.5, 0)}>−2,5</button>
                        <button type="button" onClick={() => adjustSetValues(exIdx, focusedSet.setIdx, 2.5, 0)}>+2,5</button>
                        <button type="button" onClick={() => adjustSetValues(exIdx, focusedSet.setIdx, 0, -1)}>−1</button>
                        <button type="button" onClick={() => adjustSetValues(exIdx, focusedSet.setIdx, 0, 1)}>+1</button>
                        <button type="button" class="mobile-set-more" aria-expanded={setMenuOpen} onClick={() => setSetMenuOpen(open => !open)} aria-label="Fler setval">⋯</button>
                        {setMenuOpen && (
                          <div class="mobile-set-menu">
                            <button type="button" onClick={() => { setTypePicker({ exIdx, setIdx: focusedSet.setIdx }); setSetMenuOpen(false) }}>Settyp</button>
                            <button type="button" onClick={() => { setRpePicker({ exIdx, setIdx: focusedSet.setIdx }); setSetMenuOpen(false) }}>RPE</button>
                            <button type="button" class="text-danger" onClick={() => { removeSet(exIdx, focusedSet.setIdx); setFocusedSet(null); setSetMenuOpen(false) }}>Ta bort set</button>
                          </div>
                        )}
                      </div>
                    )}

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
                      {(ex.notes || notesOpen === exIdx) && <input
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
                      />}
                    </div>
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

        {plateauItems && <PlateauDialog items={plateauItems} image={showCartman ? beefcakeImage(beefcakeLevel, 'plateau') : null} onChoose={handlePlateauChoice} />}
        {celebrating && <Celebration image={showCartman ? beefcakeImage(beefcakeLevel, 'celebrate') : null} onDone={() => setCelebrating(false)} />}

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
