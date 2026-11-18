// Custom server: Next.js + Socket.IO (realtime chat/notifications) + background job worker in one process.
// Run several instances behind a load balancer with REDIS_URL set — the Redis adapter fans events out.
import fs from 'node:fs';
if (fs.existsSync('.env')) process.loadEnvFile('.env');

import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOSTNAME_BIND || '0.0.0.0';

async function main() {
  const app = next({ dev, hostname: 'localhost', port });
  await app.prepare();
  const handle = app.getRequestHandler();
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: process.env.APP_URL || `http://localhost:${port}`, credentials: true },
    maxHttpBufferSize: 64 * 1024,
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60_000 },
  });

  if (process.env.REDIS_URL) {
    const { createAdapter } = await import('@socket.io/redis-adapter');
    const { createRedisConnection } = await import('./src/lib/redis');
    const pub = createRedisConnection()!;
    const sub = pub.duplicate();
    io.adapter(createAdapter(pub, sub));
    console.log('> Socket.IO using Redis adapter');
  }

  const { setIO } = await import('./src/server/realtime');
  const { attachChatServer } = await import('./src/server/socket');
  const { startWorker } = await import('./src/server/jobs');
  setIO(io);
  attachChatServer(io);
  startWorker();

  httpServer.listen(port, hostname, () => console.log(`> Stuffin3D ready on http://localhost:${port} (${dev ? 'dev' : 'production'})`));

  const shutdown = () => {
    io.close();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
