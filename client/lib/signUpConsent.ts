import { MARKETING_CONSENT_TEXT } from '../../shared/marketingConsent'

export { MARKETING_CONSENT_TEXT }

export interface SignUpConsent {
  /** The required "I agree to the Terms of Use and Privacy Policy" box. */
  termsAccepted?: boolean
  /** The optional marketing box (MARKETING_CONSENT_TEXT). Unticked by default. */
  marketingOptIn?: boolean
}

/**
 * The consent fields both sign-up paths send to /api/auth/hadafi/sign-up, or
 * null when the Terms box isn't ticked (the server refuses the sign-up then).
 * The wording isn't sent: the server stores its own copy.
 */
export function consentBody(c: SignUpConsent): { termsAccepted: true; marketingOptIn: boolean } | null {
  if (c.termsAccepted !== true) return null
  return { termsAccepted: true, marketingOptIn: c.marketingOptIn === true }
}
