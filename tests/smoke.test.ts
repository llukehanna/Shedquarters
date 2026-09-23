import { describe, it, expect } from 'vitest'
import { sql } from '@/lib/db'

describe('harness', () => {
  it('resolves the @ alias and loads the db client', () => {
    expect(typeof sql).toBe('function')
  })
})
