import {
  CircuitBreaker,
  CircuitOpenError,
  MAX_TRANSIENT_RETRIES,
  retryTransient,
  withDependencyTimeout,
} from './resilience.js';

describe('resilience primitives', () => {
  it('opens after consecutive failures and closes after a successful half-open probe', async () => {
    let now = 0;
    const states: string[] = [];
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 100,
      now: () => now,
      onStateChange: (from, to) => states.push(`${from}->${to}`),
    });
    const failure = () => Promise.reject(new Error('unavailable'));

    await expect(breaker.execute(failure)).rejects.toThrow('unavailable');
    await expect(breaker.execute(failure)).rejects.toThrow('unavailable');
    expect(breaker.state).toBe('open');
    await expect(breaker.execute(async () => 'not called')).rejects.toBeInstanceOf(
      CircuitOpenError,
    );

    now = 100;
    await expect(breaker.execute(async () => 'recovered')).resolves.toBe('recovered');
    expect(breaker.state).toBe('closed');
    expect(states).toEqual(['closed->open', 'open->half-open', 'half-open->closed']);
  });

  it('reopens after a failed half-open recovery probe', async () => {
    let now = 0;
    const transitions: string[] = [];
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 50,
      now: () => now,
      onStateChange: (from, to) => transitions.push(`${from}->${to}`),
    });
    await expect(breaker.execute(() => Promise.reject(new Error('initial')))).rejects.toThrow('initial');
    now = 50;
    await expect(breaker.execute(() => Promise.reject(new Error('probe')))).rejects.toThrow('probe');
    expect(breaker.state).toBe('open');
    expect(transitions).toEqual(['closed->open', 'open->half-open', 'half-open->open']);
  });

  it('retries a transient failure with capped jitter but does not retry permanent errors', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const onRetry = jest.fn();
    const operation = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(Object.assign(new Error('private detail'), { code: 'ETIMEDOUT' }))
      .mockResolvedValue('ok');

    await expect(
      retryTransient(operation, {
        maxRetries: 1,
        initialDelayMs: 40,
        maxDelayMs: 100,
        random: () => 0.5,
        sleep,
        onRetry,
      }),
    ).resolves.toBe('ok');
    expect(sleep).toHaveBeenCalledWith(20);
    expect(onRetry).toHaveBeenCalledWith(1, 20, 'ETIMEDOUT');
    expect(operation).toHaveBeenCalledTimes(2);

    const permanent = Object.assign(new Error('invalid data'), { code: 'P2002' });
    const noRetry = jest.fn<Promise<void>, []>().mockRejectedValue(permanent);
    await expect(
      retryTransient(noRetry, {
        maxRetries: 2,
        initialDelayMs: 40,
        maxDelayMs: 100,
        sleep,
      }),
    ).rejects.toBe(permanent);
    expect(noRetry).toHaveBeenCalledTimes(1);
  });

  it('caps exponential retry delays even when the retry budget allows more attempts', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const operation = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(Object.assign(new Error('transient'), { code: 'ECONNRESET' }))
      .mockRejectedValueOnce(Object.assign(new Error('transient'), { code: 'ECONNRESET' }))
      .mockRejectedValueOnce(Object.assign(new Error('transient'), { code: 'ECONNRESET' }))
      .mockResolvedValue('ok');

    await expect(
      retryTransient(operation, {
        maxRetries: 3,
        initialDelayMs: 40,
        maxDelayMs: 100,
        random: () => 1,
        sleep,
      }),
    ).resolves.toBe('ok');
    expect(sleep.mock.calls.map(([delay]) => delay)).toEqual([40, 80, 100]);
  });

  it('rejects invalid retry budgets and clamps large finite budgets to the hard ceiling', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const alwaysTransient = jest.fn<Promise<void>, []>().mockRejectedValue(
      Object.assign(new Error('temporary'), { code: 'ETIMEDOUT' }),
    );
    for (const maxRetries of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(
        retryTransient(alwaysTransient, {
          maxRetries,
          initialDelayMs: 1,
          maxDelayMs: 2,
          sleep,
        }),
      ).rejects.toThrow('maxRetries must be a finite non-negative integer.');
    }
    expect(alwaysTransient).not.toHaveBeenCalled();

    alwaysTransient.mockClear();
    await expect(
      retryTransient(alwaysTransient, {
        maxRetries: Number.MAX_SAFE_INTEGER,
        initialDelayMs: 1,
        maxDelayMs: 2,
        random: () => 0,
        sleep,
      }),
    ).rejects.toThrow('temporary');
    expect(alwaysTransient).toHaveBeenCalledTimes(MAX_TRANSIENT_RETRIES + 1);
    expect(sleep).toHaveBeenCalledTimes(MAX_TRANSIENT_RETRIES);
  });

  it('clears timeout handles when the operation settles', async () => {
    jest.useFakeTimers();
    try {
      await expect(
        withDependencyTimeout(async () => 'done', 'redis', 'cache.get', 100),
      ).resolves.toBe('done');
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
