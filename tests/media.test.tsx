// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { DESKTOP_QUERY, matches, useMediaQuery } from '@/lib/ui/media'
import { stubMatchMedia, unstubMatchMedia } from './helpers/match-media'

function Probe() {
  return <p>{useMediaQuery(DESKTOP_QUERY) ? 'desktop' : 'phone'}</p>
}

afterEach(() => {
  cleanup()
  unstubMatchMedia()
})

describe('matches', () => {
  it('is false where matchMedia does not exist', () => {
    expect(matches(DESKTOP_QUERY)).toBe(false)
  })

  it('reads the query', () => {
    stubMatchMedia([DESKTOP_QUERY])
    expect(matches(DESKTOP_QUERY)).toBe(true)
    expect(matches('(min-width: 9999px)')).toBe(false)
  })
})

describe('useMediaQuery', () => {
  it('reports a matching query', () => {
    stubMatchMedia([DESKTOP_QUERY])
    render(<Probe />)
    expect(screen.getByText('desktop')).toBeTruthy()
  })

  it('reports false without matchMedia', () => {
    render(<Probe />)
    expect(screen.getByText('phone')).toBeTruthy()
  })
})
