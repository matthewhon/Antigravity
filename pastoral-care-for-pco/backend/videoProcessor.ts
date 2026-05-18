import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getDb, getStorage } from './firebase.js';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export async function processVideoJob(job: any) {
  const { fileId, churchId, gcsPath } = job.data;
  console.log(`Starting video compression for job ${job.id}, file ${fileId}`);

  const db = getDb();
  const storage = getStorage();
  const bucketName = 'pastoral-care-for-pco.firebasestorage.app';
  const bucket = storage.bucket(bucketName);

  const tempInputPath = path.join(os.tmpdir(), `${fileId}_input.mp4`);
  const tempOutputPath = path.join(os.tmpdir(), `${fileId}_output.mp4`);

  try {
    // 1. Download file from GCS
    console.log(`Downloading ${gcsPath} to ${tempInputPath}`);
    await bucket.file(gcsPath).download({ destination: tempInputPath });

    // 2. Process using fluent-ffmpeg
    console.log(`Compressing video...`);
    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempInputPath)
        .outputOptions([
          '-vf scale=\\'trunc(oh*a/2)*2:min(480,ih)\\'', // scale height to 480p max, keeping aspect ratio
          '-c:v libx264',
          '-crf 28', // Good balance between quality and size
          '-preset veryfast',
          '-c:a aac',
          '-b:a 128k',
          '-movflags +faststart'
        ])
        .save(tempOutputPath)
        .on('end', () => {
          console.log(`FFmpeg processing finished`);
          resolve();
        })
        .on('error', (err) => {
          console.error(`FFmpeg error:`, err);
          reject(err);
        });
    });

    // 3. Upload the compressed video back to GCS
    console.log(`Uploading compressed video to ${gcsPath}`);
    await bucket.upload(tempOutputPath, {
      destination: gcsPath,
      metadata: {
        contentType: 'video/mp4'
      }
    });

    // Get the new public URL and size
    const file = bucket.file(gcsPath);
    await file.makePublic(); // Depending on your bucket's public access settings, this might be needed or not. The frontend uses getDownloadURL which is slightly different but publicUrl can just use the public link. 
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${encodeURIComponent(gcsPath)}`;
    const [metadata] = await file.getMetadata();

    // 4. Update Firestore
    console.log(`Updating Firestore document ${fileId}`);
    await db.collection('tenantFiles').doc(fileId).update({
      sizeBytes: parseInt(metadata.size as string, 10),
      publicUrl: publicUrl,
      processingStatus: 'completed'
    });

    console.log(`Video compression completed for ${fileId}`);
  } catch (error) {
    console.error(`Video compression failed for ${fileId}:`, error);
    await db.collection('tenantFiles').doc(fileId).update({
      processingStatus: 'failed'
    });
    throw error; // Re-throw to fail the BullMQ job
  } finally {
    // Clean up temporary files
    if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
    if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
  }
}
