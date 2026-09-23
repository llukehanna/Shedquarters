import type { Metadata, Viewport } from 'next'
import { Barlow_Condensed, Inter_Tight, JetBrains_Mono } from 'next/font/google'
import { Providers } from '@/components/Providers'
import { ServiceWorker } from '@/components/ServiceWorker'
import './globals.css'

// Barlow Condensed is not a variable font, so each weight and style used must be listed.
const display = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-barlow-condensed',
  display: 'swap',
})

const body = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  display: 'swap',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: 'Shedquarters', template: '%s · Shedquarters' },
  description: 'Beer die rankings for the Shed. Est. 2026.',
  applicationName: 'Shedquarters',
  // Opened from the home screen the app runs full-screen with an opaque status bar.
  //
  // Deliberately NO `viewportFit: 'cover'`: with it, page pixels sit under the
  // status bar, and from iOS 26 the system fills that inset with the Liquid
  // Glass scroll-edge effect — a blur band across the top of every screen that
  // no CSS or meta tag can turn off. Without it, iOS insets the web view below
  // the status bar and the home indicator itself, so there is nothing to blur
  // (and every env(safe-area-inset-*) reads 0, which the layout allows for).
  appleWebApp: { capable: true, title: 'Shed HQ', statusBarStyle: 'black' },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: '#0b0304',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}</Providers>
        <ServiceWorker />
      </body>
    </html>
  )
}
