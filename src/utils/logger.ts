import pino from "pino";
import { env } from "../config/env.ts";

export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : "info",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      ignore: "pid,hostname",
      translateTime: "HH:MM:ss Z",
    },
  },
});
