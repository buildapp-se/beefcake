import { useState } from 'preact/hooks'
import { icon } from '../icons'
import { Button } from './Button'
import { calculatePlates } from '../lib/plates'
import { formatWeight } from '../lib/format'

// Skivornas färger följer IPF-standarden, en fysisk egenskap, inte ett tema. Därför hex här och inte tokens.
const PLATE_COLORS: Record<number, { color: string; textColor: string }> = {
  25: { color: '#ef4444', textColor: '#ffffff' },
  20: { color: '#3b82f6', textColor: '#ffffff' },
  15: { color: '#eab308', textColor: '#000000' },
  10: { color: '#22c55e', textColor: '#ffffff' },
  5: { color: '#f8fafc', textColor: '#0f172a' },
  2.5: { color: '#1e293b', textColor: '#ffffff' },
  1.25: { color: '#94a3b8', textColor: '#0f172a' }
}

export function PlateCalculatorModal({
  isOpen,
  onClose,
  initialWeight = 60,
  initialBarWeight = 20,
  onApplyWeight
}: {
  isOpen: boolean
  onClose: () => void
  initialWeight?: number
  initialBarWeight?: number
  onApplyWeight?: (weight: number) => void
}) {
  const [targetWeight, setTargetWeight] = useState(initialWeight)
  const [barWeight, setBarWeight] = useState(initialBarWeight)

  if (!isOpen) return null

  const { platesPerSide: plates, remainingWeight } = calculatePlates(targetWeight, barWeight)
  const platesPerSide = plates.map(p => ({ count: p.count, plate: { weight: p.weight, label: formatWeight(p.weight), ...PLATE_COLORS[p.weight] } }))
  const totalPerSide = platesPerSide.reduce((sum, item) => sum + item.plate.weight * item.count, 0)
  const actualTotal = barWeight + totalPerSide * 2

  function adjustWeight(delta: number) {
    setTargetWeight(prev => Math.max(barWeight, Math.round((prev + delta) * 10) / 10))
  }

  return (
    <div class="dialog-overlay" onClick={onClose}>
      <div class="dialog plate-calc-dialog" onClick={e => e.stopPropagation()}>
        <div class="flex justify-between items-center mb">
          <h2 class="m-0 flex items-center gap-2">
            <span>Plattkalkylator</span>
          </h2>
          <button class="banner-dismiss" onClick={onClose} aria-label="Stäng">
            <svg width="16" height="16" viewBox="0 0 19 19"><use href={icon('x-icon')} /></svg>
          </button>
        </div>

        <div class="plate-calc-header mb">
          <div class="plate-calc-target">
            <span class="text-sm text-muted">Målvikt</span>
            <div class="plate-calc-weight-display">
              <span class="weight-number">{targetWeight.toLocaleString('sv-SE')}</span>
              <span class="weight-unit">kg</span>
            </div>
          </div>

          <div class="plate-calc-controls flex gap-sm flex-wrap">
            <Button size="sm" variant="secondary" onClick={() => adjustWeight(-10)}>-10</Button>
            <Button size="sm" variant="secondary" onClick={() => adjustWeight(-2.5)}>-2,5</Button>
            <Button size="sm" variant="secondary" onClick={() => adjustWeight(-1.25)}>-1,25</Button>
            <Button size="sm" variant="secondary" onClick={() => adjustWeight(1.25)}>+1,25</Button>
            <Button size="sm" variant="secondary" onClick={() => adjustWeight(2.5)}>+2,5</Button>
            <Button size="sm" variant="secondary" onClick={() => adjustWeight(10)}>+10</Button>
          </div>
        </div>

        <div class="plate-calc-bar-selection mb">
          <span class="text-xs text-muted">Stångvikt:</span>
          <div class="flex gap-sm mt-1">
            <button
              type="button"
              class={`btn btn-sm ${barWeight === 20 ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setBarWeight(20)}
            >
              20 kg (Olympisk)
            </button>
            <button
              type="button"
              class={`btn btn-sm ${barWeight === 15 ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setBarWeight(15)}
            >
              15 kg (Dam/Teknik)
            </button>
            <button
              type="button"
              class={`btn btn-sm ${barWeight === 10 ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setBarWeight(10)}
            >
              10 kg (EZ-stång)
            </button>
          </div>
        </div>

        <div class="plate-calc-visual-wrap mb">
          <div class="plate-calc-visual">
            <div class="barbell-sleeve"></div>
            <div class="barbell-collar"></div>
            <div class="plates-stack">
              {platesPerSide.length === 0 ? (
                <span class="text-sm text-muted">Bara stången ({barWeight} kg)</span>
              ) : (
                platesPerSide.flatMap((item, itemIdx) =>
                  Array.from({ length: item.count }).map((_, cIdx) => (
                    <div
                      key={`${itemIdx}-${cIdx}`}
                      class="visual-plate"
                      style={{
                        backgroundColor: item.plate.color,
                        color: item.plate.textColor,
                        height: `${Math.max(40, Math.min(100, item.plate.weight * 3.8 + 20))}px`
                      }}
                      title={`${item.plate.label} kg`}
                    >
                      <span>{item.plate.label}</span>
                    </div>
                  ))
                )
              )}
            </div>
            <div class="barbell-shaft"></div>
          </div>
        </div>

        <div class="plate-calc-summary mb">
          <h3 class="m-0 mb-sm text-sm">Per sida ({totalPerSide.toLocaleString('sv-SE')} kg):</h3>
          {platesPerSide.length === 0 ? (
            <p class="text-sm text-muted m-0">Inga viktskivor behövs.</p>
          ) : (
            <div class="plate-badge-list flex gap-sm flex-wrap">
              {platesPerSide.map((item, idx) => (
                <div key={idx} class="plate-badge flex items-center gap-1">
                  <span
                    class="plate-dot"
                    style={{ backgroundColor: item.plate.color }}
                  ></span>
                  <strong>{item.count} × {item.plate.label} kg</strong>
                </div>
              ))}
            </div>
          )}
          {remainingWeight > 0 && (
            <p class="text-xs text-warning mt-2">
              Kvar att fördela: {remainingWeight.toLocaleString('sv-SE')} kg (mindre än minsta skiva 1,25 kg)
            </p>
          )}
        </div>

        <div class="flex justify-between items-center mt pt border-top">
          <span class="text-sm">
            Totalvikt: <strong>{actualTotal.toLocaleString('sv-SE')} kg</strong>
          </span>
          <div class="flex gap-sm">
            <Button variant="secondary" onClick={onClose}>Stäng</Button>
            {onApplyWeight && (
              <Button
                variant="primary"
                onClick={() => {
                  onApplyWeight(targetWeight)
                  onClose()
                }}
              >
                Använd {targetWeight.toLocaleString('sv-SE')} kg
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
