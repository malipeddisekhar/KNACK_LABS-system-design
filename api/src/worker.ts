import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module.js';
import { AppLogger, type AppLogLevel } from './common/app-logger.service.js';

export interface ClosableApplicationContext {
  close: () => Promise<void>;
}

export interface WorkerShutdownLogger {
  log: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

export interface WorkerShutdownState {
  isShuttingDown: boolean;
}

export async function handleWorkerShutdown(
  app: ClosableApplicationContext,
  signal: string,
  state: WorkerShutdownState,
  logger: WorkerShutdownLogger,
  drainTimeoutMs: number = 10000,
  exitFn: (code: number) => void = (code) => process.exit(code),
): Promise<{ outcome: 'clean' | 'timeout' | 'error'; exitCode: number }> {
  if (state.isShuttingDown) {
    logger.warn(
      `Shutdown already in progress. Ignoring duplicate signal: ${signal}`,
    );
    return { outcome: 'error', exitCode: 0 };
  }
  state.isShuttingDown = true;
  logger.log(
    `Received ${signal}. Shutting down Analytics Worker gracefully...`,
  );

  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      logger.warn(
        `Worker shutdown timed out after ${drainTimeoutMs}ms, forcing exit.`,
      );
      resolve('timeout');
    }, drainTimeoutMs);
  });

  const closePromise = app.close().then(() => 'clean' as const);

  let exitCode = 0;
  let outcome: 'clean' | 'timeout' | 'error' = 'clean';

  try {
    const result = await Promise.race([closePromise, timeoutPromise]);
    clearTimeout(timer!);

    if (result === 'clean') {
      outcome = 'clean';
      exitCode = 0;
      logger.log('Analytics Worker shut down cleanly.');
    } else {
      outcome = 'timeout';
      exitCode = 1;
      logger.error(
        'Analytics Worker shutdown incomplete: timeout expired before in-flight jobs finished draining.',
      );
    }
  } catch {
    clearTimeout(timer!);
    outcome = 'error';
    exitCode = 1;
    logger.error('Error during worker shutdown; details withheld.');
  } finally {
    exitFn(exitCode);
  }

  return { outcome, exitCode };
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: false,
  });
  const logger = app.get(AppLogger);
  logger.setServiceName('url-shortener-worker');
  const configuredLevel = process.env.LOG_LEVEL;
  if (
    configuredLevel &&
    ['error', 'warn', 'log', 'debug', 'verbose'].includes(configuredLevel)
  ) {
    logger.setMinimumLevel(configuredLevel as AppLogLevel);
  }
  app.useLogger(logger);
  logger.log('Analytics Worker is running and listening for queue jobs...');

  const state: WorkerShutdownState = { isShuttingDown: false };

  process.on(
    'SIGINT',
    () => void handleWorkerShutdown(app, 'SIGINT', state, logger),
  );
  process.on(
    'SIGTERM',
    () => void handleWorkerShutdown(app, 'SIGTERM', state, logger),
  );
}

// Automatically bootstrap when executed as the main application script
if (process.env.NODE_ENV !== 'test') {
  void bootstrap().catch(() => {
    const production = process.env.NODE_ENV === 'production';
    process.stderr.write(
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        message: production
          ? 'Worker startup failed; sensitive details redacted.'
          : 'Worker startup failed; details withheld.',
        service_name: 'url-shortener-worker',
        request_id: null,
      })}\n`,
    );
    process.exitCode = 1;
  });
}
