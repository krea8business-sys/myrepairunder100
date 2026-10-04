import http from 'node:http';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { initRealtime } from './realtime/io.js';
import { startJobs } from './jobs/index.js';
import { logger } from './lib/logger.js';
import { pool } from './db/client.js';

const app = createApp();
const server = http.createServer(app);
initRealtime(server, env.CORS_ORIGINS.split(',').map((s) => s.trim()));
if (env.RUN_JOBS) startJobs();

server.listen(env.PORT, () => logger.info(`MyRepairUnder100 API listening on :${env.PORT} (${env.NODE_ENV})`));

const shutdown = (sig: string) => {
  logger.info(`${sig} received, shutting down`);
  server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
