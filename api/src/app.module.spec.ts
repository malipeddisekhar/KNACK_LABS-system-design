import { validateEnvironment } from './app.module';

const validConfig = {
  PORT: '3000',
  JWT_SECRET: 'A9!strong-development-secret-value-32',
};

describe('validateEnvironment JWT_SECRET policy', () => {
  it('rejects a missing JWT_SECRET', () => {
    expect(() => validateEnvironment({ PORT: '3000' })).toThrow(
      'JWT_SECRET must be at least 32 characters long',
    );
  });

  it('rejects a weak JWT_SECRET', () => {
    expect(() =>
      validateEnvironment({ ...validConfig, JWT_SECRET: 'short-secret' }),
    ).toThrow('JWT_SECRET must be at least 32 characters long');
  });

  it('accepts a sufficiently strong JWT_SECRET', () => {
    expect(validateEnvironment(validConfig).JWT_SECRET).toBe(
      validConfig.JWT_SECRET,
    );
  });
});

describe('validateEnvironment PORT policy', () => {
  it('defaults to port 3000 when PORT is omitted', () => {
    const validated = validateEnvironment({
      JWT_SECRET: 'A9!strong-development-secret-value-32',
    });
    expect(validated.PORT).toBe(3000);
  });

  it('accepts a custom integer PORT between 1 and 65535', () => {
    const validated = validateEnvironment({
      PORT: '8080',
      JWT_SECRET: 'A9!strong-development-secret-value-32',
    });
    expect(validated.PORT).toBe(8080);
  });

  it('rejects an out-of-range port', () => {
    expect(() =>
      validateEnvironment({
        PORT: '70000',
        JWT_SECRET: 'A9!strong-development-secret-value-32',
      }),
    ).toThrow('PORT must be set to an integer between 1 and 65535.');
  });
});