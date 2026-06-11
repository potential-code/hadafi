import type { Request, Response, NextFunction } from 'express'
import * as svc from '../../services/lms/blocks.service'
import { AppError } from '../../utils/app-error'

/**
 * POST /lms/admin/units/:unitId/blocks
 * Creates a new learning block at the end of the given unit.
 * Body pre-validated by Zod (type required; title defaults to '').
 */
export async function create(req: Request<{ unitId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { title, type, body, videoUrl, transcript, imageUrl } = req.body as {
      title: string
      type: 'text' | 'video' | 'image' | 'question'
      body?: string | null
      videoUrl?: string | null
      transcript?: string | null
      imageUrl?: string | null
    }
    // Service expects `string | null` (not undefined) for optional text columns —
    // coerce undefined (omitted Zod optional) to null so the type matches LearningBlock.
    res.status(201).json({
      success: true,
      data: await svc.createBlock(req.params.unitId, {
        title,
        type,
        body: body ?? null,
        videoUrl: videoUrl ?? null,
        transcript: transcript ?? null,
        imageUrl: imageUrl ?? null,
      }),
    })
  } catch (e) {
    next(e)
  }
}

/**
 * PATCH /lms/admin/blocks/:blockId
 * Partially updates a learning block. Body pre-validated by Zod (all fields optional;
 * `type` excluded from update allowlist — block type is immutable after creation).
 * Returns 404 if the block does not exist.
 */
export async function update(req: Request<{ blockId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { title, body, videoUrl, transcript, imageUrl } = req.body as {
      title?: string
      body?: string | null
      videoUrl?: string | null
      transcript?: string | null
      imageUrl?: string | null
    }
    const b = await svc.updateBlock(req.params.blockId, { title, body, videoUrl, transcript, imageUrl })
    if (!b) {
      throw new AppError('Not found', 404, 'NOT_FOUND')
    }
    res.json({ success: true, data: b })
  } catch (e) {
    next(e)
  }
}

/**
 * DELETE /lms/admin/blocks/:blockId
 * Deletes a learning block and its associated questions.
 */
export async function remove(req: Request<{ blockId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deleteBlock(req.params.blockId)
    res.json({ success: true, data: { ok: true } })
  } catch (e) {
    next(e)
  }
}

/**
 * POST /lms/admin/units/:unitId/blocks/reorder
 * Reorders blocks within a unit. Body pre-validated by Zod as { ids: string[] }.
 * Rejects an empty ids array — every position must be accounted for.
 */
export async function reorder(req: Request<{ unitId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { ids } = req.body as { ids: string[] }
    if (ids.length === 0) {
      throw new AppError('ids must not be empty', 400, 'VALIDATION_ERROR')
    }
    await svc.reorderBlocks(req.params.unitId, ids)
    res.json({ success: true, data: { ok: true } })
  } catch (e) {
    next(e)
  }
}

/**
 * POST /lms/admin/blocks/:blockId/questions
 * Creates a new question on a block of type 'question'.
 * Body pre-validated by Zod (prompt required; kind and format default provided).
 */
export async function createQuestion(req: Request<{ blockId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { kind, format, prompt, options, correctIndex, correctBool, placeholder } = req.body as {
      kind: 'survey' | 'action-plan'
      format: 'multiple-choice' | 'true-false' | 'short-text'
      prompt: string
      options?: string[] | null
      correctIndex?: number | null
      correctBool?: boolean | null
      placeholder?: string | null
    }
    res.status(201).json({
      success: true,
      data: await svc.createBlockQuestion(req.params.blockId, { kind, format, prompt, options, correctIndex, correctBool, placeholder }),
    })
  } catch (e) {
    next(e)
  }
}

/**
 * PATCH /lms/admin/block-questions/:questionId
 * Partially updates a block question. Body pre-validated by Zod (all fields optional).
 * Returns 404 if not found.
 */
export async function updateQuestion(req: Request<{ questionId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { kind, format, prompt, options, correctIndex, correctBool, placeholder } = req.body as {
      kind?: 'survey' | 'action-plan'
      format?: 'multiple-choice' | 'true-false' | 'short-text'
      prompt?: string
      options?: string[] | null
      correctIndex?: number | null
      correctBool?: boolean | null
      placeholder?: string | null
    }
    const q = await svc.updateBlockQuestion(req.params.questionId, { kind, format, prompt, options, correctIndex, correctBool, placeholder })
    if (!q) {
      throw new AppError('Not found', 404, 'NOT_FOUND')
    }
    res.json({ success: true, data: q })
  } catch (e) {
    next(e)
  }
}

/**
 * DELETE /lms/admin/block-questions/:questionId
 * Deletes a block question.
 */
export async function removeQuestion(req: Request<{ questionId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    await svc.deleteBlockQuestion(req.params.questionId)
    res.json({ success: true, data: { ok: true } })
  } catch (e) {
    next(e)
  }
}

/**
 * POST /lms/admin/blocks/:blockId/questions/reorder
 * Reorders questions within a block. Body pre-validated by Zod as { ids: string[] }.
 * Rejects an empty ids array — every position must be accounted for.
 */
export async function reorderQuestions(req: Request<{ blockId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { ids } = req.body as { ids: string[] }
    if (ids.length === 0) {
      throw new AppError('ids must not be empty', 400, 'VALIDATION_ERROR')
    }
    await svc.reorderBlockQuestions(req.params.blockId, ids)
    res.json({ success: true, data: { ok: true } })
  } catch (e) {
    next(e)
  }
}
