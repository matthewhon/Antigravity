import { getDb } from './firebase.ts'; 
async function run() { 
  try { 
    const db = getDb(); 
    const docs = await db.collection('pco_detailed_donations').limit(5).get(); 
    docs.forEach(d => console.log(d.data())); 
  } catch (e) { 
    console.error(e); 
  } 
} 
run();
