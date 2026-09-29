// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { RefreshIfStale, STALE_AFTER_MS } from '@/components/RefreshIfStale'

const NOW = 1_800_000_000_000
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  refresh.mockClear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// A tab served from the phone's page cache shows instantly, then catches up.
describe('RefreshIfStale', () => {
  it('refreshes a page that came from the cache', () => {
    render(<RefreshIfStale renderedAt={NOW - 60_000} />)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('leaves a page the server just rendered alone', () => {
    render(<RefreshIfStale renderedAt={NOW - 500} />)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('draws the line at STALE_AFTER_MS', () => {
    render(<RefreshIfStale renderedAt={NOW - STALE_AFTER_MS} />)
    expect(refresh).not.toHaveBeenCalled()
    cleanup()
    render(<RefreshIfStale renderedAt={NOW - STALE_AFTER_MS - 1} />)
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
