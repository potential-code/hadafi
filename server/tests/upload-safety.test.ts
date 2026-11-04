import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'

/**
 * Admin media uploads can't plant a page that runs script on Hadafi's address
 * (ported from SMEEP c9a9ccb, plus a check of the file's real bytes):
 * - the stored extension comes from the checked type, never the client's name;
 * - the bytes must match the claimed type;
 * - /uploads sends nosniff, and SVGs a sandboxing CSP.
 * Also: the plain-text part of emails is readable (no template CSS).
 */

let baseUrl: string
let admin: TestUser
const uploaded: { id: string; path: string }[] = []

// 1x1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)
const HTML = Buffer.from('<!doctype html><html><body><script>alert(document.domain)</script></body></html>')
const SVG = Buffer.from(
  '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10"/></svg>',
)

interface Uploaded {
  id: string
  storedName: string
  mimeType: string
  path: string
}

async function upload(body: Buffer, type: string, name: string) {
  const form = new FormData()
  form.append('files', new Blob([new Uint8Array(body)], { type }), name)
  const res = await fetch(`${baseUrl}/api/media/upload`, {
    method: 'POST',
    headers: { Connection: 'close', Cookie: admin.token },
    body: form,
  })
  const json = (await res.json().catch(() => null)) as { data?: Uploaded[]; error?: { message: string } } | null
  for (const f of json?.data ?? []) uploaded.push({ id: f.id, path: f.path })
  return { status: res.status, body: json }
}

beforeAll(async () => {
  baseUrl = await startTestServer()
  admin = await createTestUser('media-admin', 'admin')
})

afterAll(async () => {
  for (const f of uploaded) {
    await api('DELETE', `/api/media/${f.id}`, { token: admin.token }).catch(() => {})
    // Belt and braces if the delete route could not find the file.
    await fs.unlink(path.join(import.meta.dir, '..', f.path)).catch(() => {})
  }
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('admin media uploads', () => {
  it('saves a real PNG named page.html as .png and serves it as an image, never as HTML', async () => {
    const res = await upload(PNG, 'image/png', 'page.html')
    expect(res.status).toBe(201)
    const file = res.body!.data![0]!
    expect(file.storedName).toMatch(/\.png$/)
    expect(file.path).not.toMatch(/\.html?$/i)

    const served = await fetch(`${baseUrl}/${file.path}`)
    expect(served.status).toBe(200)
    expect(served.headers.get('content-type')).toBe('image/png')
    expect(served.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('refuses an HTML file renamed and sent as an image', async () => {
    const res = await upload(HTML, 'image/png', 'photo.png')
    expect(res.status).toBe(415)
    expect(res.body?.error?.message).toBeTruthy()
  })

  it('refuses an HTML file sent as an SVG', async () => {
    const res = await upload(HTML, 'image/svg+xml', 'logo.svg')
    expect(res.status).toBe(415)
  })

  it('refuses types that are not on the list, with a plain message', async () => {
    const res = await upload(HTML, 'text/html', 'page.html')
    expect(res.status).toBe(415)
    expect(res.body?.error?.message).toMatch(/type/i)
  })

  it('serves an SVG sandboxed so script inside it cannot run', async () => {
    const res = await upload(SVG, 'image/svg+xml', 'logo.svg')
    expect(res.status).toBe(201)
    const file = res.body!.data![0]!
    expect(file.storedName).toMatch(/\.svg$/)

    const served = await fetch(`${baseUrl}/${file.path}`)
    expect(served.status).toBe(200)
    expect(served.headers.get('content-type')).toContain('image/svg+xml')
    expect(served.headers.get('x-content-type-options')).toBe('nosniff')
    const csp = served.headers.get('content-security-policy') ?? ''
    expect(csp).toContain('sandbox')
    expect(csp).toContain("default-src 'none'")
  })

  it('deletes the stored file along with its record', async () => {
    const res = await upload(PNG, 'image/png', 'gone.png')
    const file = res.body!.data![0]!
    const del = await api('DELETE', `/api/media/${file.id}`, { token: admin.token })
    expect(del.status).toBe(200)
    expect((await fetch(`${baseUrl}/${file.path}`)).status).toBe(404)
  })
})

describe('plain-text email', () => {
  it('drops the template head and styles and decodes entities', async () => {
    const mailer = (await import('../mail/mailer')) as { htmlToText?: (html: string) => string }
    expect(typeof mailer.htmlToText).toBe('function')
    const text = mailer.htmlToText!(
      '<html><head><title>T</title><style>body { color: red; }</style></head><body><p>Hello&nbsp;Sara &amp; team</p>\n\n\n\n<p>&copy; Hadafi &mdash; &lt;ok&gt;</p></body></html>',
    )
    expect(text).not.toContain('color: red')
    expect(text).not.toContain('<p>')
    expect(text).toContain('<ok>')
    expect(text).toContain('Hello Sara & team')
    expect(text).toContain('© Hadafi — ')
    expect(text).not.toMatch(/\n{3,}/)
  })
})
