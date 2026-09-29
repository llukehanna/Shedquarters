// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { Sport } from '@/lib/domain/sport'

const nav = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))

import { SportProvider } from '@/components/SportContext'
import { TabBar } from '@/components/ui/TabBar'

function renderBar(sport: Sport, liveSports: Sport[]) {
  return render(
    <SportProvider sport={sport} liveSports={liveSports}>
      <TabBar />
    </SportProvider>,
  )
}

afterEach(() => {
  cleanup()
  nav.pathname = '/'
})

describe('TabBar', () => {
  it('shows the three tabs and marks the current one', () => {
    nav.pathname = '/games'
    renderBar('beer_die', [])
    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Ranks', 'Table', 'Me'])
    expect(screen.getByRole('link', { name: 'Ranks' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Table' }).getAttribute('aria-current')).toBeNull()
  })

  it('puts a live dot on Table while this sport has a night on', () => {
    renderBar('beer_die', ['beer_die'])
    expect(screen.getByRole('img', { name: 'Beer die night live' })).toBeTruthy()
  })

  it('shows no dot when only the other sport is live', () => {
    renderBar('beer_die', ['spikeball'])
    expect(screen.queryByRole('img', { name: /night live/ })).toBeNull()
  })

  it('renders nothing off the tabs', () => {
    nav.pathname = '/gate'
    const { container } = renderBar('beer_die', [])
    expect(container.innerHTML).toBe('')
  })
})
