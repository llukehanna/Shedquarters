// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const nav = vi.hoisted(() => ({ pathname: '/', push: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, prefetch: nav.prefetch }),
}))

import { SwipeTabs } from '@/components/SwipeTabs'

let clock = 0
beforeEach(() => {
  clock = 1_000
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
  nav.pathname = '/'
  nav.push.mockClear()
  nav.prefetch.mockClear()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function swipe(el: Element, from: [number, number], to: [number, number], ms = 200) {
  fireEvent.touchStart(el, { touches: [{ clientX: from[0], clientY: from[1] }] })
  fireEvent.touchMove(el, { touches: [{ clientX: (from[0] + to[0]) / 2, clientY: (from[1] + to[1]) / 2 }] })
  fireEvent.touchMove(el, { touches: [{ clientX: to[0], clientY: to[1] }] })
  clock += ms
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: to[0], clientY: to[1] }] })
}

function renderTabs() {
  render(
    <SwipeTabs>
      <p>Rankings</p>
      <div data-no-swipe>
        <p>Scroller</p>
      </div>
    </SwipeTabs>,
  )
}

describe('SwipeTabs', () => {
  it('swipes left from Ranks to the Table', () => {
    renderTabs()
    swipe(screen.getByText('Rankings'), [220, 300], [80, 305])
    expect(nav.push).toHaveBeenCalledWith('/table')
  })

  it('swipes right from the Table back to Ranks', () => {
    nav.pathname = '/table'
    renderTabs()
    swipe(screen.getByText('Rankings'), [120, 300], [260, 296])
    expect(nav.push).toHaveBeenCalledWith('/')
  })

  it('does nothing for a scroll', () => {
    renderTabs()
    swipe(screen.getByText('Rankings'), [200, 500], [150, 200])
    expect(nav.push).not.toHaveBeenCalled()
  })

  it('leaves anything marked data-no-swipe alone', () => {
    renderTabs()
    swipe(screen.getByText('Scroller'), [220, 300], [80, 305])
    expect(nav.push).not.toHaveBeenCalled()
  })

  it('does nothing while a sheet is open', () => {
    renderTabs()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)
    swipe(screen.getByText('Rankings'), [220, 300], [80, 305])
    dialog.remove()
    expect(nav.push).not.toHaveBeenCalled()
  })

  it('warms up the tabs either side', () => {
    nav.pathname = '/table'
    renderTabs()
    expect(nav.prefetch).toHaveBeenCalledWith('/')
    expect(nav.prefetch).toHaveBeenCalledWith('/roster')
  })
})
