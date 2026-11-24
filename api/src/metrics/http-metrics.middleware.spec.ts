import { HttpMetricsMiddleware } from './http-metrics.middleware.js';
import type { MetricsService } from './metrics.service.js';
import type { AppLogger } from '../common/app-logger.service.js';

describe('HttpMetricsMiddleware', () => {
  it('records a bounded route template and correlated completion log on response finish', () => {
    const recordHttpRequest = jest.fn();
    const logRequest = jest.fn();
    const metrics = { recordHttpRequest } as unknown as MetricsService;
    const logger = { logRequest } as unknown as AppLogger;
    const middleware = new HttpMetricsMiddleware(metrics, logger);
    let finish: (() => void) | undefined;
    const req = {
      method: 'GET',
      requestId: 'edge-request-17',
      path: '/teams/private-team-id/activity',
      route: { path: '/:teamId/activity' },
    };
    const res = {
      statusCode: 200,
      once: (_event: string, callback: () => void) => {
        finish = callback;
        return res;
      },
    };
    const next = jest.fn();

    middleware.use(req as never, res as never, next);
    finish?.();

    expect(next).toHaveBeenCalledTimes(1);
    expect(recordHttpRequest).toHaveBeenCalledWith(
      'GET',
      '/:teamId/activity',
      200,
      expect.any(Number),
    );
    expect(recordHttpRequest.mock.calls[0][1]).not.toContain('private-team-id');
    expect(logRequest).toHaveBeenCalledWith({
      request_id: 'edge-request-17',
      method: 'GET',
      route: '/:teamId/activity',
      status_code: 200,
      latency_ms: expect.any(Number),
    });
  });
});
