import type { ButtonHTMLAttributes } from 'react'

const TONES = {
  gold: 'bg-gold text-gold-ink',
  cardinal: 'bg-gradient-to-br from-cardinal-glow to-cardinal-shade text-white shadow-[inset_0_0_0_1px_rgb(255_204_0/0.35)]',
  ghost: 'border border-gold/15 text-cream not-italic',
} as const

const SIZES = {
  md: 'min-h-11 px-4 text-[17px]',
  lg: 'min-h-14 px-5 text-[23px]',
} as const

export function Button({
  tone = 'gold',
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
