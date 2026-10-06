import { useEffect } from 'preact/hooks'

const PIECES = 28
const COLORS = ['var(--accent)', 'var(--success)', 'var(--warning)', 'var(--primary)']

/**
 * Konfetti (och Cartman i den inloggades nivå) när testsetet i höjningsförslaget klaras.
 * Ren CSS, stänger sig själv, tar inga tryck och är dold för skärmläsare: resultatraden vid
 * setet bär beskedet. Under prefers-reduced-motion visas ingenting som rör sig.
 */
export function Celebration({ image, onDone }: { image: string | null; onDone: () => void }) {
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
      {image && <img class="celebration-cartman" src={image} alt="" />}
    </div>
  )
}
