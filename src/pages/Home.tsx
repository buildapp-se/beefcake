import { useState, useEffect } from 'preact/hooks'
import { useLocation } from 'wouter'
import { getAllSessions, getAllTemplates, getActiveWorkout, getPRs, getWeeklyHardSetsPerMuscleGroup } from '../services/dataService'
import { formatDateWithWeekday, daysBetween, daysAgoText, todayISO, mondayISO } from '../lib/date'
import { classifyWeeklySets, SET_LOAD_LABELS } from '../lib/hypertrophy'
import { exercisesVolume } from '../lib/volume'
import { nextPrograms, type NextProgram } from '../lib/nextPrograms'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { Stat } from '../components/Stat'
import { EmptyState } from '../components/EmptyState'
import type { Session, ActiveWorkout } from '../models'

export function Home() {
  const [, navigate] = useLocation()
  const [recentSessions, setRecentSessions] = useState<Session[]>([])
  // De tre senast körda programmen, det som väntat längst först: det är nästa pass
  const [upcoming, setNextPrograms] = useState<NextProgram[]>([])
  const [templateCount, setTemplateCount] = useState(0)
  const [totalSessions, setTotalSessions] = useState(0)
  const [monthSessions, setMonthSessions] = useState(0)
  const [lastWorkout, setLastWorkout] = useState<string | null>(null)
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
      const [sessions, allTemplates, active, prs, groups] = await Promise.all([
        getAllSessions(),
        getAllTemplates(),
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
      setTemplateCount(allTemplates.length)
      setTotalSessions(sessions.length)
      setMonthSessions(sessions.filter(s => s.date.startsWith(todayISO().slice(0, 7))).length)
      if (active && active.exercises.length > 0) {
        setActiveWorkout(active)
      } else {
        setActiveWorkout(null)
      }
      if (sessions.length > 0) {
        setLastWorkout(sessions[0].date)
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
      {/* Ingen rubrik "Översikt": headern säger redan Beefcake, och Cartman står ovanför.
          Påminnelsen om latmasken ligger i Cartmans andra rad (src/lib/streak.ts). */}
      {activeWorkout && (
        <Card class="mb active-workout-card">
          <div class="flex justify-between items-center flex-wrap gap-sm">
            <div>
              <span class="badge badge-primary mb-1">⚡ Pågående pass</span>
              <h3 class="m-0">{activeWorkout.templateName}</h3>
              <p class="text-xs text-muted m-0 mt-1">
                {activeWorkout.exercises.length} övningar påbörjade • Startat {formatDateWithWeekday(activeWorkout.date)}
              </p>
            </div>
            <Button
              variant="primary"
              size="lg"
              onClick={() => navigate('/log')}
            >
              Återuppta pass
            </Button>
          </div>
        </Card>
      )}

      {/* Utan mallar har kortet inget innehåll: tomma kortet ersätts av CTA:n i "Senaste pass". */}
      {upcoming.length > 0 && (
      <Card>
        <h2 class="m-0 mb-sm">Nästa pass</h2>
        {upcoming.map((p, i) => (
          <div class="mb-sm" key={p.name}>
            <Button
              variant={i === 0 ? 'primary' : 'secondary'}
              size="lg"
              class="btn-block"
              onClick={() => navigate(`/log?template=${encodeURIComponent(p.name)}`)}
            >
              Kör "{p.name}" igen
            </Button>
            <p class="text-xs text-muted text-center m-0 mt-1">senast {daysAgoText(daysBetween(p.date, todayISO()))}</p>
          </div>
        ))}
      </Card>
      )}

      {/* Veckans summering som text, inte graf. Tom vecka får en rad, ingen EmptyState. */}
      <Card>
        <h2 class="m-0 mb-sm">Denna vecka</h2>
        {week.sessions === 0 ? (
          <p class="text-muted m-0">Inga pass än denna vecka</p>
        ) : (
          <>
            <p class="m-0 mb-sm tabular-nums">
              {week.sessions} pass · {week.volume.toLocaleString('sv-SE')} kg · {week.newPRs === 1 ? '1 nytt PR' : `${week.newPRs} nya PR`}
            </p>
            <div class="week-sets-chips" role="list" aria-label="Set per muskelgrupp denna vecka">
              {week.groups.map(mg => {
                const load = classifyWeeklySets(mg.sets)
                return (
                  <span class={`week-sets-chip load-${load}`} role="listitem" key={mg.muscleGroup} title={`${mg.muscleGroup}: ${mg.sets} set, ${SET_LOAD_LABELS[load]}`}>
                    {mg.muscleGroup} <strong class="tabular-nums">{mg.sets}</strong>
                  </span>
                )
              })}
            </div>
          </>
        )}
      </Card>

      <div class="grid grid-3 mb">
        <Card padding="sm">
          <Stat label="Totala pass" value={totalSessions} sub={`${monthSessions} denna månad`} />
        </Card>
        <Card padding="sm">
          <Stat label="Program" value={templateCount} />
        </Card>
        <Card padding="sm">
          <Stat
            label="Senaste pass"
            value={lastWorkout ? formatDateWithWeekday(lastWorkout) : '-'}
          />
        </Card>
      </div>

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
          <div class="table-wrap table-rows" style="padding: 0 var(--space-6) var(--space-6) var(--space-6)">
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
        )}
      </Card>
    </div>
  )
}
