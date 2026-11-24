import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { RuntimeEnvironment, RuntimeLogLevel } from './app.module.js';
import { RequestIdMiddleware } from './request-id.middleware.js';
import { AppLogger } from './common/app-logger.service.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { HttpMetricsMiddleware } from './metrics/http-metrics.middleware.js';

async function bootstrap() {
  // Suppress framework stack logging until configuration has been validated.
  Logger.overrideLogger(false);
  // ConfigModule validates while AppModule is evaluated. Dynamic import keeps
  // that fail-fast error inside the guarded startup promise below.
  const { AppModule } = await import('./app.module.js');
  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
    logger: false,
  });
  const config = app.get(ConfigService);
  const environment = config.getOrThrow<RuntimeEnvironment>('NODE_ENV');
  const port = config.getOrThrow<number>('PORT');
  const logLevel = config.getOrThrow<RuntimeLogLevel>('LOG_LEVEL');
  const corsOrigins = config.getOrThrow<string[]>('CORS_ORIGINS');

  const appLogger = app.get(AppLogger);
  appLogger.setMinimumLevel(logLevel);
  app.useLogger(appLogger);
  app.enableCors({
    origin: corsOrigins,
    credentials: false,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
    maxAge: 600,
  });

  // 1. Attach a request ID to every incoming request and echo it in the
  //    X-Request-ID response header.  Runs before all other middleware so
  //    the ID is available to guards, interceptors, and the exception filter.
  const requestIdMiddleware = new RequestIdMiddleware();
  app.use(requestIdMiddleware.use.bind(requestIdMiddleware));

  // 2. Count completed HTTP requests and emit correlated JSON access records.
  const httpMetricsMiddleware = app.get(HttpMetricsMiddleware);
  app.use(httpMetricsMiddleware.use.bind(httpMetricsMiddleware));

  // 3. Register the global exception filter.  It depends on AppLogger which
  //    is provided by AppModule, so we resolve it from the DI container.
  app.useGlobalFilters(new HttpExceptionFilter(appLogger, environment));

  app.enableShutdownHooks();

  const server = app.getHttpServer();
  // Sensible bounded timeouts on the HTTP server to avoid hung connections
  server.setTimeout(30000); // 30s request execution timeout
  server.keepAliveTimeout = 65000; // 65s keep-alive timeout
  server.headersTimeout = 66000; // 66s headers timeout (must exceed keepAliveTimeout)

  await app.listen(port, '0.0.0.0');
  // Deliberately allowlist startup fields; never serialize environment config.
  appLogger.logStartup({ environment, port, log_level: logLevel });
}
void bootstrap().catch((error: unknown) => {
  let message: string;
  if (process.env.NODE_ENV === 'production') {
    message = 'Startup failed; sensitive details redacted.';
  } else if (
    error instanceof Error &&
    error.name === 'EnvironmentConfigurationError'
  ) {
    message = `Startup configuration error: ${error.message}`;
  } else {
    message = 'Startup failed during application initialization; details omitted.';
  }
  writeStartupLog('error', message);
  process.exitCode = 1;
});

function writeStartupLog(level: 'error', message: string): void {
  process.stderr.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      service_name: 'url-shortener-api',
      request_id: null,
    })}\n`,
  );
}
