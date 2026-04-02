export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code: string = "INTERNAL_ERROR",
    public details?: any,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, code: string = "bad_request") {
    super(message, 400, code);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(message, 401, "unauthorized");
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = "Not Found") {
    super(message, 404, "not_found");
  }
}

export class UnsupportedQueryError extends AppError {
  constructor(message: string = "Unsupported Query") {
    super(message, 422, "unsupported_query");
  }
}
