import { createBullConnectionConfig } from './bull-config.js';

describe('BullMQ connection timeout bounds', () => {
  it('uses the aggressive two-second connect bound for the local fallback', () => {
    const config = createBullConnectionConfig({ get: () => undefined } as any);
    expect(config.connection).toMatchObject({
      host: '127.0.0.1',
      port: 6379,
      connectTimeout: 2000,
      maxRetriesPerRequest: null,
    });
  });

  it('uses the same bound for a configured Redis endpoint', () => {
    const config = createBullConnectionConfig({
      get: () => 'rediss://redis.example.invalid:6380',
    } as any);
    expect(config.connection).toMatchObject({
      host: 'redis.example.invalid',
      port: 6380,
      connectTimeout: 2000,
      lazyConnect: true,
    });
  });
});
