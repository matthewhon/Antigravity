import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'pastoral-care-for-pco',
  });
}

async function run() {
  try {
    const cred = admin.app().options.credential;
    console.log('Credential object:', cred);
    if (cred && typeof cred.getAccessToken === 'function') {
      const tokenObj = await cred.getAccessToken();
      console.log('Access token obtained successfully!');
      console.log('Token object keys:', Object.keys(tokenObj));
      console.log('Expires in:', tokenObj.expires_in);
    } else {
      console.log('Credential object does not have getAccessToken or is undefined.');
    }
  } catch (e) {
    console.error('Error fetching token:', e);
  }
}

run();
