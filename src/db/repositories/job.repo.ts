import { Prisma } from '@prisma/client';
import { prisma } from '../client';

export const jobRepo = {
  async create(sessionId: string) {
    return prisma.job.create({ data: { sessionId } });
  },

  async findById(id: string) {
    return prisma.job.findUnique({ where: { id } });
  },

  async update(id: string, data: Prisma.JobUncheckedUpdateInput) {
    return prisma.job.update({ where: { id }, data });
  },

  async countQueuedBefore(queuedAt: Date) {
    return prisma.job.count({
      where: { status: 'QUEUED', queuedAt: { lt: queuedAt } },
    });
  },

  async findBySessionId(sessionId: string) {
    return prisma.job.findMany({
      where: { sessionId, status: { in: ['QUEUED', 'PROCESSING'] } },
      orderBy: { queuedAt: 'asc' },
    });
  },
};
