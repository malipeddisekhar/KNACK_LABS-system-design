import { APP_PIPE } from '@nestjs/core';
import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from './auth/auth.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { ReadyController } from './ready.controller.js';
import { CacheModule } from './cache/cache.module.js';
import { LinksModule } from './links/links.module';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { AppLogger } from './common/app-logger.service';
import { createBullConnectionConfig } from './common/bull-config.js';

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const rawPort = config.PORT !== undefined && config.PORT !== '' ? config.PORT : '3000';
  const portText =
    typeof rawPort === 'string'
      ? rawPort
      : typeof rawPort === 'number'
        ? String(rawPort)
        : '';
  const port = /^\d+$/.test(portText) ? Number(portText) : Number.NaN;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be set to an integer between 1 and 65535.');
  }

  const jwtSecret = typeof config.JWT_SECRET === 'string' ? config.JWT_SECRET : '';
  if (
    jwtSecret.length < 32 ||
    containsControlCharacters(jwtSecret) ||
    jwtSecret.trim().length === 0 ||
    new Set(jwtSecret).size < 8
  ) {
    throw new Error(
      'JWT_SECRET must be at least 32 characters long and contain sufficient character diversity.',
    );
  }

  const configuredBaseUrl =
    typeof config.PUBLIC_BASE_URL === 'string'
      ? config.PUBLIC_BASE_URL.trim()
      : '';
  let publicBaseUrl = `http://localhost:${port}`;

  if (configuredBaseUrl) {
    if (containsControlCharacters(configuredBaseUrl)) {
      throw new Error('PUBLIC_BASE_URL must not contain control characters.');
    }

    let parsedBaseUrl: URL;
    try {
      parsedBaseUrl = new URL(configuredBaseUrl);
    } catch {
      throw new Error('PUBLIC_BASE_URL must be an absolute HTTP or HTTPS URL.');
    }

    if (
      !['http:', 'https:'].includes(parsedBaseUrl.protocol) ||
      !parsedBaseUrl.hostname ||
      parsedBaseUrl.username ||
      parsedBaseUrl.password ||
      parsedBaseUrl.pathname !== '/' ||
      parsedBaseUrl.search ||
      parsedBaseUrl.hash
    ) {
      throw new Error(
        'PUBLIC_BASE_URL must be an HTTP or HTTPS origin without credentials, path, query, or fragment.',
      );
    }

    publicBaseUrl = parsedBaseUrl.origin;
  }

  return { ...config, PORT: port, PUBLIC_BASE_URL: publicBaseUrl };
}

function containsControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    AuthModule,
    DatabaseModule,
    CacheModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createBullConnectionConfig(config),
    }),
    AnalyticsModule,
    LinksModule,
  ],
  controllers: [AppController, HealthController, ReadyController],
  providers: [
    AppService,
    AppLogger,
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
    },
  ],
})
export class AppModule {}
