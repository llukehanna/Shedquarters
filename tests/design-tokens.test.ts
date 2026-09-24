import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const css = readFileSync('app/globals.css', 'utf8')

/** The body of the first rule whose selector list contains `selector`. */
function block(selector: string): string {
  const at = css.indexOf(selector)
  if (at < 0) throw new Error(`no ${selector} block in globals.css`)
  const open = css.indexOf('{', at)
  return css.slice(open + 1, css.indexOf('}', open))
}

// Old Glory: Old Glory Blue #0A3161 and Old Glory Red #B31942, the flag's own.
const DIE = {
  ground: '#050c1f', 'ground-glow': '#0a3161', 'ground-deep': '#030814',
  panel: '#b31942', 'panel-hi': '#c41e4a', 'panel-deep': '#8a1030', 'panel-glow': '#d42452', 'panel-shade': '#7d0f2b',
  'panel-ink': '#ffffff', 'panel-sub': '#ffd9e2',
  accent: '#ffffff', 'accent-ink': '#0a3161',
  fg: '#f5f7fc', muted: '#9fabc8', faint: '#6b7896',
  'sheet-top': '#0c1a3a', 'sheet-bottom': '#050c1f',
}

// Ball Yellow & Black: the ball's own colours.
const SPIKE = {
  ground: '#0a0a0a', 'ground-glow': '#17170f', 'ground-deep': '#050505',
  panel: '#ffd400', 'panel-hi': '#ffe033', 'panel-deep': '#f2c200', 'panel-glow': '#ffe54d', 'panel-shade': '#e0b400',
  'panel-ink': '#111111', 'panel-sub': '#3d3500',
  accent: '#ffd400', 'accent-ink': '#111111',
  fg: '#f5f5ef', muted: '#a3a39a', faint: '#6b6b62',
  'sheet-top': '#1a1a14', 'sheet-bottom': '#0a0a0a',
}

// A player's page shows both sports, so the page itself takes neither.
const BOTH = { ground: '#0b0b0e', 'ground-glow': '#10131c', 'ground-deep': '#070709', accent: '#ffffff', 'accent-ink': '#0b0b0e', fg: '#f4f4f6', muted: '#a0a0aa', faint: '#6a6a74' }

function pins(name: string, selector: string, values: Record<string, string>) {
  describe(name, () => {
    for (const [token, value] of Object.entries(values)) {
      it(`--${token} is ${value}`, () => {
        expect(block(selector)).toMatch(new RegExp(`--${token}:\\s*${value};`, 'i'))
      })
    }
  })
}

pins('beer die (the default)', ":root, [data-sport='beer_die']", DIE)
pins('spikeball', "[data-sport='spikeball']", SPIKE)
pins('a page showing both', "[data-sport='both']", BOTH)

describe('the tokens Tailwind builds utilities from', () => {
  it('point every colour at the current sport', () => {
    for (const token of Object.keys(DIE)) {
      expect(block('@theme inline')).toMatch(new RegExp(`--color-${token}:\\s*var\\(--${token}\\);`))
    }
  })

  it('keeps up and down the same in every sport', () => {
    expect(css).toMatch(/--color-up:\s*#4ade80;/)
    expect(css).toMatch(/--color-down:\s*#ff6b6b;/)
  })

  it('imports tailwind', () => {
    expect(css).toMatch(/@import\s+['"]tailwindcss['"];/)
  })

  it('binds the three font families to next/font variables', () => {
    expect(css).toMatch(/--font-display:\s*var\(--font-barlow-condensed\)/)
    expect(css).toMatch(/--font-mono:\s*var\(--font-jetbrains-mono\)/)
    expect(css).toMatch(/--font-body:\s*var\(--font-inter-tight\)/)
  })
})
