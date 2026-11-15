import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { RequestWithId } from '../request-id.middleware.js';
import { AppLogger } from './app-logger.service.js';
import type { ErrorEnvelope } from './error-envelope.js';

/**
 * Global exception filter — catches every unhandled exception and writes a
 * safe, consistent error envelope to the response.
 *
 * Rules enforced here:
 *  - Stack traces are never sent to clients.
 *  - Secrets (auth headers, passwords) are never logged.
 *  - 5xx responses always use a generic client message; detail stays server-side.
 *  - The request_id in the body always matches the X-Request-ID header.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly appLogger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & Partial<RequestWithId>>();
    const res = ctx.getResponse<Response>();

    const requestId = req.requestId ?? 'unknown';
    const start = (req as Request & { _startTime?: number })._startTime;
    const latencyMs = start ? Date.now() - start : -1;

    let statusCode: number;
    let clientMessage: string;
    let errorCode: string;
    let serverMessage: string;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const responseBody = exception.getResponse();
      // Extract the human-readable message NestJS built for us.
      const nestMessage =
        typeof responseBody === 'string'
          ? responseBody
          : (responseBody as Record<string, unknown>).message;

      clientMessage = Array.isArray(nestMessage)
        ? (nestMessage as string[]).join('; ')
        : typeof nestMessage === 'string'
          ? nestMessage
          : exception.message;

      errorCode = httpStatusToCode(statusCode);
      serverMessage = clientMessage;
    } else {
      // Unexpected / unhandled error — do NOT expose internals.
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      errorCode = 'INTERNAL_SERVER_ERROR';
      clientMessage = 'An unexpected error occurred. Please try again later.';
      serverMessage =
        exception instanceof Error ? exception.message : String(exception);
    }

    // Log server-side context (no auth headers, no stack trace in the log line).
    this.appLogger.logError({
      request_id: requestId,
      method: req.method,
      route: req.path,
      status_code: statusCode,
      error_code: errorCode,
      message: serverMessage,
    });

    // For 5xx errors also log latency to aid incident debugging.
    if (statusCode >= 500 && latencyMs >= 0) {
      this.appLogger.logRequest({
        request_id: requestId,
        method: req.method,
        route: req.path,
        status_code: statusCode,
        latency_ms: latencyMs,
      });
    }

    const body: ErrorEnvelope = {
      error: {
        code: errorCode,
        message: clientMessage,
        request_id: requestId,
      },
    };

    res.status(statusCode).json(body);
  }
}

/**
 * Convert an HTTP status code to a stable string code.
 * Falls back to "HTTP_<n>" for any codes not explicitly listed.
 */
function httpStatusToCode(status: number): string {
  const map: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    405: 'METHOD_NOT_ALLOWED',
    408: 'REQUEST_TIMEOUT',
    409: 'CONFLICT',
    410: 'GONE',
    415: 'UNSUPPORTED_MEDIA_TYPE',
    422: 'UNPROCESSABLE_ENTITY',
    429: 'TOO_MANY_REQUESTS',
    500: 'INTERNAL_SERVER_ERROR',
    501: 'NOT_IMPLEMENTED',
    502: 'BAD_GATEWAY',
    503: 'SERVICE_UNAVAILABLE',
    504: 'GATEWAY_TIMEOUT',
  };
  return map[status] ?? `HTTP_${status}`;
}
