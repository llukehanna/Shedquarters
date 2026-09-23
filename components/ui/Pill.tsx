const TONES = {
  gold: 'bg-gold text-gold-ink',
  dim: 'bg-cream/10 text-muted',
  live: 'bg-cardinal-hi text-white',
} as const

export function Pill({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-[3px] px-[7px] py-[2px] font-display text-[11px] font-extrabold uppercase tracking-[0.1em] ${TONES[tone]}`}
    >
      {children}
    </span>
  )
}
