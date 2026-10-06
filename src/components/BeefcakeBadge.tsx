import { useEffect, useState } from 'preact/hooks'
import { useLocation } from 'wouter'
import { getAllSessions } from '../services/dataService'
import { todayISO } from '../lib/date'
import { beefcakeStatusText, beefcakeStreak, BEEFCAKE_LABELS, type BeefcakeLevel, type BeefcakeStreak } from '../lib/streak'

// Alla genererade bilder i mappen: N.jpg (nivån), celebrate-N.jpg (klarat testset), plateau-N.jpg ("Vill du höja?")
const IMAGES = import.meta.glob<string>('../assets/beefcake/*.jpg', { eager: true, import: 'default' })

/** Cartman för en nivå: själva nivåbilden, eller firandet och platån i samma kropp. */
export function beefcakeImage(level: BeefcakeLevel, kind?: 'celebrate' | 'plateau'): string {
  return IMAGES[`../assets/beefcake/${kind ? `${kind}-` : ''}${level}.jpg`]
}

/**
 * Träningskedjan, läst om vid varje sidbyte: det är billigt mot IndexedDB och
 * fångar att du just slutfört ett pass utan att någon behöver skicka en händelse.
 * Anropas en gång i app-skalet och delas till märket och avatarerna.
 */
export function useBeefcakeStreak(): BeefcakeStreak {
  const [location] = useLocation()
  const [streak, setStreak] = useState<BeefcakeStreak>({ level: 1, streak: 0, daysSinceLast: null, startDate: null, deadline: null })

  useEffect(() => {
    let cancelled = false
    getAllSessions()
      .then(sessions => {
        if (!cancelled) setStreak(beefcakeStreak(sessions.map(s => s.date), todayISO()))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [location])

  return streak
}

/** Cartman i full storlek med statustexten. Bara på Hem: belöningen hör hemma där, inte ovanför första setet. */
export function BeefcakeBadge({ streak }: { streak: BeefcakeStreak }) {
  return (
    <div class={`beefcake-banner level-${streak.level}`}>
      <img
        src={beefcakeImage(streak.level)}
        alt={`Beefcake-nivå ${streak.level}: ${BEEFCAKE_LABELS[streak.level]}`}
        width="320"
        height="320"
      />
      <p class="beefcake-banner-text">{beefcakeStatusText(streak, todayISO())}</p>
    </div>
  )
}

/** 40 px avatar i headern, sidebaren och railen på övriga sidor. Ramfärgen följer nivån via level-klassen. */
export function BeefcakeAvatar({ streak }: { streak: BeefcakeStreak }) {
  return (
    <img
      class={`beefcake-avatar level-${streak.level}`}
      src={beefcakeImage(streak.level)}
      alt={`Beefcake-nivå ${streak.level}: ${BEEFCAKE_LABELS[streak.level]}`}
      title={beefcakeStatusText(streak, todayISO()).replaceAll('\n', ' ')}
      width="40"
      height="40"
    />
  )
}
