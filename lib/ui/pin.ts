/** Pure state transitions for the gate's PIN keypad. No React, no server code. */

export const PIN_LENGTH = 4

export function pressDigit(pin: string, digit: string): string {
  if (!/^[0-9]$/.test(digit)) return pin
  return pin.length >= PIN_LENGTH ? pin : pin + digit
}

export function pressBackspace(pin: string): string {
  return pin.slice(0, -1)
}

export function isComplete(pin: string): boolean {
  return pin.length === PIN_LENGTH
}
