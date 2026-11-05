import multer from 'multer'
import path from 'path'
import crypto from 'crypto'
import fs from 'fs'
import type { Request, Response, NextFunction } from 'express'
import { AppError } from '../utils/app-error'

/**
 * Root of everything served at /uploads. Resolved from this file so the
 * source tree (server/middleware) and the bundle (server/dist) both land on
 * server/uploads; index.ts serves this same folder.
 */
export const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads')
export const MEDIA_DIR = path.join(UPLOADS_ROOT, 'media')

if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true })
}

/**
 * Allowed media types and the extension each is saved with. The extension
 * comes from this map, never from the client's filename, so a file sent as
 * image/png but named page.html is still saved (and served) as .png. The
 * service then checks the saved bytes really are that type.
 */
export const MEDIA_TYPES: Readonly<Record<string, string>> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
}

export const MEDIA_MAX_BYTES = 50 * 1024 * 1024
const MEDIA_MAX_FILES = 10

const mediaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, MEDIA_DIR),
  filename: (_req, file, cb) => {
    const ext = MEDIA_TYPES[file.mimetype] ?? ''
    const hash = crypto.randomBytes(8).toString('hex')
    cb(null, `${Date.now()}-${hash}${ext}`)
  },
})

const mediaMulter = multer({
  storage: mediaStorage,
  limits: { fileSize: MEDIA_MAX_BYTES, files: MEDIA_MAX_FILES },
  fileFilter: (_req, file, cb) => {
    if (Object.hasOwn(MEDIA_TYPES, file.mimetype)) cb(null, true)
    else
      cb(
        new AppError(
          `"${file.originalname}" is not a file type the library accepts. Upload images, PDF, Word documents or MP4, WebM or MOV video.`,
          415,
          'FILE_TYPE_NOT_ALLOWED',
        ),
      )
  },
}).array('files', MEDIA_MAX_FILES)

/**
 * Accepts up to 10 `files` (see MEDIA_TYPES, max 50 MB each) into `req.files`.
 * Multer's own errors become AppErrors (4xx with a plain message) instead of
 * a 500. Files multer already wrote before an error are removed.
 */
export function uploadMedia(req: Request, res: Response, next: NextFunction): void {
  mediaMulter(req, res, (err: unknown) => {
    if (!err) return next()
    const written = (Array.isArray(req.files) ? req.files : []) as Express.Multer.File[]
    for (const f of written) fs.promises.unlink(f.path).catch(() => {})
    if (err instanceof AppError) return next(err)
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError('Each file must be 50 MB or smaller', 413, 'FILE_TOO_LARGE'))
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE')
        return next(new AppError('Upload up to 10 files at a time in the "files" field', 400, 'INVALID_UPLOAD'))
      return next(new AppError('The upload could not be read. Please try again.', 400, 'INVALID_UPLOAD'))
    }
    next(err)
  })
}

// ---------------------------------------------------------------------------
// Mentor profile photo
// ---------------------------------------------------------------------------

const AVATAR_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024

const avatarMulter = multer({
  // In memory: the service sniffs the real image type from the bytes before
  // anything is written to disk, and names the file itself (the client's
  // filename and mimetype are never used for the stored file).
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (AVATAR_MIMES.has(file.mimetype)) cb(null, true)
    else cb(new AppError('Photo must be a JPEG, PNG or WebP image', 415, 'UNSUPPORTED_IMAGE'))
  },
}).single('photo')

/**
 * Accepts one `photo` file (JPEG/PNG/WebP, max 5 MB) into `req.file`.
 * Multer's own errors are mapped to AppErrors so clients get a 4xx with a
 * clear code instead of a 500.
 */
export function uploadAvatar(req: Request, res: Response, next: NextFunction): void {
  avatarMulter(req, res, (err: unknown) => {
    if (!err) return next()
    if (err instanceof AppError) return next(err)
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError('Photo must be 5 MB or smaller', 413, 'FILE_TOO_LARGE'))
      return next(new AppError('Send one image in the "photo" field', 400, 'INVALID_UPLOAD'))
    }
    next(err)
  })
}
