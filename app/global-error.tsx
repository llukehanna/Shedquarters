'use client'

/**
 * The last resort: an error thrown by the root layout itself, where
 * app/error.tsx never renders. This file replaces the whole document, so it
 * gets no global stylesheet and no fonts — every style here is inline on
 * purpose, and the palette is hard-coded because the design tokens live in the
 * stylesheet this page does not load.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          padding: 24,
          boxSizing: 'border-box',
          textAlign: 'center',
          background: '#0b0304',
          color: '#f7eedc',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <title>Something broke · Shedquarters</title>
        <div
          style={{
            font: 'italic 800 44px/0.9 "Arial Narrow", system-ui, sans-serif',
            textTransform: 'uppercase',
          }}
        >
          Shed<span style={{ color: '#ffcc00' }}>HQ</span>
        </div>
        <p style={{ margin: 0, maxWidth: 300, color: '#9e8570', fontSize: 15, lineHeight: 1.45 }}>
          Shedquarters hit an error it could not recover from. Try again, or reload the page.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          style={{
            marginTop: 10,
            minHeight: 48,
            padding: '0 28px',
            border: 0,
            borderRadius: 12,
            background: '#ffcc00',
            color: '#3a0000',
            font: 'italic 800 18px/1 "Arial Narrow", system-ui, sans-serif',
            textTransform: 'uppercase',
          }}
        >
          Try again
        </button>
        {error.digest && (
          <p style={{ margin: 0, color: '#5e4a3c', fontSize: 12 }}>Reference: {error.digest}</p>
        )}
      </body>
    </html>
  )
}
