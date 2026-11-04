import type { Request, Response, NextFunction } from 'express'
import * as mediaService from '../services/media.service'
import { AppError } from '../utils/app-error'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function listFiles(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const files = await mediaService.listMediaFiles()
    res.json({ success: true, data: files })
  } catch (err) {
    next(err)
  }
}

/**
 * Saves the files `uploadMedia` wrote. Each file's bytes must match the type
 * the browser claimed; if any does not, none of the batch is kept.
 */
export async function uploadFiles(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const uploaded = (req.files ?? []) as Express.Multer.File[]
  try {
    if (!uploaded.length) throw new AppError('Choose at least one file to upload', 400, 'NO_FILES')

    for (const f of uploaded) {
      if (!(await mediaService.contentMatchesType(f.path, f.mimetype))) {
        throw new AppError(
          `"${f.originalname}" does not look like the type it claims to be. Save it again in its real format and retry.`,
          415,
          'FILE_CONTENT_MISMATCH',
        )
      }
    }

    const saved = await Promise.all(
      uploaded.map((f) =>
        mediaService.createMediaFile({
          originalName: f.originalname,
          storedName: f.filename,
          mimeType: f.mimetype,
          size: f.size,
          path: `uploads/media/${f.filename}`,
          uploadedBy: req.user!.userId,
        }),
      ),
    )

    res.status(201).json({ success: true, data: saved })
  } catch (err) {
    await Promise.all(uploaded.map((f) => mediaService.removeMediaFromDisk(`uploads/media/${f.filename}`).catch(() => {})))
    next(err)
  }
}

export async function deleteFile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as { id: string }
    const file = UUID.test(id) ? await mediaService.getMediaFile(id) : null
    if (!file) throw new AppError('File not found', 404, 'NOT_FOUND')

    await mediaService.removeMediaFromDisk(file.path)
    await mediaService.deleteMediaFile(id)

    res.json({ success: true })
  } catch (err) {
    next(err)
  }
}

export async function bulkDeleteFiles(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { ids } = (req.body ?? {}) as { ids?: unknown }
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((i) => typeof i === 'string' && UUID.test(i))) {
      throw new AppError('Choose at least one file to delete', 400, 'VALIDATION_ERROR')
    }

    const files = await mediaService.getMediaFilesByIds(ids as string[])
    await Promise.all(files.map((f) => mediaService.removeMediaFromDisk(f.path)))
    await mediaService.deleteMediaFiles(ids as string[])

    res.json({ success: true })
  } catch (err) {
    next(err)
  }
}
