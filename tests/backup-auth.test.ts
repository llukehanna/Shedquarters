import { describe, it, expect, vi, beforeEach } from 'vitest'

// Both dependencies are mocked so this test can run with no KV binding and
// without ever touching the database — it is exercising the auth gate in
// app/api/cron/backup/route.ts in isolation.
vi.mock('@/lib/backup', () => ({ assembleDump: vi.fn() }))
vi.mock('@/lib/backup-store', () => ({ putBackup: vi.fn() }))

import { GET } from '@/app/api/cron/backup/route'
import { assembleDump } from '@/lib/backup'
import { putBackup } from '@/lib/backup-store'

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
    expect(putBackup).not.toHaveBeenCalled()
  })

  it('rejects a request with no Authorization header before touching the database', async () => {
    const res = await GET(new Request('http://localhost/api/cron/backup'))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false })
    expect(assembleDump).not.toHaveBeenCalled()
    expect(putBackup).not.toHaveBeenCalled()
  })

  it('rejects a request with the wrong secret before touching the database', async () => {
    const res = await GET(
      new Request('http://localhost/api/cron/backup', {
        headers: { authorization: 'Bearer wrong-secret' },
      }),
    )
    expect(res.status).toBe(401)
    expect(assembleDump).not.toHaveBeenCalled()
    expect(putBackup).not.toHaveBeenCalled()
  })

  it('proceeds when the bearer token matches CRON_SECRET', async () => {
    vi.mocked(assembleDump).mockResolvedValue({
      takenAt: '2026-09-07T09:00:00.000Z',
      players: [],
      sessions: [],
      games: [{ id: 1 }, { id: 2 }],
    })
    vi.mocked(putBackup).mockResolvedValue()

    const res = await GET(
      new Request('http://localhost/api/cron/backup', {
        headers: { authorization: 'Bearer test-secret' },
      }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    const key = `backups/${new Date().toISOString().slice(0, 10)}.json`
    expect(body).toEqual({ ok: true, key, games: 2 })
    expect(assembleDump).toHaveBeenCalledTimes(1)
    expect(putBackup).toHaveBeenCalledTimes(1)
    expect(vi.mocked(putBackup).mock.calls[0][0]).toBe(key)
    expect(JSON.parse(vi.mocked(putBackup).mock.calls[0][1]).games).toHaveLength(2)
  })
})
