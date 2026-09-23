import type { Player } from '@/lib/queries'
import type { TeamSize } from '@/components/ui/TeamSizeToggle'

/**
 * The "tap names in order" picker: a live preview of who's on which team, a
 * Clear, and the full roster to tap through. Fully controlled — the parent
 * owns `picked` and `size`; this only renders them and reports taps. Shared
 * by SessionSetup (naming a fresh lineup) and TableMode's "Change teams"
 * screen (changing one mid-session), so both open the same picker experience.
 */
export function TeamPicker({
  players,
  size,
  picked,
  onToggle,
  onClear,
}: {
  players: Player[]
  size: TeamSize
  picked: string[]
  onToggle: (id: string) => void
  onClear: () => void
}) {
  const target = size * 2
  const name = (id: string) => players.find((p) => p.id === id)?.displayName ?? '?'
  const teams: Array<{ label: string; ids: string[]; holding: boolean }> = [
    { label: 'Holding the table', ids: picked.slice(0, size), holding: true },
    { label: 'Challengers', ids: picked.slice(size, target), holding: false },
  ]

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {teams.map((team) => (
          <div key={team.label}>
            <p className={`eyebrow mb-1.5 text-[10.5px] ${team.holding ? 'text-gold' : ''}`}>{team.label}</p>
            {Array.from({ length: size }, (_, i) => {
              const id = team.ids[i]
              return (
                <div
                  key={i}
                  className={`mb-1.5 flex min-h-11 items-center rounded-[9px] border-[1.5px] px-3 font-display text-[18px] font-bold uppercase ${id ? 'border-gold/45 bg-gold/6 text-cream' : 'border-dashed border-gold/30 text-faint'}`}
                >
                  {id ? name(id) : 'Tap a name'}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={onClear}
          disabled={picked.length === 0}
          className="min-h-11 rounded-md px-3 font-display text-[13px] font-bold uppercase tracking-[0.1em] text-faint disabled:opacity-40"
        >
          Clear
        </button>
      </div>

      <p className="eyebrow mt-3 mb-2">Everyone</p>
      <ul className="flex flex-wrap gap-1.5">
        {players.map((p) => {
          const on = picked.includes(p.id)
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onToggle(p.id)}
                aria-pressed={on}
                className={`min-h-11 rounded-full border px-4 font-display text-[17px] font-bold uppercase ${on ? 'border-gold bg-gold text-gold-ink' : 'surface'}`}
              >
                {p.displayName}
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}
