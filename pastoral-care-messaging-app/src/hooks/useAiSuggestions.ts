import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { SmsAiSuggestion } from '../types';

export function useAiSuggestions(churchId: string, conversationId: string) {
    const [suggestion, setSuggestion] = useState<SmsAiSuggestion | null>(null);

    useEffect(() => {
        if (!churchId || !conversationId) {
            setSuggestion(null);
            return;
        }

        // We query the subcollection: smsConversations/{convId}/aiSuggestions
        const q = query(
            collection(db, `smsConversations/${conversationId}/aiSuggestions`),
            where('status', '==', 'pending'),
            orderBy('createdAt', 'desc')
        );
        
        const unsub = onSnapshot(q, snap => {
            if (!snap.empty) {
                // Get the most recent pending suggestion
                const doc = snap.docs[0];
                setSuggestion({ id: doc.id, ...doc.data() } as SmsAiSuggestion);
            } else {
                setSuggestion(null);
            }
        });
        
        return unsub;
    }, [churchId, conversationId]);
    
    return { suggestion };
}
