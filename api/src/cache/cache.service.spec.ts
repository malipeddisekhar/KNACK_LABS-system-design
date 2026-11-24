import { CacheService, redisReconnectDelay } from './cache.service.js';

describe('CacheService resilience boundaries', () => {
  it('jitter-spreads Redis reconnect delays and stops after the retry cap', () => {
    expect(redisReconnectDelay(1, () => 0.5)).toBe(100);
    expect(redisReconnectDelay(2, () => 0.5)).toBe(200);
    expect(redisReconnectDelay(3, () => 0.5)).toBe(400);
    expect(redisReconnectDelay(3, () => 0.999999)).toBeLessThanOrEqual(799);
    expect(redisReconnectDelay(3, () => 0.999999)).toBeLessThanOrEqual(1000);
    expect(redisReconnectDelay(4, () => 0.5)).toBeNull();
    expect(redisReconnectDelay(0, () => 0.5)).toBeNull();
  });

  it('opens the redirect-read circuit after three failures and falls back without another Redis call', async () => {
    const appLogger = {
      logCircuitState: jest.fn(),
      warnDependencyFailure: jest.fn(),
      logDependencyTimeout: jest.fn(),
    };
    const service = new CacheService({ get: jest.fn() } as any, appLogger as any);
    const get = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('private endpoint detail'), { code: 'ECONNRESET' }));
    (service as any).redis = { get };

    await expect(service.getRedirectTarget('code')).resolves.toBeNull();
    await expect(service.getRedirectTarget('code')).resolves.toBeNull();
    await expect(service.getRedirectTarget('code')).resolves.toBeNull();
    await expect(service.getRedirectTarget('code', 'req-9')).resolves.toBeNull();

    expect(get).toHaveBeenCalledTimes(3);
    expect(appLogger.logCircuitState).toHaveBeenCalledWith({
      dependency: 'redis',
      operation: 'redirect_cache_read',
      from_state: 'closed',
      to_state: 'open',
    });
    expect(appLogger.warnDependencyFailure).toHaveBeenCalledTimes(3);
  });

  it('logs Redis command timeouts with operation, bound, and request id only', async () => {
    const appLogger = {
      logCircuitState: jest.fn(),
      warnDependencyFailure: jest.fn(),
      logDependencyTimeout: jest.fn(),
    };
    const service = new CacheService({ get: jest.fn() } as any, appLogger as any);
    (service as any).redis = {
      get: jest.fn().mockRejectedValue(new Error('Command timed out')),
    };

    await expect(service.getRedirectTarget('code', 'req-cache-2')).resolves.toBeNull();
    expect(appLogger.logDependencyTimeout).toHaveBeenCalledWith({
      dependency: 'redis',
      operation: 'redirect_cache_get',
      timeout_ms: 1000,
      request_id: 'req-cache-2',
    });
    expect(JSON.stringify(appLogger.logDependencyTimeout.mock.calls)).not.toContain('Command timed out');
  });
});
