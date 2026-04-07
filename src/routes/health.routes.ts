import { Router, Request, Response } from 'express';
import { prisma } from '../db/client';
import { config } from '../config/env';
import { workerHealthy } from '../workers/job.worker';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const dependencies: Record<string, string> = {
    database: 'UNKNOWN',
    llmProvider: 'UNKNOWN',
    queue: 'UNKNOWN',
  };

  // Database check
  try {
    await prisma.$queryRaw`SELECT 1`;
    dependencies.database = 'OK';
  } catch {
    dependencies.database = 'ERROR';
  }

  // LLM provider check (key presence only — avoid billable pings)
  dependencies.llmProvider = config.llmApiKey ? 'OK' : 'UNCONFIGURED';

  // Queue check
  dependencies.queue = workerHealthy ? 'OK' : 'ERROR';

  const allOk = Object.values(dependencies).every((v) => v === 'OK');

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'OK' : 'DEGRADED',
    version: '1.0.0',
    uptime: Math.floor(process.uptime()),
    dependencies,
    timestamp: new Date().toISOString(),
  });
});

export default router;
