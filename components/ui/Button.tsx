import type { ButtonHTMLAttributes } from 'react'

const TONES = {
  accent: 'bg-accent text-accent-ink',
  panel: 'bg-gradient-to-br from-panel-glow to-panel-shade text-panel-ink ring-1 ring-inset ring-panel-ink/35',
  ghost: 'border border-accent/15 text-fg not-italic',
} as const

const SIZES = {
  md: 'min-h-11 px-4 text-[17px]',
  lg: 'min-h-14 px-5 text-[23px]',
} as const

export function Button({
  tone = 'accent',
  size = 'lg',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof TONES; size?: keyof typeof SIZES }) {
  return (
    <button
      {...props}
      className={`flex w-full items-center justify-center rounded-xl font-display font-extrabold italic uppercase transition-opacity disabled:opacity-40 ${TONES[tone]} ${SIZES[size]} ${className}`}
    />
  )
}
