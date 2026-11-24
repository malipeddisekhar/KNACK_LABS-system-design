import { Injectable, LoggerService } from '@nestjs/common';
import { safeHttpMethod, safeRouteTemplate } from './http-route.js';

export type AppLogLevel = 'error' | 'warn' | 'log' | 'debug' | 'verbose';
export type ResilienceRequestId = string | undefined;

const LEVEL_WEIGHT: Record<AppLogLevel, number> = {
  error: 0,
  warn: 1,
  log: 2,
  debug: 3,
  verbose: 4,
};
const SENSITIVE_LOG_DETAIL =
  /(?:\b(?:password|passwd|pwd|secret|token|api[_-]?key|authorization|credential|database_url|jwt_secret)\b\s*[:=]|\bBearer\s+\S+|\b(?:postgres(?:ql)?|redis|rediss|mysql|mongodb(?:\+srv)?):\/\/\S+|\b(?:ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ECONNRESET|EHOSTUNREACH|PrismaClient\w+Error)\b|(?:^|\n)\s*at\s+|(?:^|\n)\s*Error(?::|\s)|\b(?:stack trace|caused by:)\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b[A-Z0-9_-]{8,}\.[A-Z0-9_-]{8,}\.[A-Z0-9_-]{8,}\b)/i;

/** Writes one newline-delimited JSON record per call; Nest stack arguments are ignored. */
@Injectable()
export class AppLogger implements LoggerService {
  private minimumLevel: AppLogLevel = 'log';
  private serviceName = 'url-shortener-api';

  setMinimumLevel(level: AppLogLevel): void {
    this.minimumLevel = level;
  }

  setServiceName(name: string): void {
    this.serviceName = name;
  }

  log(message: unknown): void {
    this.write('info', safeLogMessage(message));
  }

  error(message: unknown): void {
    this.write('error', safeLogMessage(message));
  }

  warn(message: unknown): void {
    this.write('warn', safeLogMessage(message));
  }

  debug(message: unknown): void {
    this.write('debug', safeLogMessage(message));
  }

  verbose(message: unknown): void {
    this.write('verbose', safeLogMessage(message));
  }

  fatal(message: unknown): void {
    this.write('error', safeLogMessage(message));
  }

  logStartup(fields: {
    environment: string;
    port: number;
    log_level: string;
  }): void {
    this.write(
      'info',
      'api_started',
      null,
      fields,
      true,
    );
  }

  logRequest(fields: {
    request_id: string;
    method: string;
    route: string;
    status_code: number;
    latency_ms: number;
  }): void {
    this.write(
      'info',
      'http_request_completed',
      fields.request_id,
      {
        method: safeHttpMethod(fields.method),
        path: safeRouteTemplate(fields.route),
        status_code: fields.status_code,
        duration_ms: fields.latency_ms,
      },
    );
  }

  logError(fields: {
    request_id: string;
    method: string;
    route: string;
    status_code: number;
    error_code: string;
    message: string;
  }): void {
    this.write(
      'error',
      safeLogMessage(fields.message),
      fields.request_id,
      {
        method: safeHttpMethod(fields.method),
        path: safeRouteTemplate(fields.route),
        status_code: fields.status_code,
        error_code: fields.error_code,
      },
      true,
    );
  }

  logDependencyTimeout(fields: {
    dependency: string;
    operation: string;
    timeout_ms: number;
    request_id?: ResilienceRequestId;
  }): void {
    this.write(
      'warn',
      'dependency_timeout',
      safeRequestId(fields.request_id),
      {
        dependency: fields.dependency,
        operation: fields.operation,
        timeout_ms: fields.timeout_ms,
      },
      true,
    );
  }

  warnDependencyFailure(fields: {
    dependency: string;
    operation: string;
    request_id?: ResilienceRequestId;
  }): void {
    this.write(
      'warn',
      'dependency_operation_failed_details_withheld',
      safeRequestId(fields.request_id),
      { dependency: fields.dependency, operation: fields.operation },
      true,
    );
  }

  logCircuitState(fields: {
    dependency: string;
    operation: string;
    from_state: string;
    to_state: string;
    request_id?: ResilienceRequestId;
  }): void {
    this.write(
      'warn',
      'dependency_circuit_state_changed',
      safeRequestId(fields.request_id),
      {
        dependency: fields.dependency,
        operation: fields.operation,
        from_state: fields.from_state,
        to_state: fields.to_state,
      },
      true,
    );
  }

  logDependencyRetry(fields: {
    dependency: string;
    operation: string;
    attempt: number;
    delay_ms: number;
    error_code: string;
    request_id?: ResilienceRequestId;
  }): void {
    this.write(
      'warn',
      'dependency_retry_scheduled',
      safeRequestId(fields.request_id),
      {
        dependency: fields.dependency,
        operation: fields.operation,
        attempt: fields.attempt,
        delay_ms: fields.delay_ms,
        error_code: fields.error_code,
      },
      true,
    );
  }

  private write(
    level: 'info' | 'warn' | 'error' | 'debug' | 'verbose',
    message: string,
    requestId: string | null = null,
    fields: Record<string, string | number> = {},
    force = false,
  ): void {
    const configuredLevel = level === 'info' ? 'log' : level;
    if (!force && LEVEL_WEIGHT[configuredLevel] > LEVEL_WEIGHT[this.minimumLevel]) {
      return;
    }
    const line = `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      service_name: this.serviceName,
      request_id: requestId,
      ...fields,
    })}\n`;
    if (level === 'error' || level === 'warn') {
      process.stderr.write(line);
    } else {
      process.stdout.write(line);
    }
  }
}

function safeLogMessage(message: unknown): string {
  if (typeof message !== 'string') return 'Non-string log payload omitted.';
  if (SENSITIVE_LOG_DETAIL.test(message)) return 'Diagnostic details withheld.';
  return message.replace(/[\r\n]/g, ' ');
}

function safeRequestId(requestId: string | undefined): string | null {
  return requestId && /^[A-Za-z0-9._-]{1,128}$/.test(requestId)
    ? requestId
    : null;
}
