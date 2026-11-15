import { Injectable, Logger } from '@nestjs/common';

/**
 * Thin wrapper around NestJS Logger that emits structured log lines.
 *
 * Fields logged per request:
 *   request_id, route, status_code, latency_ms
 *
 * Fields logged per error (server-side only):
 *   request_id, route, status_code, error_code, message
 *
 * Secrets (Authorization header, API keys) are intentionally never logged.
 */
@Injectable()
export class AppLogger {
  private readonly logger = new Logger('HTTP');

  logRequest(fields: {
    request_id: string;
    method: string;
    route: string;
    status_code: number;
    latency_ms: number;
  }): void {
    this.logger.log(JSON.stringify(fields));
  }

  logError(fields: {
    request_id: string;
    method: string;
    route: string;
    status_code: number;
    error_code: string;
    message: string;
  }): void {
    this.logger.error(JSON.stringify(fields));
  }
}

