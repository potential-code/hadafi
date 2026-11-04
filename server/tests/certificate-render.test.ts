import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { eq } from 'drizzle-orm'
import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas'
import { db } from '../db'
import { courseCertificates, courseEnrollments, courses } from '../db/schema'
import { getCertificateFile, issueCertificate, refreshOutdatedCertificates } from '../services/lms/certificate.service'
import { startTestServer, stopTestServer, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'

/**
 * Certificates are drawn on the server. The production image has no system
 * fonts and no client folder, so the template and the Geist font ship in
 * server/assets. Certificates drawn before that are drawn again at boot, and
 * a missing file (e.g. lost in a redeploy) is drawn again on download.
 */

let learner: TestUser
let courseId = ''
const template = path.join(__dirname, '..', 'assets', 'certificate-template.jpg')

/** Pixels in the learner-name band that differ from the blank template. */
async function inkInNameBand(png: Buffer): Promise<number> {
  const [cert, blank] = await Promise.all([loadImage(png), loadImage(template)])
  const read = (img: typeof cert) => {
    const c = createCanvas(1200, 849)
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0, 1200, 849)
    return ctx.getImageData(300, 280, 600, 60).data
  }
  const a = read(cert)
  const b = read(blank)
  let diff = 0
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!) > 60) diff++
  }
  return diff
}

beforeAll(async () => {
  await startTestServer()
  learner = await createTestUser('cert')
  const [course] = await db.insert(courses).values({ title: 'E2E certificate course', status: 'published' }).returning()
  courseId = course!.id
  await db.insert(courseEnrollments).values({ userId: learner.id, courseId })
})

afterAll(async () => {
  const rows = await db.select().from(courseCertificates).where(eq(courseCertificates.userId, learner.id))
  for (const r of rows) if (r.filePath) fs.rmSync(r.filePath, { force: true })
  await db.delete(courses).where(eq(courses.id, courseId))
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('certificate drawing', () => {
  it('draws the name in the bundled Geist font', async () => {
    const cert = await issueCertificate(learner.id, courseId)
    expect(GlobalFonts.has('Geist')).toBe(true)
    expect(cert.certificateUrl).toEndWith('-v2.png')
    const png = await getCertificateFile(cert.id, { userId: learner.id, role: 'sme' })
    expect(await inkInNameBand(png)).toBeGreaterThan(500)
  })

  it('draws an older certificate again at boot, and a missing file on download', async () => {
    const [cert] = await db.select().from(courseCertificates).where(eq(courseCertificates.userId, learner.id))
    const oldPath = cert!.filePath!.replace(/-v2\.png$/, '.png')
    fs.renameSync(cert!.filePath!, oldPath)
    await db.update(courseCertificates)
      .set({ certificateUrl: `/uploads/certificates/${cert!.id}.png`, filePath: oldPath })
      .where(eq(courseCertificates.id, cert!.id))

    await refreshOutdatedCertificates()
    const [redrawn] = await db.select().from(courseCertificates).where(eq(courseCertificates.id, cert!.id))
    expect(redrawn!.certificateUrl).toEndWith('-v2.png')
    expect(fs.existsSync(oldPath)).toBe(false)

    fs.rmSync(redrawn!.filePath!)
    const png = await getCertificateFile(cert!.id, { userId: learner.id, role: 'sme' })
    expect(await inkInNameBand(png)).toBeGreaterThan(500)
  })
})
