export function BrandMark({ class: className = '' }: { class?: string }) {
  return <img class={`brand-mark ${className}`.trim()} src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width="40" height="40" />
}
