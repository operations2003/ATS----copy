/**
 * Standalone Background Worker Process for HireIQ ATS
 *
 * Can be deployed as a persistent Render Background Worker service.
 * Command: `npm run worker`
 */

import 'dotenv/config';
import { bulkQueue } from './services/bulkQueueService';
import { bulkUploadService } from './services/bulkUploadService';

console.log('[HireIQ ATS Worker] Initializing standalone background worker...');

// Ensure processor is initialized
bulkUploadService;

bulkQueue.start();

const shutdown = () => {
  console.log('[HireIQ ATS Worker] Gracefully shutting down worker...');
  bulkQueue.stop();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

