import { jobRepo } from '../db/repositories/job.repo';
import { logger } from '../utils/logger';

// Circular import avoided: extraction service is imported lazily inside processJob
interface JobPayload {
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  sessionId: string;
}

const pendingPayloads = new Map<string, JobPayload>();
let workerRunning = false;
export let workerHealthy = true;

export function enqueueJob(jobId: string, payload: JobPayload): void {
  pendingPayloads.set(jobId, payload);
  if (!workerRunning) {
    setImmediate(processNext);
  }
}

async function processNext(): Promise<void> {
  if (pendingPayloads.size === 0) {
    workerRunning = false;
    return;
  }

  workerRunning = true;

  // Pick the oldest queued payload
  const [jobId, payload] = pendingPayloads.entries().next().value as [string, JobPayload];
  pendingPayloads.delete(jobId);

  try {
    await jobRepo.update(jobId, { status: 'PROCESSING', startedAt: new Date() });
    logger.info('job.processing', { jobId });

    // Lazy import to avoid circular dependency at module load time
    const { runExtraction } = await import('../services/extraction.service');
    const extraction = await runExtraction(
      payload.fileBuffer,
      payload.fileName,
      payload.mimeType,
      payload.sessionId,
    );

    await jobRepo.update(jobId, {
      status: 'COMPLETE',
      extractionId: extraction.id,
      completedAt: new Date(),
    });
    logger.info('job.complete', { jobId, extractionId: extraction.id });
  } catch (err: any) {
    // ExtractionError stores the semantic code in err.code; fall back to err.message
    const errorCode: string = err.code || err.message || 'INTERNAL_ERROR';
    const isTimeout = errorCode === 'LLM_TIMEOUT';
    await jobRepo.update(jobId, {
      status: 'FAILED',
      errorCode,
      errorMessage: err.message || 'Unexpected error during processing',
      isRetryable: isTimeout,
      completedAt: new Date(),
    });
    logger.error('job.failed', { jobId, error: errorCode });
  }

  setImmediate(processNext);
}
