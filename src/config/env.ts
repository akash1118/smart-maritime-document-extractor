export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || '',
  llmProvider: (process.env.LLM_PROVIDER || 'gemini').toLowerCase(),
  llmModel: process.env.LLM_MODEL || 'gemini-2.0-flash',
  llmApiKey: process.env.LLM_API_KEY || '',
  nodeEnv: process.env.NODE_ENV || 'development',
  rateLimitWindowMs: 60_000,
  rateLimitMax: 10,
  llmTimeoutMs: 30_000,
  maxFileSizeBytes: 10 * 1024 * 1024,
};
