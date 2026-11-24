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
import { safeHttpMethod, safeRouteTemplate } from './http-route.js';

/**
 * Global exception filter — catches every unhandled exception and writes a
 * safe, consistent error envelope to the response.
 *
 * Rules enforced here:
 *  - Stack traces are never sent to clients.
 *  - Secrets (auth headers, passwords) are never logged.
 *  - 5xx responses are generic; exception details and stacks are never serialized.
 *  - The request_id in the body always matches the X-Request-ID header.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly appLogger: AppLogger,
    private readonly environment: string = process.env.NODE_ENV ??
      'development',
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & Partial<RequestWithId>>();
    const res = ctx.getResponse<Response>();

    const requestId = req.requestId ?? 'unknown';
    const route = safeRouteTemplate(
      (req as Request & { route?: { path?: unknown } }).route?.path,
    );

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
      if (statusCode >= 500) {
        clientMessage = 'An unexpected error occurred. Please try again later.';
        serverMessage = this.safeServerMessage(errorCode);
      } else {
        clientMessage = safeClientErrorMessage(clientMessage);
        // Keep request data and exception detail out of logs in every mode.
        serverMessage = errorCode;
      }
    } else {
      // Unexpected / unhandled error — do NOT expose internals.
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      errorCode = 'INTERNAL_SERVER_ERROR';
      clientMessage = 'An unexpected error occurred. Please try again later.';
      serverMessage = this.safeServerMessage(errorCode);
    }

    // Log server-side context (no auth headers, no stack trace in the log line).
    this.appLogger.logError({
      request_id: requestId,
      method: safeHttpMethod(req.method),
      route,
      status_code: statusCode,
      error_code: errorCode,
      message: serverMessage,
    });

    const body: ErrorEnvelope = {
      error: {
        code: errorCode,
        message: clientMessage,
        request_id: requestId,
      },
    };

    res.status(statusCode).json(body);
  }

  private safeServerMessage(errorCode: string): string {
    return this.environment === 'production'
      ? `${errorCode} (details redacted)`
      : `${errorCode} (details withheld; stack not logged)`;
  }
}

const SENSITIVE_CLIENT_DETAIL =
  /(?:\b(?:password|passwd|pwd|secret|token|api[_-]?key|authorization|credential|database_url|jwt_secret)\b\s*[:=]|\bBearer\s+[A-Za-z0-9._~+/-]+|\b(?:postgres(?:ql)?|redis|rediss|mysql|mongodb(?:\+srv)?):\/\/[^\s"'<>]+|\b(?:ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ECONNRESET|EHOSTUNREACH|PrismaClient\w+Error)\b|(?:^|\n)\s*at\s+[\w.$<>]+\s+\(|(?:^|\n)\s*Error(?::|\s)|\b(?:stack trace|caused by:)\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b[A-Z0-9_-]{8,}\.[A-Z0-9_-]{8,}\.[A-Z0-9_-]{8,}\b)/im;

function safeClientErrorMessage(message: string): string {
  return SENSITIVE_CLIENT_DETAIL.test(message)
    ? 'Request could not be completed.'
    : message;
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
