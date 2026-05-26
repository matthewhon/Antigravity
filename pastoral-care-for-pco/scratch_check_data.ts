import { getDb } from './backend/firebase.ts';

async function run() {
    try {
        const db = getDb();

        console.log("=== GROUPS ===");
        const groupsSnap = await db.collection('groups').get();
        console.log(`Total groups: ${groupsSnap.size}`);
        groupsSnap.forEach(doc => {
            const data = doc.data();
            console.log(`- ID: ${doc.id}, Name: ${data.name}, MemberCount: ${data.memberIds?.length || 0}`);
            if (data.attendanceHistory && data.attendanceHistory.length > 0) {
                console.log(`  Attendance history sample:`, JSON.stringify(data.attendanceHistory.slice(0, 2)));
            }
        });

        console.log("\n=== ATTENDANCE ===");
        const attendanceSnap = await db.collection('attendance').limit(10).get();
        attendanceSnap.forEach(doc => {
            const data = doc.data();
            console.log(`- ID: ${doc.id}, Date: ${data.date}, Count: ${data.count}, Events:`, JSON.stringify(data.events || []));
        });

        console.log("\n=== DONATIONS SAMPLE ===");
        const donationsSnap = await db.collection('detailed_donations').limit(5).get();
        donationsSnap.forEach(doc => {
            const data = doc.data();
            console.log(`- ID: ${doc.id}, Fund: ${data.fundName}, Amount: ${data.amount}, Date: ${data.date}, Donor: ${data.donorName}`);
        });

    } catch (e) {
        console.error("Error running script:", e);
    }
}
run();
