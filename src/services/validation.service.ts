import { extractionRepo } from '../db/repositories/extraction.repo';
import { sessionRepo } from '../db/repositories/session.repo';
import { prisma } from '../db/client';
import { createLlmClient } from '../llm/llm.factory';
import { safeParse } from '../utils/jsonParser';
import { logger } from '../utils/logger';
import { LlmValidationResult } from '../types';

const llm = createLlmClient();

export class ValidationError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export async function validateSession(sessionId: string): Promise<LlmValidationResult> {
  const session = await sessionRepo.findById(sessionId);
  if (!session) throw new ValidationError(`Session ${sessionId} not found`, 'SESSION_NOT_FOUND');

  const extractions = await extractionRepo.findBySessionId(sessionId);

  const completed = extractions.filter((e) => e.status === 'COMPLETE');
  if (completed.length < 2) {
    throw new ValidationError(
      'At least 2 successfully extracted documents are required for validation',
      'INSUFFICIENT_DOCUMENTS',
    );
  }

  // Build a clean, LLM-friendly summary of each document
  const documents = completed.map((e) => ({
    id: e.id,
    fileName: e.fileName,
    documentType: e.documentType,
    documentName: e.documentName,
    category: e.category,
    applicableRole: e.applicableRole,
    confidence: e.confidence,
    holderName: e.holderName,
    dateOfBirth: e.dateOfBirth,
    sirbNumber: e.sirbNumber,
    passportNumber: e.passportNumber,
    holderNationality: e.holderNationality,
    holderRank: e.holderRank,
    validity: e.validityJson,
    medicalData: e.medicalDataJson,
    flags: e.flagsJson,
    compliance: e.complianceJson,
    isExpired: e.isExpired,
    summary: e.summary,
  }));

  logger.info('validation.start', { sessionId, documentCount: documents.length });

  const raw = await llm.validate(documents);
  const parsed: LlmValidationResult | null = safeParse(raw);

  if (!parsed) {
    throw new ValidationError('LLM returned unparseable validation result', 'LLM_JSON_PARSE_FAIL');
  }

  // Persist result
  await prisma.validation.create({
    data: {
      sessionId,
      resultJson: parsed as unknown as import('@prisma/client').Prisma.InputJsonValue,
    },
  });

  logger.info('validation.complete', { sessionId, status: parsed.overallStatus });
  return parsed;
}

export async function getLatestValidation(sessionId: string): Promise<LlmValidationResult | null> {
  const record = await prisma.validation.findFirst({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
  });
  return record ? (record.resultJson as unknown as LlmValidationResult) : null;
}
