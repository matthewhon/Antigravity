import { useState, useEffect, useRef } from 'react';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../services/firebase';
import { SmsMessage } from '../types';

// ─── Cache helpers ────────────────────────────────────────────────────────────

const CACHE_VERSION = 'v1';
// Keep cached threads for 7 days to avoid unbounded localStorage growth
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function cacheKey(churchId: string, conversationId: string) {
    return `messages_cache_${CACHE_VERSION}_${churchId}_${conversationId}`;
}

interface CacheEntry {
    savedAt: number;
    messages: SmsMessage[];
}

function readCache(churchId: string, conversationId: string): SmsMessage[] | null {
    try {
        const raw = localStorage.getItem(cacheKey(churchId, conversationId));
        if (!raw) return null;
        const entry: CacheEntry = JSON.parse(raw);
        // Evict stale entries so very old threads don't fill up storage
        if (Date.now() - entry.savedAt > CACHE_TTL_MS) {
            localStorage.removeItem(cacheKey(churchId, conversationId));
            return null;
        }
        return entry.messages;
    } catch {
        return null;
    }
}

function writeCache(churchId: string, conversationId: string, messages: SmsMessage[]) {
    try {
        const entry: CacheEntry = { savedAt: Date.now(), messages };
        localStorage.setItem(cacheKey(churchId, conversationId), JSON.stringify(entry));
    } catch {
        // localStorage may be unavailable (private mode / quota) — fail silently
    }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMessages(churchId: string, conversationId: string) {
    const isReady = !!(churchId && conversationId);

    // Seed from localStorage so the thread renders immediately with no spinner
    const [messages, setMessages] = useState<SmsMessage[]>(() => {
        if (!churchId || !conversationId) return [];
        return readCache(churchId, conversationId) ?? [];
    });

    // Show the spinner only when there is no cached data to show yet
    const [loading, setLoading] = useState<boolean>(() => {
        if (!churchId || !conversationId) return false;
        return readCache(churchId, conversationId) === null;
    });

    // Track the previous key so we can reset state when the conversation changes
    const prevKeyRef = useRef({ churchId, conversationId });

    if (
        churchId !== prevKeyRef.current.churchId ||
        conversationId !== prevKeyRef.current.conversationId
    ) {
        prevKeyRef.current = { churchId, conversationId };
        const cached = churchId && conversationId ? readCache(churchId, conversationId) : null;
        setMessages(cached ?? []);
        setLoading(cached === null);
    }

    useEffect(() => {
        if (!churchId || !conversationId) {
            return;
        }

        // We query the smsMessages subcollection/collection
        const q = query(
            collection(db, 'smsMessages'),
            where('churchId', '==', churchId),
            where('conversationId', '==', conversationId),
            orderBy('createdAt', 'desc'),
            limit(100) // load last 100 messages for mobile perf
        );

        const unsub = onSnapshot(q, snap => {
            // Reverse so oldest is first (newest is at the bottom of the chat)
            const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsMessage)).reverse();
            setMessages(fresh);
            setLoading(false);
            // Persist so next time this thread is opened it renders instantly
            writeCache(churchId, conversationId, fresh);
        });

        return unsub;
    }, [churchId, conversationId]);

    return {
        messages: isReady ? messages : [],
        loading: isReady ? loading : false,
    };
}
