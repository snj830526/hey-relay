import { createApp } from './app.js';
import { env } from './config/env.js';
import { createRedisClient } from './lib/redis.js';

const redis = createRedisClient(env.redisUrl);
const app = createApp(redis);

app.listen(env.port, () => {
  console.log(`Hey-Relay Server running at http://localhost:${env.port}`);
});
