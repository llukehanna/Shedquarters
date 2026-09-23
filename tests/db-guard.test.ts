import { afterEach, describe, expect, it } from 'vitest'
import { assertLocalDatabase } from '@/lib/db-guard'

const original = process.env.DATABASE_URL

afterEach(() => {
  if (original === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = original
})

describe('assertLocalDatabase', () => {
  it.each([
    'postgresql://houseladder:houseladder@localhost:55432/houseladder',
    'postgres://u:p@127.0.0.1:5432/db',
    'postgres://u:p@[::1]:5432/db',
  ])('allows a local database (%s)', (url) => {
    process.env.DATABASE_URL = url
    expect(() => assertLocalDatabase()).not.toThrow()
  })

  it.each([
    ['a Neon production URL', 'postgres://u:p@ep-cool-name.us-east-2.aws.neon.tech/db?sslmode=require'],
    ['a bare remote host', 'postgres://u:p@db.example.com:5432/db'],
    // Guards against a hostname that merely *contains* "localhost".
    ['a lookalike host', 'postgres://u:p@localhost.evil.example.com:5432/db'],
  ])('refuses %s', (_label, url) => {
    process.env.DATABASE_URL = url
    expect(() => assertLocalDatabase()).toThrow(/non-local database/)
  })

  it('refuses an unset DATABASE_URL', () => {
    delete process.env.DATABASE_URL
    expect(() => assertLocalDatabase()).toThrow(/DATABASE_URL is not set/)
  })

  it('refuses an unparseable DATABASE_URL', () => {
    process.env.DATABASE_URL = 'not a url'
    expect(() => assertLocalDatabase()).toThrow(/not a parseable URL/)
  })
})
