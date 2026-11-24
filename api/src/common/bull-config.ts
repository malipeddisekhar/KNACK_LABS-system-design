import { ConfigService } from '@nestjs/config';

export function createBullConnectionConfig(config: ConfigService) {
  const redisUrl = config.get<string>('REDIS_URL')?.trim();
  if (!redisUrl) {
    return {
      connection: {
        host: '127.0.0.1',
        port: 6379,
        maxRetriesPerRequest: null,
        connectTimeout: 2000,
      },
    };
  }
  try {
    const url = new URL(redisUrl);
    return {
      connection: {
        host: url.hostname,
        port: Number(url.port) || 6379,
        password: url.password ? decodeURIComponent(url.password) : undefined,
        tls: url.protocol === 'rediss:' ? {} : undefined,
        maxRetriesPerRequest: null,
        connectTimeout: 2000,
        lazyConnect: true,
      },
    };
  } catch {
    return {
      connection: {
        host: '127.0.0.1',
        port: 6379,
        maxRetriesPerRequest: null,
      },
    };
  }
}
