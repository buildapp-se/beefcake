import { useState, useEffect } from 'preact/hooks'
import { useLocation } from 'wouter'
import { getAllSessions, getActiveWorkout, getPRs, getWeeklyHardSetsPerMuscleGroup } from '../services/dataService'
import { formatDateWithWeekday, formatDateCompact, daysBetween, daysAgoText, todayISO, mondayISO } from '../lib/date'
import { classifyWeeklySets, SET_LOAD_LABELS } from '../lib/hypertrophy'
import { exercisesVolume } from '../lib/volume'
import { nextPrograms, type NextProgram } from '../lib/nextPrograms'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { useIsGuest } from '../components/LoginGate'
import { isCloudSyncConfigured } from '../services/cloudSyncService'
import { beefcakeStatusText, beefcakeStreak } from '../lib/streak'
import type { Session, ActiveWorkout } from '../models'

export function Home() {
  const guest = useIsGuest()
  const [, navigate] = useLocation()
  const [recentSessions, setRecentSessions] = useState<Session[]>([])
  const [greeting, setGreeting] = useState('')
  // De tre senast körda programmen, det som väntat längst först: det är nästa pass
  const [upcoming, setNextPrograms] = useState<NextProgram[]>([])
  const [totalSessions, setTotalSessions] = useState(0)
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkout | null>(null)
  // Veckan från måndag: pass, volym, nya PR (maxvikt eller maxvolym daterade i veckan) och set per muskelgrupp
  const [week, setWeek] = useState<{ sessions: number; volume: number; newPRs: number; groups: { muscleGroup: string; sets: number }[] }>({ sessions: 0, volume: 0, newPRs: 0, groups: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      setError(null)
      const monday = mondayISO()
      const [sessions, active, prs, groups] = await Promise.all([
        getAllSessions(),
        getActiveWorkout(),
        getPRs(),
        getWeeklyHardSetsPerMuscleGroup(monday)
      ])
      const weekSessions = sessions.filter(s => s.date >= monday)
      setWeek({
        sessions: weekSessions.length,
        volume: weekSessions.reduce((sum, s) => sum + exercisesVolume(s.exercises), 0),
        newPRs: prs.reduce((n, pr) => n + (pr.maxWeightDate >= monday ? 1 : 0) + (pr.maxVolumeDate >= monday ? 1 : 0), 0),
        groups
      })
      setRecentSessions(sessions.slice(0, 5))
      setGreeting(sessions.length === 0
        ? 'Välkommen till Beefcake\nLogga ditt första pass och se hur du utvecklas.'
        : beefcakeStatusText(beefcakeStreak(sessions.map(s => s.date), todayISO()), todayISO()))
      setTotalSessions(sessions.length)
      if (active && active.exercises.length > 0) {
        setActiveWorkout(active)
      } else {
        setActiveWorkout(null)
      }
      if (sessions.length > 0) {
        setNextPrograms(nextPrograms(sessions))
      }
    } catch (err) {
      setError('Kunde inte ladda data. Försök igen.')
      console.error('Fel vid laddning:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div>
        <Card class="skeleton skeleton-card mb"></Card>
        <div class="grid grid-3 mb">
          <Card class="skeleton skeleton-card"></Card>
          <Card class="skeleton skeleton-card"></Card>
          <Card class="skeleton skeleton-card"></Card>
        </div>
        <Card class="skeleton skeleton-card"></Card>
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
      {(guest || !isCloudSyncConfigured()) && <div class="home-greeting">
        <h1>{greeting.split('\n')[0]}</h1>
        <p>{greeting.split('\n').slice(1).join(' ')}</p>
      </div>}
      {activeWorkout && (
        <Card class="mb active-workout-card">
          <div class="flex justify-between items-center flex-wrap gap-sm">
            <div>
              <span class="active-workout-label">Pågående pass</span>
              <h3 class="m-0">{activeWorkout.templateName}</h3>
              <p class="text-xs text-muted m-0 mt-1">
                {activeWorkout.exercises.length} övningar påbörjade · Startat {formatDateCompact(activeWorkout.date)}
              </p>
            </div>
            <Button
              variant="primary"
              size="lg"
              onClick={() => navigate('/log')}
            >
              Fortsätt passet
            </Button>
          </div>
        </Card>
      )}

      {/* Utan mallar har kortet inget innehåll: tomma kortet ersätts av CTA:n i "Senaste pass". */}
      {upcoming.length > 0 && (
      <Card class="next-programs-card">
        <h2 class="m-0 mb-sm">Nästa pass</h2>
        {upcoming.map((p) => (
          <button type="button" class="next-program-row" key={p.name} onClick={() => navigate(`/log?template=${encodeURIComponent(p.name)}`)}>
            <span><strong>{p.name}</strong><small>{daysAgoText(daysBetween(p.date, todayISO()))}</small></span>
            <span aria-hidden="true">›</span>
          </button>
        ))}
      </Card>
      )}

      {guest && recentSessions.length === 0 && (
        <Card class="demo-card">
          <p class="m-0 mb-sm">Så här visas ett sparat pass. Dina egna pass som gäst sparas på den här enheten.</p>
          <div class="session-summary-row"><span><strong>Exempel: Helkropp</strong><small>3 övningar · 8 set</small></span><strong>1 840 kg</strong></div>
          <Button href="/templates" variant="secondary" size="sm">Välj ett program</Button>
        </Card>
      )}

      <section class="home-week-summary" aria-label="Denna vecka">
        <span>Denna vecka</span>
        <strong>{week.sessions} pass · {totalSessions} totalt</strong>
        {week.sessions > 0 && <p>{week.volume.toLocaleString('sv-SE')} kg · {week.newPRs === 1 ? '1 nytt PR' : `${week.newPRs} nya PR`}</p>}
        {week.groups.length > 0 && <div class="week-sets-chips" role="list" aria-label="Set per muskelgrupp denna vecka">
          {week.groups.map(mg => {
            const load = classifyWeeklySets(mg.sets)
            return <span class={`week-sets-chip load-${load}`} role="listitem" key={mg.muscleGroup} title={`${mg.muscleGroup}: ${mg.sets} set, ${SET_LOAD_LABELS[load]}`}>
              {mg.muscleGroup} <strong class="tabular-nums">{mg.sets}</strong>
            </span>
          })}
        </div>}
      </section>

      <Card padding="none">
        <div class="flex justify-between items-center mb-sm" style="padding: var(--space-6) var(--space-6) var(--space-2) var(--space-6)">
          <h2 class="m-0">Senaste pass</h2>
          <Button href="/log" variant="secondary" size="sm">Logga nytt</Button>
        </div>

        {recentSessions.length === 0 ? (
          <EmptyState
            title="Inga pass loggade ännu"
            message="Börja med att skapa ett program och logga ditt första pass."
            action={<Button href="/templates">Skapa program</Button>}
          />
        ) : (
          <>
          <div class="home-session-list">
            {recentSessions.map(session => (
              <button type="button" class="session-summary-row" key={session.id} onClick={() => navigate(`/history/${session.id}`)}>
                <span><strong>{session.templateName}</strong><small>{formatDateCompact(session.date)} · {session.exercises.length} övningar</small></span>
                <strong>{exercisesVolume(session.exercises).toLocaleString('sv-SE')} kg</strong>
              </button>
            ))}
          </div>
          <div class="table-wrap table-rows home-session-table" style="padding: 0 var(--space-6) var(--space-6) var(--space-6)">
            <table>
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Pass</th>
                  <th>Övningar</th>
                  <th>Total volym</th>
                </tr>
              </thead>
              <tbody>
                {recentSessions.map((session) => {
                  const sessionVolume = exercisesVolume(session.exercises)
                  return (
                    <tr
                      key={session.id}
                      onClick={() => navigate(`/history/${session.id}`)}
                    >
                      <td>{formatDateWithWeekday(session.date)}</td>
                      <td><span class="badge badge-primary">{session.templateName}</span></td>
                      <td>{session.exercises.length}</td>
                      <td class="volume-hero">{sessionVolume.toLocaleString('sv-SE')} kg</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>
    </div>
  )
}
