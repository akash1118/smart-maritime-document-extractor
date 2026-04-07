import { Prisma } from '@prisma/client';
import { prisma } from '../client';

export const extractionRepo = {
  async create(data: Prisma.ExtractionUncheckedCreateInput) {
    return prisma.extraction.create({ data });
  },

  async findById(id: string) {
    return prisma.extraction.findUnique({ where: { id } });
  },

  async findBySessionIdAndHash(sessionId: string, fileHash: string) {
    return prisma.extraction.findFirst({ where: { sessionId, fileHash } });
  },

  async findBySessionId(sessionId: string) {
    return prisma.extraction.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  },

  async updateStatus(id: string, status: string, rawLlmResponse?: string) {
    return prisma.extraction.update({
      where: { id },
      data: { status, ...(rawLlmResponse !== undefined ? { rawLlmResponse } : {}) },
    });
  },
};
