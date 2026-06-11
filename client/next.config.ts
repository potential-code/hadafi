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
  env: {
    NEXT_PUBLIC_AI_BACKEND_URL: process.env.NEXT_PUBLIC_AI_BACKEND_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  },
}

export default config
