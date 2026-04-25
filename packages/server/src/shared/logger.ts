import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import pino from "pino";
import { pinoHttp } from "pino-http";

const isDev = process.env.NODE_ENV !== "production";

const TRACE_HEADER_KEY = "x-request-id";

interface LoggerContext {
  traceId?: string;
  [key: string]: unknown;
}

const asyncLocalStorage = new AsyncLocalStorage<LoggerContext>();

export function createLogger(serviceName: string) {
  return pino({
    level: process.env.LOG_LEVEL || "info",

    mixin() {
      const traceId = getTraceId();
      return traceId ? { traceId } : {};
    },

    redact: {
      paths: [
        "req.headers.authorization",
        'req.headers["x-auth-token"]',
        "password",
        "token",
        "secret",
        "credit_card",
        "bank_account",
      ],
      censor: "***",
    },

    transport: isDev
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
            messageFormat: `[${serviceName}] {msg}`,
          },
        }
      : undefined,

    base: {
      service: serviceName,
      pid: process.pid,
      hostname: undefined,
    },
  });
}

export function getTraceId() {
  return asyncLocalStorage.getStore()?.traceId;
}

export function createRequestLoggerMiddleware(logger: pino.Logger) {
  const httpLogger = pinoHttp({
    logger,
    genReqId: (req) => {
      return (req.headers[TRACE_HEADER_KEY] as string) || randomUUID();
    },
    serializers: {
      req: (req) => ({
        method: req.method,
        url: req.url,
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },
    customAttributeKeys: {
      req: "req",
      res: "res",
      err: "err",
      responseTime: "responseTime",
    },
  });

  return (
    req: Parameters<typeof httpLogger>[0],
    res: Parameters<typeof httpLogger>[1],
    next: () => void,
  ) => {
    httpLogger(req, res, () => {
      const traceId = req.id as string;
      res.setHeader(TRACE_HEADER_KEY, traceId);
      asyncLocalStorage.run({ traceId }, () => {
        next();
      });
    });
  };
}
