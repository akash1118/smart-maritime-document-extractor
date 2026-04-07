import { extractionRepo } from '../db/repositories/extraction.repo';

export async function findDuplicate(sessionId: string, fileHash: string) {
  return extractionRepo.findBySessionIdAndHash(sessionId, fileHash);
}
