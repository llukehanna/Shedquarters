'use client'

import { createContext, useContext } from 'react'
import { DEFAULT_SPORT, type Sport } from '@/lib/domain/sport'

type SportState = { sport: Sport; liveSports: readonly Sport[] }

const SportContext = createContext<SportState>({ sport: DEFAULT_SPORT, liveSports: [] })

/**
 * The sport this phone is on (from the `shed-sport` cookie) and which sports
 * have a night going, read once by the tabs layout on the server and handed to
 * the client components that need them: the top-bar pill, mostly.
 */
export function SportProvider({
  sport,
  liveSports,
  children,
}: SportState & { children: React.ReactNode }) {
  return <SportContext.Provider value={{ sport, liveSports }}>{children}</SportContext.Provider>
}

export function useSport(): Sport {
  return useContext(SportContext).sport
}

export function useLiveSports(): readonly Sport[] {
  return useContext(SportContext).liveSports
}
