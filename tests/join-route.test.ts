import { describe, expect, it, vi, beforeEach } from 'vitest'

const enterWithInvite = vi.fn()
vi.mock('@/lib/auth', () => ({ enterWithInvite }))

const { GET } = await import('@/app/join/[token]/route')

function request() {
  return new Request('https://shed.example/join/whatever')
}

beforeEach(() => {
  enterWithInvite.mockReset()
})

describe('GET /join/[token]', () => {
  it('sends a good link to "who are you"', async () => {
    enterWithInvite.mockResolvedValue(true)
    const res = await GET(request(), { params: Promise.resolve({ token: 'good' }) })
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://shed.example/who')
  })

  it('sends a stale link to the gate with an explanation', async () => {
    enterWithInvite.mockResolvedValue(false)
    const res = await GET(request(), { params: Promise.resolve({ token: 'stale' }) })
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://shed.example/gate?invite=stale')
  })

  it('passes the token through untouched', async () => {
    enterWithInvite.mockResolvedValue(true)
    await GET(request(), { params: Promise.resolve({ token: 'abc-123_XYZ' }) })
    expect(enterWithInvite).toHaveBeenCalledWith('abc-123_XYZ')
  })
})
