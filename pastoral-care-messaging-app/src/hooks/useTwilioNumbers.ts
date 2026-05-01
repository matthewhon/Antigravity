import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { TwilioPhoneNumber, User } from '../types';

export function useTwilioNumbers(churchId: string) {
    const [numbers, setNumbers] = useState<TwilioPhoneNumber[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!churchId) {
            setLoading(false);
            return;
        }

        const q = query(
            collection(db, 'twilioNumbers'),
            where('churchId', '==', churchId),
            orderBy('isDefault', 'desc'),
            orderBy('createdAt', 'asc')
        );
        
        const unsub = onSnapshot(q, snap => {
            setNumbers(snap.docs.map(d => ({ id: d.id, ...d.data() } as TwilioPhoneNumber)));
            setLoading(false);
        });
        
        return unsub;
    }, [churchId]);
    
    return { numbers, loading };
}

export function canUserSeeNumber(num: TwilioPhoneNumber, user: User): boolean {
    if (user.roles.includes('Church Admin') || user.roles.includes('System Administration')) return true;
    return num.allowedUserIds.length === 0 || num.allowedUserIds.includes(user.id);
}
