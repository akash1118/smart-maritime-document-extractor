import { type Extraction } from '@prisma/client';
import { hashFile } from '../utils/hash.util';
import { safeParse } from '../utils/jsonParser';
import { createLlmClient } from '../llm/llm.factory';
import { extractionRepo } from '../db/repositories/extraction.repo';
import { sessionRepo } from '../db/repositories/session.repo';
import { logger } from '../utils/logger';
import { LlmExtractionResult } from '../types';

const llm = createLlmClient();

export class ExtractionError extends Error {
  constructor(
    message: string,
    public code: string,
    public extractionId?: string,
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

/**
 * Ensures a session exists. Creates one if sessionId is not provided.
 * Throws if a provided sessionId does not exist in the DB.
 */
export async function resolveSession(sessionId?: string): Promise<string> {
  if (!sessionId) {
    const session = await sessionRepo.create();
    return session.id;
  }
  const session = await sessionRepo.findById(sessionId);
  if (!session) {
    throw new ExtractionError(`Session ${sessionId} not found`, 'SESSION_NOT_FOUND');
  }
  return sessionId;
}

/**
 * Core extraction pipeline. Handles all LLM reliability requirements:
 * 1. JSON boundary extraction (in safeParse)
 * 2. Repair prompt fallback on parse failure
 * 3. 30s timeout (in LLM client)
 * 4. LOW confidence retry with file-name hints
 * 5. Never-discard — always stores a record even on failure
 */
export async function runExtraction(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  sessionId: string,
) {
  const startTime = Date.now();
  const fileHash = hashFile(fileBuffer);
  const base64File = fileBuffer.toString('base64');
  let raw = '';

  try {
    // --- Step 1: Call LLM (30s timeout enforced inside client) ---
    raw = await llm.extract(base64File, mimeType);

    // --- Step 2: Parse JSON (boundary extraction first) ---
    let parsed: LlmExtractionResult | null = safeParse(raw);

    // --- Step 3: Repair prompt fallback ---
    if (!parsed) {
      logger.warn('llm.parse_failed.attempting_repair', { fileName });
      const repaired = await llm.repairJSON(raw);
      raw = repaired; // store the repaired version
      parsed = safeParse(repaired);
    }

    // --- Step 4: Still unparseable — store failure record and throw ---
    if (!parsed) {
      const failed = await extractionRepo.create({
        sessionId,
        fileName,
        fileHash,
        rawLlmResponse: raw,
        status: 'FAILED',
      });
      throw new ExtractionError(
        'LLM_JSON_PARSE_FAIL',
        'LLM_JSON_PARSE_FAIL',
        failed.id,
      );
    }

    // --- Step 5: LOW confidence retry with file-name hints ---
    if (parsed.detection?.confidence === 'LOW') {
      logger.warn('llm.low_confidence.retrying', { fileName });
      try {
        const retryRaw = await llm.extractWithHints(base64File, mimeType, fileName);
        const retryParsed: LlmExtractionResult | null = safeParse(retryRaw);
        if (retryParsed && retryParsed.detection?.confidence !== 'LOW') {
          raw = retryRaw;
          parsed = retryParsed;
        }
      } catch {
        // Retry failed — keep original parsed result
      }
    }

    const processingTimeMs = Date.now() - startTime;

    const extraction = await extractionRepo.create({
      sessionId,
      fileName,
      fileHash,
      documentType: parsed.detection?.documentType ?? null,
      documentName: parsed.detection?.documentName ?? null,
      category: parsed.detection?.category ?? null,
      applicableRole: parsed.detection?.applicableRole ?? null,
      isRequired: parsed.detection?.isRequired ?? null,
      confidence: parsed.detection?.confidence ?? null,
      detectionReason: parsed.detection?.detectionReason ?? null,
      holderName: parsed.holder?.fullName ?? null,
      dateOfBirth: parsed.holder?.dateOfBirth ?? null,
      passportNumber: parsed.holder?.passportNumber ?? null,
      sirbNumber: parsed.holder?.sirbNumber ?? null,
      holderNationality: parsed.holder?.nationality ?? null,
      holderRank: parsed.holder?.rank ?? null,
      holderPhoto: parsed.holder?.photo ?? null,
      fieldsJson: (parsed.fields ?? []) as unknown as import('@prisma/client').Prisma.InputJsonValue,
      validityJson: (parsed.validity ?? null) as unknown as import('@prisma/client').Prisma.InputJsonValue,
      medicalDataJson: (parsed.medicalData ?? null) as unknown as import('@prisma/client').Prisma.InputJsonValue,
      flagsJson: (parsed.flags ?? []) as unknown as import('@prisma/client').Prisma.InputJsonValue,
      complianceJson: (parsed.compliance ?? null) as unknown as import('@prisma/client').Prisma.InputJsonValue,
      isExpired: parsed.validity?.isExpired ?? false,
      summary: parsed.summary ?? null,
      rawLlmResponse: raw,
      processingTimeMs,
      status: 'COMPLETE',
    });

    logger.info('extraction.complete', { extractionId: extraction.id, fileName, processingTimeMs });
    return extraction;
  } catch (err: any) {
    // Re-throw known extraction errors (already stored a record)
    if (err instanceof ExtractionError) throw err;

    // Unknown error (timeout, network, DB) — store a failure record
    logger.error('extraction.unexpected_error', { fileName, error: err.message });
    const failed = await extractionRepo.create({
      sessionId,
      fileName,
      fileHash,
      rawLlmResponse: raw || err.message,
      status: 'FAILED',
    });

    throw new ExtractionError(
      err.message === 'LLM_TIMEOUT' ? 'LLM_TIMEOUT' : 'INTERNAL_ERROR',
      err.message === 'LLM_TIMEOUT' ? 'LLM_TIMEOUT' : 'INTERNAL_ERROR',
      failed.id,
    );
  }
}

/** Maps a DB Extraction record to the public API response shape. */
export function formatExtraction(e: Extraction) {
  return {
    id: e.id,
    sessionId: e.sessionId,
    fileName: e.fileName,
    documentType: e.documentType,
    documentName: e.documentName,
    applicableRole: e.applicableRole,
    category: e.category,
    confidence: e.confidence,
    holderName: e.holderName,
    dateOfBirth: e.dateOfBirth,
    sirbNumber: e.sirbNumber,
    passportNumber: e.passportNumber,
    fields: e.fieldsJson ?? [],
    validity: e.validityJson ?? null,
    compliance: e.complianceJson ?? null,
    medicalData: e.medicalDataJson ?? null,
    flags: e.flagsJson ?? [],
    isExpired: e.isExpired,
    processingTimeMs: e.processingTimeMs,
    summary: e.summary,
    status: e.status,
    createdAt: e.createdAt,
  };
}
