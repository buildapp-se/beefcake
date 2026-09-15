import { exerciseImageUrl } from '../lib/exerciseDb'

interface ExerciseAnimationProps {
  id: string
  name: string
  class?: string
  /** Bara startbilden: listor och miniatyrer, där många rörliga bilder stör och laddar dubbelt */
  still?: boolean
}

/**
 * Två bildrutor (start och slut) staplade; CSS växlar den övre av och på, så rörelsen
 * syns utan JavaScript och stannar under prefers-reduced-motion. crossorigin gör att
 * service workern får ett riktigt svar att cacha, inte ett opakt.
 */
export function ExerciseAnimation({ id, name, class: className = '', still = false }: ExerciseAnimationProps) {
  return (
    <span class={`exdb-anim ${className}`.trim()} role="img" aria-label={name}>
      <img src={exerciseImageUrl(id, 0)} alt="" loading="lazy" decoding="async" crossorigin="anonymous" />
      {!still && <img src={exerciseImageUrl(id, 1)} alt="" loading="lazy" decoding="async" crossorigin="anonymous" />}
    </span>
  )
}
