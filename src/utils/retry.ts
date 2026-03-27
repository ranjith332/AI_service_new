export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    attempts?: number;
    baseDelayMs?: number;
    shouldRetry?: (error: unknown, attempt: number) => boolean;
  } = {}
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 300;
  const shouldRetry = options.shouldRetry ?? (() => true);

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !shouldRetry(error, attempt)) {
        throw error;
      }

      await Bun.sleep(baseDelayMs * attempt);
    }
  }

  throw lastError;
}
