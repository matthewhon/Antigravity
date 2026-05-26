import { getDb } from './backend/firebase';
import { createServerLogger } from './services/logService';
import { processExecutiveAiQuery } from './backend/executiveAiAgent';

async function test() {
  const db = getDb();
  const log = createServerLogger(db);
  
  const churchId = 'ch_v0cjkh0z1';
  const personId = '128753163'; // Matthew Hon
  const phoneNumber = '+14693440785';
  const body = 'What is our YTD giving?';
  const listId = '4942298';
  const smsNumberId = 'ch_v0cjkh0z1_aa378651-7370-4572-8ed5-9929e89ed9b2';

  console.log(`Running processExecutiveAiQuery...`);
  await processExecutiveAiQuery(
    db,
    log,
    churchId,
    personId,
    phoneNumber,
    body,
    listId,
    smsNumberId
  );
  console.log(`Finished processExecutiveAiQuery.`);
}

test().catch(console.error);
