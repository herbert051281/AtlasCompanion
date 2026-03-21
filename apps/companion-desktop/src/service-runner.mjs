import { startService } from '../../companion-service/src/server.ts';

const handle = await startService();
process.stdout.write(`SERVICE_PORT=${handle.port}\n`);

const shutdown = () => {
  handle.server.close(() => process.exit(0));
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
