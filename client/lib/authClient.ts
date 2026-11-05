import { createAuthClient } from 'better-auth/react'
import { emailOTPClient } from 'better-auth/client/plugins'

/**
 * Better Auth in the browser. Same-origin: the Next app forwards /api/* to
 * the API server (next.config.ts rewrites), so the httpOnly session cookie
 * belongs to this site. No token ever touches localStorage.
 */
export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [emailOTPClient()],
})
