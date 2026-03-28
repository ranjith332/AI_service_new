import pino from "pino";

import { env } from "../config/env.ts";

export const logger = pino({
  name: env.SERVICE_NAME,
  level: env.LOG_LEVEL || (env.NODE_ENV === "production" ? "info" : "debug"),
  base: {
    service: env.SERVICE_NAME,
    environment: env.NODE_ENV
  },
  timestamp: pino.stdTimeFunctions.isoTime
});
