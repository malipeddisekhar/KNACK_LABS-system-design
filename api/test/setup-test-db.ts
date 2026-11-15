import fs from 'node:fs';
import path from 'node:path';

process.env.NODE_ENV = 'test';

/**
 * Extracts the database name from a PostgreSQL connection URL.
 * Strictly verifies the URL protocol is postgresql: or postgres:.
 * Example: 'postgresql://user:pass@localhost:5432/url_shortener_test?schema=public' -> 'url_shortener_test'
 */
export function extractDatabaseName(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    if (!['postgresql:', 'postgres:'].includes(url.protocol)) {
      return '';
    }
    return url.pathname.replace(/^\/+/, '').replace(/\/+$/, '').split('?')[0];
  } catch {
    return '';
  }
}

/**
 * Reads explicitly configured TEST_DATABASE_URL from process.env or api/.env.
 * NEVER reads, copies, derives from, or falls back to development DATABASE_URL.
 */
function getExplicitTestDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL?.trim()) {
    return process.env.TEST_DATABASE_URL.trim();
  }

  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith('TEST_DATABASE_URL=')) {
        let val = trimmed.substring('TEST_DATABASE_URL='.length).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        return val.trim();
      }
    }
  }

  return '';
}

// 1. Explicitly configured TEST_DATABASE_URL.
const testDbUrl = getExplicitTestDatabaseUrl();

// 2. Requirement 3: Missing TEST_DATABASE_URL must stop test execution immediately.
// Requirement 2: It must NEVER be derived from, copied from, or fall back to development DATABASE_URL.
if (!testDbUrl) {
  throw new Error(
    '[DATABASE SAFETY GUARD] Missing TEST_DATABASE_URL: test execution halted immediately. TEST_DATABASE_URL must be explicitly configured and cannot be derived from DATABASE_URL.',
  );
}

// 3. Requirement 1: Must target only 'url_shortener_test'
const targetDbName = extractDatabaseName(testDbUrl);
if (targetDbName !== 'url_shortener_test') {
  throw new Error(
    `[DATABASE SAFETY GUARD] Refusing to run tests: Target test database must be exactly 'url_shortener_test', but found '${targetDbName}'. Tests must never run against development or production databases!`,
  );
}

// 4. Ensure environment variables in the test runner process target url_shortener_test
process.env.TEST_DATABASE_URL = testDbUrl;
process.env.DATABASE_URL = testDbUrl;
