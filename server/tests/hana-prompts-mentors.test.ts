import { describe, it, expect } from 'bun:test'
import { ASK_HANA_PROMPT, SIGN_UP_PROMPT } from '../../shared/hana/prompts'
import { HUMAN_MENTORS_ENABLED } from '../../shared/features'
import { browserClaims, guestClaims, fingerprint } from '../services/serviceTokenClaims'

/**
 * With human mentors off (the default), Hana's prompts tell her sessions aren't
 * available and stop describing booking, and the API still fingerprints
 * exactly the prompts the site sends.
 */
describe("Hana's prompts with human mentors off", () => {
  it('is the default', () => {
    expect(HUMAN_MENTORS_ENABLED).toBe(false)
  })

  it('tells Ask Hana not to offer sessions and to offer the AI mentors', () => {
    expect(ASK_HANA_PROMPT).toContain('HUMAN MENTORS ARE NOT AVAILABLE RIGHT NOW')
    expect(ASK_HANA_PROMPT).toContain('showAiMentorCards')
  })

  it('no longer tells visitors they can book expert sessions', () => {
    expect(SIGN_UP_PROMPT).not.toContain('Human Expert Sessions')
  })

  it('is the prompt the API lets the browser send', () => {
    expect(browserClaims('sme').prompts).toContain(fingerprint(ASK_HANA_PROMPT))
    expect(guestClaims().prompts).toContain(fingerprint(SIGN_UP_PROMPT))
  })
})
