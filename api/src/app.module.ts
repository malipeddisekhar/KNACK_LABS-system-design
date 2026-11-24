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
import { TeamsModule } from './teams/teams.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { CommonModule } from './common/common.module.js';
import { createBullConnectionConfig } from './common/bull-config.js';
import { MetricsModule } from './metrics/metrics.module.js';

export type RuntimeEnvironment =
  'development' | 'staging' | 'production' | 'test';
export type RuntimeLogLevel = 'error' | 'warn' | 'log' | 'debug' | 'verbose';

export class EnvironmentConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvironmentConfigurationError';
  }
}

const RUNTIME_ENVIRONMENTS: RuntimeEnvironment[] = [
  'development',
  'staging',
  'production',
  'test',
];
const RUNTIME_LOG_LEVELS: RuntimeLogLevel[] = [
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
];

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const environment = readEnvironment(config.NODE_ENV);
  const isTest = environment === 'test';
  const port = readPort(config.PORT, isTest);
  const jwtSecret = readRequiredString(config, 'JWT_SECRET');
  if (
    jwtSecret.length < 32 ||
    containsControlCharacters(jwtSecret) ||
    jwtSecret.trim() !== jwtSecret ||
    new Set(jwtSecret).size < 8
  ) {
    throw new EnvironmentConfigurationError(
      'JWT_SECRET must be at least 32 characters long and contain sufficient character diversity.',
    );
  }

  const databaseUrl = readRequiredString(config, 'DATABASE_URL');
  validateServiceUrl(databaseUrl, ['postgres:', 'postgresql:'], 'DATABASE_URL');

  const redisUrl = readOptionalString(config.REDIS_URL, 'REDIS_URL');
  if (!redisUrl && ['staging', 'production'].includes(environment)) {
    throw new EnvironmentConfigurationError(
      'REDIS_URL is required in staging and production.',
    );
  }
  if (redisUrl) {
    validateServiceUrl(redisUrl, ['redis:', 'rediss:'], 'REDIS_URL');
  }

  const configuredBaseUrl = readOptionalString(
    config.PUBLIC_BASE_URL,
    'PUBLIC_BASE_URL',
  );
  if (!configuredBaseUrl && ['staging', 'production'].includes(environment)) {
    throw new EnvironmentConfigurationError(
      'PUBLIC_BASE_URL is required in staging and production.',
    );
  }
  const publicBaseUrl = configuredBaseUrl
    ? validateOrigin(
        configuredBaseUrl,
        'PUBLIC_BASE_URL',
        environment === 'production',
      )
    : `http://localhost:${port}`;

  const corsOrigins = readCorsOrigins(config.CORS_ORIGINS, environment);
  const logLevel = readLogLevel(config.LOG_LEVEL, environment);
  const retentionDays = readRetentionDays(config.RETENTION_DAYS);

  return {
    ...config,
    NODE_ENV: environment,
    PORT: port,
    JWT_SECRET: jwtSecret,
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    PUBLIC_BASE_URL: publicBaseUrl,
    CORS_ORIGINS: corsOrigins,
    LOG_LEVEL: logLevel,
    RETENTION_DAYS: retentionDays,
  };
}

function readEnvironment(value: unknown): RuntimeEnvironment {
  if (typeof value !== 'string' || !value.trim()) {
    throw new EnvironmentConfigurationError(
      'NODE_ENV is required; use development, staging, or production.',
    );
  }
  const environment = value.trim().toLowerCase();
  if (!RUNTIME_ENVIRONMENTS.includes(environment as RuntimeEnvironment)) {
    throw new EnvironmentConfigurationError(
      'NODE_ENV must be one of development, staging, production, or test.',
    );
  }
  return environment as RuntimeEnvironment;
}

function readPort(value: unknown, isTest: boolean): number {
  if ((value === undefined || value === '') && isTest) return 3000;
  const portText =
    typeof value === 'string'
      ? value
      : typeof value === 'number'
        ? String(value)
        : '';
  const port = /^\d+$/.test(portText) ? Number(portText) : Number.NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new EnvironmentConfigurationError(
      'PORT is required and must be an integer between 1 and 65535.',
    );
  }
  return port;
}

function readRequiredString(
  config: Record<string, unknown>,
  name: string,
): string {
  const value = config[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new EnvironmentConfigurationError(`${name} is required.`);
  }
  if (containsControlCharacters(value) || value.trim() !== value) {
    throw new EnvironmentConfigurationError(
      `${name} contains invalid whitespace.`,
    );
  }
  return value;
}

function readOptionalString(value: unknown, name: string): string {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || containsControlCharacters(value)) {
    throw new EnvironmentConfigurationError(`${name} must be a valid string.`);
  }
  return value.trim();
}

function validateServiceUrl(
  value: string,
  protocols: string[],
  name: string,
): void {
  try {
    const parsed = new URL(value);
    if (
      !protocols.includes(parsed.protocol) ||
      !parsed.hostname ||
      parsed.pathname === '/'
    ) {
      throw new Error('invalid');
    }
  } catch {
    throw new EnvironmentConfigurationError(
      `${name} must be a valid ${protocols.join(' or ')} connection URL.`,
    );
  }
}

function validateOrigin(
  value: string,
  name: string,
  requireHttps: boolean,
): string {
  try {
    const parsed = new URL(value);
    if (
      containsControlCharacters(value) ||
      !['http:', 'https:'].includes(parsed.protocol) ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash ||
      (requireHttps && parsed.protocol !== 'https:')
    ) {
      throw new Error('invalid');
    }
    return parsed.origin;
  } catch {
    throw new EnvironmentConfigurationError(
      `${name} must be an HTTP or HTTPS origin without credentials, path, query, or fragment${requireHttps ? '; production requires HTTPS' : ''}.`,
    );
  }
}

function readCorsOrigins(
  value: unknown,
  environment: RuntimeEnvironment,
): string[] {
  if ((value === undefined || value === '') && environment === 'test')
    return [];
  if (typeof value !== 'string' || !value.trim()) {
    throw new EnvironmentConfigurationError(
      'CORS_ORIGINS is required as a comma-separated list of allowed origins.',
    );
  }
  const entries = value.split(',').map((origin) => origin.trim());
  if (entries.some((origin) => !origin || origin === '*')) {
    throw new EnvironmentConfigurationError(
      'CORS_ORIGINS must contain explicit origins; wildcard origins are not allowed.',
    );
  }
  const origins = entries.map((origin) =>
    validateOrigin(origin, 'CORS_ORIGINS', environment === 'production'),
  );
  return [...new Set(origins)];
}

function readLogLevel(
  value: unknown,
  environment: RuntimeEnvironment,
): RuntimeLogLevel {
  const level = value === undefined && environment === 'test' ? 'error' : value;
  if (
    typeof level !== 'string' ||
    !RUNTIME_LOG_LEVELS.includes(level as RuntimeLogLevel)
  ) {
    throw new EnvironmentConfigurationError(
      'LOG_LEVEL is required and must be error, warn, log, debug, or verbose.',
    );
  }
  if (
    ['staging', 'production'].includes(environment) &&
    ['debug', 'verbose'].includes(level)
  ) {
    throw new EnvironmentConfigurationError(
      'LOG_LEVEL must be error, warn, or log in staging and production.',
    );
  }
  return level as RuntimeLogLevel;
}

function readRetentionDays(value: unknown): number {
  if (value === undefined || value === '') return 30;
  const days = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    throw new EnvironmentConfigurationError(
      'RETENTION_DAYS must be an integer between 1 and 3650.',
    );
  }
  return days;
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
    CommonModule,
    DatabaseModule,
    CacheModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createBullConnectionConfig(config),
    }),
    AnalyticsModule,
    LinksModule,
    TeamsModule,
    MetricsModule,
  ],
  controllers: [AppController, HealthController, ReadyController],
  providers: [
    AppService,
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
