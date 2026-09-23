import { BADGE_COPY, type Badge, type BadgeKind } from '@/lib/domain/badges'

export type BadgeView = {
  kind: BadgeKind
  /** The patch's name, e.g. "Skunk". */
  name: string
  /** The formatted tally, e.g. "×3", or null for a badge that has no count. */
  count: string | null
  /** The one line shown beside the patch. */
  blurb: string
}

/**
 * Turns earned badges into exactly the strings the shelf renders, so that
 * "which badges have a count and how it reads" is decided somewhere it can
 * be tested rather than inside JSX. `components/ui/PlayerBadges.tsx` maps
 * over this and adds no words of its own.
 *
 * Order is preserved from `earnedBadges` — that order is meaningful (what
 * you won at the table, then where you stand) and is not this layer's to
 * re-sort.
 */
export function badgeViews(badges: Badge[]): BadgeView[] {
  return badges.map((b) => ({
    kind: b.kind,
    name: BADGE_COPY[b.kind].name,
    count: b.count === null ? null : `×${b.count}`,
    blurb: BADGE_COPY[b.kind].blurb,
  }))
}
