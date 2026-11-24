import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AppLogger } from '../common/app-logger.service.js';
import { safeHttpMethod, safeRouteTemplate } from '../common/http-route.js';
import { MetricsService } from './metrics.service.js';

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(
    private readonly metrics: MetricsService,
    private readonly appLogger: AppLogger,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const started = process.hrtime.bigint();
    res.once('finish', () => {
      const route = safeRouteTemplate(
        (req as Request & { route?: { path?: unknown } }).route?.path,
      );
      const durationSeconds =
        Number(process.hrtime.bigint() - started) / 1_000_000_000;
      const method = safeHttpMethod(req.method);
      this.metrics.recordHttpRequest(
        method,
        route,
        res.statusCode,
        durationSeconds,
      );
      this.appLogger.logRequest({
        request_id: (req as Request & { requestId?: string }).requestId ?? 'unknown',
        method,
        route,
        status_code: res.statusCode,
        latency_ms: Math.round(durationSeconds * 1000),
      });
    });
    next();
  }
}
