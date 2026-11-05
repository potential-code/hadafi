import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import fs from 'node:fs/promises'
import { deflateRawSync } from 'node:zlib'
import PDFDocument from 'pdfkit'
import { startTestServer, stopTestServer, createTestUser, cleanupFixtureUsers, ORIGIN, type TestUser } from './helpers'
import {
  assertDocxWithinLimits,
  readDocumentText,
  DocumentReadError,
  DOCUMENT_MAX_CHARS,
} from '../services/documentText.service'
import { UPLOADS_ROOT } from '../middleware/upload'
import { cleanName } from '../routes/askHana'

/**
 * Documents a learner shares with Hana (ported from SMEEP ffcf4f2 and
 * 2accec0): POST /api/ask-hana/documents reads a PDF, Word, text, Markdown
 * or CSV file in memory and returns only its text, for the browser to send
 * with the learner's next message. Nothing is stored.
 */

let base: string
let learner: TestUser
let mentor: TestUser
/** Refusals count towards the 10-minute cap too, so they get their own learner. */
let refused: TestUser

beforeAll(async () => {
  base = await startTestServer()
  learner = await createTestUser('askdocs')
  mentor = await createTestUser('askdocs-mentor', 'mentor')
  refused = await createTestUser('askdocs-refused')
})

afterAll(async () => {
  await cleanupFixtureUsers()
  await stopTestServer()
})

type DocResponse = {
  success: boolean
  data?: { name: string; kind: string; size: number; text: string; truncated: boolean; pages?: number }
  error?: { code: string; message: string }
}

async function share(file: Blob | Buffer, name: string, token: string | null = learner.token, field = 'file') {
  const form = new FormData()
  const blob = file instanceof Blob ? file : new Blob([new Uint8Array(file)])
  form.append(field, blob, name)
  const res = await fetch(`${base}/api/ask-hana/documents`, {
    method: 'POST',
    headers: { Origin: ORIGIN, ...(token ? { Cookie: token } : {}) },
    body: form,
  })
  return {
    status: res.status,
    headers: res.headers,
    body: (await res.json().catch(() => null)) as DocResponse,
  }
}

function pdf(pages: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    for (const text of pages) {
      doc.addPage()
      doc.fontSize(14).text(text, 50, 80)
    }
    doc.end()
  })
}

type Entry = { name: string; data: Buffer; claimedSize?: number }

/** A minimal zip: deflated entries, a central directory and its end record. */
function zip(entries: Entry[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name)
    const packed = deflateRawSync(e.data)
    const size = e.claimedSize ?? e.data.length
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(size, 22)
    local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(packed.length, 20)
    central.writeUInt32LE(size, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, name, packed)
    centrals.push(central, name)
    offset += 30 + name.length + packed.length
  }
  const dir = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(dir.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, dir, end])
}

const docx = (body: string) =>
  zip([
    {
      name: '[Content_Types].xml',
      data: Buffer.from(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
    },
    {
      name: '_rels/.rels',
      data: Buffer.from(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      ),
    },
    {
      name: 'word/document.xml',
      data: Buffer.from(
        `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${body}</w:t></w:r></w:p></w:body></w:document>`,
      ),
    },
  ])

async function countFiles(dir: string): Promise<number> {
  const entries = await fs.readdir(dir, { recursive: true }).catch(() => [] as string[])
  let files = 0
  for (const name of entries) {
    if ((await fs.stat(`${dir}/${name}`).catch(() => null))?.isFile()) files++
  }
  return files
}

describe('Ask Hana documents: reading', () => {
  it('reads a text file and tidies its line breaks', async () => {
    const res = await share(new Blob(['Our café sells coffee.\r\n\r\n\r\nGoal: double sales.']), 'plan.txt')
    expect(res.status).toBe(200)
    expect(res.body.data?.kind).toBe('text')
    expect(res.body.data?.text).toBe('Our café sells coffee.\n\nGoal: double sales.')
    expect(res.body.data?.truncated).toBe(false)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('reads a PDF, with its page count', async () => {
    const res = await share(await pdf(['Business plan for Lina Bakery', 'Target customers: office workers']), 'bakery.pdf')
    expect(res.status).toBe(200)
    expect(res.body.data?.kind).toBe('pdf')
    expect(res.body.data?.pages).toBe(2)
    expect(res.body.data?.text).toContain('Lina Bakery')
    expect(res.body.data?.text).toContain('office workers')
  })

  it('reads a Word document', async () => {
    const res = await share(docx("Carter's Bakery marketing plan"), 'plan.docx')
    expect(res.status).toBe(200)
    expect(res.body.data?.kind).toBe('docx')
    expect(res.body.data?.text).toContain("Carter's Bakery")
  })

  it('reads Markdown and CSV, and keeps a UTF-8 file name', async () => {
    const md = await share(new Blob(['# خطة العمل']), 'خطة.md')
    expect(md.status).toBe(200)
    expect(md.body.data?.name).toBe('خطة.md')
    const csv = await share(new Blob(['month,sales\nJan,120']), 'sales.csv')
    expect(csv.status).toBe(200)
    expect(csv.body.data?.text).toContain('Jan,120')
  })

  it('cuts very long documents and says so', async () => {
    const res = await share(new Blob(['word '.repeat(10_000)]), 'long.txt')
    expect(res.status).toBe(200)
    expect(res.body.data?.truncated).toBe(true)
    expect(res.body.data?.text.length).toBe(DOCUMENT_MAX_CHARS)
  })

  it('strips a path and control characters from the file name', async () => {
    const res = await share(new Blob(['hello']), '../../etc/passwd.txt')
    expect(res.status).toBe(200)
    expect(res.body.data?.name).toBe('passwd.txt')
    expect(cleanName('pa"ss<w>d\u0007.txt')).toBe('passwd.txt')
    expect(cleanName('C:\\Users\\me\\plan.md')).toBe('plan.md')
  })

  it('stores nothing on the server', async () => {
    const before = await countFiles(UPLOADS_ROOT)
    expect((await share(new Blob(['private business plan']), 'private.txt')).status).toBe(200)
    expect(await countFiles(UPLOADS_ROOT)).toBe(before)
  })

  it('is open to mentors too (they can use Hana)', async () => {
    expect((await share(new Blob(['notes']), 'notes.txt', mentor.token)).status).toBe(200)
  })
})

describe('Ask Hana documents: refusals', () => {
  it('needs a signed-in user', async () => {
    const res = await share(new Blob(['hello']), 'a.txt', null)
    expect(res.status).toBe(401)
  })

  it('refuses images and other files, whatever their name says', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    expect((await share(png, 'photo.png', refused.token)).status).toBe(415)
    expect((await share(png, 'notes.txt', refused.token)).status).toBe(415)
    expect((await share(Buffer.from('not a word file'), 'fake.docx', refused.token)).status).toBe(415)
    // An old binary .doc, a script and an executable are not read either.
    expect((await share(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), 'old.doc', refused.token)).status).toBe(415)
    expect((await share(Buffer.from('console.log(1)'), 'run.js', refused.token)).status).toBe(415)
    expect((await share(Buffer.from('MZ\u0090\u0000\u0003'), 'setup.exe', refused.token)).status).toBe(415)
  })

  it('refuses an empty file', async () => {
    const res = await share(new Blob(['   \n  ']), 'empty.txt', refused.token)
    expect(res.status).toBe(422)
    expect(res.body.error?.code).toBe('EMPTY_DOCUMENT')
  })

  it('refuses a damaged PDF without crashing', async () => {
    const res = await share(Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog /Pages 2 0 R >>\ngarbage'), 'broken.pdf', refused.token)
    expect(res.status).toBe(422)
    expect(res.body.success).toBe(false)
  })

  it('refuses a Word zip bomb quickly', async () => {
    const bomb = docx('a'.repeat(50 * 1024 * 1024))
    expect(bomb.length).toBeLessThan(200_000)
    const started = Date.now()
    const res = await share(bomb, 'bomb.docx', refused.token)
    expect(res.status).toBe(422)
    expect(res.body.error?.code).toBe('UNREADABLE')
    expect(Date.now() - started).toBeLessThan(3_000)
  })

  it('refuses a file over 15 MB', async () => {
    const res = await share(Buffer.alloc(15 * 1024 * 1024 + 10, 0x61), 'huge.txt', refused.token)
    expect(res.status).toBe(413)
    expect(res.body.error?.code).toBe('FILE_TOO_LARGE')
  })

  it('refuses a request without a file, or with the file in another field', async () => {
    const empty = await fetch(`${base}/api/ask-hana/documents`, {
      method: 'POST',
      headers: { Origin: ORIGIN, Cookie: refused.token },
      body: new FormData(),
    })
    expect(empty.status).toBe(400)
    expect((await share(new Blob(['hello']), 'a.txt', refused.token, 'upload')).status).toBe(400)
  })

  it('limits how many files one person shares in 10 minutes', async () => {
    const busy = await createTestUser('askdocs-busy')
    for (let i = 0; i < 20; i++) {
      expect((await share(new Blob([`note ${i}`]), `n${i}.txt`, busy.token)).status).toBe(200)
    }
    const res = await share(new Blob(['one more']), 'more.txt', busy.token)
    expect(res.status).toBe(429)
    // Someone else is not affected.
    expect((await share(new Blob(['mine']), 'mine.txt', mentor.token)).status).toBe(200)
  })
})

describe('Word file limits', () => {
  it("doesn't trust the sizes a zip claims for itself", () => {
    const liar = zip([{ name: 'word/document.xml', data: Buffer.alloc(30 * 1024 * 1024, 0x61), claimedSize: 100 }])
    expect(() => assertDocxWithinLimits(liar)).toThrow(DocumentReadError)
  })

  it('refuses a file that only looks like a zip', () => {
    expect(() => assertDocxWithinLimits(Buffer.from('PK not really a zip'))).toThrow(DocumentReadError)
  })

  it('reads text files only when they really are text', async () => {
    await expect(readDocumentText(Buffer.from([0x68, 0x00, 0x69]), 'nul.txt')).rejects.toBeInstanceOf(DocumentReadError)
  })
})

