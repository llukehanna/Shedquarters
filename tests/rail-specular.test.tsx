// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RailSpecular } from '@/components/ui/RailSpecular'
import { FINE_POINTER_QUERY, REDUCED_MOTION_QUERY } from '@/lib/ui/media'
import { stubMatchMedia, unstubMatchMedia } from './helpers/match-media'

afterEach(() => {
  cleanup()
  unstubMatchMedia()
})

function renderRail() {
  render(<RailSpecular data-testid="rail">rail</RailSpecular>)
  return screen.getByTestId('rail')
}

describe('RailSpecular', () => {
  it('follows a mouse', () => {
    stubMatchMedia([FINE_POINTER_QUERY])
    const rail = renderRail()
    fireEvent.pointerMove(rail, { clientX: 40, clientY: 70 })
    expect(rail.style.getPropertyValue('--mx')).toBe('40px')
    expect(rail.style.getPropertyValue('--my')).toBe('70px')
  })

  it('ignores a finger', () => {
    stubMatchMedia([])
    const rail = renderRail()
    fireEvent.pointerMove(rail, { clientX: 40, clientY: 70 })
    expect(rail.style.getPropertyValue('--mx')).toBe('')
  })

  it('stays still under reduced motion', () => {
    stubMatchMedia([FINE_POINTER_QUERY, REDUCED_MOTION_QUERY])
    const rail = renderRail()
    fireEvent.pointerMove(rail, { clientX: 40, clientY: 70 })
    expect(rail.style.getPropertyValue('--mx')).toBe('')
  })
})
