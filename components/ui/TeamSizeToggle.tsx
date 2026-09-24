export type TeamSize = 2 | 3

/** The 3V3 / 2V2 toggle, shared by SessionSetup and TableMode's team editor. */
export function TeamSizeToggle({ size, onChange }: { size: TeamSize; onChange: (size: TeamSize) => void }) {
  return (
    <div role="group" aria-label="Team size" className="flex overflow-hidden rounded-[9px] border border-accent/15">
      {([3, 2] as const).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => {
            // Tapping the size already selected is not a change. Every
            // consumer treats `onChange` as "the size moved" and acts on it —
            // SessionSetup clears the pick, TableMode reshapes the board and
            // announces it — so firing here turns a non-event into one.
            if (n !== size) onChange(n)
          }}
          aria-pressed={size === n}
          className={`min-h-11 px-3 font-display text-[15px] font-extrabold ${size === n ? 'bg-accent text-accent-ink' : 'text-fg'}`}
        >
          {n}V{n}
        </button>
      ))}
    </div>
  )
}
