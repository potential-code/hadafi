'use client'

/**
 * Last-resort boundary for errors in the root layout itself. It replaces the
 * whole document, so it renders its own <html>/<body> and inline styles
 * (the app's CSS may be what failed).
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 16px',
          boxSizing: 'border-box',
          background: '#F7F7F9',
          color: '#17171C',
          fontFamily: "'Geist', system-ui, -apple-system, 'Segoe UI', sans-serif",
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        <div
          role="alert"
          style={{
            width: '100%',
            maxWidth: 440,
            boxSizing: 'border-box',
            background: '#FFFFFF',
            border: '1px solid #E5E5EA',
            borderRadius: 14,
            padding: 28,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <img src="/images/hadafi-logo.png" alt="Hadafi" style={{ height: 34, width: 'auto', alignSelf: 'flex-start' }} />
          <h1 style={{ margin: '6px 0 0', fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>
            Hadafi is having trouble loading
          </h1>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: '#5B5B67' }}>
            Please try again in a moment. If this keeps happening, contact{' '}
            <a href="mailto:hadafi@potential.com" style={{ color: '#c8106a', fontWeight: 600, textDecoration: 'none' }}>
              hadafi@potential.com
            </a>
            .
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              alignSelf: 'flex-start',
              marginTop: 4,
              height: 40,
              padding: '0 16px',
              background: '#c8106a',
              color: '#fff',
              border: 0,
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
