const TONES = {
  accent: 'bg-accent text-accent-ink',
  dim: 'bg-fg/10 text-muted',
  live: 'bg-panel-hi text-panel-ink',
  // Sitting on a panel, where the accent can be the panel's own colour (spikeball's yellow).
  onPanel: 'bg-panel-ink text-panel',
  onPanelDim: 'bg-panel-ink/15 text-panel-ink',
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
