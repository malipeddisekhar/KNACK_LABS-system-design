import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module.js';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('WorkerRunner');
  const app = await NestFactory.createApplicationContext(WorkerModule);
  logger.log('Analytics Worker is running and listening for queue jobs...');

  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn(`Shutdown already in progress. Ignoring duplicate signal: ${signal}`);
      return;
    }
    isShuttingDown = true;
    logger.log(`Received ${signal}. Shutting down Analytics Worker gracefully...`);

    const drainTimeoutMs = 10000;
    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        logger.warn(`Worker shutdown timed out after ${drainTimeoutMs}ms, forcing exit.`);
        resolve();
      }, drainTimeoutMs);
    });

    try {
      await Promise.race([app.close(), timeoutPromise]);
      logger.log('Analytics Worker shut down cleanly.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Error during worker shutdown: ${msg}`);
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void bootstrap();
