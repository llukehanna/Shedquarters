export type LogGameInput = {
  clientId: string
  sessionId: string
  winner: 'holders' | 'challengers'
  loserScore: number
  nextChallengers: string[]
  /**
   * What this game was played to. Optional so a game queued by a phone
   * still running an older build (which never sent it) still lands: the
   * server falls back to the night's current target.
   */
  targetScore?: number
}
