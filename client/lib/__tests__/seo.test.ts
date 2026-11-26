import { describe, expect, it } from 'bun:test'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import robots from '../../app/robots'
import sitemap from '../../app/sitemap'
import { NOINDEX, SITE_URL } from '../seo'

const ORIGIN = 'https://hadafi.potential.org'
const PRIVATE = ['/dashboard', '/admin', '/mentor', '/partner', '/api', '/unsubscribe']
const AI_SEARCH_BOTS = ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot']

const asList = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])

/**
 * The `export const metadata = { ... }` of a page or layout, as property name ->
 * source text. Read from the source rather than imported: importing a page
 * loads its whole component tree, which other test files load later with their
 * own browser globals and stubs, and a module loads only once per run.
 */
function metadataOf(file: string): Record<string, string> {
  const full = path.join(import.meta.dir, '../../app', file)
  const src = ts.createSourceFile(full, fs.readFileSync(full, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let props: Record<string, string> | undefined
  src.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return
    if (!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return
    for (const decl of node.declarationList.declarations) {
      if (decl.name.getText(src) !== 'metadata' || !decl.initializer || !ts.isObjectLiteralExpression(decl.initializer)) continue
      props = {}
      for (const p of decl.initializer.properties) {
        if (ts.isPropertyAssignment(p)) props[p.name.getText(src)] = p.initializer.getText(src)
      }
    }
  })
  if (!props) throw new Error(`${file} exports no metadata object`)
  // Next refuses metadata from a client component, so the file must be a server one.
  expect(src.statements[0]?.getText(src)).not.toMatch(/^['"]use client['"]/)
  return props
}

describe('robots.txt', () => {
  const r = robots()
  const rules = asList(r.rules)
  const ruleFor = (agent: string) => rules.find((rule) => asList(rule.userAgent).includes(agent))

  it('keeps every crawler out of the private areas and lets it in everywhere else', () => {
    const all = ruleFor('*')!
    expect(asList(all.allow)).toEqual(['/'])
    for (const p of PRIVATE) expect(asList(all.disallow)).toContain(p)
  })

  it('does not block /login, so crawlers can see its noindex', () => {
    for (const rule of rules) expect(asList(rule.disallow)).not.toContain('/login')
  })

  it('names the AI search and user-fetch bots, with the same private areas', () => {
    for (const bot of AI_SEARCH_BOTS) {
      const rule = ruleFor(bot)
      expect(rule).toBeDefined()
      expect(asList(rule!.allow)).toEqual(['/'])
      expect(asList(rule!.disallow).sort()).toEqual([...PRIVATE].sort())
    }
  })

  it('leaves AI training bots to the default rule (decision pending)', () => {
    for (const bot of ['GPTBot', 'ClaudeBot', 'Google-Extended']) expect(ruleFor(bot)).toBeUndefined()
  })

  it('points at the sitemap on this site', () => {
    expect(r.sitemap).toBe(`${ORIGIN}/sitemap.xml`)
  })
})

describe('sitemap.xml', () => {
  const urls = sitemap().map((entry) => entry.url)

  it('lists the public pages as absolute https URLs on this site', () => {
    expect(urls).toEqual([ORIGIN, `${ORIGIN}/sign-up`])
    for (const url of urls) expect(new URL(url).origin).toBe(ORIGIN)
  })

  it('never lists login, signed-in areas or the API', () => {
    for (const url of urls) {
      expect(new URL(url).pathname).not.toMatch(/^\/(login|dashboard|admin|mentor|partner|api|unsubscribe)(\/|$)/)
    }
  })
})

describe('page metadata', () => {
  it('NOINDEX keeps a page out of results but lets its links be followed', () => {
    expect(NOINDEX).toEqual({ index: false, follow: true })
  })

  it('marks login, the signed-in areas and invite set-up pages noindex', () => {
    for (const file of [
      '(auth)/login/page.tsx',
      '(dashboard)/dashboard/layout.tsx',
      '(admin)/layout.tsx',
      '(mentor)/layout.tsx',
      '(partner)/layout.tsx',
      'mentor/setup/page.tsx',
    ]) {
      expect({ file, robots: metadataOf(file).robots }).toEqual({ file, robots: 'NOINDEX' })
    }
  })

  it('keeps sign-up, the home page and the root layout indexable', () => {
    for (const file of ['(auth)/sign-up/page.tsx', 'page.tsx', 'layout.tsx']) {
      expect(metadataOf(file).robots).toBeUndefined()
    }
  })

  it('makes canonicals absolute on this site', () => {
    expect(SITE_URL).toBe(ORIGIN)
    expect(metadataOf('layout.tsx').metadataBase).toBe('new URL(SITE_URL)')
    expect(metadataOf('page.tsx').alternates).toBe("{ canonical: '/' }")
  })
})
