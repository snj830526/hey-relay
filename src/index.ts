import { createApp } from './app.js';
import { env } from './config/env.js';
import { createRedisClient } from './lib/redis.js';
import { RelayStore } from './store/relayStore.js';
import { seedProtocols } from './lib/seedProtocols.js';

const redis = createRedisClient(env.redisUrl);
const app = createApp(redis);

app.listen(env.port, async () => {
  console.log(`Hey-Relay Server running at http://localhost:${env.port}`);
  await seedProtocols(new RelayStore(redis));
});
