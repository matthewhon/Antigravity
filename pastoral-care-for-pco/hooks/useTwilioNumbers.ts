import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db as firebaseDb } from '../services/firebase';
import { TwilioPhoneNumber, User } from '../types';

/**
 * Real-time listener for all phone numbers owned by a church tenant.
 * Returns numbers sorted: default first, then by creation date ascending.
 */
export function useTwilioNumbers(churchId: string) {
    const [numbers, setNumbers] = useState<TwilioPhoneNumber[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(
            collection(firebaseDb, 'smsNumbers'),
            where('churchId', '==', churchId),
            orderBy('createdAt', 'asc')
        );
        const unsub = onSnapshot(q, snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as TwilioPhoneNumber));
            // Default number always comes first
            list.sort((a, b) => {
                if (a.isDefault && !b.isDefault) return -1;
                if (!a.isDefault && b.isDefault) return 1;
                return 0;
            });
            setNumbers(list);
            setLoading(false);
        });
        return unsub;
    }, [churchId]);

    return { numbers, loading };
}

/**
 * Returns true if the given user is allowed to see / use a particular phone number.
 * - Church Admins and System Admins always have access.
 * - An empty allowedUserIds array means visible to everyone.
 * - Otherwise the user must be in the allowedUserIds list.
 */
export function canUserSeeNumber(num: TwilioPhoneNumber, user: User): boolean {
    if (user.roles.includes('Church Admin') || user.roles.includes('System Administration')) return true;
    return num.allowedUserIds.length === 0 || num.allowedUserIds.includes(user.id);
}
