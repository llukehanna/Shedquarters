import { describe, it, expect, vi, beforeEach } from 'vitest'

// Both dependencies are mocked so this test can run with no
// BLOB_READ_WRITE_TOKEN and without ever touching the database — it is
// exercising the auth gate in app/api/cron/backup/route.ts in isolation.
vi.mock('@/lib/backup', () => ({ assembleDump: vi.fn() }))
vi.mock('@vercel/blob', () => ({ put: vi.fn() }))

import { GET } from '@/app/api/cron/backup/route'
import { assembleDump } from '@/lib/backup'
import { put } from '@vercel/blob'

describe('GET /api/cron/backup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
  })

  it('refuses with 500 when CRON_SECRET is unset, without touching the database', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(
      new Request('http://localhost/api/cron/backup', {
        headers: { authorization: 'Bearer anything' },
      }),
    )
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ ok: false })
    expect(assembleDump).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
  })

  it('rejects a request with no Authorization header before touching the database', async () => {
    const res = await GET(new Request('http://localhost/api/cron/backup'))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false })
    expect(assembleDump).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
  })

  it('rejects a request with the wrong secret before touching the database', async () => {
    const res = await GET(
      new Request('http://localhost/api/cron/backup', {
        headers: { authorization: 'Bearer wrong-secret' },
      }),
    )
    expect(res.status).toBe(401)
    expect(assembleDump).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
  })

  it('proceeds when the bearer token matches CRON_SECRET', async () => {
    vi.mocked(assembleDump).mockResolvedValue({
      takenAt: '2026-09-07T09:00:00.000Z',
      players: [],
      sessions: [],
      games: [{ id: 1 }, { id: 2 }],
    })
    vi.mocked(put).mockResolvedValue({ url: 'https://example.blob.vercel-storage.com/backups/2026-09-07.json' } as never)

    const res = await GET(
      new Request('http://localhost/api/cron/backup', {
        headers: { authorization: 'Bearer test-secret' },
      }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      ok: true,
      url: 'https://example.blob.vercel-storage.com/backups/2026-09-07.json',
      games: 2,
    })
    expect(assembleDump).toHaveBeenCalledTimes(1)
    expect(put).toHaveBeenCalledTimes(1)
  })
})
