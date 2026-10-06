import { useEffect, useRef, useState } from 'preact/hooks'
import { formatWeight } from '../lib/format'

export interface PlateauItem {
  exerciseId: string
  name: string
  weight: number
  reps: number
  /** Antal pass i rad med samma vikt och reps */
  run: number
  step: number
}

export type PlateauChoice = 'test' | 'step' | 'no'

/**
 * "Vill du höja?": en gång per pass när minst en övning står på platå. Samma overlay och ruta som
 * appens övriga dialoger, plus det de saknar: dialogroll, fokus in och tillbaka, Tab stannar i
 * rutan och Escape stänger som "Nä".
 */
export function PlateauDialog({ items, onChoose }: {
  items: PlateauItem[]
  onChoose: (choice: PlateauChoice, heldIds: string[]) => void
}) {
  const [held, setHeld] = useState<string[]>([])
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector<HTMLElement>('.plateau-choice')?.focus()
    return () => opener?.focus()
  }, [])

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onChoose('no', held)
      return
    }
    if (event.key !== 'Tab') return
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button, input') ?? [])
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const steps = new Set(items.map(i => i.step))
  const stepText = steps.size === 1 ? `+${formatWeight(items[0].step)} kg` : 'ett steg upp'

  return (
    <div class="dialog-overlay" onClick={() => onChoose('no', held)}>
      <div
        ref={dialogRef}
        class="dialog plateau-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plateau-dialog-title"
        onClick={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <h3 id="plateau-dialog-title" class="m-0 mb-sm">Vill du höja?</h3>
        <ul class="plateau-list">
          {items.map(item => (
            <li key={item.exerciseId}>
              <span>
                <strong>{item.name}</strong>: samma vikt och reps {item.run} pass i rad
                <span class="text-muted tabular-nums"> ({formatWeight(item.weight)} kg × {item.reps})</span>
              </span>
              <label class="plateau-hold">
                <input
                  type="checkbox"
                  checked={held.includes(item.exerciseId)}
                  onChange={() => setHeld(prev => prev.includes(item.exerciseId) ? prev.filter(id => id !== item.exerciseId) : [...prev, item.exerciseId])}
                />
                Håll vikten med flit
              </label>
            </li>
          ))}
        </ul>
        <div class="plateau-choices">
          <button type="button" class="btn btn-primary plateau-choice" onClick={() => onChoose('test', held)}>
            <strong>BEEFCAKE!</strong>
            <span>Test: ett set med max reps, så räknar appen ut nästa vikt.</span>
          </button>
          <button type="button" class="btn btn-secondary plateau-choice" onClick={() => onChoose('step', held)}>
            <strong>Höj bara ett steg</strong>
            <span>Inget test: {stepText} direkt i dag.</span>
          </button>
          <button type="button" class="btn btn-secondary plateau-choice" onClick={() => onChoose('no', held)}>
            <strong>Nä, jag fiser på som vanligt</strong>
            <span>Frågar igen nästa pass.</span>
          </button>
        </div>
      </div>
    </div>
  )
}
