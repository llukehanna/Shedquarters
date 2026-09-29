// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { Sport } from '@/lib/domain/sport'

const nav = vi.hoisted(() => ({ pathname: '/', search: '' }))
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}))

import { SportProvider } from '@/components/SportContext'
import { Sidebar } from '@/components/ui/Sidebar'

function renderRail(sport: Sport, liveSports: Sport[]) {
  return render(
    <SportProvider sport={sport} liveSports={liveSports}>
      <Sidebar />
    </SportProvider>,
  )
}

afterEach(() => {
  cleanup()
  nav.pathname = '/'
})

describe('Sidebar', () => {
  it('lists Ranks, Games, H2H, Table and Me with their numbers', () => {
    renderRail('beer_die', [])
    const main = screen.getByRole('navigation', { name: 'Main' })
    for (const [label, href, index] of [
      ['Ranks', '/', '01'],
      ['Games', '/games', '02'],
      ['H2H', '/h2h', '03'],
      ['Table', '/table', '04'],
      ['Me', '/roster', '05'],
    ]) {
      const link = within(main).getByRole('link', { name: new RegExp(`^${label}`) })
      expect(link.getAttribute('href')).toBe(href)
      expect(within(link).getByText(index)).toBeTruthy()
    }
  })

  it('marks only the current page', () => {
    nav.pathname = '/h2h'
    renderRail('beer_die', [])
    // The rail's H2H link, plus the pill's current-sport half, which also carries aria-current.
    const current = screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(current.map((l) => l.getAttribute('href')).sort()).toEqual(['/h2h', '/h2h?sport=beer_die'])
  })

  it('carries the Die | Spike pill', () => {
    renderRail('beer_die', [])
    expect(screen.getByRole('navigation', { name: 'Game' })).toBeTruthy()
  })

  it('shows the night as live on Table and in the footer', () => {
    renderRail('spikeball', ['spikeball'])
    expect(screen.getByRole('img', { name: 'Spikeball night live' })).toBeTruthy()
    expect(screen.getByText('● Live')).toBeTruthy()
  })

  it('says no night is on otherwise', () => {
    renderRail('spikeball', ['beer_die'])
    expect(screen.queryByRole('img', { name: 'Spikeball night live' })).toBeNull()
    expect(screen.getByText('No night on')).toBeTruthy()
  })

  it('renders nothing off the tabs', () => {
    nav.pathname = '/gate'
    const { container } = renderRail('beer_die', [])
    expect(container.innerHTML).toBe('')
  })
})
