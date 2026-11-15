import 'dotenv/config';
import { defineConfig } from 'prisma/config';

function extractDatabaseName(urlStr: string): string {
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

const testDbUrl = process.env.TEST_DATABASE_URL?.trim() || '';
if (!testDbUrl) {
  throw new Error(
    '[DATABASE SAFETY GUARD] Missing TEST_DATABASE_URL: cannot run migrations without TEST_DATABASE_URL explicitly set.',
  );
}

const dbName = extractDatabaseName(testDbUrl);
if (dbName !== 'url_shortener_test') {
  throw new Error(
    `[DATABASE SAFETY GUARD] Refusing to run migrations: Target test database must be exactly 'url_shortener_test', but found '${dbName}'.`,
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: testDbUrl,
  },
});
