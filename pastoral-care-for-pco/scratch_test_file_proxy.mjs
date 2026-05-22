import { getDb, getStorage } from './backend/firebase.ts';

async function main() {
  console.log('Initializing database and storage from backend/firebase.ts...');
  const db = getDb();
  const storage = getStorage();
  
  try {
    console.log('Testing storage.bucket()...');
    const bucket = storage.bucket();
    console.log('Bucket name successfully fetched:', bucket.name);
  } catch (err) {
    console.error('CRITICAL ERROR on storage.bucket():', err);
  }

  // Let's also check if we query the last tenantFiles document to test with a real gcsPath
  try {
    const snap = await db.collection('tenantFiles').limit(1).get();
    if (snap.empty) {
      console.log('No tenantFiles found in Firestore.');
    } else {
      const fileData = snap.docs[0].data();
      console.log('Found file document:', snap.docs[0].id, fileData);
      
      const gcsPath = fileData.gcsPath;
      console.log('Testing signed URL for path:', gcsPath);
      
      try {
        const bucket = storage.bucket();
        const fileRef = bucket.file(gcsPath);
        const [url] = await fileRef.getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + 15 * 60 * 1000,
          responseDisposition: `inline; filename="${fileData.originalName}"`,
          responseType: fileData.mimeType || 'application/octet-stream',
        });
        console.log('Generated Signed URL successfully:', url);
      } catch (err) {
        console.error('Error during getSignedUrl:', err);
      }
    }
  } catch (err) {
    console.error('Error fetching tenantFiles:', err);
  }
  
  process.exit(0);
}

main();
