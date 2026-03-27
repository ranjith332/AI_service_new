import { env } from "../config/env.ts";
import { UnauthorizedError } from "../utils/errors.ts";

export class AuthService {
  async validate(request: Request): Promise<void> {
    if (!env.AUTH_REQUIRED) {
      return;
    }

    const token = request.headers.get("authorization");
    if (!token) {
      throw new UnauthorizedError("Authorization header is required.");
    }
  }
}
