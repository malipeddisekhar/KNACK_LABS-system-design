import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { RequestIdMiddleware } from './request-id.middleware.js';
import { AppLogger } from './common/app-logger.service.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = app.get(ConfigService).get<number>('PORT');

  // 1. Attach a request ID to every incoming request and echo it in the
  //    X-Request-ID response header.  Runs before all other middleware so
  //    the ID is available to guards, interceptors, and the exception filter.
  const requestIdMiddleware = new RequestIdMiddleware();
  app.use(requestIdMiddleware.use.bind(requestIdMiddleware));

  // 2. Stamp _startTime so the exception filter can compute latency.
  app.use((_req: { _startTime?: number }, _res: unknown, next: () => void) => {
    _req._startTime = Date.now();
    next();
  });

  // 3. Register the global exception filter.  It depends on AppLogger which
  //    is provided by AppModule, so we resolve it from the DI container.
  const appLogger = app.get(AppLogger);
  app.useGlobalFilters(new HttpExceptionFilter(appLogger));

  app.enableShutdownHooks();

  const server = app.getHttpServer();
  // Sensible bounded timeouts on the HTTP server to avoid hung connections
  server.setTimeout(30000); // 30s request execution timeout
  server.keepAliveTimeout = 65000; // 65s keep-alive timeout
  server.headersTimeout = 66000; // 66s headers timeout (must exceed keepAliveTimeout)

  const resolvedPort = port ?? 3000;
  await app.listen(resolvedPort, '0.0.0.0');
}
void bootstrap();
