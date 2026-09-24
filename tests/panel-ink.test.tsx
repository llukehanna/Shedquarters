// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { RankRow } from '@/components/ui/RankRow'
import { TeamButton } from '@/components/ui/TeamButton'

// Spikeball's panels are yellow, so anything sitting on one has to take the
// panel's own ink (black there, white on die) rather than the page's light
// foreground or the accent, which on spikeball is the panel's own yellow.
afterEach(cleanup)

describe('text on a panel', () => {
  it('uses the panel ink on the #1 row', () => {
    render(<RankRow rank={1} name="Cal" rating="31.4" record="42–18" href="/players/cal" first />)
    const row = screen.getByRole('link')
    expect(row.className).toContain('panel')
    expect(screen.getByText('1').className).toContain('text-panel-ink')
    expect(screen.getByText('42–18').className).toContain('text-panel-sub')
    // The badge inverts rather than using the accent, which vanishes on yellow.
    expect(screen.getByText('Shed of the Table').className).toContain('bg-panel-ink')
  })

  it('keeps the provisional pill readable on the #1 row', () => {
    render(<RankRow rank={1} name="Cal" rating="31.4" record="4–2" href="/players/cal" first provisional />)
    expect(screen.getByText('Provisional').className).toContain('bg-panel-ink/15')
  })

  it('keeps the accent off the panel on every other row', () => {
    render(<RankRow rank={2} name="Ana" rating="28.9" record="37–21" href="/players/ana" />)
    expect(screen.getByText('2').className).toContain('text-accent')
    expect(screen.getByText('37–21').className).toContain('text-muted')
  })

  it('uses the panel ink on the holding team', () => {
    render(<TeamButton label="Holding the net" names={['Hal', 'Ivy']} holding onClick={vi.fn()} />)
    expect(screen.getByText('Holding the net').className).toContain('text-panel-sub')
    expect(screen.getByText('They won →').className).toContain('text-panel-ink')
  })
})
