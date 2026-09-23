import { redirect } from 'next/navigation'
import { getActiveTable } from '@/lib/session'
import { getPlayers } from '@/lib/queries'
import { requirePasscode } from '@/lib/auth'
import { TableMode } from '@/components/TableMode'
import { SessionSetup } from '@/components/SessionSetup'

export const dynamic = 'force-dynamic'

export default async function TablePage() {
  try {
    await requirePasscode()
  } catch {
    redirect('/gate')
  }

  const [table, players] = await Promise.all([getActiveTable(), getPlayers()])
  if (!table) return <SessionSetup players={players} />

  return (
    <TableMode
      // Keyed on the session id so a session change — e.g. an undo pulls a
      // newly-started session into what was already a mounted TableMode —
      // remounts the component from scratch instead of reusing it with new
      // props. Without this, every piece of local UI state (phase, picked,
      // the teams-editor sentinels) would carry over from the old session,
      // and the phase-save effect would write the previous session's phase
      // under the new session's storage key.
      key={table.sessionId}
      sessionId={table.sessionId}
      serverTable={{
        holders: table.holders,
        challengers: table.challengers,
        runLength: table.runLength,
        seq: table.seq,
      }}
      sport={table.gameType}
      serverTarget={table.targetScore}
      players={players}
    />
  )
}
