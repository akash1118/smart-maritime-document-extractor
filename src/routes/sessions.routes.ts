import { Router } from 'express';
import {
  getSessionHandler,
  validateSessionHandler,
  getReportHandler,
} from '../controllers/sessions.controller';

const router = Router();

router.get('/:sessionId', getSessionHandler);
router.post('/:sessionId/validate', validateSessionHandler);
router.get('/:sessionId/report', getReportHandler);

export default router;
