/** A night is on: the rail's Table row, the tab bar's Table tab. */
export function LiveDot({ label }: { label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      className="inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-up shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-up)_22%,transparent)]"
    />
  )
}
