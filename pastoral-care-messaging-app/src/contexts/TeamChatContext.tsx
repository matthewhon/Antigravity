/**
 * TeamChatContext (mobile)
 *
 * Mobile port of pastoral-care-for-pco/contexts/TeamChatContext.tsx.
 * Channel visibility rules MUST stay identical to the web app.
 * Leaves out the web-only "Discuss widget in chat" plumbing, which needs the
 * full analytics data set that the phone app does not load.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Church, PcoPerson, TeamChannel, TeamChatArea, User } from '../types';
import { firestore } from '../services/firestoreService';
import { canReadArea, hasTeamChatAccess } from '../services/chatPermissions';
import {
    activeTeamChat, ensureDefaultTeamChannels, findOrCreateDirectChannel, saveTeamChannel, subscribeToTeamChannels,
} from '../services/teamChatService';

interface TeamChatContextValue {
    enabled: boolean;
    currentUser: User;
    church: Church;
    people: PcoPerson[];
    channels: TeamChannel[];
    churchUsers: User[];
    loading: boolean;
    totalUnreadCount: number;
    isChannelUnread: (channel: TeamChannel) => boolean;
    getChannelDisplayName: (channel: TeamChannel) => string;
    getChannelParticipants: (channel: TeamChannel) => User[];
    startDirectMessage: (targetUsers: User[]) => Promise<TeamChannel | null>;
    createCustomChannel: (params: {
        name: string;
        description?: string;
        icon?: string;
        requiredArea?: TeamChatArea;
        participantIds?: string[];
        isAutoJoinedByRole?: boolean;
    }) => Promise<TeamChannel | null>;
    /** Channel currently on screen (used to suppress foreground toasts) */
    viewingChannelId: string | null;
    setViewingChannelId: (id: string | null) => void;
}

const TeamChatContext = createContext<TeamChatContextValue | undefined>(undefined);

export const TeamChatProvider: React.FC<{
    currentUser: User;
    church: Church;
    people: PcoPerson[];
    children: React.ReactNode;
}> = ({ currentUser, church, people, children }) => {
    const enabled = hasTeamChatAccess(currentUser, church);
    const [rawChannels, setRawChannels] = useState<TeamChannel[]>([]);
    const [churchUsers, setChurchUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewingChannelId, setViewingChannelId] = useState<string | null>(null);

    useEffect(() => { activeTeamChat.channelId = viewingChannelId; }, [viewingChannelId]);

    useEffect(() => {
        if (!enabled || !church?.id || !currentUser?.id) {
            setRawChannels([]);
            setChurchUsers([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        ensureDefaultTeamChannels(church.id);
        firestore.getUsersByChurch(church.id).then(setChurchUsers).catch(() => {});
        const unsub = subscribeToTeamChannels(church.id, loaded => {
            setRawChannels(loaded);
            setLoading(false);
        });
        return () => unsub();
    }, [enabled, church?.id, currentUser?.id]);

    // Same visibility rules as the web TeamChatContext
    const channels = useMemo(() => rawChannels.filter(ch => {
        if (ch.requiredArea && !canReadArea(currentUser, ch.requiredArea)) return false;
        if (ch.type === 'direct') return (ch.participantIds || []).includes(currentUser.id);
        if (ch.isAutoJoinedByRole) return true;
        return (ch.participantIds || []).includes(currentUser.id)
            || ch.createdBy === currentUser.id
            || (ch.participantIds || []).length === 0;
    }), [rawChannels, currentUser]);

    const isChannelUnread = useCallback((ch: TeamChannel) => {
        if (!ch.lastMessageAt || ch.lastMessageSenderId === currentUser.id) return false;
        if (!ch.lastMessageSenderId) return false; // freshly created, no messages yet
        return ch.lastMessageAt > (ch.lastReadAt?.[currentUser.id] || 0);
    }, [currentUser.id]);

    const totalUnreadCount = useMemo(() => channels.filter(isChannelUnread).length, [channels, isChannelUnread]);

    const getChannelDisplayName = useCallback((ch: TeamChannel) => {
        if (ch.type === 'direct') {
            const others = (ch.participantIds || [])
                .filter(id => id !== currentUser.id)
                .map(id => churchUsers.find(u => u.id === id)?.name || 'Teammate');
            if (others.length === 0) return `${currentUser.name} (You)`;
            return others.join(', ');
        }
        return ch.name || 'channel';
    }, [currentUser, churchUsers]);

    const getChannelParticipants = useCallback((ch: TeamChannel) => {
        if (ch.type === 'direct' || (!ch.isAutoJoinedByRole && (ch.participantIds || []).length > 0)) {
            return churchUsers.filter(u => (ch.participantIds || []).includes(u.id));
        }
        if (ch.requiredArea) return churchUsers.filter(u => canReadArea(u, ch.requiredArea!));
        return churchUsers;
    }, [churchUsers]);

    const startDirectMessage = useCallback(async (targets: User[]) => {
        if (targets.length === 0) return null;
        return findOrCreateDirectChannel(church.id, currentUser, targets);
    }, [church.id, currentUser]);

    const createCustomChannel = useCallback(async (params: {
        name: string; description?: string; icon?: string; requiredArea?: TeamChatArea;
        participantIds?: string[]; isAutoJoinedByRole?: boolean;
    }) => {
        const now = Date.now();
        const slug = params.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const participants = Array.from(new Set([currentUser.id, ...(params.participantIds || [])]));
        const chan: TeamChannel = {
            id: `chan_${church.id}_${now}_${Math.random().toString(36).slice(2, 6)}`,
            churchId: church.id,
            type: 'custom_channel',
            name: slug || 'discussion',
            description: params.description?.trim() || undefined,
            icon: params.icon || (params.requiredArea === 'giving' ? '💰' : params.requiredArea === 'care' ? '🕊️' : '💬'),
            requiredArea: params.requiredArea,
            participantIds: participants,
            isAutoJoinedByRole: params.isAutoJoinedByRole ?? true,
            createdBy: currentUser.id,
            createdAt: now,
            lastMessageAt: now,
            lastReadAt: { [currentUser.id]: now },
        };
        await saveTeamChannel(chan);
        return chan;
    }, [church.id, currentUser.id]);

    return (
        <TeamChatContext.Provider value={{
            enabled, currentUser, church, people, channels, churchUsers, loading,
            totalUnreadCount, isChannelUnread, getChannelDisplayName, getChannelParticipants,
            startDirectMessage, createCustomChannel, viewingChannelId, setViewingChannelId,
        }}>
            {children}
        </TeamChatContext.Provider>
    );
};

export function useTeamChat() {
    const ctx = useContext(TeamChatContext);
    if (!ctx) throw new Error('useTeamChat must be used within a TeamChatProvider');
    return ctx;
}

/** Safe variant for components that may render outside the provider. */
export function useOptionalTeamChat() {
    return useContext(TeamChatContext);
}
