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

        // The backend writes the number ID under two field aliases:
        //   - 'twilioNumberId' (canonical in legacy + SignalWire tenants)
        //   - 'smsNumberId' (canonical field name going forward)
        // Both always hold the same value (the smsNumbers doc ID).
        // We run both queries in parallel and merge so conversations are
        // never missing regardless of which field was written.
        const qByTwilio = query(
            collection(db, 'smsConversations'),
            where('churchId', '==', churchId),
            where('twilioNumberId', '==', twilioNumberId),
            orderBy('lastMessageAt', 'desc')
        );
        const qBySms = query(
            collection(db, 'smsConversations'),
            where('churchId', '==', churchId),
            where('smsNumberId', '==', twilioNumberId),
            orderBy('lastMessageAt', 'desc')
        );

        // Merge both snapshots, deduplicate by doc ID, keep sorted newest-first
        const merge = (a: SmsConversation[], b: SmsConversation[]) => {
            const map = new Map<string, SmsConversation>();
            [...a, ...b].forEach(c => map.set(c.id, c));
            return Array.from(map.values()).sort((x, y) =>
                (y.lastMessageAt ?? 0) - (x.lastMessageAt ?? 0)
            );
        };

        let snapA: SmsConversation[] = [];
        let snapB: SmsConversation[] = [];

        const unsubA = onSnapshot(qByTwilio, snap => {
            snapA = snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsConversation));
            const fresh = merge(snapA, snapB);
            setConversations(fresh);
            setLoading(false);
            writeCache(churchId, twilioNumberId, fresh);
        });

        const unsubB = onSnapshot(qBySms, snap => {
            snapB = snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsConversation));
            const fresh = merge(snapA, snapB);
            setConversations(fresh);
            setLoading(false);
            writeCache(churchId, twilioNumberId, fresh);
        });

        return () => { unsubA(); unsubB(); };
    }, [churchId, twilioNumberId]);

    return {
        conversations: isReady ? conversations : [],
        loading: isReady ? loading : false,
    };
}
