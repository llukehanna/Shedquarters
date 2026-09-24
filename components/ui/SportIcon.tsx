import type { Sport } from '@/lib/domain/sport'

/** A die for beer die, a netted ball for spikeball. Stroke icons in the current text colour. */
export function SportIcon({ sport, size = 16 }: { sport: Sport; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
      className="shrink-0"
    >
      {sport === 'beer_die' ? (
        <>
          <rect x="3" y="3" width="18" height="18" rx="4" />
          {[
            [8, 8],
            [16, 8],
            [12, 12],
            [8, 16],
            [16, 16],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.4" fill="currentColor" stroke="none" />
          ))}
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M5 8.5c4 1.5 10 1.5 14 0" />
          <path d="M5 15.5c4-1.5 10-1.5 14 0" />
          <path d="M9.5 3.4c-1.8 5.6-1.8 11.6 0 17.2" />
          <path d="M14.5 3.4c1.8 5.6 1.8 11.6 0 17.2" />
        </>
      )}
    </svg>
  )
}
