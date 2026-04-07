import { prisma } from '../client';

export const sessionRepo = {
  async create() {
    return prisma.session.create({ data: {} });
  },

  async findById(id: string) {
    return prisma.session.findUnique({ where: { id } });
  },
};
