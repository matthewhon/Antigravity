/**
 * Backfill script: create pastoral_notes Firestore docs for all completed
 * outreach slots that don't already have one.
 *
 * Run once from the project root:
 *   node scripts/backfill-outreach-notes.mjs
 */

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// ── Init Firebase Admin ────────────────────────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'pastoral-care-for-pco',
  });
}

// Named Firestore database (the default database does not exist for this project)
const db = getFirestore(admin.app(), 'pcforpco');

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('Fetching completed outreach slots...');

  const slotsSnap = await db.collection('outreach_slots')
    .where('status', 'in', ['contacted', 'no-answer'])
    .get();

  if (slotsSnap.empty) {
    console.log('No completed slots found. Nothing to backfill.');
    return;
  }

  console.log(`Found ${slotsSnap.size} completed slots. Checking for missing pastoral_notes...`);

  // Cache sessions to avoid repeated reads
  const sessionCache = new Map();
  async function getSession(sessionId) {
    if (sessionCache.has(sessionId)) return sessionCache.get(sessionId);
    const snap = await db.collection('outreach_sessions').doc(sessionId).get();
    const data = snap.exists ? snap.data() : null;
    sessionCache.set(sessionId, data);
    return data;
  }

  // Check which noteIds already exist
  const noteIds = slotsSnap.docs.map(d => `outreach_${d.id}`);
  const existingSet = new Set();
  const CHECK_CHUNK = 30;
  for (let i = 0; i < noteIds.length; i += CHECK_CHUNK) {
    const chunk = noteIds.slice(i, i + CHECK_CHUNK);
    const refs = chunk.map(id => db.collection('pastoral_notes').doc(id));
    const snaps = await db.getAll(...refs);
    snaps.forEach(s => { if (s.exists) existingSet.add(s.id); });
  }

  console.log(`  ${existingSet.size} already exist, ${noteIds.length - existingSet.size} to create.`);

  let created = 0;
  let skipped = 0;
  const BATCH_LIMIT = 400;
  let batch = db.batch();
  let batchCount = 0;

  for (const slotDoc of slotsSnap.docs) {
    const slot = slotDoc.data();
    const noteId = `outreach_${slotDoc.id}`;

    if (existingSet.has(noteId)) { skipped++; continue; }

    const session = await getSession(slot.sessionId);
    if (!session) { skipped++; continue; }

    const churchId    = session.churchId;
    const sessionName = session.name || 'Outreach Session';
    const outcome     = slot.status;
    const outcomeEmoji = outcome === 'contacted' ? '✅' : '📵';
    const outcomeLabel = outcome === 'contacted' ? 'Reached' : 'No Answer';

    const completedAt = slot.completedAt ?? slot.assignedAt ?? Date.now();
    const dateStr = new Date(completedAt).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
    const todayIso = new Date(completedAt).toISOString().split('T')[0];

    const noteLines = [
      `${outcomeEmoji} Pastoral Outreach — ${outcomeLabel}`,
      `Session: ${sessionName}`,
      ...(slot.volunteerName ? [`Contacted by: ${slot.volunteerName}`] : []),
      `Date: ${dateStr}`,
      ...(slot.notes?.trim() ? ['', '---', slot.notes.trim()] : []),
    ];

    const ref = db.collection('pastoral_notes').doc(noteId);
    batch.set(ref, {
      id:          noteId,
      churchId,
      personId:    slot.assignedPersonId,
      personName:  slot.assignedPersonName || 'Unknown',
      authorId:    'outreach_system',
      authorName:  slot.volunteerName || 'Outreach Volunteer',
      date:        todayIso,
      type:        'Call',
      content:     noteLines.join('\n'),
      isCompleted: true,
      tags:        ['outreach', outcome === 'contacted' ? 'reached' : 'no-answer'],
    }, { merge: true });

    created++;
    batchCount++;

    if (batchCount >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
      console.log(`  Committed batch — ${created} notes written so far...`);
    }
  }

  if (batchCount > 0) await batch.commit();

  console.log(`\n✅ Done! Created ${created} pastoral_notes, skipped ${skipped} (already existed).`);
}

main().catch(e => { console.error(e); process.exit(1); });
