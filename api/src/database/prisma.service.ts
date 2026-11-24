import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export function extractDatabaseName(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) {
      return '';
    }
    return parsed.pathname.replace(/^\/+/, '').replace(/\/+$/, '').split('?')[0];
  } catch {
    return '';
  }
}

export function resolveDatabaseConnectionString(
  configService: ConfigService,
): string {
  const isTest =
    process.env.NODE_ENV === 'test' ||
    process.env.JEST_WORKER_ID !== undefined;

  if (isTest) {
    const testDbUrl =
      configService.get<string>('TEST_DATABASE_URL') ||
      process.env.TEST_DATABASE_URL;

    if (!testDbUrl || !testDbUrl.trim()) {
      throw new Error(
        '[DATABASE SAFETY GUARD] Missing TEST_DATABASE_URL: test execution halted immediately. TEST_DATABASE_URL must be explicitly configured and cannot be derived from DATABASE_URL.',
      );
    }

    const dbName = extractDatabaseName(testDbUrl);
    if (dbName !== 'url_shortener_test') {
      throw new Error(
        `[DATABASE SAFETY GUARD] Refusing to run tests: Target test database must be exactly 'url_shortener_test', but found '${dbName}'. Tests must never run against development or production databases!`,
      );
    }

    return testDbUrl.trim();
  }

  return configService.getOrThrow<string>('DATABASE_URL');
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    const connectionString = resolveDatabaseConnectionString(configService);
    const adapter = new PrismaPg({
      connectionString,
      connectionTimeoutMillis: 2000,
      idleTimeoutMillis: 30000,
      max: 10,
      statement_timeout: 3000,
      query_timeout: 3500,
    });

    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
