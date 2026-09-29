// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SectionRule } from '@/components/ui/SectionRule'
import { LiveDot } from '@/components/ui/LiveDot'

afterEach(cleanup)

describe('SectionRule', () => {
  it('is a heading named by its label, with the index in mono and a decorative rule', () => {
    const { container } = render(<SectionRule label="Longest runs" index="01" />)
    expect(screen.getByRole('heading', { level: 2, name: 'Longest runs' })).toBeTruthy()
    expect(screen.getByText('01').className).toContain('font-mono')
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })

  it('leaves trailing content outside the heading', () => {
    render(
      <SectionRule label="Head to head">
        <span>Die</span>
      </SectionRule>,
    )
    expect(screen.getByRole('heading', { name: 'Head to head' })).toBeTruthy()
    expect(screen.getByText('Die')).toBeTruthy()
  })

  it('can be a plain row', () => {
    render(<SectionRule as="div" label="Standings" />)
    expect(screen.queryByRole('heading')).toBeNull()
  })
})

describe('LiveDot', () => {
  it('is announced by its label', () => {
    render(<LiveDot label="Beer die night live" />)
    expect(screen.getByRole('img', { name: 'Beer die night live' })).toBeTruthy()
  })
})
