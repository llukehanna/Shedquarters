'use client'

import { MotionConfig } from 'motion/react'

/** Every animation in the app honors the OS "reduce motion" setting. */
export function Providers({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
