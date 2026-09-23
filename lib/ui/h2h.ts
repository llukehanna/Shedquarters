export type H2hSelection = { a?: string; b?: string }

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

  const params = new URLSearchParams()
  if (next.a) params.set('a', next.a)
  if (next.b) params.set('b', next.b)

  const qs = params.toString()
  return qs ? `/h2h?${qs}` : '/h2h'
}
