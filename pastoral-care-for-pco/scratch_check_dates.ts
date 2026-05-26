import { getDb } from './backend/firebase.ts';

async function run() {
    try {
        const db = getDb();

        console.log("=== ATTENDANCE DATE RANGES BY CHURCH ===");
        const attendanceSnap = await db.collection('attendance').get();
        const attStats: Record<string, { count: number, minDate: string, maxDate: string, eventNames: Set<string> }> = {};
        
        attendanceSnap.forEach(doc => {
            const data = doc.data();
            const churchId = data.churchId || 'unknown';
            const date = data.date || '';
            const events = data.events || [];
            
            if (!attStats[churchId]) {
                attStats[churchId] = { count: 0, minDate: date, maxDate: date, eventNames: new Set() };
            }
            const s = attStats[churchId];
            s.count++;
            if (date < s.minDate) s.minDate = date;
            if (date > s.maxDate) s.maxDate = date;
            events.forEach((ev: any) => {
                if (ev.name) s.eventNames.add(ev.name);
            });
        });

        Object.entries(attStats).forEach(([churchId, stats]) => {
            console.log(`ChurchId: ${churchId}`);
            console.log(`- Count: ${stats.count} daily records`);
            console.log(`- Date Range: ${stats.minDate} to ${stats.maxDate}`);
            console.log(`- Event Names:`, Array.from(stats.eventNames).join(', '));
        });

        console.log("\n=== DONATION DATE RANGES BY CHURCH ===");
        const donationsSnap = await db.collection('detailed_donations').get();
        const donStats: Record<string, { count: number, minDate: string, maxDate: string }> = {};

        donationsSnap.forEach(doc => {
            const data = doc.data();
            const churchId = data.churchId || 'unknown';
            const date = data.date ? data.date.substring(0, 10) : '';

            if (!donStats[churchId]) {
                donStats[churchId] = { count: 0, minDate: date, maxDate: date };
            }
            const s = donStats[churchId];
            s.count++;
            if (date < s.minDate) s.minDate = date;
            if (date > s.maxDate) s.maxDate = date;
        });

        Object.entries(donStats).forEach(([churchId, stats]) => {
            console.log(`ChurchId: ${churchId}`);
            console.log(`- Count: ${stats.count} donations`);
            console.log(`- Date Range: ${stats.minDate} to ${stats.maxDate}`);
        });

    } catch (e) {
        console.error("Error:", e);
    }
}
run();
