import type { Request, Response, NextFunction } from 'express'
import fs from 'fs/promises'
import path from 'path'
import * as mediaService from '../services/media.service'

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

export async function uploadFiles(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const uploaded = req.files as Express.Multer.File[]
    if (!uploaded?.length) {
      res.status(400).json({ success: false, message: 'No files provided' })
      return
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
    const file = await mediaService.getMediaFile(id)

    if (!file) {
      res.status(404).json({ success: false, message: 'File not found' })
      return
    }

    await fs.unlink(path.join(process.cwd(), file.path)).catch(() => {})
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
    const { ids } = req.body as { ids: string[] }

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ success: false, message: 'ids must be a non-empty array' })
      return
    }

    const files = await mediaService.getMediaFilesByIds(ids)
    await Promise.all(
      files.map((f) => fs.unlink(path.join(process.cwd(), f.path)).catch(() => {})),
    )
    await mediaService.deleteMediaFiles(ids)

    res.json({ success: true })
  } catch (err) {
    next(err)
  }
}
