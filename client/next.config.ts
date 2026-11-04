import type { NextConfig } from 'next'
import { config as loadEnv } from 'dotenv'
import path from 'path'

loadEnv({ path: path.resolve(__dirname, '../.env'), override: false })

const config: NextConfig = {
  output: 'standalone',
  // Monorepo: `next` is hoisted to the workspace root node_modules. Trace from
  // the repo root so the standalone bundle includes it (otherwise the runtime
  // crashes with "Cannot find module 'next'"). This nests the output under
  // client/, which the Dockerfile copy paths account for.
  outputFileTracingRoot: path.join(__dirname, '..'),
  typescript: {
    tsconfigPath: '../tsconfig.json',
  },
  allowedDevOrigins: [
    '*.replit.dev',
    '*.repl.co',
    '*.sisko.replit.dev',
    '*.picard.replit.dev',
    '*.kirk.replit.dev',
    '*.janeway.replit.dev',
    '*.worf.replit.dev',
    '*.spock.replit.dev',
    '*.riker.replit.dev',
  ],
  // Don't advertise the framework in every response.
  poweredByHeader: false,
  async headers() {
    return [
      {
        // public/images file names are not content-hashed, so cache for a day
        // and revalidate in the background for a week rather than forever.
        source: '/images/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
      {
        // Every page (the /api responses get theirs from the API's helmet).
        // Other sites can't frame Hadafi, so they can't trick a signed-in
        // admin into clicking through an invisible page.
        source: '/((?!api/).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // The microphone stays available to this site (Hana's voice chat).
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), browsing-topics=()' },
          ...(process.env.NODE_ENV === 'production'
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
            : []),
        ],
      },
    ]
  },
  env: {
    NEXT_PUBLIC_AI_BACKEND_URL: process.env.NEXT_PUBLIC_AI_BACKEND_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  },
}

export default config
