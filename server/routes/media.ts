import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import { requireRole } from '../middleware/require-role'
import { uploadMedia } from '../middleware/upload'
import * as mediaController from '../controllers/media.controller'

const router = Router()

router.use(authenticate, requireRole('admin'))

router.get('/', mediaController.listFiles)
router.post('/upload', uploadMedia.array('files', 10), mediaController.uploadFiles)
router.delete('/', mediaController.bulkDeleteFiles)
router.delete('/:id', mediaController.deleteFile)

export default router
