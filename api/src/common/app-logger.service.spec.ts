import { AppLogger } from './app-logger.service.js';

describe('AppLogger JSON records', () => {
  afterEach(() => jest.restoreAllMocks());

  it('writes required fields and redacts diagnostic-bearing messages', () => {
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const logger = new AppLogger();
    logger.setMinimumLevel('verbose');
    logger.logRequest({
      request_id: 'edge-request-17',
      method: 'GET',
      route: '/:shortCode',
      status_code: 302,
      latency_ms: 9,
    });
    logger.log('connection failed: postgres://user:secret@db/app');

    const records = stdout.mock.calls.map((call) => JSON.parse(String(call[0])));
    expect(records[0]).toMatchObject({
      level: 'info',
      message: 'http_request_completed',
      service_name: 'url-shortener-api',
      request_id: 'edge-request-17',
      method: 'GET',
      path: '/:shortCode',
      status_code: 302,
      duration_ms: 9,
    });
    expect(records[0].timestamp).toEqual(expect.any(String));
    expect(records[1].message).toBe('Diagnostic details withheld.');
    expect(JSON.stringify(records)).not.toContain('secret');
  });

  it('always writes the allowlisted startup event, even at error log level', () => {
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const logger = new AppLogger();
    logger.setMinimumLevel('error');
    logger.logStartup({ environment: 'production', port: 3000, log_level: 'warn' });

    expect(JSON.parse(String(stdout.mock.calls[0][0]))).toMatchObject({
      level: 'info',
      message: 'api_started',
      service_name: 'url-shortener-api',
      request_id: null,
      environment: 'production',
      port: 3000,
      log_level: 'warn',
    });
  });

  it('writes structured timeout, retry, and breaker fields without raw diagnostics', () => {
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const logger = new AppLogger();
    logger.setMinimumLevel('error');
    logger.logDependencyTimeout({
      dependency: 'redis',
      operation: 'cache.get',
      timeout_ms: 1000,
      request_id: 'req-safe-1',
    });
    logger.logDependencyRetry({
      dependency: 'postgres',
      operation: 'analytics_fallback_write',
      attempt: 1,
      delay_ms: 50,
      error_code: 'ETIMEDOUT',
      request_id: 'postgres://user:secret@host/db',
    });
    logger.logCircuitState({
      dependency: 'redis',
      operation: 'redirect_cache_read',
      from_state: 'closed',
      to_state: 'open',
    });

    const records = stderr.mock.calls.map((call) => JSON.parse(String(call[0])));
    expect(records[0]).toMatchObject({
      message: 'dependency_timeout',
      dependency: 'redis',
      operation: 'cache.get',
      timeout_ms: 1000,
      request_id: 'req-safe-1',
    });
    expect(records[1]).toMatchObject({
      message: 'dependency_retry_scheduled',
      error_code: 'ETIMEDOUT',
      request_id: null,
    });
    expect(records[2]).toMatchObject({
      message: 'dependency_circuit_state_changed',
      from_state: 'closed',
      to_state: 'open',
    });
    expect(JSON.stringify(records)).not.toContain('secret');
    expect(JSON.stringify(records)).not.toContain('postgres://');
  });

  it('withholds standalone PII and JWT-like values and flattens line breaks', () => {
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const logger = new AppLogger();
    logger.setMinimumLevel('verbose');
    logger.log('contact alice@example.invalid');
    logger.log('token abcdefgh.ijklmnop.qrstuvwx');
    logger.log('first line\nsecond line');

    const records = stdout.mock.calls.map((call) => JSON.parse(String(call[0])));
    expect(records[0].message).toBe('Diagnostic details withheld.');
    expect(records[1].message).toBe('Diagnostic details withheld.');
    expect(records[2].message).toBe('first line second line');
    expect(JSON.stringify(records)).not.toContain('alice@example.invalid');
    expect(JSON.stringify(records)).not.toContain('abcdefgh.ijklmnop.qrstuvwx');
  });
});
