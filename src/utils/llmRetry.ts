import { logger } from './logger';

const RETRY_DELAYS_MS = [1000, 2000, 4000]; // 3 attempts: 1s, 2s, 4s backoff

function isRetryable(err: any): boolean {
  const msg = String(err?.message ?? err);
  if (/503|UNAVAILABLE|rate.?limit|quota|overload|too.?many.?request/i.test(msg)) return true;
  // Gemini wraps errors as JSON strings — check the parsed code
  try {
    const parsed = JSON.parse(msg);
    const code = parsed?.error?.code ?? parsed?.code;
    return code === 503 || code === 429;
  } catch {
    return false;
  }
}

export async function callLlmWithRetry<T>(
  fn: () => Promise<T>,
  label: string,
): Promise<T> {
  for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
    try {
      return await fn();
    } catch (err: any) {
      const retryable = isRetryable(err);
      if (!retryable || i === RETRY_DELAYS_MS.length) throw err;
      const delay = RETRY_DELAYS_MS[i];
      logger.warn('llm.retrying', { label, attempt: i + 1, delayMs: delay, error: err?.message });
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  // unreachable
  throw new Error('LLM retry loop exhausted');
}
