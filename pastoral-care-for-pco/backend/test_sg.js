import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fetch from 'node-fetch';

const serviceAccount = require('./serviceAccountKey.json'); // wait, I don't have this.
