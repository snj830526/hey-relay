import { Redis } from 'ioredis';

export function createRedisClient(redisUrl: string) {
  const redis = new Redis(redisUrl, {
    retryStrategy: (times) => Math.min(times * 200, 3000),
    lazyConnect: false,
    connectTimeout: 5000,
    commandTimeout: 5000,
  });

  redis.on('error', (err) => {
    console.error('[Redis] connection error:', err.message);
  });

  redis.on('reconnecting', () => {
    console.log('[Redis] reconnecting...');
  });

  return redis;
}
