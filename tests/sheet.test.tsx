// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Sheet } from '@/components/ui/Sheet'
import { DESKTOP_QUERY } from '@/lib/ui/media'
import { stubMatchMedia, unstubMatchMedia } from './helpers/match-media'

function Harness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Sheet
        open={open}
        label="Edit player"
        onClose={() => {
          onClose()
          setOpen(false)
        }}
      >
        <button>First</button>
        <button>Last</button>
      </Sheet>
    </>
  )
}

afterEach(() => {
  cleanup()
  unstubMatchMedia()
})

describe.each([
  ['on a phone', [] as string[]],
  ['on desktop', [DESKTOP_QUERY]],
])('Sheet %s', (_, matching) => {
  function open() {
    stubMatchMedia(matching)
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    // A real click focuses the button; fireEvent.click does not, so focus it
    // first. That's what the sheet hands focus back to.
    screen.getByText('Open').focus()
    fireEvent.click(screen.getByText('Open'))
    return onClose
  }

  it('opens as a labelled dialog with focus on its first control', () => {
    open()
    expect(screen.getByRole('dialog', { name: 'Edit player' })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByText('First'))
  })

  it('closes on Escape and hands focus back', () => {
    const onClose = open()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(screen.getByText('Open'))
  })

  it('closes on a backdrop click', () => {
    const onClose = open()
    fireEvent.click(screen.getByTestId('sheet-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps Tab inside', () => {
    open()
    screen.getByText('Last').focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByText('First'))
  })
})
