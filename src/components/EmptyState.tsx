import type { ComponentChildren } from 'preact'

interface EmptyStateProps {
  title: string
  message?: string
  action?: ComponentChildren
  class?: string
}

export function EmptyState({ title, message, action, class: className = '' }: EmptyStateProps) {
  return (
    <div class={`empty-state ${className}`.trim()}>
      <h2>{title}</h2>
      {message && <p>{message}</p>}
      {action && <div class="mt">{action}</div>}
    </div>
  )
}
