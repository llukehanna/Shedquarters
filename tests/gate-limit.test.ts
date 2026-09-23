import { describe, expect, it } from 'vitest'
import {
  GLOBAL_FAILURE_LIMIT,
  GLOBAL_WINDOW_MS,
  IP_FAILURE_LIMIT,
  IP_WINDOW_MS,
  UNKNOWN_IP,
  clientIpFrom,
  decideGateAttempt,
} from '@/lib/domain/gate-limit'

describe('gate limit constants', () => {
  it('are the documented values', () => {
    expect(IP_FAILURE_LIMIT).toBe(5)
    expect(IP_WINDOW_MS).toBe(15 * 60 * 1000)
    expect(GLOBAL_FAILURE_LIMIT).toBe(20)
    expect(GLOBAL_WINDOW_MS).toBe(24 * 60 * 60 * 1000)
  })
})

describe('decideGateAttempt', () => {
  it('allows a clean slate', () => {
    expect(decideGateAttempt({ ipFailures: 0, globalFailures: 0 })).toEqual({ allowed: true })
  })

  it('per IP: allows at 4 failures, locks at 5', () => {
    expect(decideGateAttempt({ ipFailures: 4, globalFailures: 4 })).toEqual({ allowed: true })
    expect(decideGateAttempt({ ipFailures: 5, globalFailures: 5 })).toEqual({ allowed: false, reason: 'ip' })
    expect(decideGateAttempt({ ipFailures: 9, globalFailures: 9 })).toEqual({ allowed: false, reason: 'ip' })
  })

  it('global: allows at 19 failures, locks at 20 even for a fresh IP', () => {
    expect(decideGateAttempt({ ipFailures: 0, globalFailures: 19 })).toEqual({ allowed: true })
    expect(decideGateAttempt({ ipFailures: 0, globalFailures: 20 })).toEqual({ allowed: false, reason: 'global' })
    expect(decideGateAttempt({ ipFailures: 0, globalFailures: 100 })).toEqual({ allowed: false, reason: 'global' })
  })

  it('reports the global lock when both are exceeded', () => {
    expect(decideGateAttempt({ ipFailures: 5, globalFailures: 20 })).toEqual({ allowed: false, reason: 'global' })
  })
})

describe('clientIpFrom', () => {
  const h = (entries: Record<string, string>) => new Headers(entries)

  it('prefers x-vercel-forwarded-for', () => {
    expect(
      clientIpFrom(h({ 'x-vercel-forwarded-for': '1.1.1.1', 'x-real-ip': '2.2.2.2', 'x-forwarded-for': '3.3.3.3' })),
    ).toBe('1.1.1.1')
  })

  it('falls back to x-real-ip, then the first x-forwarded-for entry', () => {
    expect(clientIpFrom(h({ 'x-real-ip': '2.2.2.2', 'x-forwarded-for': '3.3.3.3' }))).toBe('2.2.2.2')
    expect(clientIpFrom(h({ 'x-forwarded-for': ' 3.3.3.3 , 4.4.4.4' }))).toBe('3.3.3.3')
  })

  it('uses the shared unknown bucket rather than skipping limiting', () => {
    expect(clientIpFrom(h({}))).toBe(UNKNOWN_IP)
    expect(clientIpFrom(h({ 'x-forwarded-for': ' , ' }))).toBe(UNKNOWN_IP)
  })
})
