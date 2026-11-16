import { apiFetch } from './api'
import { consentStore, type SignUpMethod } from './consent/store'

/**
 * Creates the account (and signs in) for both sign-up paths, then tells
 * Google Tag Manager a sign-up happened, with the method only. Errors are
 * passed on unchanged, and nothing is reported for them.
 */
export async function createAccount(
  body: Record<string, unknown>,
  method: SignUpMethod,
  deps: {
    post?: (path: string, init?: RequestInit) => Promise<unknown>
    track?: (method: SignUpMethod) => void
  } = {},
): Promise<void> {
  const post = deps.post ?? apiFetch
  const track = deps.track ?? ((m: SignUpMethod) => consentStore.trackSignUp(m))
  await post('/api/auth/hadafi/sign-up', { method: 'POST', body: JSON.stringify(body) })
  try {
    track(method)
  } catch {
    /* measurement must never break a sign-up */
  }
}
