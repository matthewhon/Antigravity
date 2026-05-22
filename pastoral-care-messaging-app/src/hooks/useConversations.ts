import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { SmsConversation } from '../types';

export function useConversations(churchId: string, twilioNumberId: string | null) {
    const [conversations, setConversations] = useState<SmsConversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [prevKeys, setPrevKeys] = useState({ churchId, twilioNumberId });

    if (churchId !== prevKeys.churchId || twilioNumberId !== prevKeys.twilioNumberId) {
        setPrevKeys({ churchId, twilioNumberId });
        setConversations([]);
        setLoading(true);
    }

    useEffect(() => {
        if (!churchId || !twilioNumberId) {
            return;
        }

        const q = query(
            collection(db, 'smsConversations'),
            where('churchId', '==', churchId),
            where('twilioNumberId', '==', twilioNumberId),
            orderBy('lastMessageAt', 'desc')
        );
        
        const unsub = onSnapshot(q, snap => {
            setConversations(snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsConversation)));
            setLoading(false);
        });
        
        return unsub;
    }, [churchId, twilioNumberId]);
    
    const isReady = !!(churchId && twilioNumberId);
    return { 
        conversations: isReady ? conversations : [], 
        loading: isReady ? loading : false 
    };
}
