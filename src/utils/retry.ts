import { logger } from "./logger.ts";

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    delayMs?: number;
    description?: string;
  } = {},
): Promise<T> {
  const { maxRetries = 3, delayMs = 1000, description = "Operation" } = options;
  let lastError: any;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      logger.warn(
        { error: error.message, attempt: i + 1, description },
        "Retry triggered",
      );
      if (i < maxRetries - 1) {
        await new Promise((res) => setTimeout(res, delayMs * Math.pow(2, i)));
      }
    }
  }

  throw lastError;
}
