import multer from 'multer'
import path from 'path'
import crypto from 'crypto'
import fs from 'fs'
import type { Request, Response, NextFunction } from 'express'
import { AppError } from '../utils/app-error'

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'media')

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
}

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'video/mp4',
  'video/webm',
  'video/quicktime',
])

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    const hash = crypto.randomBytes(8).toString('hex')
    cb(null, `${Date.now()}-${hash}${ext}`)
  },
})

export const uploadMedia = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('FILE_TYPE_NOT_ALLOWED'))
    }
  },
})

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
