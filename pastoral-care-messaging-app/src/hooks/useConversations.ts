import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { SmsConversation } from '../types';

export function useConversations(churchId: string, twilioNumberId: string | null) {
    const [conversations, setConversations] = useState<SmsConversation[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!churchId || !twilioNumberId) {
            setConversations([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        const q = query(
            collection(db, 'smsConversations'),
            where('churchId', '==', churchId),
            where('twilioNumberId', '==', twilioNumberId),
            orderBy('updatedAt', 'desc')
        );
        
        const unsub = onSnapshot(q, snap => {
            setConversations(snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsConversation)));
            setLoading(false);
        });
        
        return unsub;
    }, [churchId, twilioNumberId]);
    
    return { conversations, loading };
}
