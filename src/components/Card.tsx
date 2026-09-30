import type { ComponentChildren, JSX } from 'preact'

export type CardPadding = 'none' | 'sm' | 'md' | 'lg'

// Övriga attribut (data-*, aria-*, role) går vidare till diven: loggvyns dragning hittar
// korten via data-exercise-index, och när Card kastade det gick det aldrig att flytta en övning.
interface CardProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'title'> {
  children?: ComponentChildren
  padding?: CardPadding
  class?: string
  title?: string
}

const PADDING_CLASS: Record<CardPadding, string> = {
  none: 'padding-none',
  sm: 'padding-sm',
  md: '',
  lg: 'padding-lg'
}

export function Card({ children, padding = 'md', class: className = '', title, ...rest }: CardProps) {
  const classes = ['card', PADDING_CLASS[padding], className].filter(Boolean).join(' ')

  return (
    <div {...rest} class={classes}>
      {title && <h3 class="card-title">{title}</h3>}
      {children}
    </div>
  )
}
