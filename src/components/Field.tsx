import { cloneElement, toChildArray, type ComponentChildren, type VNode } from 'preact'
import { useId } from 'preact/hooks'

interface FieldProps {
  label: string
  children: ComponentChildren
  error?: string
  class?: string
}

const CONTROLS = new Set(['input', 'select', 'textarea'])

/** Etiketten kopplas till fältets första kontroll på översta nivån, så att skärmläsare läser upp den. */
export function Field({ label, children, error, class: className = '' }: FieldProps) {
  const generatedId = useId()
  let controlId: string | undefined
  const items = toChildArray(children).map(child => {
    if (controlId !== undefined || typeof child !== 'object' || typeof child.type !== 'string' || !CONTROLS.has(child.type)) return child
    const control = child as VNode<{ id?: string }>
    if (control.props.id) {
      controlId = control.props.id
      return child
    }
    controlId = generatedId
    return cloneElement(control, { id: generatedId })
  })
  return (
    <div class={`input-group ${className}`.trim()}>
      <label for={controlId}>{label}</label>
      {items}
      {error && <div class="field-error">{error}</div>}
    </div>
  )
}
