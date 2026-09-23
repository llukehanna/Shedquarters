'use server'

import { redirect } from 'next/navigation'
import { setPasscode } from '@/lib/auth'
import type { GateStatus } from '@/lib/domain/gate-limit'

/**
 * The gate's form action. Deliberately not in lib/actions.ts: every export
 * there requires an existing session, and this is where one is created.
 */
export async function submitPin(_prev: GateStatus | null, formData: FormData): Promise<GateStatus> {
  const status = await setPasscode(String(formData.get('code') ?? ''))
  // setPasscode always issues an unclaimed cookie, so "Who are you?" — shown
  // whenever the phone has no claim yet (spec §2) — is always the right
  // destination after a correct PIN (spec §1).
  if (status === 'ok') redirect('/who')
  return status
}
