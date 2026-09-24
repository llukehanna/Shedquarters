import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const css = readFileSync('app/globals.css', 'utf8')

describe('design tokens match the spec exactly', () => {
  const tokens: Record<string, string> = {
    '--color-ground': '#0b0304',
    '--color-ground-glow': '#170507',
    '--color-ground-deep': '#070203',
    '--color-panel': '#990000',
    '--color-panel-hi': '#b30000',
    '--color-panel-deep': '#6e0000',
    '--color-accent': '#ffcc00',
    '--color-accent-ink': '#3a0000',
    '--color-fg': '#f7eedc',
    '--color-muted': '#9e8570',
    '--color-faint': '#5e4a3c',
    '--color-up': '#4ade80',
    '--color-down': '#ff6b6b',
    '--color-panel-glow': '#c40000',
    '--color-panel-shade': '#8a0000',
    '--color-sheet-top': '#1f0709',
    '--color-sheet-bottom': '#0d0304',
  }

  for (const [name, value] of Object.entries(tokens)) {
    it(`${name} is ${value}`, () => {
      expect(css).toMatch(new RegExp(`${name}:\\s*${value};`, 'i'))
    })
  }

  it('imports tailwind', () => {
    expect(css).toMatch(/@import\s+['"]tailwindcss['"];/)
  })

  it('binds the three font families to next/font variables', () => {
    expect(css).toMatch(/--font-display:\s*var\(--font-barlow-condensed\)/)
    expect(css).toMatch(/--font-mono:\s*var\(--font-jetbrains-mono\)/)
    expect(css).toMatch(/--font-body:\s*var\(--font-inter-tight\)/)
  })
})
