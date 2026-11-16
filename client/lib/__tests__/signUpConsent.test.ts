import { describe, expect, it } from 'bun:test'
import { MARKETING_CONSENT_TEXT, consentBody } from '../signUpConsent'

/**
 * Both sign-up paths (the form and Hana's chat) send the same consent fields:
 * the required Terms tick and the optional, unticked marketing box. Without
 * the Terms tick there is nothing to send, and the account is not created.
 */
describe('sign-up consent body', () => {
  it('needs the Terms box ticked', () => {
    expect(consentBody({})).toBeNull()
    expect(consentBody({ termsAccepted: false, marketingOptIn: true })).toBeNull()
  })

  it('sends marketing as off unless it was ticked', () => {
    expect(consentBody({ termsAccepted: true })).toEqual({ termsAccepted: true, marketingOptIn: false })
    expect(consentBody({ termsAccepted: true, marketingOptIn: true })).toEqual({ termsAccepted: true, marketingOptIn: true })
  })

  it('never sends the wording: the server has its own copy', () => {
    expect(JSON.stringify(consentBody({ termsAccepted: true, marketingOptIn: true }))).not.toContain('Potential.org')
    expect(MARKETING_CONSENT_TEXT).toBe(
      'Send me programme updates, offers and event invitations from the Potential.org Foundation. You can unsubscribe at any time.',
    )
  })
})
