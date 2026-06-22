import { useState, useEffect, useRef } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { SmsConversation } from '../types';

// ─── Cache helpers ────────────────────────────────────────────────────────────

const CACHE_VERSION = 'v1';

function cacheKey(churchId: string, twilioNumberId: string) {
    return `conversations_cache_${CACHE_VERSION}_${churchId}_${twilioNumberId}`;
}

function readCache(churchId: string, twilioNumberId: string): SmsConversation[] | null {
    try {
        const raw = localStorage.getItem(cacheKey(churchId, twilioNumberId));
        if (!raw) return null;
        return JSON.parse(raw) as SmsConversation[];
    } catch {
        return null;
    }
}

function writeCache(churchId: string, twilioNumberId: string, data: SmsConversation[]) {
    try {
        localStorage.setItem(cacheKey(churchId, twilioNumberId), JSON.stringify(data));
    } catch {
        // localStorage may be unavailable (private mode quota, etc.) — fail silently
    }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useConversations(churchId: string, twilioNumberId: string | null) {
    const isReady = !!(churchId && twilioNumberId);

    // Seed from localStorage so the list renders immediately with no spinner
    const [conversations, setConversations] = useState<SmsConversation[]>(() => {
        if (!churchId || !twilioNumberId) return [];
        return readCache(churchId, twilioNumberId) ?? [];
    });

    // Show the spinner only when there is no cached data to show yet
    const [loading, setLoading] = useState<boolean>(() => {
        if (!churchId || !twilioNumberId) return false;
        return readCache(churchId, twilioNumberId) === null;
    });

    // Track the previous key so we can reset state when the number/church changes
    const prevKeyRef = useRef({ churchId, twilioNumberId });

    if (
        churchId !== prevKeyRef.current.churchId ||
        twilioNumberId !== prevKeyRef.current.twilioNumberId
    ) {
        prevKeyRef.current = { churchId, twilioNumberId };
        const cached = churchId && twilioNumberId ? readCache(churchId, twilioNumberId) : null;
        setConversations(cached ?? []);
        setLoading(cached === null);
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
            const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsConversation));
            setConversations(fresh);
            setLoading(false);
            // Persist so next launch is instant
            writeCache(churchId, twilioNumberId, fresh);
        });

        return unsub;
    }, [churchId, twilioNumberId]);

    return {
        conversations: isReady ? conversations : [],
        loading: isReady ? loading : false,
    };
}
