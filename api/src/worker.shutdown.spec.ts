import {
  handleWorkerShutdown,
  type ClosableApplicationContext,
  type WorkerShutdownLogger,
  type WorkerShutdownState,
} from './worker.js';

describe('Worker Graceful Shutdown & Drain Timeout (unit)', () => {
  let mockLogger: WorkerShutdownLogger;
  let exitCalls: number[];
  let exitFn: (code: number) => void;

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    exitCalls = [];
    exitFn = (code: number) => {
      exitCalls.push(code);
    };
  });

  it('successfully drains in-flight jobs within timeout window and logs clean exit (code 0)', async () => {
    const mockApp: ClosableApplicationContext = {
      close: jest.fn().mockImplementation(async () => {
        // Fast completion simulating jobs draining cleanly in 10ms
        await new Promise((r) => setTimeout(r, 10));
      }),
    };
    const state: WorkerShutdownState = { isShuttingDown: false };

    const result = await handleWorkerShutdown(
      mockApp,
      'SIGTERM',
      state,
      mockLogger,
      5000,
      exitFn,
    );

    expect(result.outcome).toBe('clean');
    expect(result.exitCode).toBe(0);
    expect(exitCalls).toEqual([0]);
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('Received SIGTERM. Shutting down Analytics Worker gracefully...'),
    );
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('Analytics Worker shut down cleanly.'),
    );
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('handles drain timeout expiration accurately: logs incomplete shutdown and exits with code 1', async () => {
    const mockApp: ClosableApplicationContext = {
      close: jest.fn().mockImplementation(async () => {
        // Simulating slow/stuck in-flight job that takes longer than drain timeout
        await new Promise((r) => setTimeout(r, 2000));
      }),
    };
    const state: WorkerShutdownState = { isShuttingDown: false };

    // Set short 50ms drain timeout for test determinism
    const result = await handleWorkerShutdown(
      mockApp,
      'SIGINT',
      state,
      mockLogger,
      50,
      exitFn,
    );

    expect(result.outcome).toBe('timeout');
    expect(result.exitCode).toBe(1);
    expect(exitCalls).toEqual([1]);

    // Confirms warning logged about timeout
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Worker shutdown timed out after 50ms, forcing exit.'),
    );

    // Confirms incomplete shutdown error logged
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Analytics Worker shutdown incomplete: timeout expired before in-flight jobs finished draining.'),
    );

    // Confirms it did NOT falsely claim clean shutdown
    expect(mockLogger.log).not.toHaveBeenCalledWith(
      expect.stringContaining('Analytics Worker shut down cleanly.'),
    );
  });

  it('rejects duplicate shutdown signals while draining is already in progress', async () => {
    let resolveClose: () => void;
    const mockApp: ClosableApplicationContext = {
      close: jest.fn().mockImplementation(
        () =>
          new Promise<void>((r) => {
            resolveClose = r;
          }),
      ),
    };
    const state: WorkerShutdownState = { isShuttingDown: false };

    // Initiate first shutdown
    const firstShutdownPromise = handleWorkerShutdown(
      mockApp,
      'SIGTERM',
      state,
      mockLogger,
      2000,
      exitFn,
    );

    // Immediately attempt second shutdown while first is draining
    const secondResult = await handleWorkerShutdown(
      mockApp,
      'SIGINT',
      state,
      mockLogger,
      2000,
      exitFn,
    );

    expect(secondResult.outcome).toBe('error');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Shutdown already in progress. Ignoring duplicate signal: SIGINT'),
    );

    // Complete the first shutdown
    resolveClose!();
    const firstResult = await firstShutdownPromise;

    expect(firstResult.outcome).toBe('clean');
    expect(firstResult.exitCode).toBe(0);
    expect(exitCalls).toEqual([0]);
  });

  it('logs error and exits with code 1 if app.close() throws', async () => {
    const mockApp: ClosableApplicationContext = {
      close: jest.fn().mockRejectedValue(new Error('Database disconnect failure')),
    };
    const state: WorkerShutdownState = { isShuttingDown: false };

    const result = await handleWorkerShutdown(
      mockApp,
      'SIGTERM',
      state,
      mockLogger,
      2000,
      exitFn,
    );

    expect(result.outcome).toBe('error');
    expect(result.exitCode).toBe(1);
    expect(exitCalls).toEqual([1]);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error during worker shutdown: Database disconnect failure'),
    );
  });
});
