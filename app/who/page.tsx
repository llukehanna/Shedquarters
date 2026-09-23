import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth'
import { getPlayers } from '@/lib/queries'
import { getClaimedPlayerIds } from '@/lib/identity'
import { WhoAreYou } from '@/components/WhoAreYou'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Who are you?' }

export default async function Who() {
  try {
    await requireSession()
  } catch {
    redirect('/gate')
  }

  const [players, claimed] = await Promise.all([getPlayers(), getClaimedPlayerIds()])
  const claimedSet = new Set(claimed)

  return (
    <WhoAreYou
      players={players.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        isHousemate: p.isHousemate,
        claimed: claimedSet.has(p.id),
      }))}
    />
  )
}
