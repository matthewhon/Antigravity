import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import {
    ChatWidgetAttachment,
    Church,
    TeamChannel,
    TeamChatArea,
    User,
} from '../types';
import { firestore } from '../services/firestoreService';
import { canReadArea, DashboardArea } from '../services/permissionService';
import { useTenantData } from './TenantDataContext';
import { buildChatWidgetAttachment, buildDonorListChatWidget } from '../services/chatWidgetService';

interface TeamChatContextValue {
    isDrawerOpen: boolean;
    setIsDrawerOpen: (open: boolean) => void;
    channels: TeamChannel[];
    churchUsers: User[];
    activeChannelId: string | null;
    setActiveChannelId: (id: string | null) => void;
    activeChannel: TeamChannel | null;
    pendingWidget: ChatWidgetAttachment | null;
    setPendingWidget: (w: ChatWidgetAttachment | null) => void;
    totalUnreadCount: number;
    isChannelUnread: (channel: TeamChannel) => boolean;
    openChatWithWidget: (widget: ChatWidgetAttachment, preferredArea?: TeamChatArea) => void;
    startDirectMessage: (targetUsers: User[]) => Promise<TeamChannel | null>;
    createCustomChannel: (params: {
        name: string;
        description?: string;
        icon?: string;
        requiredArea?: TeamChatArea;
        participantIds?: string[];
        isAutoJoinedByRole?: boolean;
        type?: 'custom_channel' | 'widget_thread';
    }) => Promise<TeamChannel | null>;
    getChannelDisplayName: (channel: TeamChannel) => string;
    getChannelParticipants: (channel: TeamChannel) => User[];
}

const TeamChatContext = createContext<TeamChatContextValue | undefined>(undefined);

export const TeamChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const tenantData = useTenantData();
    const { user, church } = tenantData;

    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [rawChannels, setRawChannels] = useState<TeamChannel[]>([]);
    const [churchUsers, setChurchUsers] = useState<User[]>([]);
    const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
    const [pendingWidget, setPendingWidget] = useState<ChatWidgetAttachment | null>(null);

    // 1. Ensure default department channels exist & subscribe to channels + church users
    useEffect(() => {
        if (!church?.id || !user?.id) {
            setRawChannels([]);
            setChurchUsers([]);
            return;
        }

        firestore.ensureDefaultTeamChannels(church.id);

        firestore.getUsersByChurch(church.id).then(users => {
            setChurchUsers(users);
        }).catch(() => {});

        const unsub = firestore.subscribeToTeamChannels(church.id, (loaded) => {
            setRawChannels(loaded);
        });

        return () => {
            unsub();
        };
    }, [church?.id, user?.id]);

    // 2. Filter channels based on user role permissions and participation
    const visibleChannels = useMemo(() => {
        if (!user) return [];
        return rawChannels.filter(ch => {
            // Strictly enforce requiredArea role gating (e.g. 'giving' for #giving-and-finance)
            if (ch.requiredArea && !canReadArea(user, ch.requiredArea as DashboardArea)) {
                return false;
            }
            // Direct messages: user must be in participantIds
            if (ch.type === 'direct') {
                return (ch.participantIds || []).includes(user.id);
            }
            // Auto-joined department or role-scoped channels
            if (ch.isAutoJoinedByRole) {
                return true;
            }
            // Private/invite-only custom channels: user must be participant or creator
            return (
                (ch.participantIds || []).includes(user.id) ||
                ch.createdBy === user.id ||
                (ch.participantIds || []).length === 0
            );
        });
    }, [rawChannels, user]);

    // Default active channel selection
    useEffect(() => {
        if (visibleChannels.length === 0) return;
        if (!activeChannelId || !visibleChannels.some(c => c.id === activeChannelId)) {
            const general = visibleChannels.find(c => c.name === 'general') || visibleChannels[0];
            if (general) {
                setActiveChannelId(general.id);
            }
        }
    }, [visibleChannels, activeChannelId]);

    const activeChannel = useMemo(
        () => visibleChannels.find(c => c.id === activeChannelId) || null,
        [visibleChannels, activeChannelId]
    );

    const isChannelUnread = useCallback(
        (ch: TeamChannel): boolean => {
            if (!user) return false;
            if (!ch.lastMessageAt || ch.lastMessageSenderId === user.id) return false;
            const lastRead = ch.lastReadAt?.[user.id] || 0;
            return ch.lastMessageAt > lastRead;
        },
        [user]
    );

    const totalUnreadCount = useMemo(() => {
        return visibleChannels.filter(isChannelUnread).length;
    }, [visibleChannels, isChannelUnread]);

    const getChannelDisplayName = useCallback(
        (ch: TeamChannel): string => {
            if (ch.type === 'direct') {
                const others = (ch.participantIds || [])
                    .filter(id => id !== user?.id)
                    .map(id => churchUsers.find(u => u.id === id)?.name || 'Teammate');
                if (others.length === 0) return user?.name ? `${user.name} (You)` : 'Direct Message';
                return others.join(', ');
            }
            return ch.name || 'channel';
        },
        [user, churchUsers]
    );

    const getChannelParticipants = useCallback(
        (ch: TeamChannel): User[] => {
            if (ch.type === 'direct' || (!ch.isAutoJoinedByRole && (ch.participantIds || []).length > 0)) {
                return churchUsers.filter(u => (ch.participantIds || []).includes(u.id));
            }
            if (ch.requiredArea) {
                return churchUsers.filter(u => canReadArea(u, ch.requiredArea as DashboardArea));
            }
            return churchUsers;
        },
        [churchUsers]
    );

    const openChatWithWidget = useCallback(
        (widget: ChatWidgetAttachment, preferredArea?: TeamChatArea) => {
            const targetArea = preferredArea || widget.area;
            // Find the matching role-gated department channel first (e.g., #giving-and-finance for giving widgets)
            const matchingDept = visibleChannels.find(
                c => c.type === 'department' && c.requiredArea === targetArea
            );
            if (matchingDept) {
                setActiveChannelId(matchingDept.id);
            }
            setPendingWidget(widget);
            setIsDrawerOpen(true);
        },
        [visibleChannels]
    );

    // Global event listener so SharedUI's WidgetWrapper & DonorListWidget can trigger Discuss in Chat
    useEffect(() => {
        const handleDiscussWidget = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (!detail) return;

            let widgetAttachment: ChatWidgetAttachment;
            if (detail.widgetAttachment) {
                widgetAttachment = detail.widgetAttachment;
            } else if (detail.donors && Array.isArray(detail.donors)) {
                widgetAttachment = buildDonorListChatWidget(
                    detail.title || 'Donor List',
                    detail.donors,
                    tenantData.people,
                    detail.widgetId
                );
            } else {
                widgetAttachment = buildChatWidgetAttachment(
                    detail.widgetId || detail.title || 'people_stats',
                    {
                        church: tenantData.church,
                        people: tenantData.people,
                        donations: tenantData.donations,
                        funds: tenantData.funds,
                        groups: tenantData.groups,
                        teams: tenantData.teams,
                        servicesData: tenantData.servicesData,
                        pastoralNotes: tenantData.pastoralNotes,
                        prayerRequests: tenantData.prayerRequests,
                        campusId: tenantData.selectedCampusId,
                    }
                );
            }
            openChatWithWidget(widgetAttachment, widgetAttachment.area);
        };

        window.addEventListener('discussWidgetInChat', handleDiscussWidget);
        return () => window.removeEventListener('discussWidgetInChat', handleDiscussWidget);
    }, [openChatWithWidget, tenantData]);

    const startDirectMessage = useCallback(
        async (targetUsers: User[]): Promise<TeamChannel | null> => {
            if (!church || !user || targetUsers.length === 0) return null;
            const dm = await firestore.findOrCreateDirectChannel(church.id, user, targetUsers);
            setActiveChannelId(dm.id);
            return dm;
        },
        [church, user]
    );

    const createCustomChannel = useCallback(
        async (params: {
            name: string;
            description?: string;
            icon?: string;
            requiredArea?: TeamChatArea;
            participantIds?: string[];
            isAutoJoinedByRole?: boolean;
            type?: 'custom_channel' | 'widget_thread';
        }): Promise<TeamChannel | null> => {
            if (!church || !user) return null;
            const now = Date.now();
            const slug = params.name
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');
            const id = `chan_${church.id}_${now}_${Math.random().toString(36).slice(2, 6)}`;
            const participants = Array.from(new Set([user.id, ...(params.participantIds || [])]));

            const newChan: TeamChannel = {
                id,
                churchId: church.id,
                type: params.type || 'custom_channel',
                name: params.type === 'widget_thread' ? params.name.trim() : (slug || 'discussion'),
                description: params.description?.trim() || undefined,
                icon: params.icon || (params.requiredArea === 'giving' ? '💰' : params.requiredArea === 'care' ? '🕊️' : '💬'),
                requiredArea: params.requiredArea,
                participantIds: participants,
                isAutoJoinedByRole: params.isAutoJoinedByRole ?? true,
                createdBy: user.id,
                createdAt: now,
                lastMessageAt: now,
                lastReadAt: { [user.id]: now },
            };

            await firestore.saveTeamChannel(newChan);
            setActiveChannelId(newChan.id);
            return newChan;
        },
        [church, user]
    );

    return (
        <TeamChatContext.Provider
            value={{
                isDrawerOpen,
                setIsDrawerOpen,
                channels: visibleChannels,
                churchUsers,
                activeChannelId,
                setActiveChannelId,
                activeChannel,
                pendingWidget,
                setPendingWidget,
                totalUnreadCount,
                isChannelUnread,
                openChatWithWidget,
                startDirectMessage,
                createCustomChannel,
                getChannelDisplayName,
                getChannelParticipants,
            }}
        >
            {children}
        </TeamChatContext.Provider>
    );
};

export function useTeamChat() {
    const ctx = useContext(TeamChatContext);
    if (!ctx) {
        throw new Error('useTeamChat must be used within a TeamChatProvider');
    }
    return ctx;
}
