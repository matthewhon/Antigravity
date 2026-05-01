import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../services/firebase';
import { SmsMessage } from '../types';

export function useMessages(churchId: string, conversationId: string) {
    const [messages, setMessages] = useState<SmsMessage[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!churchId || !conversationId) {
            setMessages([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        // We order by createdAt desc to easily get the latest, then reverse in UI or flex-col-reverse
        const q = query(
            collection(db, 'smsMessages'),
            where('churchId', '==', churchId),
            where('conversationId', '==', conversationId),
            orderBy('createdAt', 'desc'),
            limit(100) // load last 100 messages for mobile perf
        );
        
        const unsub = onSnapshot(q, snap => {
            const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsMessage));
            // Reverse so oldest is first
            setMessages(msgs.reverse());
            setLoading(false);
        });
        
        return unsub;
    }, [churchId, conversationId]);
    
    return { messages, loading };
}
