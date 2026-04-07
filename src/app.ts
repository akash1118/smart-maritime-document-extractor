import 'dotenv/config';
import path from 'path';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';

import extractRoutes from './routes/extract.routes';
import jobRoutes from './routes/jobs.routes';
import sessionRoutes from './routes/sessions.routes';
import healthRoutes from './routes/health.routes';
import { errorHandler } from './middlewares/errorHandler';
import { swaggerSpec } from './swagger';
import { config } from './config/env';
import { logger } from './utils/logger';

const app = express();

app.use(cors());
app.use(express.json());

// Swagger UI
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api/docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Serve frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// Routes
app.use('/api/extract', extractRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/health', healthRoutes);

// Global error handler (must be last)
app.use(errorHandler);

app.listen(config.port, () => {
  logger.info('server.started', { port: config.port, env: config.nodeEnv });
});

export default app;
