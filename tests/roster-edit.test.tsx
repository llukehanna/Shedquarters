// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Player } from '@/lib/queries'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }), unstable_rethrow: () => {} }))
const actions = vi.hoisted(() => ({
  renamePlayer: vi.fn(async () => true),
  addNickname: vi.fn(async () => true),
  removeNickname: vi.fn(async () => {}),
}))
vi.mock('@/lib/actions', () => actions)

import { RosterList } from '@/components/RosterList'
import { PlayerEditor } from '@/components/PlayerEditor'

const ana: Player = { id: 'ana', displayName: 'Ana', photoUrl: null, isHousemate: true, nicknames: ['Big Cat'] }
const gus: Player = { id: 'gus', displayName: 'Gus', photoUrl: null, isHousemate: false, nicknames: [] }

afterEach(() => {
  cleanup()
  refresh.mockClear()
  Object.values(actions).forEach((f) => f.mockClear())
})

describe('the roster', () => {
  it('opens a player\'s profile from their name', () => {
    render(<RosterList players={[ana, gus]} />)
    expect(screen.getByRole('link', { name: /Ana/ }).getAttribute('href')).toBe('/players/ana')
    expect(screen.getByRole('link', { name: /Gus/ }).getAttribute('href')).toBe('/players/gus')
  })

  it('has no Edit button any more', () => {
    render(<RosterList players={[ana, gus]} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText(/edit/i)).toBeNull()
  })
})

describe('editing from the profile', () => {
  it('renames the player and refreshes the profile once the sheet closes', async () => {
    render(<PlayerEditor player={ana} />)
    fireEvent.click(screen.getByRole('button', { name: /Edit name & nicknames/ }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Anastasia' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(actions.renamePlayer).toHaveBeenCalledWith('ana', 'Anastasia')
    expect(refresh).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('does not refresh when nothing was changed', () => {
    render(<PlayerEditor player={ana} />)
    fireEvent.click(screen.getByRole('button', { name: /Edit name & nicknames/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(refresh).not.toHaveBeenCalled()
  })
})
