import React, { useState, useEffect, useRef, useMemo, useCallback, useId } from 'react';
import {
    CareFollowUpLog,
    ChatFileAttachment,
    ChatPersonMention,
    ChatWidgetAttachment,
    ChatWidgetItemClaim,
    ChatWidgetSnapshotItem,
    TeamChannel,
    TeamChatArea,
    TeamMessage,
    TenantFile,
    User,
} from '../../types';
import { useTeamChat } from '../../contexts/TeamChatContext';
import { useTenantData } from '../../contexts/TenantDataContext';
import { firestore } from '../../services/firestoreService';
import { notifyTeamChatPush } from '../../services/teamChatPushService';
import { storage } from '../../services/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { canReadArea, DashboardArea } from '../../services/permissionService';
import {
    buildChatWidgetAttachment,
    CHAT_SLASH_COMMANDS,
    getCurrentWeekKey,
} from '../../services/chatWidgetService';
import { generateTeamChatAiReply } from '../../services/geminiService';
import { ChatWidgetCard } from './ChatWidgetCard';
import { ChatWidgetPickerModal } from './ChatWidgetPickerModal';
import { ToolHeader } from '../tool-shell';
import {
    MessageSquare,
    Lock,
    Plus,
    Send,
    Paperclip,
    Image as ImageIcon,
    Sparkles,
    Users,
    Hash,
    AtSign,
    X,
    Reply,
    Trash2,
    Pin,
    FolderOpen,
    CheckCircle2,
    Loader2,
    ChevronLeft,
    Maximize2,
    FileText,
    Download,
    ExternalLink,
    Smile,
    ClipboardList,
    Info,
    Bot,
    ChartColumn,
    Folder,
    UserRound,
} from 'lucide-react';

interface TeamChatWorkspaceProps {
    isCompactDrawer?: boolean;
    onCloseDrawer?: () => void;
    onExpandToFullPage?: () => void;
}

const QUICK_REACTIONS = ['🙏', '✅', '👀', '❤️', '👍', '🎉'];

const AREA_LABELS: Record<TeamChatArea, { label: string; badgeClass: string; icon: string }> = {
    giving: {
        label: 'Giving & Finance Only',
        badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
        icon: '💰',
    },
    care: {
        label: 'Pastoral Care Only',
        badgeClass: 'bg-violet-100 text-violet-800 dark:bg-violet-950/70 dark:text-violet-300 border-violet-300 dark:border-violet-800',
        icon: '🕊️',
    },
    people: {
        label: 'People Access Only',
        badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800',
        icon: '👥',
    },
    groups: {
        label: 'Groups Access Only',
        badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-300 dark:border-amber-800',
        icon: '📂',
    },
    services: {
        label: 'Services Access Only',
        badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border-blue-300 dark:border-blue-800',
        icon: '🎵',
    },
    admin: {
        label: 'Church Admin Only',
        badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border-rose-300 dark:border-rose-800',
        icon: '🛡️',
    },
};

/**
 * Resolve `@<User.name>` tokens in `text` to staff user IDs (case-insensitive).
 * Longest names are matched first and consumed, so "@Jo Ann Smith" wins over "@Jo".
 * Excludes PastorAI and `excludeUserId` (the sender). Drives push for @mentions.
 */
const extractMentionedUserIds = (
    text: string,
    candidates: { id: string; name?: string }[],
    excludeUserId: string
): string[] => {
    if (!text.includes('@')) return [];
    let masked = text.toLowerCase();
    const found = new Set<string>();
    const sorted = candidates
        .filter(u => u.id !== 'pastor-ai' && u.id !== excludeUserId && u.name && u.name.trim())
        .sort((a, b) => (b.name || '').trim().length - (a.name || '').trim().length);

    for (const u of sorted) {
        const token = `@${(u.name || '').trim().toLowerCase()}`;
        let idx = masked.indexOf(token);
        while (idx !== -1) {
            const nextChar = masked.charAt(idx + token.length);
            if (!nextChar || !/[\w\u00C0-\u024F]/.test(nextChar)) {
                found.add(u.id);
                masked = masked.slice(0, idx) + ' '.repeat(token.length) + masked.slice(idx + token.length);
            }
            idx = masked.indexOf(token, idx + 1);
        }
    }
    return Array.from(found);
};

const compressChatImage = (file: File): Promise<File> => {
    return new Promise((resolve) => {
        if (!file.type.startsWith('image/') || file.type === 'image/gif') {
            resolve(file);
            return;
        }
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(img.src);
            const MAX_DIM = 1400;
            let width = img.width;
            let height = img.height;
            if (width > MAX_DIM || height > MAX_DIM) {
                if (width > height) {
                    height = Math.round((height * MAX_DIM) / width);
                    width = MAX_DIM;
                } else {
                    width = Math.round((width * MAX_DIM) / height);
                    height = MAX_DIM;
                }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(file);
                return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        const name = file.name.replace(/\.[^/.]+$/, '') + '.jpg';
                        resolve(new File([blob], name, { type: 'image/jpeg' }));
                    } else {
                        resolve(file);
                    }
                },
                'image/jpeg',
                0.86
            );
        };
        img.onerror = () => resolve(file);
    });
};

export const TeamChatWorkspace: React.FC<TeamChatWorkspaceProps> = ({
    isCompactDrawer = false,
    onCloseDrawer,
    onExpandToFullPage,
}) => {
    const chatInputId = useId();
    const formRef = useRef<HTMLFormElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const tenantData = useTenantData();
    const { user, church } = tenantData;

    const {
        channels,
        churchUsers,
        activeChannelId,
        setActiveChannelId,
        activeChannel,
        pendingWidget,
        setPendingWidget,
        isChannelUnread,
        startDirectMessage,
        createCustomChannel,
        getChannelDisplayName,
        getChannelParticipants,
    } = useTeamChat();

    // UI states
    const [showMobileSidebar, setShowMobileSidebar] = useState(false);
    const [showRightInspector, setShowRightInspector] = useState(!isCompactDrawer);
    const [messages, setMessages] = useState<TeamMessage[]>([]);
    const [messageText, setMessageText] = useState('');
    const [replyingTo, setReplyingTo] = useState<TeamMessage | null>(null);
    const [stagedAttachments, setStagedAttachments] = useState<ChatFileAttachment[]>([]);
    const [stagedMentions, setStagedMentions] = useState<ChatPersonMention[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isAiThinking, setIsAiThinking] = useState(false);

    // Modals
    const [showWidgetPicker, setShowWidgetPicker] = useState(false);
    const [showNewChannelModal, setShowNewChannelModal] = useState(false);
    const [showNewDmModal, setShowNewDmModal] = useState(false);
    const [showFileLibraryModal, setShowFileLibraryModal] = useState(false);
    const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);

    // New Channel Form State
    const [newChanName, setNewChanName] = useState('');
    const [newChanDesc, setNewChanDesc] = useState('');
    const [newChanRequiredArea, setNewChanRequiredArea] = useState<TeamChatArea | 'all'>('all');
    const [newChanIsPrivate, setNewChanIsPrivate] = useState(false);
    const [newChanSelectedUsers, setNewChanSelectedUsers] = useState<string[]>([]);

    // New DM Form State
    const [dmSelectedUsers, setDmSelectedUsers] = useState<string[]>([]);
    const [dmSearch, setDmSearch] = useState('');

    // Tenant File Library State
    const [tenantFiles, setTenantFiles] = useState<TenantFile[]>([]);
    const [loadingTenantFiles, setLoadingTenantFiles] = useState(false);

    // Autocomplete Popover Detection (@staff, #person, /widget)
    const [activeTrigger, setActiveTrigger] = useState<{
        type: 'slash' | 'staff' | 'person';
        query: string;
        tokenStart: number;
    } | null>(null);

    // Subscribe to messages for activeChannelId
    useEffect(() => {
        if (!church?.id || !activeChannelId) {
            setMessages([]);
            return;
        }
        const unsub = firestore.subscribeToTeamMessages(church.id, activeChannelId, (loaded) => {
            setMessages(loaded);
            if (user?.id) {
                firestore.markTeamChannelRead(activeChannelId, user.id);
            }
        });
        if (user?.id) {
            firestore.markTeamChannelRead(activeChannelId, user.id);
        }
        return () => unsub();
    }, [church?.id, activeChannelId, user?.id]);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length, activeChannelId, isAiThinking]);

    // Group channels for sidebar
    const departmentChannels = useMemo(
        () => channels.filter(c => c.type === 'department'),
        [channels]
    );
    const customChannels = useMemo(
        () => channels.filter(c => c.type === 'custom_channel' || c.type === 'widget_thread'),
        [channels]
    );
    const directChannels = useMemo(
        () => channels.filter(c => c.type === 'direct'),
        [channels]
    );

    const activeParticipants = useMemo(
        () => (activeChannel ? getChannelParticipants(activeChannel) : []),
        [activeChannel, getChannelParticipants]
    );

    // Detect @, #, or / triggers as the user types
    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setMessageText(val);

        const cursor = e.target.selectionStart ?? val.length;
        const textBeforeCursor = val.slice(0, cursor);
        const match = textBeforeCursor.match(/(?:^|\s)([/@#])([^\s/@#]*)$/);

        if (match) {
            const symbol = match[1];
            const query = match[2] || '';
            const tokenStart = cursor - query.length - 1;
            if (symbol === '/') {
                setActiveTrigger({ type: 'slash', query, tokenStart });
            } else if (symbol === '@') {
                setActiveTrigger({ type: 'staff', query, tokenStart });
            } else if (symbol === '#') {
                setActiveTrigger({ type: 'person', query, tokenStart });
            }
        } else {
            setActiveTrigger(null);
        }
    };

    const slashResults = useMemo(() => {
        if (!activeTrigger || activeTrigger.type !== 'slash' || !user) return [];
        const q = activeTrigger.query.toLowerCase();
        return CHAT_SLASH_COMMANDS.filter(
            cmd =>
                canReadArea(user, cmd.area as DashboardArea) &&
                (cmd.command.slice(1).includes(q) || cmd.label.toLowerCase().includes(q))
        ).slice(0, 6);
    }, [activeTrigger, user]);

    const staffResults = useMemo(() => {
        if (!activeTrigger || activeTrigger.type !== 'staff') return [];
        const q = activeTrigger.query.toLowerCase();
        const pastorAiEntry = {
            id: 'pastor-ai',
            name: 'PastorAI',
            email: 'AI Ministry Assistant',
            roles: ['Pastor AI'] as any,
            churchId: church?.id || '',
        };
        const pool = [pastorAiEntry, ...activeParticipants];
        return pool.filter(u => u.name.toLowerCase().includes(q)).slice(0, 6);
    }, [activeTrigger, activeParticipants, church?.id]);

    const personResults = useMemo(() => {
        if (!activeTrigger || activeTrigger.type !== 'person') return [];
        const q = activeTrigger.query.toLowerCase();
        return tenantData.people
            .filter(p => p.name.toLowerCase().includes(q))
            .slice(0, 6);
    }, [activeTrigger, tenantData.people]);

    // Apply autocomplete selection
    const handleSelectSlashCommand = (cmd: (typeof CHAT_SLASH_COMMANDS)[0]) => {
        if (!activeTrigger) return;
        const before = messageText.slice(0, activeTrigger.tokenStart);
        const after = messageText.slice(
            activeTrigger.tokenStart + activeTrigger.query.length + 1
        );
        setMessageText((before + after).trimStart());
        setActiveTrigger(null);

        const widget = buildChatWidgetAttachment(cmd.widgetId, {
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
        });
        setPendingWidget(widget);
        textareaRef.current?.focus();
    };

    const handleSelectStaffMention = (staff: User) => {
        if (!activeTrigger) return;
        const before = messageText.slice(0, activeTrigger.tokenStart);
        const after = messageText.slice(
            activeTrigger.tokenStart + activeTrigger.query.length + 1
        );
        const mentionToken = staff.id === 'pastor-ai' ? '@PastorAI ' : `@${staff.name} `;
        setMessageText(before + mentionToken + after);
        setActiveTrigger(null);
        textareaRef.current?.focus();
    };

    const handleSelectPersonMention = (person: (typeof tenantData.people)[0]) => {
        if (!activeTrigger) return;
        const before = messageText.slice(0, activeTrigger.tokenStart);
        const after = messageText.slice(
            activeTrigger.tokenStart + activeTrigger.query.length + 1
        );
        setMessageText(`${before}#${person.name} ${after}`);
        setStagedMentions(prev =>
            prev.some(p => p.id === person.id)
                ? prev
                : [
                      ...prev,
                      {
                          id: person.id,
                          name: person.name,
                          avatar: person.avatar,
                          membership: person.membership,
                          riskCategory: person.riskProfile?.category,
                      },
                  ]
        );
        setActiveTrigger(null);
        textareaRef.current?.focus();
    };

    // File Upload Handler
    const handleUploadFiles = async (fileList: FileList | File[]) => {
        if (!church?.id || !user?.id) return;
        const filesArray = Array.from(fileList);
        if (filesArray.length === 0) return;

        setIsUploading(true);
        setUploadProgress(0);

        try {
            for (const rawFile of filesArray) {
                const isImg = rawFile.type.startsWith('image/');
                const processedFile = isImg ? await compressChatImage(rawFile) : rawFile;
                const fileId = `chatfile_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                const gcsPath = `tenants/${church.id}/uploads/${fileId}_${processedFile.name}`;
                const sRef = storageRef(storage, gcsPath);

                const task = uploadBytesResumable(sRef, processedFile);
                await new Promise<void>((resolve, reject) => {
                    task.on(
                        'state_changed',
                        snap => {
                            setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100);
                        },
                        reject,
                        () => resolve()
                    );
                });

                const url = await getDownloadURL(sRef);

                // Also register in TenantFiles under "Team Chat" folder so it's accessible in FileManager
                const tenantFile: TenantFile = {
                    id: fileId,
                    churchId: church.id,
                    uploaderUid: user.id,
                    originalName: processedFile.name,
                    mimeType: processedFile.type || 'application/octet-stream',
                    sizeBytes: processedFile.size,
                    publicUrl: url,
                    gcsPath,
                    createdAt: Date.now(),
                    folder: 'Team Chat',
                    tags: ['team-chat'],
                };
                await firestore.saveTenantFile(tenantFile).catch(() => {});

                const attachment: ChatFileAttachment = {
                    id: fileId,
                    kind: isImg ? 'image' : rawFile.type.startsWith('video/') ? 'video' : 'document',
                    name: processedFile.name,
                    mimeType: processedFile.type || 'application/octet-stream',
                    sizeBytes: processedFile.size,
                    url,
                    gcsPath,
                    tenantFileId: fileId,
                };
                setStagedAttachments(prev => [...prev, attachment]);
            }
        } catch (err) {
            console.error('Chat file upload failed:', err);
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // Clipboard Paste for Screenshots / Images
    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        const pastedFiles: File[] = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file') {
                const f = item.getAsFile();
                if (f) pastedFiles.push(f);
            }
        }
        if (pastedFiles.length > 0) {
            e.preventDefault();
            handleUploadFiles(pastedFiles);
        }
    };

    // Trigger @PastorAI response in thread (Idea 3)
    const triggerPastorAiInChannel = useCallback(
        async (userPrompt: string, explicitWidget?: ChatWidgetAttachment | null) => {
            if (!church || !activeChannel || !user) return;
            setIsAiThinking(true);
            try {
                const targetWidget =
                    explicitWidget ||
                    pendingWidget ||
                    [...messages].reverse().find(m => m.widget)?.widget ||
                    activeChannel.pinnedWidgets?.[0] ||
                    null;

                const widgetContextStr = targetWidget
                    ? `Widget Title: ${targetWidget.title} (${targetWidget.area})\nHeadline: ${
                          targetWidget.snapshot?.headlineValue || ''
                      }\nTop Records:\n${(targetWidget.snapshot?.items || [])
                          .slice(0, 12)
                          .map(
                              i =>
                                  `- ${i.name}: ${i.primaryStat} (${i.secondaryStat || ''}) ${
                                      i.riskCategory ? `[Risk: ${i.riskCategory}]` : ''
                                  }`
                          )
                          .join('\n')}`
                    : undefined;

                const aiText = await generateTeamChatAiReply({
                    churchName: church.name,
                    channelName: getChannelDisplayName(activeChannel),
                    userQuery: userPrompt,
                    senderName: user.name,
                    recentMessages: messages.slice(-8).map(m => ({
                        senderName: m.senderName,
                        text: m.text,
                        widgetTitle: m.widget?.title,
                    })),
                    activeWidgetsContext: widgetContextStr,
                });

                const aiMsg: TeamMessage = {
                    id: `msg_${Date.now()}_ai`,
                    channelId: activeChannel.id,
                    churchId: church.id,
                    senderId: 'pastor-ai',
                    senderName: '🤖 @PastorAI',
                    isAiResponse: true,
                    text: aiText,
                    createdAt: Date.now(),
                };
                await firestore.sendTeamMessage(aiMsg);
            } catch (e) {
                console.error('Failed to generate @PastorAI reply:', e);
            } finally {
                setIsAiThinking(false);
            }
        },
        [church, activeChannel, user, pendingWidget, messages, getChannelDisplayName]
    );

    // Send Message Submit
    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!church || !user || !activeChannel) return;

        const trimmed = messageText.trim();
        if (!trimmed && !pendingWidget && stagedAttachments.length === 0) return;

        const widgetToSend = pendingWidget || undefined;
        const attachmentsToSend = stagedAttachments.length > 0 ? [...stagedAttachments] : undefined;
        const mentionsToSend = stagedMentions.length > 0 ? [...stagedMentions] : undefined;
        const replyToSend = replyingTo
            ? {
                  id: replyingTo.id,
                  senderName: replyingTo.senderName,
                  text: replyingTo.text || (replyingTo.widget ? `[Widget: ${replyingTo.widget.title}]` : '[Attachment]'),
              }
            : undefined;

        const mentionedUserIds = extractMentionedUserIds(
            trimmed,
            activeParticipants.length > 0 ? activeParticipants : churchUsers,
            user.id
        );

        const newMsg: TeamMessage = {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            channelId: activeChannel.id,
            churchId: church.id,
            senderId: user.id,
            senderName: user.name,
            senderRoles: user.roles,
            text: trimmed,
            createdAt: Date.now(),
            replyToMessageId: replyingTo?.id,
            replyPreview: replyToSend,
            attachments: attachmentsToSend,
            widget: widgetToSend,
            mentionedPeople: mentionsToSend,
            ...(mentionedUserIds.length > 0 ? { mentionedUserIds } : {}),
        };

        // Reset composer immediately for snappy feel
        setMessageText('');
        setPendingWidget(null);
        setStagedAttachments([]);
        setStagedMentions([]);
        setReplyingTo(null);
        setActiveTrigger(null);

        await firestore.sendTeamMessage(newMsg);
        // Native push for teammates (DMs, @mentions, "notify all" opt-ins) — fire-and-forget
        notifyTeamChatPush(newMsg.id);

        // If the user tagged @PastorAI, automatically generate an AI response in the thread!
        if (/@pastorai\b/i.test(trimmed)) {
            await triggerPastorAiAiPrompt(trimmed, widgetToSend);
        }
    };

    const triggerPastorAiAiPrompt = async (promptText: string, attachedWidget?: ChatWidgetAttachment) => {
        await triggerPastorAiInChannel(promptText, attachedWidget);
    };

    // IME-safe Enter-to-Submit handler (per modern-web-guidance `ime-safe-enter-submit`)
    const handleTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            // Block submission if composing natively or if keyCode is 229 (Safari IME workaround)
            if (event.nativeEvent.isComposing || event.keyCode === 229) {
                return;
            }
            formRef.current?.requestSubmit();
        }
    };

    // Claim & Care Handler on Widget Items (Idea 1)
    const handleClaimWidgetItem = async (
        messageId: string,
        widget: ChatWidgetAttachment,
        item: ChatWidgetSnapshotItem,
        existingClaim?: ChatWidgetItemClaim
    ) => {
        if (!user || !church) return;
        const isUnclaiming = existingClaim?.claimedByUserId === user.id;

        if (isUnclaiming) {
            await firestore.claimWidgetItemInMessage(messageId, item.id, null);
            return;
        }

        const newClaim: ChatWidgetItemClaim = {
            claimedByUserId: user.id,
            claimedByUserName: user.name,
            claimedAt: Date.now(),
            status: 'claimed',
        };
        await firestore.claimWidgetItemInMessage(messageId, item.id, newClaim);

        // Also record in CareFollowUpLog so the rest of the Pastoral Care module reflects this outreach claim!
        const logEntry: CareFollowUpLog = {
            id: `${church.id}_${item.id}`,
            churchId: church.id,
            personId: item.id,
            followedUpAt: Date.now(),
            dismissedAt: null,
            dismissedSignal: null,
        };
        await firestore.saveCareFollowUpLog(logEntry).catch(() => {});
    };

    // Automated / 1-Click Weekly Channel Briefing (Idea 4)
    const handlePostWeeklyBriefing = async () => {
        if (!church || !activeChannel || !user) return;
        const area = activeChannel.requiredArea || 'people';
        const widgetId =
            area === 'giving'
                ? 'lifecycleLapsed'
                : area === 'care'
                ? 'care_recommended_followups'
                : area === 'services'
                ? 'struggling_teams'
                : area === 'groups'
                ? 'groups_action_center'
                : 'atRiskList';

        const briefingWidget = buildChatWidgetAttachment(widgetId, {
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
        });

        const weekKey = getCurrentWeekKey();
        const briefingMsg: TeamMessage = {
            id: `briefing_${activeChannel.id}_${Date.now()}`,
            channelId: activeChannel.id,
            churchId: church.id,
            senderId: user.id,
            senderName: '📋 Weekly Ministry Briefing',
            isAutomatedBriefing: true,
            text: `**Weekly Needs Attention Briefing (${weekKey})** for **#${getChannelDisplayName(
                activeChannel
            )}** — Here is the latest live snapshot. Click **Claim** on any person below to coordinate follow-ups as a team, or reply with \`@PastorAI\` for outreach drafts.`,
            createdAt: Date.now(),
            widget: briefingWidget,
        };

        await firestore.sendTeamMessage(briefingMsg);
        await firestore.saveTeamChannel({
            ...activeChannel,
            lastBriefingWeekKey: weekKey,
        });
    };

    // Load Tenant Files when File Library modal opens
    const openFileLibrary = async () => {
        if (!church?.id) return;
        setShowFileLibraryModal(true);
        setLoadingTenantFiles(true);
        try {
            const list = await firestore.getTenantFiles(church.id);
            setTenantFiles(list);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingTenantFiles(false);
        }
    };

    if (!user || !church) return null;

    const sharedChannelFiles = useMemo(() => {
        return messages.flatMap(m => m.attachments || []);
    }, [messages]);

    return (
        <div className="flex h-full min-h-0 bg-white dark:bg-slate-900 overflow-hidden select-none sm:select-auto">
            {/* ── LEFT SIDEBAR: CHANNELS, THREADS & DIRECT MESSAGES ───────────── */}
            <aside
                className={`${
                    isCompactDrawer
                        ? showMobileSidebar
                            ? 'w-64 absolute inset-y-0 left-0 z-30 shadow-2xl'
                            : 'hidden'
                        : 'w-72 shrink-0 border-r border-slate-200 dark:border-slate-800 flex'
                } flex-col bg-slate-50 dark:bg-slate-950 h-full`}
            >
                {/* Sidebar Header */}
                <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800">
                    <ToolHeader
                        tool="team-chat"
                        variant="compact"
                        actions={
                            isCompactDrawer ? (
                                <button
                                    type="button"
                                    onClick={() => setShowMobileSidebar(false)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
                                >
                                    <X size={15} />
                                </button>
                            ) : undefined
                        }
                    />
                    <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-1 truncate">
                        {church.name} • {churchUsers.length} Staff
                    </p>
                </div>

                {/* Scrollable Channel Lists */}
                <div className="flex-1 overflow-y-auto p-3 space-y-5">
                    {/* 1. Ministry & Role-Gated Channels */}
                    <div>
                        <div className="px-2 mb-1.5 flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                Ministry Channels
                            </span>
                        </div>
                        <div className="space-y-0.5">
                            {departmentChannels.map(ch => {
                                const active = ch.id === activeChannelId;
                                const unread = isChannelUnread(ch);
                                return (
                                    <button
                                        key={ch.id}
                                        type="button"
                                        onClick={() => {
                                            setActiveChannelId(ch.id);
                                            setShowMobileSidebar(false);
                                        }}
                                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left transition ${
                                            active
                                                ? 'bg-indigo-600 text-white shadow-xs'
                                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800/70'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-sm shrink-0">{ch.icon || '#'}</span>
                                            <span className={`text-xs truncate ${unread || active ? 'font-black' : 'font-semibold'}`}>
                                                {ch.name}
                                            </span>
                                            {ch.requiredArea && (
                                                <Lock
                                                    size={11}
                                                    className={`shrink-0 ${
                                                        active ? 'text-indigo-200' : 'text-amber-500 dark:text-amber-400'
                                                    }`}
                                                    title={`Role-restricted to ${ch.requiredArea} access`}
                                                />
                                            )}
                                        </div>
                                        {unread && !active && (
                                            <span className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400 shrink-0" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* 2. Custom Topic & Role-Gated Threads */}
                    <div>
                        <div className="px-2 mb-1.5 flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                Topic & Widget Threads
                            </span>
                            <button
                                type="button"
                                onClick={() => setShowNewChannelModal(true)}
                                className="inline-flex items-center gap-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                                <Plus size={11} /> New
                            </button>
                        </div>
                        <div className="space-y-0.5">
                            {customChannels.map(ch => {
                                const active = ch.id === activeChannelId;
                                const unread = isChannelUnread(ch);
                                return (
                                    <button
                                        key={ch.id}
                                        type="button"
                                        onClick={() => {
                                            setActiveChannelId(ch.id);
                                            setShowMobileSidebar(false);
                                        }}
                                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left transition ${
                                            active
                                                ? 'bg-indigo-600 text-white shadow-xs'
                                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800/70'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-sm shrink-0">{ch.icon || <MessageSquare size={14} aria-hidden="true" />}</span>
                                            <span className={`text-xs truncate ${unread || active ? 'font-black' : 'font-semibold'}`}>
                                                {ch.name}
                                            </span>
                                            {ch.requiredArea && (
                                                <Lock
                                                    size={11}
                                                    className={`shrink-0 ${
                                                        active ? 'text-indigo-200' : 'text-amber-500 dark:text-amber-400'
                                                    }`}
                                                />
                                            )}
                                        </div>
                                        {unread && !active && (
                                            <span className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400 shrink-0" />
                                        )}
                                    </button>
                                );
                            })}
                            {customChannels.length === 0 && (
                                <button
                                    type="button"
                                    onClick={() => setShowNewChannelModal(true)}
                                    className="w-full inline-flex items-center gap-1 py-2 px-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 text-[11px] font-semibold text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-400 transition text-left"
                                >
                                    <Plus size={12} aria-hidden="true" /> Start a topic or Giving-only thread
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 3. Direct Messages (1:1 & Group DMs) */}
                    <div>
                        <div className="px-2 mb-1.5 flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                Direct Messages
                            </span>
                            <button
                                type="button"
                                onClick={() => setShowNewDmModal(true)}
                                className="inline-flex items-center gap-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                                <Plus size={11} /> New DM
                            </button>
                        </div>
                        <div className="space-y-0.5">
                            {directChannels.map(ch => {
                                const active = ch.id === activeChannelId;
                                const unread = isChannelUnread(ch);
                                const displayName = getChannelDisplayName(ch);
                                return (
                                    <button
                                        key={ch.id}
                                        type="button"
                                        onClick={() => {
                                            setActiveChannelId(ch.id);
                                            setShowMobileSidebar(false);
                                        }}
                                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left transition ${
                                            active
                                                ? 'bg-indigo-600 text-white shadow-xs'
                                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800/70'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div
                                                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                                                    active
                                                        ? 'bg-white/20 text-white'
                                                        : 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'
                                                }`}
                                            >
                                                {displayName.charAt(0)}
                                            </div>
                                            <span className={`text-xs truncate ${unread || active ? 'font-black' : 'font-semibold'}`}>
                                                {displayName}
                                            </span>
                                        </div>
                                        {unread && !active && (
                                            <span className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400 shrink-0" />
                                        )}
                                    </button>
                                );
                            })}

                            {/* Quick list of staff members to message directly */}
                            {churchUsers
                                .filter(u => u.id !== user.id)
                                .slice(0, 6)
                                .map(teammate => {
                                    const existingDm = directChannels.find(
                                        d =>
                                            d.participantIds.length === 2 &&
                                            d.participantIds.includes(teammate.id) &&
                                            d.participantIds.includes(user.id)
                                    );
                                    if (existingDm) return null;
                                    return (
                                        <button
                                            key={teammate.id}
                                            type="button"
                                            onClick={async () => {
                                                await startDirectMessage([teammate]);
                                                setShowMobileSidebar(false);
                                            }}
                                            className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl text-left text-slate-500 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition"
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-[9px] font-black shrink-0">
                                                    {teammate.name.charAt(0)}
                                                </div>
                                                <span className="text-xs font-medium truncate">{teammate.name}</span>
                                            </div>
                                            {teammate.roles.includes('Giving') && (
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                                                    Giving
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                        </div>
                    </div>
                </div>
            </aside>

            {/* ── CENTER PANE: ACTIVE CONVERSATION ────────────────────────────── */}
            <div className="flex-1 flex flex-col min-w-0 h-full bg-white dark:bg-slate-900 relative">
                {/* Conversation Header */}
                <header className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                        {isCompactDrawer && (
                            <button
                                type="button"
                                onClick={() => setShowMobileSidebar(true)}
                                className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1 shrink-0 hover:bg-indigo-50 transition"
                                title="Switch Channel or Direct Message"
                            >
                                <ChevronLeft size={14} />
                                <span>Chats ({channels.length})</span>
                            </button>
                        )}

                        {activeChannel && (
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-black text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                                        <span>{activeChannel.icon || (activeChannel.type === 'direct' ? <UserRound size={14} aria-hidden="true" /> : '#')}</span>
                                        <span>{getChannelDisplayName(activeChannel)}</span>
                                    </span>

                                    {activeChannel.requiredArea && (
                                        <span
                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                                AREA_LABELS[activeChannel.requiredArea]?.badgeClass || ''
                                            }`}
                                            title="Users without this permission cannot see or join this channel"
                                        >
                                            <Lock size={10} />
                                            <span>{AREA_LABELS[activeChannel.requiredArea]?.label}</span>
                                        </span>
                                    )}
                                </div>
                                {activeChannel.description && !isCompactDrawer && (
                                    <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                                        {activeChannel.description}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Right Header Actions: Weekly Briefing, Add Widget, Info, Expand/Close */}
                    <div className="flex items-center gap-1.5 shrink-0">
                        {activeChannel && (
                            <button
                                type="button"
                                onClick={handlePostWeeklyBriefing}
                                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold transition border border-indigo-200/60 dark:border-indigo-800/60"
                                title="Drop this week's Needs Attention & interactive widget briefing into this channel"
                            >
                                <ClipboardList size={13} />
                                <span>Weekly Briefing</span>
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={() => setShowWidgetPicker(true)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold transition shadow-2xs"
                            title="Add an interactive widget (e.g. Lapsed Donors) to this conversation"
                        >
                            <Sparkles size={12} />
                            <span>+ Widget</span>
                        </button>

                        {!isCompactDrawer && (
                            <button
                                type="button"
                                onClick={() => setShowRightInspector(!showRightInspector)}
                                className={`p-2 rounded-xl border transition ${
                                    showRightInspector
                                        ? 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-slate-800 dark:border-slate-700 dark:text-indigo-400'
                                        : 'border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-700'
                                }`}
                                title="Toggle Channel Members & Pinned Widgets Inspector"
                            >
                                <Info size={15} />
                            </button>
                        )}

                        {isCompactDrawer && onExpandToFullPage && (
                            <button
                                type="button"
                                onClick={onExpandToFullPage}
                                className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                                title="Open Full-Screen Team Chat Workspace"
                            >
                                <Maximize2 size={15} />
                            </button>
                        )}

                        {isCompactDrawer && onCloseDrawer && (
                            <button
                                type="button"
                                onClick={onCloseDrawer}
                                className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-800 transition"
                                title="Close Chat Drawer"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </header>

                {/* Pinned Widgets Strip (if any pinned to this channel) */}
                {activeChannel?.pinnedWidgets && activeChannel.pinnedWidgets.length > 0 && (
                    <div className="px-4 py-2 bg-indigo-50/60 dark:bg-indigo-950/20 border-b border-indigo-100 dark:border-indigo-900/40 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar shrink-0">
                        <div className="flex items-center gap-2 min-w-0">
                            <Pin size={12} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 shrink-0">
                                Pinned:
                            </span>
                            {activeChannel.pinnedWidgets.map(pw => (
                                <button
                                    key={pw.widgetId}
                                    type="button"
                                    onClick={() => setPendingWidget(pw)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-indigo-200 dark:border-slate-700 text-[11px] font-bold text-slate-800 dark:text-slate-200 hover:border-indigo-500 transition shrink-0"
                                >
                                    <span className="inline-flex items-center">{pw.icon || <ChartColumn size={12} aria-hidden="true" />}</span>
                                    <span>{pw.title}</span>
                                    {pw.snapshot?.headlineValue && (
                                        <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                                            ({pw.snapshot.headlineValue.split('•')[0].trim()})
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Message Feed */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto py-12 px-4">
                            <div className="w-14 h-14 rounded-3xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-2xl mb-3 shadow-xs">
                                {activeChannel?.icon || <MessageSquare size={24} aria-hidden="true" />}
                            </div>
                            <h4 className="text-base font-black text-slate-900 dark:text-white">
                                Welcome to #{activeChannel ? getChannelDisplayName(activeChannel) : 'Team Chat'}
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                                {activeChannel?.requiredArea === 'giving'
                                    ? <><Lock size={11} className="inline -mt-0.5 mr-1 text-amber-500 dark:text-amber-400" aria-hidden="true" />This channel is restricted to staff with Giving permissions. Share the Lapsed Donors widget, coordinate donor outreach, or ask @PastorAI for insights.</>
                                    : 'Share messages, drop files & pictures, mention people with #Name, or embed live analytics widgets to collaborate with your team.'}
                            </p>
                            <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowWidgetPicker(true)}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-xs"
                                >
                                    <Sparkles size={13} />
                                    <span>Share a Widget (e.g. Lapsed Donors)</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handlePostWeeklyBriefing}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition"
                                >
                                    <ClipboardList size={13} />
                                    <span>Post Weekly Briefing</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        messages.map(msg => {
                            const isMe = msg.senderId === user.id;
                            const isAi = msg.isAiResponse || msg.senderId === 'pastor-ai';
                            const reactions = msg.reactions || {};

                            return (
                                <div
                                    key={msg.id}
                                    className={`group flex gap-3 ${
                                        isAi
                                            ? 'bg-violet-50/60 dark:bg-violet-950/20 p-3.5 rounded-2xl border border-violet-200/70 dark:border-violet-800/50'
                                            : msg.isAutomatedBriefing
                                            ? 'bg-indigo-50/40 dark:bg-indigo-950/20 p-3.5 rounded-2xl border border-indigo-200/60 dark:border-indigo-800/50'
                                            : ''
                                    }`}
                                >
                                    {/* Sender Avatar */}
                                    <div
                                        className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0 mt-0.5 ${
                                            isAi
                                                ? 'bg-violet-600 text-white'
                                                : msg.isAutomatedBriefing
                                                ? 'bg-indigo-600 text-white'
                                                : isMe
                                                ? 'bg-indigo-600 text-white'
                                                : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                                        }`}
                                    >
                                        {isAi ? <Bot size={16} aria-hidden="true" /> : msg.isAutomatedBriefing ? <ClipboardList size={16} aria-hidden="true" /> : (msg.senderName || '?').charAt(0)}
                                    </div>

                                    {/* Message Content Column */}
                                    <div className="flex-1 min-w-0">
                                        {/* Sender Name + Roles + Timestamp + Quick Actions */}
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-xs font-black text-slate-900 dark:text-white">
                                                    {msg.senderName}
                                                </span>
                                                {msg.senderRoles && msg.senderRoles.includes('Giving') && (
                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                                                        Giving
                                                    </span>
                                                )}
                                                {msg.senderRoles && msg.senderRoles.includes('Pastor') && (
                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                                                        Pastor
                                                    </span>
                                                )}
                                                <span className="text-[10px] font-medium text-slate-400">
                                                    {new Date(msg.createdAt).toLocaleTimeString([], {
                                                        hour: 'numeric',
                                                        minute: '2-digit',
                                                    })}
                                                </span>
                                            </div>

                                            {/* Hover Actions: React, Reply, Delete */}
                                            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                                                {QUICK_REACTIONS.slice(0, 4).map(emoji => (
                                                    <button
                                                        key={emoji}
                                                        type="button"
                                                        onClick={() => firestore.toggleTeamMessageReaction(msg.id, emoji, user.id)}
                                                        className="w-6 h-6 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-xs flex items-center justify-center transition"
                                                        title={`React with ${emoji}`}
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setReplyingTo(msg);
                                                        textareaRef.current?.focus();
                                                    }}
                                                    className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                                                    title="Reply in thread"
                                                >
                                                    <Reply size={13} />
                                                </button>
                                                {isMe && (
                                                    <button
                                                        type="button"
                                                        onClick={() => firestore.deleteTeamMessage(msg.id)}
                                                        className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-800 transition"
                                                        title="Delete message"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Reply Preview Banner */}
                                        {msg.replyPreview && (
                                            <div className="mt-1 mb-1.5 pl-2.5 border-l-2 border-indigo-400 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                                <span className="font-bold text-slate-700 dark:text-slate-300">
                                                    @{msg.replyPreview.senderName}:
                                                </span>{' '}
                                                {msg.replyPreview.text}
                                            </div>
                                        )}

                                        {/* Message Text */}
                                        {msg.text && (
                                            <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed mt-1">
                                                {msg.text}
                                            </p>
                                        )}

                                        {/* Inline Mentioned #Person Cards (Idea 2) */}
                                        {msg.mentionedPeople && msg.mentionedPeople.length > 0 && (
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                {msg.mentionedPeople.map(person => (
                                                    <button
                                                        key={person.id}
                                                        type="button"
                                                        onClick={() =>
                                                            window.dispatchEvent(
                                                                new CustomEvent('openPersonProfile', { detail: person.id })
                                                            )
                                                        }
                                                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition text-left"
                                                    >
                                                        <div className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center overflow-hidden">
                                                            {person.avatar ? (
                                                                <img src={person.avatar} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                person.name.charAt(0)
                                                            )}
                                                        </div>
                                                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                                                            #{person.name}
                                                        </span>
                                                        {person.riskCategory && (
                                                            <span
                                                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                                                    person.riskCategory === 'Healthy'
                                                                        ? 'bg-emerald-100 text-emerald-700'
                                                                        : person.riskCategory === 'At Risk'
                                                                        ? 'bg-amber-100 text-amber-700'
                                                                        : 'bg-rose-100 text-rose-700'
                                                                }`}
                                                            >
                                                                {person.riskCategory}
                                                            </span>
                                                        )}
                                                        <ExternalLink size={10} className="text-indigo-500" />
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {/* Shared Images & File Attachments */}
                                        {msg.attachments && msg.attachments.length > 0 && (
                                            <div className="flex flex-wrap gap-2.5 mt-2.5">
                                                {msg.attachments.map(att =>
                                                    att.kind === 'image' ? (
                                                        <button
                                                            key={att.id}
                                                            type="button"
                                                            onClick={() => setLightboxImageUrl(att.url)}
                                                            className="relative group/img rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 max-w-xs max-h-56 bg-slate-100 dark:bg-slate-800"
                                                        >
                                                            <img
                                                                src={att.url}
                                                                alt={att.name}
                                                                className="max-h-56 w-auto object-cover group-hover/img:scale-102 transition-transform"
                                                            />
                                                        </button>
                                                    ) : (
                                                        <a
                                                            key={att.id}
                                                            href={att.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center gap-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 transition max-w-xs"
                                                        >
                                                            <div className="w-9 h-9 rounded-xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                                                                <FileText size={18} />
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                                                    {att.name}
                                                                </p>
                                                                <p className="text-[10px] text-slate-400">
                                                                    {Math.max(1, Math.round((att.sizeBytes || 0) / 1024))} KB
                                                                </p>
                                                            </div>
                                                            <Download size={14} className="text-slate-400 shrink-0" />
                                                        </a>
                                                    )
                                                )}
                                            </div>
                                        )}

                                        {/* Embedded Interactive Widget Card */}
                                        {msg.widget && (
                                            <div className="max-w-xl">
                                                <ChatWidgetCard
                                                    widget={msg.widget}
                                                    currentUser={user}
                                                    messageId={msg.id}
                                                    compact={isCompactDrawer}
                                                    onClaimItem={(item, existingClaim) =>
                                                        handleClaimWidgetItem(msg.id, msg.widget!, item, existingClaim)
                                                    }
                                                    onPinWidget={w =>
                                                        activeChannel && firestore.pinWidgetToChannel(activeChannel.id, w)
                                                    }
                                                    onAskPastorAiAboutWidget={w =>
                                                        triggerPastorAiInChannel(
                                                            `Analyze the "${w.title}" widget shared here. Who are the top 3 people we should prioritize reaching out to first, and can you provide a warm, caring check-in message template?`,
                                                            w
                                                        )
                                                    }
                                                />
                                            </div>
                                        )}

                                        {/* Emoji Reaction Chips */}
                                        {Object.keys(reactions).length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                {(Object.entries(reactions) as [string, string[]][]).map(([emoji, userIds]) => {
                                                    if (!userIds || userIds.length === 0) return null;
                                                    const reactedByMe = userIds.includes(user.id);
                                                    return (
                                                        <button
                                                            key={emoji}
                                                            type="button"
                                                            onClick={() =>
                                                                firestore.toggleTeamMessageReaction(msg.id, emoji, user.id)
                                                            }
                                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border transition ${
                                                                reactedByMe
                                                                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-950/70 dark:border-indigo-700 dark:text-indigo-300'
                                                                    : 'bg-slate-100 border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
                                                            }`}
                                                        >
                                                            <span>{emoji}</span>
                                                            <span>{userIds.length}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}

                    {isAiThinking && (
                        <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-violet-50/70 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800/50 text-xs font-bold text-violet-700 dark:text-violet-300">
                            <Loader2 size={15} className="animate-spin" />
                            <span>@PastorAI is analyzing the conversation and widget data...</span>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* ── COMPOSER AREA ─────────────────────────────────────────────── */}
                <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/90 relative">
                    {/* Autocomplete Popover for /widget, @staff, #person */}
                    {activeTrigger && (
                        <div className="absolute bottom-full left-3 right-3 mb-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden z-30 max-h-60 overflow-y-auto">
                            {activeTrigger.type === 'slash' &&
                                slashResults.map(cmd => (
                                    <button
                                        key={cmd.command}
                                        type="button"
                                        onClick={() => handleSelectSlashCommand(cmd)}
                                        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-indigo-50 dark:hover:bg-slate-700/70 text-left transition"
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <span className="text-base">{cmd.icon}</span>
                                            <div className="min-w-0">
                                                <p className="text-xs font-black text-slate-900 dark:text-white">
                                                    {cmd.command}{' '}
                                                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                                                        — {cmd.label}
                                                    </span>
                                                </p>
                                                <p className="text-[10px] text-slate-400 truncate">{cmd.description}</p>
                                            </div>
                                        </div>
                                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500">
                                            {cmd.area}
                                        </span>
                                    </button>
                                ))}

                            {activeTrigger.type === 'staff' &&
                                staffResults.map(st => (
                                    <button
                                        key={st.id}
                                        type="button"
                                        onClick={() => handleSelectStaffMention(st)}
                                        className="w-full flex items-center justify-between gap-3 px-4 py-2 hover:bg-indigo-50 dark:hover:bg-slate-700/70 text-left transition"
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">
                                                {st.id === 'pastor-ai' ? <Bot size={12} aria-hidden="true" /> : st.name.charAt(0)}
                                            </div>
                                            <span className="text-xs font-bold text-slate-900 dark:text-white">
                                                @{st.name}
                                            </span>
                                        </div>
                                        <span className="text-[10px] text-slate-400">
                                            {(st.roles || []).slice(0, 2).join(', ')}
                                        </span>
                                    </button>
                                ))}

                            {activeTrigger.type === 'person' &&
                                personResults.map(p => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => handleSelectPersonMention(p)}
                                        className="w-full flex items-center justify-between gap-3 px-4 py-2 hover:bg-indigo-50 dark:hover:bg-slate-700/70 text-left transition"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-black flex items-center justify-center overflow-hidden">
                                                {p.avatar ? (
                                                    <img src={p.avatar} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    p.name.charAt(0)
                                                )}
                                            </div>
                                            <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                                #{p.name}
                                            </span>
                                        </div>
                                        <span className="text-[10px] text-slate-400">{p.membership || 'Member'}</span>
                                    </button>
                                ))}
                        </div>
                    )}

                    {/* Staged Reply Banner */}
                    {replyingTo && (
                        <div className="mb-2 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-slate-800 border border-indigo-100 dark:border-slate-700 flex items-center justify-between gap-2 text-xs">
                            <span className="truncate text-slate-600 dark:text-slate-300">
                                Replying to <strong>{replyingTo.senderName}</strong>
                            </span>
                            <button
                                type="button"
                                onClick={() => setReplyingTo(null)}
                                className="text-slate-400 hover:text-rose-500"
                            >
                                <X size={13} />
                            </button>
                        </div>
                    )}

                    {/* Staged Widget Preview */}
                    {pendingWidget && (
                        <div className="mb-2 px-3.5 py-2.5 rounded-2xl bg-indigo-50/90 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <span className="text-lg shrink-0 text-indigo-600 dark:text-indigo-400">{pendingWidget.icon || <ChartColumn size={18} aria-hidden="true" />}</span>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                                            Staged {pendingWidget.area} Widget
                                        </span>
                                    </div>
                                    <p className="text-xs font-black text-slate-900 dark:text-white truncate">
                                        {pendingWidget.title} — {pendingWidget.snapshot?.headlineValue}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setPendingWidget(null)}
                                className="p-1 rounded-full text-slate-400 hover:text-rose-500"
                                title="Remove staged widget"
                            >
                                <X size={15} />
                            </button>
                        </div>
                    )}

                    {/* Staged File Attachments */}
                    {stagedAttachments.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-2">
                            {stagedAttachments.map(att => (
                                <div
                                    key={att.id}
                                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200"
                                >
                                    <span className="truncate max-w-[160px]">{att.name}</span>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setStagedAttachments(prev => prev.filter(x => x.id !== att.id))
                                        }
                                        className="text-slate-400 hover:text-rose-500"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Upload Progress */}
                    {isUploading && (
                        <div className="mb-2 flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                            <Loader2 size={13} className="animate-spin" />
                            <span>Uploading file ({Math.round(uploadProgress)}%)...</span>
                        </div>
                    )}

                    {/* Form with IME-safe Enter submit and field-sizing: content */}
                    <form ref={formRef} onSubmit={handleSendMessage} className="space-y-2">
                        <label htmlFor={chatInputId} className="sr-only">
                            Message #{activeChannel ? getChannelDisplayName(activeChannel) : 'channel'}
                        </label>
                        <div className="flex items-end gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500">
                            <textarea
                                id={chatInputId}
                                ref={textareaRef}
                                rows={1}
                                value={messageText}
                                onChange={handleTextChange}
                                onKeyDown={handleTextareaKeyDown}
                                onPaste={handlePaste}
                                placeholder={`Message #${
                                    activeChannel ? getChannelDisplayName(activeChannel) : 'chat'
                                }... (Use /lapsed for widgets, #Name for people, @PastorAI)`}
                                style={{ fieldSizing: 'content' } as React.CSSProperties}
                                className="flex-1 w-full h-auto min-h-[1.75rem] max-h-32 bg-transparent text-xs font-medium text-slate-900 dark:text-white placeholder-slate-400 outline-none resize-none leading-relaxed"
                            />
                            <button
                                type="submit"
                                disabled={
                                    !messageText.trim() && !pendingWidget && stagedAttachments.length === 0
                                }
                                className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white transition shrink-0 shadow-xs"
                                title="Send message (Enter)"
                            >
                                <Send size={14} />
                            </button>
                        </div>

                        {/* Composer Action Toolbar */}
                        <div className="flex items-center justify-between gap-2 px-1">
                            <div className="flex items-center gap-1 flex-wrap">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    className="hidden"
                                    onChange={e => e.target.files && handleUploadFiles(e.target.files)}
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-slate-500 hover:text-indigo-600 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
                                    title="Upload Pictures or Files"
                                >
                                    <Paperclip size={13} />
                                    <span>Upload</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={openFileLibrary}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-slate-500 hover:text-indigo-600 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
                                    title="Attach from Church File Manager"
                                >
                                    <FolderOpen size={13} />
                                    <span>Church Files</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setShowWidgetPicker(true)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 transition"
                                    title="Add Interactive Widget (Lapsed Donors, At-Risk List, etc.)"
                                >
                                    <Sparkles size={13} />
                                    <span>Add Widget</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setMessageText(prev => `${prev}${prev.endsWith(' ') || !prev ? '' : ' '}@PastorAI `);
                                        textareaRef.current?.focus();
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-slate-800 transition"
                                    title="Ask @PastorAI in this conversation"
                                >
                                    <AtSign size={13} />
                                    <span>PastorAI</span>
                                </button>
                            </div>

                            <span className="hidden sm:inline text-[10px] text-slate-400">
                                <strong>Enter</strong> to send • <strong>Shift+Enter</strong> new line
                            </span>
                        </div>
                    </form>
                </div>
            </div>

            {/* ── RIGHT INSPECTOR: CHANNEL ACCESS, PARTICIPANTS & SHARED FILES ── */}
            {!isCompactDrawer && showRightInspector && activeChannel && (
                <aside className="w-72 shrink-0 border-l border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 flex flex-col h-full overflow-y-auto p-4 space-y-6">
                    {/* Access & Security Card */}
                    <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-2">
                        <div className="flex items-center gap-2">
                            {activeChannel.requiredArea ? (
                                <Lock size={14} className="text-amber-500" />
                            ) : (
                                <Users size={14} className="text-indigo-500" />
                            )}
                            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                {activeChannel.requiredArea ? 'Role-Gated Channel' : 'Channel Access'}
                            </h4>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                            {activeChannel.requiredArea
                                ? `Only staff with ${activeChannel.requiredArea.toUpperCase()} permissions (or Pastor / Admin) can see or join this conversation.`
                                : activeChannel.type === 'direct'
                                ? 'Private direct message conversation between the participants below.'
                                : 'Open to authorized staff members in your church.'}
                        </p>
                    </div>

                    {/* Authorized Participants */}
                    <div>
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                            Authorized Members ({activeParticipants.length})
                        </h4>
                        <div className="space-y-1.5">
                            {activeParticipants.map(member => (
                                <div
                                    key={member.id}
                                    className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-[10px] font-black flex items-center justify-center shrink-0">
                                            {member.name.charAt(0)}
                                        </div>
                                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                                            {member.name}
                                        </span>
                                    </div>
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 truncate max-w-[90px]">
                                        {member.roles[0] || 'Staff'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Shared Files & Pictures */}
                    <div>
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                            Shared Files & Pictures ({sharedChannelFiles.length})
                        </h4>
                        {sharedChannelFiles.length === 0 ? (
                            <p className="text-[11px] text-slate-400 italic">
                                No files or images shared in this conversation yet.
                            </p>
                        ) : (
                            <div className="space-y-1.5">
                                {sharedChannelFiles.map(att => (
                                    <a
                                        key={att.id}
                                        href={att.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-indigo-400 transition"
                                    >
                                        <span className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true">{att.kind === 'image' ? <ImageIcon size={14} /> : <FileText size={14} />}</span>
                                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate flex-1">
                                            {att.name}
                                        </span>
                                        <ExternalLink size={11} className="text-slate-400 shrink-0" />
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                </aside>
            )}

            {/* ── WIDGET PICKER MODAL ─────────────────────────────────────────── */}
            <ChatWidgetPickerModal
                isOpen={showWidgetPicker}
                onClose={() => setShowWidgetPicker(false)}
                currentUser={user}
                activeChannel={activeChannel}
                allUsers={churchUsers}
                onSelectWidget={(widgetId, _area, switchToRoleChannelArea) => {
                    const built = buildChatWidgetAttachment(widgetId, {
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
                    });
                    if (switchToRoleChannelArea) {
                        const targetChan = channels.find(
                            c => c.type === 'department' && c.requiredArea === switchToRoleChannelArea
                        );
                        if (targetChan) setActiveChannelId(targetChan.id);
                    }
                    setPendingWidget(built);
                }}
            />

            {/* ── CREATE NEW CHANNEL / ROLE-GATED THREAD MODAL ────────────────── */}
            {showNewChannelModal && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-black text-slate-900 dark:text-white">
                                    New Channel or Topic Thread
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Restrict by ministry permission (e.g. Giving Only) or invite specific staff
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowNewChannelModal(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400"
                            >
                                <X size={15} />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                    Channel / Topic Name
                                </label>
                                <input
                                    type="text"
                                    value={newChanName}
                                    onChange={e => setNewChanName(e.target.value)}
                                    placeholder="e.g. q4-lapsed-donors or stewardship-team"
                                    className="w-full px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                    Role Permission Gate (Who can see & join?)
                                </label>
                                <select
                                    value={newChanRequiredArea}
                                    onChange={e => setNewChanRequiredArea(e.target.value as any)}
                                    className="w-full px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="all">All Staff Members</option>
                                    {canReadArea(user, 'giving') && (
                                        <option value="giving">
                                            Giving &amp; Finance Access Only (Hides from non-Giving users)
                                        </option>
                                    )}
                                    {canReadArea(user, 'care') && (
                                        <option value="care">Pastoral Care Access Only</option>
                                    )}
                                    {canReadArea(user, 'people') && (
                                        <option value="people">People Access Only</option>
                                    )}
                                    {canReadArea(user, 'groups') && (
                                        <option value="groups">Groups Access Only</option>
                                    )}
                                    {canReadArea(user, 'services') && (
                                        <option value="services">Services Access Only</option>
                                    )}
                                </select>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                    Description (Optional)
                                </label>
                                <input
                                    type="text"
                                    value={newChanDesc}
                                    onChange={e => setNewChanDesc(e.target.value)}
                                    placeholder="What is this conversation about?"
                                    className="w-full px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-white outline-none"
                                />
                            </div>

                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
                                <input
                                    type="checkbox"
                                    checked={newChanIsPrivate}
                                    onChange={e => setNewChanIsPrivate(e.target.checked)}
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span>Invite specific teammates only (instead of auto-joining all matching roles)</span>
                            </label>

                            {newChanIsPrivate && (
                                <div className="max-h-36 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl p-2 space-y-1">
                                    {churchUsers
                                        .filter(
                                            u =>
                                                u.id !== user.id &&
                                                (newChanRequiredArea === 'all' ||
                                                    canReadArea(u, newChanRequiredArea as DashboardArea))
                                        )
                                        .map(u => {
                                            const checked = newChanSelectedUsers.includes(u.id);
                                            return (
                                                <label
                                                    key={u.id}
                                                    className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-xs"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() =>
                                                                setNewChanSelectedUsers(prev =>
                                                                    checked
                                                                        ? prev.filter(id => id !== u.id)
                                                                        : [...prev, u.id]
                                                                )
                                                            }
                                                        />
                                                        <span className="font-bold text-slate-800 dark:text-slate-200">
                                                            {u.name}
                                                        </span>
                                                    </div>
                                                    <span className="text-[10px] text-slate-400">
                                                        {u.roles.slice(0, 2).join(', ')}
                                                    </span>
                                                </label>
                                            );
                                        })}
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowNewChannelModal(false)}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={!newChanName.trim()}
                                onClick={async () => {
                                    await createCustomChannel({
                                        name: newChanName,
                                        description: newChanDesc,
                                        requiredArea:
                                            newChanRequiredArea === 'all' ? undefined : newChanRequiredArea,
                                        isAutoJoinedByRole: !newChanIsPrivate,
                                        participantIds: newChanSelectedUsers,
                                    });
                                    setNewChanName('');
                                    setNewChanDesc('');
                                    setNewChanSelectedUsers([]);
                                    setShowNewChannelModal(false);
                                }}
                                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold transition"
                            >
                                Create Channel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── START DIRECT MESSAGE / GROUP DM MODAL ───────────────────────── */}
            {showNewDmModal && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-black text-slate-900 dark:text-white">
                                    New Direct Message
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Select 1 or more staff members (role badges shown for permission clarity)
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowNewDmModal(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400"
                            >
                                <X size={15} />
                            </button>
                        </div>

                        <input
                            type="text"
                            value={dmSearch}
                            onChange={e => setDmSearch(e.target.value)}
                            placeholder="Search staff by name or role..."
                            className="w-full px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white outline-none"
                        />

                        <div className="max-h-60 overflow-y-auto space-y-1">
                            {churchUsers
                                .filter(
                                    u =>
                                        u.id !== user.id &&
                                        (u.name.toLowerCase().includes(dmSearch.toLowerCase()) ||
                                            u.roles.some(r => r.toLowerCase().includes(dmSearch.toLowerCase())))
                                )
                                .map(u => {
                                    const selected = dmSelectedUsers.includes(u.id);
                                    return (
                                        <label
                                            key={u.id}
                                            className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition ${
                                                selected
                                                    ? 'bg-indigo-50/80 border-indigo-300 dark:bg-indigo-950/40 dark:border-indigo-700'
                                                    : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <input
                                                    type="checkbox"
                                                    checked={selected}
                                                    onChange={() =>
                                                        setDmSelectedUsers(prev =>
                                                            selected
                                                                ? prev.filter(id => id !== u.id)
                                                                : [...prev, u.id]
                                                        )
                                                    }
                                                />
                                                <div>
                                                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                                                        {u.name}
                                                    </p>
                                                    <p className="text-[10px] text-slate-400">{u.email}</p>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-1 justify-end max-w-[140px]">
                                                {u.roles.slice(0, 2).map(r => (
                                                    <span
                                                        key={r}
                                                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                                            r === 'Giving' || r === 'Finance'
                                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                                        }`}
                                                    >
                                                        {r}
                                                    </span>
                                                ))}
                                            </div>
                                        </label>
                                    );
                                })}
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowNewDmModal(false)}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={dmSelectedUsers.length === 0}
                                onClick={async () => {
                                    const targets = churchUsers.filter(u => dmSelectedUsers.includes(u.id));
                                    await startDirectMessage(targets);
                                    setDmSelectedUsers([]);
                                    setShowNewDmModal(false);
                                }}
                                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold transition"
                            >
                                Start Conversation
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── CHURCH FILE MANAGER PICKER MODAL ────────────────────────────── */}
            {showFileLibraryModal && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-lg p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-black text-slate-900 dark:text-white">
                                    Attach from Church File Library
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Select any uploaded image or document from your church File Manager
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowFileLibraryModal(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400"
                            >
                                <X size={15} />
                            </button>
                        </div>

                        <div className="max-h-72 overflow-y-auto space-y-2">
                            {loadingTenantFiles ? (
                                <div className="py-10 text-center text-xs text-slate-400">
                                    Loading church files...
                                </div>
                            ) : tenantFiles.length === 0 ? (
                                <div className="py-10 text-center text-xs text-slate-400">
                                    No files in your Church File Library yet.
                                </div>
                            ) : (
                                tenantFiles.map(tf => {
                                    const isImg = (tf.mimeType || '').startsWith('image/');
                                    return (
                                        <div
                                            key={tf.id}
                                            className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-indigo-400 transition"
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                {isImg ? (
                                                    <img
                                                        src={tf.publicUrl}
                                                        alt={tf.originalName}
                                                        className="w-10 h-10 rounded-xl object-cover shrink-0"
                                                    />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-slate-800 flex items-center justify-center text-indigo-600 shrink-0">
                                                        <FileText size={18} />
                                                    </div>
                                                )}
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                                        {tf.originalName}
                                                    </p>
                                                    <p className="flex items-center gap-1 text-[10px] text-slate-400">
                                                        {tf.folder && <><Folder size={10} aria-hidden="true" />{`${tf.folder} • `}</>}
                                                        {Math.max(1, Math.round((tf.sizeBytes || 0) / 1024))} KB
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setStagedAttachments(prev => [
                                                        ...prev,
                                                        {
                                                            id: tf.id,
                                                            kind: isImg ? 'image' : 'document',
                                                            name: tf.originalName,
                                                            mimeType: tf.mimeType,
                                                            sizeBytes: tf.sizeBytes,
                                                            url: tf.publicUrl,
                                                            gcsPath: tf.gcsPath,
                                                            tenantFileId: tf.id,
                                                        },
                                                    ]);
                                                    setShowFileLibraryModal(false);
                                                }}
                                                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shrink-0"
                                            >
                                                Attach
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── IMAGE LIGHTBOX ──────────────────────────────────────────────── */}
            {lightboxImageUrl && (
                <div
                    className="fixed inset-0 z-[140] bg-black/85 flex items-center justify-center p-4"
                    onClick={() => setLightboxImageUrl(null)}
                >
                    <button
                        type="button"
                        onClick={() => setLightboxImageUrl(null)}
                        className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                    >
                        <X size={20} />
                    </button>
                    <img
                        src={lightboxImageUrl}
                        alt="Full size preview"
                        className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl object-contain"
                        onClick={e => e.stopPropagation()}
                    />
                </div>
            )}
        </div>
    );
};
