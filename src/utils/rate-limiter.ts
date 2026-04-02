import { UnauthorizedError } from "./errors.ts";

export class RateLimiter {
  private requests = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number = 60000, maxRequests: number = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  async check(key: string): Promise<void> {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    let userRequests = this.requests.get(key) || [];
    userRequests = userRequests.filter((timestamp) => timestamp > windowStart);
    
    if (userRequests.length >= this.maxRequests) {
      throw new UnauthorizedError("Rate limit exceeded. Please try again later.");
    }
    
    userRequests.push(now);
    this.requests.set(key, userRequests);
  }
}
