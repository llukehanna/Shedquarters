import { describe, it, expect } from 'vitest'
import {
  countLabel,
  formatDiff,
  formatDiffAverage,
  formatMovement,
  formatMovementLabel,
  formatNightDate,
  formatPercent,
  formatRating,
  formatRecord,
  formatStreak,
} from '@/lib/ui/format'

describe('formatRating', () => {
  it('shows one decimal', () => {
    expect(formatRating(31.44)).toBe('31.4')
    expect(formatRating(-4.705)).toBe('-4.7')
  })

  it('never shows negative zero', () => {
    expect(formatRating(-0.04)).toBe('0.0')
    expect(formatRating(-0)).toBe('0.0')
  })
})

describe('formatRecord', () => {
  it('renders wins–losses with an en dash', () => {
    expect(formatRecord(41, 53)).toBe('41–12')
    expect(formatRecord(0, 0)).toBe('0–0')
  })
})

describe('formatPercent', () => {
  it('rounds to a whole percent', () => {
    expect(formatPercent(0.7736)).toBe('77%')
    expect(formatPercent(1)).toBe('100%')
    expect(formatPercent(0)).toBe('0%')
  })
})

describe('countLabel', () => {
  it('pluralizes', () => {
    expect(countLabel(1, 'game')).toBe('1 game')
    expect(countLabel(214, 'game')).toBe('214 games')
    expect(countLabel(2, 'run', 'runs')).toBe('2 runs')
  })
})

describe('formatNightDate', () => {
  it('renders a short weekday, month, and day', () => {
    expect(formatNightDate('2026-09-12T23:00:00.000Z')).toBe('Sat, Sep 12')
  })

  it('uses LA local time, not UTC, so a late-night game keeps its house date', () => {
    // 9pm PDT Friday Sep 11 2026 is 04:00 UTC Saturday Sep 12 — the house
    // played Friday night, and the heading must say Friday, not Saturday.
    expect(formatNightDate('2026-09-12T04:00:00.000Z')).toBe('Fri, Sep 11')
  })
})

describe('formatDiff', () => {
  it('prefixes positive totals with a plus', () => {
    expect(formatDiff(34)).toBe('+34')
  })

  it('leaves negative totals with their minus sign', () => {
    expect(formatDiff(-12)).toBe('-12')
  })

  it('shows zero with no sign', () => {
    expect(formatDiff(0)).toBe('0')
  })

  it('never shows negative zero', () => {
    expect(formatDiff(-0)).toBe('0')
    expect(formatDiff(-0.4)).toBe('0')
  })

  it('rounds to the nearest whole number', () => {
    expect(formatDiff(34.6)).toBe('+35')
    expect(formatDiff(-12.6)).toBe('-13')
  })
})

describe('formatDiffAverage', () => {
  it('prefixes a positive average with a plus', () => {
    expect(formatDiffAverage(1.44)).toBe('+1.4')
  })

  it('leaves a negative average with its minus sign', () => {
    expect(formatDiffAverage(-2.34)).toBe('-2.3')
  })

  it('shows a zero average with no sign', () => {
    expect(formatDiffAverage(0)).toBe('0.0')
  })

  it('never shows negative zero', () => {
    expect(formatDiffAverage(-0.04)).toBe('0.0')
    expect(formatDiffAverage(-0)).toBe('0.0')
  })

  it('never shows a stray plus for a small positive that rounds to zero', () => {
    expect(formatDiffAverage(0.04)).toBe('0.0')
    expect(formatDiffAverage(1 / 30)).toBe('0.0') // total of 1 across 30 games
  })
})

describe('formatStreak', () => {
  it('renders a winning streak', () => {
    expect(formatStreak({ result: 'W', length: 2 })).toBe('W2')
  })

  it('renders a losing streak', () => {
    expect(formatStreak({ result: 'L', length: 4 })).toBe('L4')
  })

  it('renders a two-digit streak', () => {
    expect(formatStreak({ result: 'W', length: 12 })).toBe('W12')
  })
})

describe('formatMovement', () => {
  it('renders upward movement with an up arrow', () => {
    expect(formatMovement(2)).toBe('▲2')
  })

  it('renders downward movement with a down arrow and a positive count', () => {
    expect(formatMovement(-3)).toBe('▼3')
  })

  it('renders no change as an em dash', () => {
    expect(formatMovement(0)).toBe('—')
  })
})

describe('formatMovementLabel', () => {
  it('describes upward movement', () => {
    expect(formatMovementLabel(2)).toBe('Up 2 this week')
  })

  it('describes downward movement with a positive count', () => {
    expect(formatMovementLabel(-3)).toBe('Down 3 this week')
  })

  it('describes no change', () => {
    expect(formatMovementLabel(0)).toBe('No change this week')
  })
})
