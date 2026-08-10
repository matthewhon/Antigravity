import { DateTime } from 'luxon';

function getNextDayOfWeek(date: DateTime, dayOfWeek: number) {
    let result = date;
    while (result.weekday % 7 !== dayOfWeek % 7) {
        result = result.plus({ days: 1 });
    }
    return result;
}

function calcNextSendAt(step: any, now: number): number {
    if (step.scheduleType === 'day_of_week') {
        const delayDays = Number(step.delayDays) || 0;
        const targetDay = Number(step.scheduleDayOfWeek) || 0; // 0=Sunday
        const [hh, mm]  = (step.scheduleTime || '09:00').split(':').map(Number);

        const base = DateTime.fromMillis(now).setZone('America/Chicago');
        const afterDelay = base.plus({ days: delayDays });

        let target = afterDelay.set({ hour: hh, minute: mm, second: 0, millisecond: 0 });
        if (target.weekday % 7 !== targetDay || target.toMillis() <= afterDelay.toMillis()) {
            target = getNextDayOfWeek(afterDelay, targetDay).set({ hour: hh, minute: mm, second: 0, millisecond: 0 });
        }

        return target.toMillis();
    }
    return now;
}

const step = {
    scheduleTime: "09:15",
    order: 5,
    delayDays: 1,
    delayHours: 0,
    id: "bw313efu2aw4i6sr",
    scheduleType: "day_of_week",
    scheduleDayOfWeek: 5,
    channelType: "staff_sms"
};

const now = 1784980505954; // 11:55:05 UTC (the lastStepSentAt)
console.log("Result:", calcNextSendAt(step, now));
