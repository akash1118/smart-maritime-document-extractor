import { jobRepo } from '../db/repositories/job.repo';
import { extractionRepo } from '../db/repositories/extraction.repo';
import { formatExtraction } from './extraction.service';

export async function getJobStatus(jobId: string) {
  const job = await jobRepo.findById(jobId);
  if (!job) return null;

  const base = {
    jobId: job.id,
    sessionId: job.sessionId,
    status: job.status,
  };

  if (job.status === 'QUEUED') {
    const position = await jobRepo.countQueuedBefore(job.queuedAt);
    return {
      ...base,
      queuePosition: position,
      queuedAt: job.queuedAt,
      estimatedCompleteMs: (position + 1) * 6000,
    };
  }

  if (job.status === 'PROCESSING') {
    return {
      ...base,
      startedAt: job.startedAt,
      estimatedCompleteMs: 6000,
    };
  }

  if (job.status === 'COMPLETE' && job.extractionId) {
    const extraction = await extractionRepo.findById(job.extractionId);
    return {
      ...base,
      extractionId: job.extractionId,
      result: extraction ? formatExtraction(extraction) : null,
      completedAt: job.completedAt,
    };
  }

  // FAILED
  return {
    ...base,
    error: job.errorCode,
    message: job.errorMessage,
    retryable: job.isRetryable,
    failedAt: job.completedAt,
  };
}
