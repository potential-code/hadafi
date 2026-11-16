import { beforeAll, describe, expect, it } from 'bun:test'
import path from 'node:path'
import { MARKETING_CONSENT_TEXT } from '@/lib/signUpConsent'

/**
 * Both sign-up paths show the Terms box and the marketing box, and neither
 * starts ticked: consent is only what the person ticks themselves. The pages
 * are rendered in a separate process (renderConsent.tsx) so their modules
 * don't share state with other test files.
 */

let html: { form: string; card: string }

beforeAll(() => {
  const out = Bun.spawnSync([process.execPath, 'run', path.join(import.meta.dir, 'renderConsent.tsx')], {
    cwd: path.join(import.meta.dir, '..', '..', '..'),
    stderr: 'pipe',
  })
  if (out.exitCode !== 0) throw new Error(`render failed: ${out.stderr.toString()}`)
  html = JSON.parse(out.stdout.toString().trim().split('\n').pop()!)
})

/** Every checkbox input in the markup, with whether it is ticked. */
function checkboxes(markup: string): { checked: boolean }[] {
  return [...markup.matchAll(/<input[^>]*type="checkbox"[^>]*>/g)].map((m) => ({ checked: /\schecked(=|\s|>|\/)/.test(m[0]) }))
}

describe('sign-up consent boxes start unticked', () => {
  it('in the web form', () => {
    expect(html.form).toContain('Terms of Use')
    expect(html.form).toContain('Privacy Policy')
    expect(html.form).toContain(MARKETING_CONSENT_TEXT)
    const boxes = checkboxes(html.form)
    expect(boxes).toHaveLength(2)
    expect(boxes.every((b) => !b.checked)).toBe(true)
  })

  it("in Hana's confirm card, where Confirm waits for the Terms box", () => {
    expect(html.card).toContain('Terms of Use')
    expect(html.card).toContain('Privacy Policy')
    expect(html.card).toContain(MARKETING_CONSENT_TEXT)
    const boxes = checkboxes(html.card)
    expect(boxes).toHaveLength(2)
    expect(boxes.every((b) => !b.checked)).toBe(true)
    const confirm = html.card.match(/<button[^>]*>(?:(?!<\/button>).)*Confirm &amp; Register<\/button>/s)?.[0] ?? ''
    expect(confirm).toMatch(/\sdisabled(=|\s|>)/)
  })
})
