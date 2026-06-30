import { createApp } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { prisma } from './config/prisma';

const app = createApp();

const server = app.listen(env.port, () => {
  logger.info(`🚀 TAG - MPS API listening on port ${env.port} [${env.nodeEnv}]`);
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
