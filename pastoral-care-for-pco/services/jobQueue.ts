import { Queue, Worker, ConnectionOptions } from 'bullmq';

const connection: ConnectionOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

export const pastoralJourneyQueue = new Queue('pastoral-journeys', { connection });

export const pastoralJourneyWorker = new Worker('pastoral-journeys', async (job) => {
  console.log(`Processing job ${job.id}:`, job.data);
  // Logic for multi-step emails/SMS and snoozing
}, { connection });
