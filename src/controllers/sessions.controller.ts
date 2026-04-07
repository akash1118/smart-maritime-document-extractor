import { Request, Response, NextFunction } from 'express';
import { sessionRepo } from '../db/repositories/session.repo';
import { extractionRepo } from '../db/repositories/extraction.repo';
import { jobRepo } from '../db/repositories/job.repo';
import { validateSession } from '../services/validation.service';
import { buildReport } from '../services/report.service';
import { AppError } from '../middlewares/errorHandler';
import { OverallHealth } from '../types';
import { type Extraction } from '@prisma/client';

function computeOverallHealth(extractions: Extraction[]): OverallHealth {
  const completed = extractions.filter((e) => e.status === 'COMPLETE');
  for (const e of completed) {
    const flags = (e.flagsJson as Array<{ severity: string }>) ?? [];
    if (flags.some((f) => f.severity === 'CRITICAL') || e.isExpired) return 'CRITICAL';
  }
  for (const e of completed) {
    const flags = (e.flagsJson as Array<{ severity: string }>) ?? [];
    const validity = e.validityJson as { daysUntilExpiry?: number | null } | null;
    if (
      flags.some((f) => f.severity === 'HIGH' || f.severity === 'MEDIUM') ||
      (validity?.daysUntilExpiry != null && validity.daysUntilExpiry <= 90)
    )
      return 'WARN';
  }
  return 'OK';
}

function detectRole(extractions: Extraction[]): string {
  const roles = extractions.map((e) => e.applicableRole).filter(Boolean) as string[];
  const deck = roles.filter((r) => r === 'DECK').length;
  const engine = roles.filter((r) => r === 'ENGINE').length;
  if (deck > engine) return 'DECK';
  if (engine > deck) return 'ENGINE';
  if (deck > 0) return 'BOTH';
  return 'UNKNOWN';
}

export const getSessionHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const sessionId = req.params.sessionId as string;
    const session = await sessionRepo.findById(sessionId);
    if (!session) throw new AppError(404, 'SESSION_NOT_FOUND', `Session ${sessionId} not found`);

    const [extractions, pendingJobs] = await Promise.all([
      extractionRepo.findBySessionId(sessionId),
      jobRepo.findBySessionId(sessionId),
    ]);

    const completed = extractions.filter((e) => e.status === 'COMPLETE');

    res.json({
      sessionId,
      documentCount: completed.length,
      detectedRole: detectRole(extractions),
      overallHealth: computeOverallHealth(extractions),
      documents: completed.map((e) => ({
        id: e.id,
        fileName: e.fileName,
        documentType: e.documentType,
        documentName: e.documentName,
        applicableRole: e.applicableRole,
        holderName: e.holderName,
        confidence: e.confidence,
        isExpired: e.isExpired,
        flagCount: ((e.flagsJson as unknown[]) ?? []).length,
        criticalFlagCount: (
          (e.flagsJson as Array<{ severity: string }>) ?? []
        ).filter((f) => f.severity === 'CRITICAL').length,
        createdAt: e.createdAt,
      })),
      pendingJobs: pendingJobs.map((j) => ({
        jobId: j.id,
        status: j.status,
        queuedAt: j.queuedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
};

export const validateSessionHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const sessionId = req.params.sessionId as string;
    const result = await validateSession(sessionId);
    res.json(result);
  } catch (err: any) {
    if (err.code === 'SESSION_NOT_FOUND') {
      next(new AppError(404, err.code, err.message));
    } else if (err.code === 'INSUFFICIENT_DOCUMENTS') {
      next(new AppError(400, err.code, err.message));
    } else if (err.code === 'LLM_JSON_PARSE_FAIL') {
      next(new AppError(422, err.code, err.message));
    } else {
      next(err);
    }
  }
};

export const getReportHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const sessionId = req.params.sessionId as string;
    const report = await buildReport(sessionId);
    if (!report) throw new AppError(404, 'SESSION_NOT_FOUND', `Session ${sessionId} not found`);
    res.json(report);
  } catch (err) {
    next(err);
  }
};
