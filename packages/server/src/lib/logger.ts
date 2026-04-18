import pino from "pino";

const isTTY = process.stdout.isTTY === true;
const isTest = process.env.NODE_ENV === "test";

export const logger = pino({
  level: process.env.SIDESCAN_LOG_LEVEL ?? (isTest ? "silent" : "info"),
  ...(isTTY && !isTest
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
});
