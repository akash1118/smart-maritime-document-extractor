import { Router } from 'express';
import multer from 'multer';
import { extractHandler } from '../controllers/extract.controller';
import { rateLimiter } from '../middlewares/rateLimiter';
import { config } from '../config/env';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileSizeBytes },
});

router.post(
  '/',
  rateLimiter,
  upload.single('document'),
  extractHandler,
);

export default router;
