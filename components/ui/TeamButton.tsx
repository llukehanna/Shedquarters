/** A whole team as one large tap target. The holding team wears the panel colour. */
export function TeamButton({
  label,
  names,
  holding,
  ghost,
  onClick,
  disabled = false,
}: {
  label: string
  names: string[]
  holding: boolean
  ghost?: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative block w-full overflow-hidden rounded-2xl px-4 py-4 text-left ${holding ? 'panel' : 'surface'}`}
    >
      {ghost && (
        <span aria-hidden className={`headline absolute top-1 right-3 text-[90px] leading-none ${holding ? 'text-panel-ink/12' : 'text-accent/12'}`}>
          {ghost}
        </span>
      )}
      <span className={`eyebrow relative block text-[11.5px] ${holding ? 'text-panel-sub' : ''}`}>{label}</span>
      <span className="headline relative mt-1.5 block pr-10 text-[28px] leading-[1.08]">{names.join(' · ')}</span>
      <span
        className={`relative mt-3 block font-display text-[13px] font-extrabold uppercase tracking-[0.1em] ${holding ? 'text-panel-ink' : 'text-fg'}`}
      >
        They won →
      </span>
    </button>
  )
}
