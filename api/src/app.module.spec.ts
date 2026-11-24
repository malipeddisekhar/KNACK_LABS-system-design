import { validateEnvironment } from './app.module';

const validConfig = {
  NODE_ENV: 'development',
  PORT: '3000',
  JWT_SECRET: 'THIS VALUE IS A TEST FIXTURE NOT A CREDENTIAL',
  DATABASE_URL: 'postgresql://user@localhost:5432/url_shortener',
  REDIS_URL: 'redis://localhost:6379',
  PUBLIC_BASE_URL: 'http://localhost:3000',
  CORS_ORIGINS: 'http://localhost:3000,https://admin.example.com',
  LOG_LEVEL: 'debug',
};

describe('validateEnvironment startup requirements', () => {
  it('fails fast when NODE_ENV is missing', () => {
    const config: Record<string, unknown> = { ...validConfig };
    delete config.NODE_ENV;
    expect(() => validateEnvironment(config)).toThrow(
      'NODE_ENV is required; use development, staging, or production.',
    );
  });

  it('rejects an unsupported environment value', () => {
    expect(() =>
      validateEnvironment({ ...validConfig, NODE_ENV: 'prod' }),
    ).toThrow(
      'NODE_ENV must be one of development, staging, production, or test.',
    );
  });

  it('fails fast when a required connection setting is missing', () => {
    const config: Record<string, unknown> = { ...validConfig };
    delete config.DATABASE_URL;
    expect(() => validateEnvironment(config)).toThrow(
      'DATABASE_URL is required.',
    );
  });

  it('rejects wildcard CORS origins', () => {
    expect(() =>
      validateEnvironment({ ...validConfig, CORS_ORIGINS: '*' }),
    ).toThrow(
      'CORS_ORIGINS must contain explicit origins; wildcard origins are not allowed.',
    );
  });

  it('requires explicit public origins and Redis in staging', () => {
    expect(() =>
      validateEnvironment({
        ...validConfig,
        NODE_ENV: 'staging',
        REDIS_URL: '',
      }),
    ).toThrow('REDIS_URL is required in staging and production.');
  });

  it('rejects debug verbosity and insecure public origins in production', () => {
    expect(() =>
      validateEnvironment({ ...validConfig, NODE_ENV: 'production' }),
    ).toThrow(
      'PUBLIC_BASE_URL must be an HTTP or HTTPS origin without credentials, path, query, or fragment; production requires HTTPS.',
    );
    expect(() =>
      validateEnvironment({
        ...validConfig,
        NODE_ENV: 'production',
        PUBLIC_BASE_URL: 'https://api.example.com',
        CORS_ORIGINS: 'https://admin.example.com',
      }),
    ).toThrow(
      'LOG_LEVEL must be error, warn, or log in staging and production.',
    );
  });
});

describe('validateEnvironment JWT_SECRET policy', () => {
  it('rejects a missing JWT_SECRET', () => {
    const config: Record<string, unknown> = { ...validConfig };
    delete config.JWT_SECRET;
    expect(() => validateEnvironment(config)).toThrow(
      'JWT_SECRET is required.',
    );
  });

  it('rejects a weak JWT_SECRET', () => {
    expect(() =>
      validateEnvironment({ ...validConfig, JWT_SECRET: 'short-secret' }),
    ).toThrow('JWT_SECRET must be at least 32 characters long');
  });

  it('accepts a sufficiently strong JWT_SECRET and normalizes CORS origins', () => {
    const validated = validateEnvironment(validConfig);
    expect(validated.JWT_SECRET).toBe(validConfig.JWT_SECRET);
    expect(validated.CORS_ORIGINS).toEqual([
      'http://localhost:3000',
      'https://admin.example.com',
    ]);
  });
});

describe('validateEnvironment PORT policy', () => {
  it('uses port 3000 only in test mode when PORT is omitted', () => {
    const validated = validateEnvironment({
      NODE_ENV: 'test',
      JWT_SECRET: validConfig.JWT_SECRET,
      DATABASE_URL: validConfig.DATABASE_URL,
    });
    expect(validated.PORT).toBe(3000);
  });

  it('accepts a custom integer PORT between 1 and 65535', () => {
    const validated = validateEnvironment({ ...validConfig, PORT: '8080' });
    expect(validated.PORT).toBe(8080);
  });

  it('rejects a missing or out-of-range runtime port', () => {
    expect(() =>
      validateEnvironment({ ...validConfig, PORT: undefined }),
    ).toThrow('PORT is required and must be an integer between 1 and 65535.');
    expect(() =>
      validateEnvironment({ ...validConfig, PORT: '70000' }),
    ).toThrow('PORT is required and must be an integer between 1 and 65535.');
  });
});
