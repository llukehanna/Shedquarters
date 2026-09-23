export type LogGameInput = {
  clientId: string
  sessionId: string
  winner: 'holders' | 'challengers'
  loserScore: number
  nextChallengers: string[]
}
