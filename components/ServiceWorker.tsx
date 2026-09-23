'use client'

import { useEffect } from 'react'

/** Registers the offline-screen service worker in production builds only. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {})
  }, [])
  return null
}
