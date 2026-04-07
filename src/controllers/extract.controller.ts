import { Request, Response, NextFunction } from 'express';
import { sessionRepo } from '../db/repositories/session.repo';
import { jobRepo } from '../db/repositories/job.repo';
import { findDuplicate } from '../services/dedup.service';
import { runExtraction, formatExtraction, ExtractionError } from '../services/extraction.service';
import { enqueueJob } from '../workers/job.worker';
import { hashFile } from '../utils/hash.util';
import { AppError } from '../middlewares/errorHandler';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

export const extractHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const file = req.file;
    const sessionId = req.body.sessionId as string | undefined;
    const mode = (req.query.mode as string | undefined) ?? 'sync';

    // --- Validate file ---
    if (!file) {
      throw new AppError(400, 'UNSUPPORTED_FORMAT', 'No file uploaded');
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new AppError(
        400,
        'UNSUPPORTED_FORMAT',
        `Unsupported file type: ${file.mimetype}. Accepted: jpeg, png, pdf`,
      );
    }

    // --- Resolve session ---
    let resolvedSessionId: string;
    if (!sessionId) {
      const session = await sessionRepo.create();
      resolvedSessionId = session.id;
    } else {
      const session = await sessionRepo.findById(sessionId);
      if (!session) throw new AppError(404, 'SESSION_NOT_FOUND', `Session ${sessionId} not found`);
      resolvedSessionId = sessionId;
    }

    // --- Deduplication check (before creating job or calling LLM) ---
    const fileHash = hashFile(file.buffer);
    const existing = await findDuplicate(resolvedSessionId, fileHash);
    if (existing) {
      res.set('X-Deduplicated', 'true');
      res.json({ ...formatExtraction(existing), deduplicated: true });
      return;
    }

    // --- Async mode ---
    if (mode === 'async') {
      const job = await jobRepo.create(resolvedSessionId);
      enqueueJob(job.id, {
        fileBuffer: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sessionId: resolvedSessionId,
      });
      res.status(202).json({
        jobId: job.id,
        sessionId: resolvedSessionId,
        status: 'QUEUED',
        pollUrl: `/api/jobs/${job.id}`,
        estimatedWaitMs: 6000,
      });
      return;
    }

    // --- Sync mode ---
    const extraction = await runExtraction(
      file.buffer,
      file.originalname,
      file.mimetype,
      resolvedSessionId,
    );
    res.json(formatExtraction(extraction));
  } catch (err: any) {
    if (err instanceof ExtractionError) {
      const statusMap: Record<string, number> = {
        LLM_JSON_PARSE_FAIL: 422,
        LLM_TIMEOUT: 500,
        SESSION_NOT_FOUND: 404,
        INTERNAL_ERROR: 500,
      };
      next(
        new AppError(
          statusMap[err.code] ?? 500,
          err.code,
          err.message === err.code
            ? 'Document extraction failed. The raw response has been stored for review.'
            : err.message,
          err.extractionId,
        ),
      );
      return;
    }
    next(err);
  }
};
