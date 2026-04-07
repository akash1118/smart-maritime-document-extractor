import { Request, Response, NextFunction } from 'express';
import { getJobStatus } from '../services/job.service';
import { AppError } from '../middlewares/errorHandler';

export const getJobHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const jobId = req.params.jobId as string;
    const job = await getJobStatus(jobId);
    if (!job) throw new AppError(404, 'JOB_NOT_FOUND', `Job ${jobId} not found`);
    res.json(job);
  } catch (err) {
    next(err);
  }
};
