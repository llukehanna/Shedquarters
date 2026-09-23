import { describe, it, expect } from 'vitest'
import { PIN_LENGTH, pressDigit, pressBackspace, isComplete } from '@/lib/ui/pin'

describe('PIN keypad', () => {
  it('is four digits', () => {
    expect(PIN_LENGTH).toBe(4)
  })

  it('appends digits up to four and ignores more', () => {
    expect(pressDigit('', '8')).toBe('8')
    expect(pressDigit('847', '2')).toBe('8472')
    expect(pressDigit('8472', '9')).toBe('8472')
  })

  it('ignores anything that is not a single digit', () => {
    expect(pressDigit('84', 'a')).toBe('84')
    expect(pressDigit('84', '12')).toBe('84')
    expect(pressDigit('84', '')).toBe('84')
  })

  it('backspace removes the last digit and is safe when empty', () => {
    expect(pressBackspace('847')).toBe('84')
    expect(pressBackspace('')).toBe('')
  })

  it('is complete only at exactly four digits', () => {
    expect(isComplete('847')).toBe(false)
    expect(isComplete('8472')).toBe(true)
  })
})
