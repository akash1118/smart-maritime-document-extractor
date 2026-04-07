import { Router } from 'express';
import { getJobHandler } from '../controllers/jobs.controller';

const router = Router();

router.get('/:jobId', getJobHandler);

export default router;
