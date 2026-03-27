import { env } from "./config/env.ts";
import { createApp } from "./app.ts";
import { logger } from "./utils/logger.ts";

export async function startServer() {
  const { app } = await createApp();
  app.listen(env.PORT);
  logger.info({ port: env.PORT }, "Doctor Healix AI service started");
}
