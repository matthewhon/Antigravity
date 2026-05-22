import { getDb, getStorage } from './firebase.js';

export const handleFileProxy = async (req: any, res: any) => {
  const { fileId } = req.params;
  
  if (!fileId) {
    return res.status(400).send('Missing file ID');
  }

  try {
    const db = getDb();
    const fileDoc = await db.collection('tenantFiles').doc(fileId).get();
    
    if (!fileDoc.exists) {
      return res.status(404).send('File not found');
    }

    const fileData = fileDoc.data()!;
    const { churchId, gcsPath, sizeBytes, originalName, mimeType } = fileData;

    // Track Egress (Bandwidth Usage)
    const today = new Date().toISOString().split('T')[0];
    const usageId = `${churchId}_${today}`;
    
    const usageRef = db.collection('billingUsage').doc(usageId);
    const usageDoc = await usageRef.get();
    
    if (usageDoc.exists) {
      // Import FieldValue dynamically from firebase-admin to avoid top-level issues if needed, or just use getDb().
      // Wait, we can just do a transaction or direct update with increment.
      const admin = await import('firebase-admin');
      await usageRef.update({
        egressBytes: admin.default.firestore.FieldValue.increment(sizeBytes || 0)
      });
    } else {
      await usageRef.set({
        id: usageId,
        churchId,
        date: today,
        storageBytes: 0,
        egressBytes: sizeBytes || 0
      });
    }

    // Proxy the file using Signed URL or stream directly.
    // Given the requirement for "signed-URL generation for secure, efficient large file uploads and public access",
    // we attempt to generate a short-lived signed URL and redirect the user.
    // If that fails (e.g. IAM permission issue for signing on the service account), we fall back to streaming.
    const storage = getStorage();
    // gcsPath from client is typically: tenants/{churchId}/uploads/{fileId}_{originalName}
    // But getStorage().bucket().file(gcsPath) works because firebase client uses default bucket.
    const fileRef = storage.bucket().file(gcsPath);
    
    try {
      const [url] = await fileRef.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        responseDisposition: `inline; filename="${originalName}"`,
        responseType: mimeType || 'application/octet-stream',
      });

      // Redirect user to the GCS signed URL to download/stream the file directly from Google.
      res.redirect(302, url);
    } catch (signErr) {
      console.warn('[FileProxy] getSignedUrl failed, falling back to streaming:', signErr);
      res.setHeader('Content-Type', mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${originalName}"`);
      if (sizeBytes) {
        res.setHeader('Content-Length', String(sizeBytes));
      }
      fileRef.createReadStream()
        .on('error', (streamErr: any) => {
          console.error('[FileProxy] Stream error:', streamErr);
          if (!res.headersSent) {
            res.status(500).send('Error streaming file');
          }
        })
        .pipe(res);
    }

  } catch (e: any) {
    console.error('[FileProxy] Error:', e);
    res.status(500).send('Internal Server Error');
  }
};
