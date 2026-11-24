import type { ConnectionOptions } from 'bullmq';

const hasRedis = Boolean(process.env.REDIS_HOST);

function createQueueWrapper(name: string, inProcessHandler?: (data: any) => Promise<void>) {
  if (hasRedis) {
    // Lazy-require bullmq only when Redis is explicitly configured
    const { Queue, Worker } = require('bullmq');
    const connection: ConnectionOptions = {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    };
    const queue = new Queue(name, { connection });
    if (inProcessHandler) {
      new Worker(name, inProcessHandler, { connection });
    }
    return queue;
  }

  return {
    async add(_jobName: string, data: any) {
      if (inProcessHandler) {
        await inProcessHandler({ data });
      } else {
        console.warn(`[JobQueue] Redis not configured; skipping "${name}" job.`);
      }
    },
  };
}

export const pastoralJourneyQueue = createQueueWrapper('pastoral-journeys');

export const videoProcessingQueue = createQueueWrapper('video-processing', async (job: any) => {
  const { processVideoJob } = await import('../backend/videoProcessor.js');
  await processVideoJob(job);
});
