import { useEffect } from 'preact/hooks'
import cartman from '../assets/beefcake/4.jpg'

const PIECES = 28
const COLORS = ['var(--accent)', 'var(--success)', 'var(--warning)', 'var(--primary)']

/**
 * Konfetti (och Cartman för den som är inloggad) när testsetet i höjningsförslaget klaras.
 * Ren CSS, stänger sig själv, tar inga tryck och är dold för skärmläsare: resultatraden vid
 * setet bär beskedet. Under prefers-reduced-motion visas ingenting som rör sig.
 */
export function Celebration({ showCartman, onDone }: { showCartman: boolean; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 2200)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div class="celebration" aria-hidden="true">
      {Array.from({ length: PIECES }, (_, i) => (
        <span
          key={i}
          class="celebration-piece"
          style={{
            left: `${(i * 37) % 100}%`,
            background: COLORS[i % COLORS.length],
            animationDelay: `${(i % 7) * 60}ms`,
            animationDuration: `${1300 + (i % 5) * 150}ms`
          }}
        />
      ))}
      {showCartman && <img class="celebration-cartman" src={cartman} alt="" />}
    </div>
  )
}
