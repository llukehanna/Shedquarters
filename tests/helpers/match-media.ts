import { vi } from 'vitest'

/** jsdom has no matchMedia. This installs one where exactly `matching` queries match. */
export function stubMatchMedia(matching: string[]): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: matching.includes(query),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

export function unstubMatchMedia(): void {
  delete (window as { matchMedia?: unknown }).matchMedia
}
