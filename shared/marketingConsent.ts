/**
 * The optional marketing box on both sign-up paths (the form and Hana's chat)
 * and the setting on the learner's profile. The server stores this constant
 * as the wording the learner agreed to; it never trusts text from the client.
 * Changing it changes what new opt-ins agree to, so treat it as a legal text.
 */
export const MARKETING_CONSENT_TEXT =
  "Send me programme updates, offers and event invitations from the Potential.org Foundation. You can unsubscribe at any time.";
