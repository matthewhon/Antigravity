/**
 * TeamChatScreen — the Team tab.
 * Channel list ↔ thread on a SwipeStack (slide in, swipe right to go back).
 */
import React, { useEffect, useRef, useState } from 'react';
import { TeamChannel } from '../../types';
import { useTeamChat } from '../../contexts/TeamChatContext';
import { SwipeStack, SwipeStackHandle } from '../../ui/SwipeStack';
import { ChannelList } from './ChannelList';
import { ChannelThread } from './ChannelThread';
import { NewConversationSheet } from './NewConversationSheet';

export const TeamChatScreen: React.FC<{
    /** False while another bottom tab is showing (thread must not mark read) */
    visible: boolean;
    deepLinkChannelId?: string | null;
    onDeepLinkHandled?: () => void;
}> = ({ visible, deepLinkChannelId, onDeepLinkHandled }) => {
    const { channels, loading } = useTeamChat();
    const [openChannelId, setOpenChannelId] = useState<string | null>(null);
    // Channel we just created/opened before the live snapshot includes it
    const [pendingChannel, setPendingChannel] = useState<TeamChannel | null>(null);
    const [showNew, setShowNew] = useState(false);
    const stackRef = useRef<SwipeStackHandle>(null);

    // Push-notification deep link → open that thread once channels are loaded
    useEffect(() => {
        if (!deepLinkChannelId || loading) return;
        if (channels.some(c => c.id === deepLinkChannelId)) setOpenChannelId(deepLinkChannelId);
        onDeepLinkHandled?.();
    }, [deepLinkChannelId, loading, channels, onDeepLinkHandled]);

    const openChannel = channels.find(c => c.id === openChannelId)
        || (pendingChannel && pendingChannel.id === openChannelId ? pendingChannel : null);

    useEffect(() => {
        if (pendingChannel && channels.some(c => c.id === pendingChannel.id)) setPendingChannel(null);
    }, [channels, pendingChannel]);

    const views = [
        {
            key: 'list',
            node: <ChannelList onOpen={c => setOpenChannelId(c.id)} onNew={() => setShowNew(true)} />,
        },
        ...(openChannel ? [{
            key: `thread-${openChannel.id}`,
            node: <ChannelThread channel={openChannel} isActive={visible} onBack={() => stackRef.current?.back()} />,
        }] : []),
    ];

    return (
        <div className="h-full min-h-0 text-left">
            <SwipeStack
                ref={stackRef}
                views={views}
                onPop={newLength => { if (newLength <= 1) setOpenChannelId(null); }}
            />
            <NewConversationSheet
                open={showNew}
                onClose={() => setShowNew(false)}
                onCreated={channel => {
                    setShowNew(false);
                    setPendingChannel(channel);
                    setOpenChannelId(channel.id);
                }}
            />
        </div>
    );
};
