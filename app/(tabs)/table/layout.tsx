import { redirect } from 'next/navigation'
import { requirePasscode } from '@/lib/auth'

/**
 * Checks the house session before this segment's loading screen streams, so a
 * signed-out visitor gets a real redirect instead of a flash of placeholder.
 * The page checks again; server actions check on their own.
 */
export default async function GatedLayout({ children }: { children: React.ReactNode }) {
  try {
    await requirePasscode()
  } catch {
    redirect('/gate')
  }
  return children
}
