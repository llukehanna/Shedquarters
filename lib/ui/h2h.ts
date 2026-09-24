import { withSport, type Sport } from '@/lib/domain/sport'

/** `sport` is carried along so a pick never jumps you to the other ladder. Absent means beer die. */
export type H2hSelection = { a?: string; b?: string; sport?: Sport }

/**
 * Normalizes a single search-param value. Next types a repeated query key
 * (`?a=x&a=y`) as `string[]`, not `string` — picking the first occurrence
 * rather than falling through to "no selection" is what a person typing a
 * URL by hand or a link with a stray duplicate param would expect.
 */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * Href for tapping a name in one of the head-to-head page's two pickers.
 * Tapping the name already sitting in that slot clears it; tapping any other
 * name fills it, leaving the other slot exactly as it was. Pure so the page
 * itself can stay a plain server component driven entirely by the URL.
 */
export function buildH2hHref(current: H2hSelection, key: 'a' | 'b', id: string): string {
  const next: H2hSelection = { ...current }
  if (next[key] === id) delete next[key]
  else next[key] = id

  return h2hPath(next)
}

/** The page's URL for a selection, exactly as it stands. */
export function h2hPath(selection: H2hSelection): string {
  const params = new URLSearchParams()
  if (selection.a) params.set('a', selection.a)
  if (selection.b) params.set('b', selection.b)

  const qs = params.toString()
  const path = qs ? `/h2h?${qs}` : '/h2h'
  return selection.sport ? withSport(path, selection.sport) : path
}
