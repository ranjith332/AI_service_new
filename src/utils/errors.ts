export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, code = "internal_error", details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, "validation_error", details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "unauthorized");
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Rate limit exceeded") {
    super(message, 429, "rate_limit_exceeded");
  }
}

export class UnsupportedQueryError extends AppError {
  constructor(message = "The query could not be safely mapped to a supported plan.") {
    super(message, 422, "unsupported_query");
  }
}
