import { RateLimitError } from "./errors.ts";

interface Bucket {
  count: number;
  resetAt: number;
}

export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly windowMs: number,
    private readonly maxRequests: number
  ) {}

  consume(key: string): void {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, {
        count: 1,
        resetAt: now + this.windowMs
      });
      return;
    }

    if (bucket.count >= this.maxRequests) {
      throw new RateLimitError();
    }

    bucket.count += 1;
    this.buckets.set(key, bucket);
  }
}
