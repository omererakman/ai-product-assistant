import pino from "pino";
import { getConfig } from "./config/env.js";

const config = getConfig();

const isDevelopment = config.nodeEnv === "development";

export const logger = pino({
  level: config.logLevel,
  transport: isDevelopment
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      }
    : undefined,
});
