import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'

const req = (url: string) => new NextRequest(new URL(url, 'https://shed.test'))

function target(res: Response): string {
  const url = new URL(res.headers.get('location')!)
  return url.pathname + url.search
}

describe('proxy', () => {
  it('turns ?sport= into the cookie and redirects to the same page without it', () => {
    const res = proxy(req('/h2h?a=1&sport=spikeball&b=2'))
    expect(res.status).toBe(307)
    expect(target(res)).toBe('/h2h?a=1&b=2')
    expect(res.cookies.get('shed-sport')?.value).toBe('spikeball')
  })

  it('stores beer die for a sport it does not know', () => {
    const res = proxy(req('/?sport=darts'))
    expect(target(res)).toBe('/')
    expect(res.cookies.get('shed-sport')?.value).toBe('beer_die')
  })

  it('keeps the cookie for a year', () => {
    const res = proxy(req('/table?sport=spikeball'))
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=31536000/i)
  })

  it('lets a URL without ?sport= straight through', () => {
    const res = proxy(req('/games'))
    expect(res.headers.get('location')).toBeNull()
    expect(res.cookies.get('shed-sport')).toBeUndefined()
  })
})
