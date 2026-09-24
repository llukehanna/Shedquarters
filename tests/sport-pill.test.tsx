// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { Sport } from '@/lib/domain/sport'

const nav = vi.hoisted(() => ({ pathname: '/h2h', search: 'a=1' }))
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}))

import { SportProvider } from '@/components/SportContext'
import { SportPill } from '@/components/ui/SportPill'

function renderPill(sport: Sport, liveSports: Sport[]) {
  return render(
    <SportProvider sport={sport} liveSports={liveSports}>
      <SportPill />
    </SportProvider>,
  )
}

afterEach(() => {
  cleanup()
  nav.pathname = '/h2h'
  nav.search = 'a=1'
})

describe('SportPill', () => {
  it('marks the sport this phone is on', () => {
    renderPill('beer_die', [])
    expect(screen.getByRole('link', { name: 'Beer die' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Spikeball' }).getAttribute('aria-current')).toBeNull()
  })

  it('links to the same page, same picks, other sport', () => {
    renderPill('beer_die', [])
    expect(screen.getByRole('link', { name: 'Spikeball' }).getAttribute('href')).toBe('/h2h?a=1&sport=spikeball')
    expect(screen.getByRole('link', { name: 'Beer die' }).getAttribute('href')).toBe('/h2h?a=1&sport=beer_die')
  })

  it('shows a dot on the other sport when its night is live', () => {
    renderPill('beer_die', ['spikeball'])
    expect(screen.getByLabelText('Spikeball night live')).toBeTruthy()
  })

  it('shows no dot when nothing else is live', () => {
    renderPill('beer_die', ['beer_die'])
    expect(screen.queryByLabelText(/night live/)).toBeNull()
  })

  it('has a plain page with no search params', () => {
    nav.pathname = '/'
    nav.search = ''
    renderPill('spikeball', [])
    expect(screen.getByRole('link', { name: 'Beer die' }).getAttribute('href')).toBe('/?sport=beer_die')
  })
})
