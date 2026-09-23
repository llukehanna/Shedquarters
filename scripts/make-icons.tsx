/**
 * Renders the home-screen icons to static PNGs in the brand italic.
 * Run after changing the mark: `npx tsx scripts/make-icons.tsx`
 * (next/og's default font has no italic, so the icons are baked here
 * instead of rendered per request).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { ImageResponse } from 'next/og'

const CARDINAL = '#990000'
const GOLD = '#FFCC00'
const font = readFileSync('node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-800-italic.woff')

/** `ring` draws the gold border; `scale` shrinks the mark for maskable safe zones. */
async function render(file: string, px: number, { ring = true, scale = 1 } = {}) {
  const res = new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: CARDINAL,
          ...(ring ? { boxShadow: `inset 0 0 0 ${Math.round(px * 0.05)}px ${GOLD}` } : {}),
        }}
      >
        <span
          style={{
            color: GOLD,
            fontFamily: 'Barlow Condensed',
            fontStyle: 'italic',
            fontWeight: 800,
            fontSize: Math.round(px * 0.56 * scale),
            letterSpacing: -px * 0.01,
            marginTop: -px * 0.04 * scale,
          }}
        >
          HQ
        </span>
      </div>
    ),
    {
      width: px,
      height: px,
      fonts: [{ name: 'Barlow Condensed', data: font, style: 'italic', weight: 800 }],
    },
  )
  writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  console.log('wrote', file)
}

async function main() {
  // iOS rounds the corners itself, which would clip a square ring.
  await render('app/apple-icon.png', 180, { ring: false, scale: 0.9 })
  await render('public/icons/icon-192.png', 192)
  await render('public/icons/icon-512.png', 512)
  // Maskable icons get cropped to a circle or squircle: no ring, mark inside the safe zone.
  await render('public/icons/maskable-512.png', 512, { ring: false, scale: 0.75 })
}

main()
