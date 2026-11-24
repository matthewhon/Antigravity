import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db as firebaseDb, storage } from '../../services/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import {
    collection, doc, onSnapshot, updateDoc,
    query, where, orderBy, limit, limitToLast, getDocs, getDoc, setDoc,
    arrayUnion, arrayRemove
} from 'firebase/firestore';
import { SmsConversation, SmsMessage, SmsTag, Church, User, TwilioPhoneNumber, SmsAiSuggestion } from '../../types';
import {
    MessageSquare, Send, Plus, ArrowLeft, Loader2, X,
    Phone, Search, AlertTriangle, Inbox, MessageCircle,
    Smile, Image as ImageIcon, Sparkles, ChevronRight,
    Tag, ExternalLink, Paperclip, Music, Film, IdCard,
    CircleCheck, CircleX, Ban, Check, HandHeart, FileText, CheckCircle
} from 'lucide-react';
import { ToolHeader } from '../tool-shell';
import { useSignalWireVoice } from '../../hooks/useSignalWireVoice';
import { VoiceSoftphone } from '../VoiceSoftphone';
import { formatPhone } from './smsUtils';
import { Toast } from './Toast';
import { canUserUseFeature } from './NumberManager';
import { compressSmsImage, COMMON_EMOJIS, TAG_COLOR_MAP, shortenSms, timeAgo } from './smsHelpers';
import { SmsTagChip } from './SmsTagChip';
import { NewMessageComposer } from './CampaignsSection';

const API_BASE = '';

const ThreadImageAttachment: React.FC<{
    index: number;
    targetUrl: string;
    rawUrl: string;
    onExpand: () => void;
}> = ({ index, targetUrl, onExpand }) => {
    const [hasError, setHasError] = useState(false);

    if (hasError) {
        return (
            <a
                href={targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:opacity-90 transition"
            >
                <Paperclip size={12} aria-hidden="true" /> Media {index + 1} <ExternalLink size={11} aria-hidden="true" />
            </a>
        );
    }

    return (
        <button
            type="button"
            onClick={onExpand}
            title="Click to expand image"
            className="block relative max-w-[240px] sm:max-w-[300px] rounded-xl overflow-hidden border border-slate-200/50 dark:border-slate-700/50 bg-slate-900/5 hover:opacity-95 transition-all shadow-sm text-left shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
            <img
                src={targetUrl}
                alt={`MMS attachment ${index + 1}`}
                className="w-full max-h-60 object-cover cursor-pointer"
                onError={() => setHasError(true)}
            />
        </button>
    );
};

export const SmsInbox: React.FC<{
    churchId: string;
    currentUser: User;
    church: Church;
    activeNumber?: TwilioPhoneNumber | null;
    twilioNumberId?: string | null;
    isDefaultNumber?: boolean;
    allowedNumberIds?: string[];
    defaultNumberId?: string | null;
}> = ({ churchId, currentUser, church, activeNumber, twilioNumberId, isDefaultNumber, allowedNumberIds = [], defaultNumberId = null }) => {
    const [conversations, setConversations] = useState<SmsConversation[]>([]);
    const [activeConv, setActiveConv] = useState<SmsConversation | null>(null);
    const [messages, setMessages] = useState<SmsMessage[]>([]);
    const [replyBody, setReplyBody] = useState('');
    const [showReplyEmojis, setShowReplyEmojis] = useState(false);
    const replyTextareaRef = useRef<HTMLTextAreaElement>(null);

    const insertAtReplyCursor = (text: string) => {
        const el = replyTextareaRef.current;
        const currentVal = replyBody;
        if (!el) {
            setReplyBody(currentVal + text);
            return;
        }
        const start = el.selectionStart ?? currentVal.length;
        const end = el.selectionEnd ?? start;
        const before = currentVal.slice(0, start);
        const after = currentVal.slice(end);
        const newVal = before + text + after;
        setReplyBody(newVal);
        requestAnimationFrame(() => {
            el.focus();
            const pos = start + text.length;
            el.setSelectionRange(pos, pos);
        });
    };
    const [replyMediaUrl, setReplyMediaUrl] = useState('');
    const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
    const [replyUploading, setReplyUploading] = useState(false);
    const [replyUploadPct, setReplyUploadPct] = useState(0);
    const replyFileRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [loadingMsgs, setLoadingMsgs] = useState(false);

    const [messageLimit, setMessageLimit] = useState(30);
    const [hasMoreMessages, setHasMoreMessages] = useState(true);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const prevScrollHeightRef = useRef<number>(0);
    const prevFirstMsgIdRef = useRef<string | null>(null);
    const lastRenderedConvIdRef = useRef<string | null>(null);
    const [isSending, setIsSending] = useState(false);
    const [search, setSearch] = useState('');
    const [limitCount, setLimitCount] = useState(100);
    const [searchedConversations, setSearchedConversations] = useState<SmsConversation[]>([]);
    const [, setSearchLoading] = useState(false);
    const [showComposer, setShowComposer] = useState(false);

    const [tags, setTags] = useState<SmsTag[]>([]);
    const [tagFilter, setTagFilter] = useState<string | null>(null);
    const [showTagPicker, setShowTagPicker] = useState(false);

    const [aiSuggestions, setAiSuggestions] = useState<SmsAiSuggestion[]>([]);
    const [aiGenerating, setAiGenerating] = useState(false);
    const smsAgentEnabled = activeNumber
        ? (activeNumber.smsAgentEnabled !== undefined ? activeNumber.smsAgentEnabled : !!(church.smsSettings?.smsAgentEnabled))
        : !!(church.smsSettings?.smsAgentEnabled);
    const userCanUseAiAgent = canUserUseFeature(activeNumber, currentUser, 'aiAgentUserIds');

    const [inboxToast, setInboxToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const voiceAddonEnabled = Boolean(church.voiceAddOn?.enabled);
    const voice = useSignalWireVoice({ churchId: church.id, voiceAddonEnabled });
    const showInboxToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setInboxToast({ msg, type });
        setTimeout(() => setInboxToast(null), 4000);
    };

    useEffect(() => {
        const q = query(
            collection(firebaseDb, 'smsTags'),
            where('churchId', '==', churchId),
            orderBy('createdAt', 'asc')
        );
        return onSnapshot(q, snap => {
            setTags(snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsTag)));
        });
    }, [churchId]);

    useEffect(() => {
        const baseQ = query(
            collection(firebaseDb, 'smsConversations'),
            where('churchId', '==', churchId),
            orderBy('lastMessageAt', 'desc'),
            limit(limitCount)
        );
        const unsub = onSnapshot(baseQ, snap => {
            const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsConversation));

            const filtered = all.filter(c => {
                const convNumberId = (c as any).smsNumberId || (c as any).inboxId || c.twilioNumberId || null;

                const userHasAccessToNumber = (() => {
                    if (!convNumberId) {
                        return defaultNumberId ? (allowedNumberIds || []).includes(defaultNumberId) : false;
                    }
                    return (allowedNumberIds || []).includes(convNumberId);
                })();
                if (!userHasAccessToNumber) return false;

                if (twilioNumberId) {
                    if (!convNumberId) {
                        return !!isDefaultNumber;
                    }
                    return convNumberId === twilioNumberId;
                }

                return true;
            });
            setConversations(filtered);
        });
        return unsub;
    }, [churchId, twilioNumberId, allowedNumberIds, defaultNumberId, isDefaultNumber, currentUser.roles, limitCount]);

    useEffect(() => {
        const queryTerm = search.trim();
        if (queryTerm.length < 2) {
            setSearchedConversations([]);
            return;
        }

        const delayDebounceFn = setTimeout(async () => {
            setSearchLoading(true);
            try {
                const resultsMap = new Map<string, SmsConversation>();

                const col = collection(firebaseDb, 'people');
                const isPhone = /^[\d\s+()\-]{4,}$/.test(queryTerm);
                const qLower = queryTerm.toLowerCase();
                const qCleanPhone = queryTerm.replace(/\D/g, '');

                const queries: Promise<any>[] = [];
                if (isPhone) {
                    queries.push(
                        getDocs(query(col, where('churchId', '==', churchId), where('phone', '>=', queryTerm), where('phone', '<=', queryTerm + '\uffff'), limit(20)))
                    );
                } else {
                    const qCap = queryTerm.charAt(0).toUpperCase() + queryTerm.slice(1).toLowerCase();
                    queries.push(
                        getDocs(query(col, where('churchId', '==', churchId), where('name', '>=', queryTerm), where('name', '<=', queryTerm + '\uffff'), limit(20))),
                        getDocs(query(col, where('churchId', '==', churchId), where('name', '>=', qCap), where('name', '<=', qCap + '\uffff'), limit(20))),
                        getDocs(query(col, where('churchId', '==', churchId), where('nameLower', '>=', qLower), where('nameLower', '<=', qLower + '\uffff'), limit(20)))
                    );
                }

                const searchSnapshots = await Promise.allSettled(queries);
                const matchedPhones = new Set<string>();

                if (isPhone && qCleanPhone.length >= 7) {
                    matchedPhones.add(queryTerm.startsWith('+') ? queryTerm : `+1${qCleanPhone}`);
                }

                searchSnapshots.forEach(r => {
                    if (r.status !== 'fulfilled') return;
                    r.value.docs.forEach((d: any) => {
                        const p = d.data();
                        if (p.phone) {
                            const cleaned = p.phone.trim();
                            if (cleaned) matchedPhones.add(cleaned);
                        }
                    });
                });

                if (matchedPhones.size > 0) {
                    const fetchPromises: Promise<any>[] = [];
                    const phonesArray = Array.from(matchedPhones).slice(0, 10);

                    phonesArray.forEach(phone => {
                        const phoneClean = phone.replace(/\+/g, '');
                        const ids: string[] = [];
                        if (twilioNumberId) {
                            ids.push(`${churchId}_${twilioNumberId}_${phoneClean}`);
                        }
                        if (allowedNumberIds && allowedNumberIds.length > 0) {
                            allowedNumberIds.forEach(numId => {
                                ids.push(`${churchId}_${numId}_${phoneClean}`);
                            });
                        }
                        ids.push(`${churchId}_${phoneClean}`);

                        ids.forEach(id => {
                            fetchPromises.push(
                                getDoc(doc(firebaseDb, 'smsConversations', id))
                            );
                        });
                    });

                    const docSnapshots = await Promise.allSettled(fetchPromises);
                    docSnapshots.forEach(r => {
                        if (r.status === 'fulfilled' && r.value.exists()) {
                            const rawData = r.value.data() || {};
                            if (rawData.churchId === churchId) {
                                const convNumberId = rawData.smsNumberId || rawData.inboxId || rawData.twilioNumberId || null;
                                const userHasAccess = !convNumberId || (allowedNumberIds || []).includes(convNumberId);
                                const matchesActiveNumber = !twilioNumberId || convNumberId === twilioNumberId || (convNumberId === null && isDefaultNumber);

                                if (userHasAccess && matchesActiveNumber) {
                                    resultsMap.set(r.value.id, { id: r.value.id, ...rawData } as SmsConversation);
                                }
                            }
                        }
                    });
                }

                setSearchedConversations(Array.from(resultsMap.values()));
            } catch (err) {
                console.error("Error searching all conversations:", err);
            } finally {
                setSearchLoading(false);
            }
        }, 400);

        return () => clearTimeout(delayDebounceFn);
    }, [search, churchId, twilioNumberId, allowedNumberIds, isDefaultNumber]);

    useEffect(() => {
        const handleSelectDeepLink = () => {
            const params = new URLSearchParams(window.location.search);
            const urlConvId = params.get('conversationId');
            if (urlConvId && conversations.length > 0) {
                const found = conversations.find(c => c.id === urlConvId);
                if (found && (!activeConv || activeConv.id !== found.id)) {
                    setActiveConv(found);
                }
            }
        };

        handleSelectDeepLink();

        window.addEventListener('popstate', handleSelectDeepLink);
        window.addEventListener('focus', handleSelectDeepLink);
        return () => {
            window.removeEventListener('popstate', handleSelectDeepLink);
            window.removeEventListener('focus', handleSelectDeepLink);
        };
    }, [conversations, activeConv]);

    useEffect(() => {
        if (!activeConv) {
            setMessages([]);
            return;
        }
        setMessageLimit(30);
        setHasMoreMessages(true);
        setLoadingMsgs(true);
        setMessages([]);
        prevFirstMsgIdRef.current = null;
        prevScrollHeightRef.current = 0;
    }, [activeConv?.id]);

    useEffect(() => {
        if (!activeConv) return;

        const q = query(
            collection(firebaseDb, 'smsConversations', activeConv.id, 'messages'),
            orderBy('createdAt', 'asc'),
            limitToLast(messageLimit)
        );
        const unsub = onSnapshot(q, snap => {
            const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsMessage));

            if (fetched.length < messageLimit) {
                setHasMoreMessages(false);
            } else {
                setHasMoreMessages(true);
            }

            setMessages(fetched);
            setLoadingMsgs(false);
        });

        updateDoc(doc(firebaseDb, 'smsConversations', activeConv.id), { unreadCount: 0 }).catch(() => { });

        const sugQ = query(
            collection(firebaseDb, 'smsConversations', activeConv.id, 'aiSuggestions'),
            where('status', '==', 'pending'),
            orderBy('createdAt', 'desc'),
            limit(3)
        );
        const unsubSug = onSnapshot(sugQ, snap => {
            setAiSuggestions(snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsAiSuggestion)));
        }, () => setAiSuggestions([]));

        return () => { unsub(); unsubSug(); };
    }, [activeConv?.id, messageLimit]);

    React.useLayoutEffect(() => {
        const container = messagesContainerRef.current;
        if (!container || messages.length === 0) return;

        const activeId = activeConv?.id || null;
        const isNewConv = lastRenderedConvIdRef.current !== activeId;
        const currentFirstMsgId = messages[0]?.id || null;

        if (isNewConv) {
            container.scrollTop = container.scrollHeight;
            lastRenderedConvIdRef.current = activeId;
            prevFirstMsgIdRef.current = currentFirstMsgId;
            prevScrollHeightRef.current = container.scrollHeight;
            return;
        }

        if (prevFirstMsgIdRef.current && prevFirstMsgIdRef.current !== currentFirstMsgId) {
            const scrollDiff = container.scrollHeight - prevScrollHeightRef.current;
            container.scrollTop = container.scrollTop + scrollDiff;

            prevFirstMsgIdRef.current = currentFirstMsgId;
            prevScrollHeightRef.current = container.scrollHeight;
            return;
        }

        const lastMsg = messages[messages.length - 1];
        const isOutbound = lastMsg?.direction === 'outbound';
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;

        if (isNearBottom || isOutbound) {
            container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        }

        prevFirstMsgIdRef.current = currentFirstMsgId;
        prevScrollHeightRef.current = container.scrollHeight;
    }, [messages, activeConv?.id]);

    const handleScroll = () => {
        const container = messagesContainerRef.current;
        if (!container || !hasMoreMessages || loadingMsgs) return;

        if (container.scrollTop <= 5) {
            prevScrollHeightRef.current = container.scrollHeight;
            if (messages.length > 0) {
                prevFirstMsgIdRef.current = messages[0].id;
            }
            setMessageLimit(prev => prev + 30);
        }
    };

    const handleAiSuggest = async () => {
        if (!activeConv || aiGenerating) return;
        setAiGenerating(true);
        try {
            const { getDoc: gd, doc: dd } = await import('firebase/firestore');
            const kbSnap = await gd(dd(firebaseDb, 'smsAgentKnowledge', churchId));
            const kb = kbSnap.exists() ? (kbSnap.data() as Record<string, string>) : {};

            const kbText = [
                kb.address && `Address: ${kb.address}`,
                kb.serviceTimes && `Service Times: ${kb.serviceTimes}`,
                kb.pastor && `Lead Pastor: ${kb.pastor}`,
                kb.ministries && `Ministries: ${kb.ministries}`,
                kb.classes && `Classes/Groups: ${kb.classes}`,
                kb.locations && `Locations: ${kb.locations}`,
                kb.website && `Website: ${kb.website}`,
                kb.phone && `Phone: ${kb.phone}`,
                kb.customFacts && kb.customFacts,
            ].filter(Boolean).join('\n');

            const recent = messages.slice(-6).map(m =>
                `${m.direction === 'inbound' ? 'Contact' : 'Staff'}: ${m.body}`
            ).join('\n');

            const systemInstruction = `You are a helpful, friendly church staff assistant.
Your job is to draft a single short SMS reply (under 160 characters if possible) on behalf of the church staff.
Be warm, concise, and pastoral in tone.
Do not make up information. Only use the church facts provided.

CHURCH FACTS:\n${kbText || 'No facts provided.'}`;

            const { getAuthJsonHeaders } = await import('../../services/authHeaders');
            const res = await fetch('/ai/generate', {
                method: 'POST',
                headers: await getAuthJsonHeaders(),
                body: JSON.stringify({
                    prompt: `Conversation:\n${recent}\n\nWrite a helpful SMS reply from the church staff:`,
                    systemInstruction,
                    model: 'gemini-2.5-flash',
                }),
            });
            const data = await res.json();
            if (data.text) setReplyBody(data.text.trim());
        } catch {
        } finally {
            setAiGenerating(false);
        }
    };

    const handleAiShorten = async () => {
        if (!replyBody.trim() || aiGenerating) return;
        setAiGenerating(true);
        try {
            const shortened = await shortenSms(replyBody, churchId);
            if (shortened) setReplyBody(shortened);
        } catch {
        } finally {
            setAiGenerating(false);
        }
    };

    const handleToggleConvTag = async (conv: SmsConversation, tagId: string) => {
        const isOn = (conv.tags || []).includes(tagId);
        const next = isOn
            ? (conv.tags || []).filter(t => t !== tagId)
            : [...(conv.tags || []), tagId];
        if (activeConv?.id === conv.id) {
            setActiveConv(prev => prev ? { ...prev, tags: next } : prev);
        }
        try {
            await updateDoc(
                doc(firebaseDb, 'smsConversations', conv.id),
                { tags: isOn ? arrayRemove(tagId) : arrayUnion(tagId) }
            );

            if (!isOn) {
                const tagObj = tags.find(t => t.id === tagId);
                if (tagObj?.autoReplyMessage?.trim()) {
                    try {
                        await fetch(`${API_BASE}/api/messaging/send-individual`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                churchId,
                                toPhone: conv.phoneNumber,
                                body: tagObj.autoReplyMessage.trim(),
                                sentBy: null,
                                sentByName: `Auto-Reply (${tagObj.name})`,
                            }),
                        });
                    } catch (replyErr: any) {
                        console.warn('[Tags] Failed to send tag auto-reply:', replyErr);
                    }
                }
            }
        } catch (err: any) {
            if (activeConv?.id === conv.id) {
                setActiveConv(prev => prev ? { ...prev, tags: conv.tags || [] } : prev);
            }
            showInboxToast('Failed to save tag: ' + (err?.message || 'Unknown error'), 'error');
        }
    };

    const handleSidebarScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        if (target.scrollHeight - target.scrollTop <= target.clientHeight + 50) {
            setLimitCount(prev => prev + 100);
        }
    };

    const allConversations = useMemo(() => {
        const seen = new Set<string>();
        const merged: SmsConversation[] = [];

        conversations.forEach(c => {
            if (!seen.has(c.id)) {
                seen.add(c.id);
                merged.push(c);
            }
        });

        searchedConversations.forEach(c => {
            if (!seen.has(c.id)) {
                seen.add(c.id);
                merged.push(c);
            }
        });

        return merged.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
    }, [conversations, searchedConversations]);

    const filtered = allConversations.filter(c => {
        const matchSearch = !search || c.phoneNumber.includes(search) || (c.personName || '').toLowerCase().includes(search.toLowerCase());
        const isPrayerFilter = tags.some(t => t.id === tagFilter && t.name === 'Needs Prayer');
        const matchTag = !tagFilter || (
            (c.tags || []).includes(tagFilter) && (!isPrayerFilter || c.lastMessageDirection === 'inbound')
        );
        return matchSearch && matchTag;
    });

    const uploadReplyImage = async (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const path = `sms-media/${churchId}/${Date.now()}_${cleanName}`;
            const fileRef = storageRef(storage, path);
            const task = uploadBytesResumable(fileRef, file);
            task.on('state_changed',
                snap => setReplyUploadPct(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
                err => reject(err),
                () => getDownloadURL(task.snapshot.ref).then(resolve).catch(reject)
            );
        });
    };

    const handleReplyFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setReplyUploading(true);
        setReplyUploadPct(0);
        try {
            const fileToUpload = file.type.startsWith('image/') ? await compressSmsImage(file) as File : file;
            const url = await uploadReplyImage(fileToUpload);
            setReplyMediaUrl(url);
        } catch {
            showInboxToast('Image upload failed. Please try again.', 'error');
        } finally {
            setReplyUploading(false);
            if (replyFileRef.current) replyFileRef.current.value = '';
        }
    };

    const handleSendReply = async () => {
        const hasBody = !!replyBody.trim();
        const hasMedia = !!replyMediaUrl;
        if ((!hasBody && !hasMedia) || !activeConv || isSending) return;
        setIsSending(true);
        try {
            if (currentUser.email === 'test@test.com') {
                const now = Date.now();
                const msgRef = doc(collection(firebaseDb, `smsConversations/${activeConv.id}/messages`));
                await setDoc(msgRef, {
                    id: msgRef.id,
                    conversationId: activeConv.id,
                    churchId,
                    direction: 'outbound',
                    body: replyBody || '',
                    status: 'delivered',
                    sentBy: currentUser.id,
                    sentByName: currentUser.name,
                    mediaUrls: replyMediaUrl ? [replyMediaUrl] : [],
                    messageSid: `SM_demo_${msgRef.id}`,
                    createdAt: now,
                    deliveredAt: now + 500,
                });
                await updateDoc(doc(firebaseDb, 'smsConversations', activeConv.id), {
                    lastMessageBody: replyBody || '📎 Media',
                    lastMessageDirection: 'outbound',
                    lastMessageAt: now,
                    unreadCount: 0,
                });
                setReplyBody('');
                setReplyMediaUrl('');
                return;
            }

            const convNumberId = (activeConv as any).twilioNumberId
                || (activeConv as any).smsNumberId
                || (activeConv as any).inboxId
                || null;
            const resolvedNumberId = twilioNumberId || convNumberId;

            const payload: Record<string, any> = {
                churchId,
                toPhone: activeConv.phoneNumber,
                body: replyBody,
                sentBy: currentUser.id,
                sentByName: currentUser.name,
                conversationId: activeConv.id,
            };
            if (resolvedNumberId) payload.twilioNumberId = resolvedNumberId;
            if (hasMedia) payload.mediaUrls = [replyMediaUrl];
            const res = await fetch(`${API_BASE}/api/messaging/send-individual`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Send failed');

            const prayerTag = tags.find(t => t.name === 'Needs Prayer');
            if (prayerTag && (activeConv.tags || []).includes(prayerTag.id)) {
                setActiveConv(prev => prev ? {
                    ...prev,
                    tags: (prev.tags || []).filter(id => id !== prayerTag.id),
                    lastMessageDirection: 'outbound',
                } : prev);
                updateDoc(doc(firebaseDb, 'smsConversations', activeConv.id), {
                    tags: arrayRemove(prayerTag.id),
                    prayerFollowUpState: null,
                }).catch(() => {});
            }

            setReplyBody('');
            setReplyMediaUrl('');
        } catch (e: any) {
            alert('Failed to send: ' + e.message);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="flex h-full min-h-0">
            {inboxToast && <Toast msg={inboxToast.msg} type={inboxToast.type} onClose={() => setInboxToast(null)} />}
            {voiceAddonEnabled && (
                <VoiceSoftphone
                    activeCall={voice.activeCall}
                    incomingCall={voice.incomingCall}
                    onAnswer={voice.answer}
                    onReject={voice.reject}
                    onHangup={voice.hangup}
                    onToggleMute={voice.toggleMute}
                    onSendDtmf={voice.sendDtmf}
                />
            )}
            {showComposer && (
                <NewMessageComposer
                    churchId={churchId}
                    church={church}
                    currentUser={currentUser}
                    twilioNumberId={twilioNumberId}
                    onClose={() => setShowComposer(false)}
                    onSent={() => setShowComposer(false)}
                />
            )}

            <div className={`w-full md:w-[320px] shrink-0 border-r border-slate-200 dark:border-slate-700 flex flex-col min-h-0 bg-white dark:bg-slate-900 ${activeConv ? 'hidden md:flex' : 'flex'}`}>
                <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-3">
                        <ToolHeader
                            tool="sms"
                            variant="compact"
                            icon={Inbox}
                            title="Inbox"
                        />
                        <button
                            onClick={() => setShowComposer(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-bold uppercase tracking-wide transition shadow-sm"
                        >
                            <Plus size={12} /> New
                        </button>
                    </div>
                    <div className="relative mb-2">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>

                    {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                            <button
                                onClick={() => setTagFilter(null)}
                                className={`px-2 py-0.5 text-[10px] font-bold rounded-full border transition ${tagFilter === null
                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                        : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                                    }`}
                            >All</button>
                            {tags.map(t => {
                                const c = TAG_COLOR_MAP[t.color] || TAG_COLOR_MAP.violet;
                                const isActive = tagFilter === t.id;
                                return (
                                    <button
                                        key={t.id}
                                        onClick={() => setTagFilter(isActive ? null : t.id)}
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border transition ${isActive ? `${c.bg} ${c.text} ${c.border}` : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                                            }`}
                                    >
                                        {t.emoji && <span>{t.emoji}</span>}
                                        {t.name}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
                <div
                    className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60"
                    onScroll={handleSidebarScroll}
                >
                    {filtered.length === 0 && (
                        <div className="text-center py-12 text-slate-400">
                            <MessageCircle size={28} className="mx-auto mb-2 opacity-40" />
                            <p className="text-sm">{tagFilter ? 'No conversations with this tag' : 'No conversations yet'}</p>
                        </div>
                    )}
                    {filtered.map(conv => {
                        const isUnread = (conv.unreadCount || 0) > 0;
                        const isActive = activeConv?.id === conv.id;
                        const convTags = tags.filter(t => (conv.tags || []).includes(t.id) && (t.name !== 'Needs Prayer' || conv.lastMessageDirection === 'inbound'));
                        return (
                            <button
                                key={conv.id}
                                className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition relative ${isActive ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
                                    }`}
                                onClick={() => setActiveConv(conv)}
                            >
                                {isUnread && !isActive && (
                                    <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-indigo-500 rounded-full" />
                                )}
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        {conv.personAvatar ? (
                                            <img
                                                src={conv.personAvatar}
                                                alt={conv.personName || conv.phoneNumber}
                                                className="w-9 h-9 rounded-full object-cover shrink-0 ring-2 ring-white dark:ring-slate-900"
                                                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget.nextElementSibling as HTMLElement)!.style.display = 'flex'; }}
                                            />
                                        ) : null}
                                        <div className={`w-9 h-9 rounded-full text-indigo-600 dark:text-indigo-300 items-center justify-center font-black text-sm shrink-0 ${isUnread
                                                ? 'bg-indigo-200 dark:bg-indigo-700'
                                                : 'bg-indigo-100 dark:bg-indigo-900/40'
                                            } ${conv.personAvatar ? 'hidden' : 'flex'}`}>
                                            {(conv.personName || conv.phoneNumber).charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <p className={`text-sm truncate ${isUnread ? 'font-black text-slate-900 dark:text-white' : 'font-semibold text-slate-700 dark:text-slate-200'
                                                    }`}>{conv.personName || formatPhone(conv.phoneNumber)}</p>
                                                {convTags.some(t => t.name === 'Needs Prayer') && conv.lastMessageDirection === 'inbound' && (
                                                    <span title="Needs Prayer (waiting for reply)" className="shrink-0 leading-none text-amber-500 dark:text-amber-400"><HandHeart size={13} aria-hidden="true" /></span>
                                                )}
                                            </div>
                                            {conv.personName && <p className={`text-[10px] ${isUnread ? 'text-slate-500' : 'text-slate-400'}`}>{formatPhone(conv.phoneNumber)}</p>}
                                            <p className={`text-xs truncate mt-0.5 ${isUnread ? 'text-slate-600 dark:text-slate-300 font-medium' : 'text-slate-400 dark:text-slate-500'
                                                }`}>{conv.lastMessageBody || '...'}</p>
                                            {convTags.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {convTags.slice(0, 3).map(t => (
                                                        <SmsTagChip key={t.id} tag={t} />
                                                    ))}
                                                    {convTags.length > 3 && (
                                                        <span className="text-[10px] text-slate-400 font-semibold">+{convTags.length - 3}</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="shrink-0 flex flex-col items-end gap-1">
                                        <span className={`text-[10px] ${isUnread ? 'text-indigo-500 font-semibold' : 'text-slate-400'}`}>{timeAgo(conv.lastMessageAt)}</span>
                                        {isUnread && (
                                            <span className="min-w-[18px] h-[18px] bg-indigo-600 text-white text-[10px] font-black rounded-full flex items-center justify-center px-1">
                                                {conv.unreadCount}
                                            </span>
                                        )}
                                        {conv.isOptedOut && <span className="text-[11px] text-red-500 font-bold">OPT-OUT</span>}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {activeConv ? (
                <div className={`flex-1 flex flex-col min-h-0 overflow-hidden ${!activeConv ? 'hidden md:flex' : 'flex'}`}>
                    <div className="shrink-0 px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center gap-3 flex-wrap">
                        <button
                            onClick={() => setActiveConv(null)}
                            className="md:hidden p-1.5 -ml-2 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0"
                            title="Back"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div className="relative shrink-0">
                            {activeConv.personAvatar ? (
                                <img
                                    src={activeConv.personAvatar}
                                    alt={activeConv.personName || activeConv.phoneNumber}
                                    className="w-9 h-9 rounded-full object-cover ring-2 ring-indigo-100 dark:ring-indigo-900/40"
                                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget.nextElementSibling as HTMLElement)!.style.display = 'flex'; }}
                                />
                            ) : null}
                            <div className={`w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 items-center justify-center font-black text-sm ${activeConv.personAvatar ? 'hidden' : 'flex'}`}>
                                {(activeConv.personName || activeConv.phoneNumber).charAt(0).toUpperCase()}
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-bold text-slate-900 dark:text-white text-sm">{activeConv.personName || formatPhone(activeConv.phoneNumber)}</p>
                            {activeConv.personName && <p className="text-xs text-slate-400">{formatPhone(activeConv.phoneNumber)}</p>}
                        </div>
                        {voiceAddonEnabled && activeNumber?.voiceEnabled && (
                            <button
                                onClick={async () => {
                                    if (voice.status !== 'ready') {
                                        showInboxToast(voice.error || `Voice softphone is ${voice.status}. Please wait a moment and try again.`, 'error');
                                        return;
                                    }
                                    try {
                                        await voice.dial(activeConv.phoneNumber, activeNumber.id);
                                    } catch (err: any) {
                                        showInboxToast(err?.message || 'Unable to place call', 'error');
                                    }
                                }}
                                disabled={Boolean(voice.activeCall)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 ${
                                    voice.status === 'ready'
                                        ? 'bg-emerald-600 hover:bg-emerald-700'
                                        : 'bg-emerald-600/60 hover:bg-emerald-600/80'
                                } disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-sm shrink-0`}
                                title={voice.status === 'ready' ? `Call ${activeConv.phoneNumber}` : (voice.error || 'Connecting voice softphone...')}
                            >
                                <Phone size={13} /> Call
                            </button>
                        )}
                        {activeConv.isOptedOut && (
                            <span className="text-xs font-bold text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-full px-2 py-0.5">OPTED OUT</span>
                        )}
                        {(() => {
                            const prayerTag = tags.find(t => t.name === 'Needs Prayer' && (activeConv.tags || []).includes(t.id));
                            return prayerTag ? (
                                <button
                                    onClick={() => handleToggleConvTag(activeConv, prayerTag.id)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700 rounded-xl text-xs font-bold transition shadow-sm"
                                    title="Mark this prayer request as resolved"
                                >
                                    <CheckCircle size={13} /> Resolve Prayer
                                </button>
                            ) : null;
                        })()}
                        {tags.filter(t => (activeConv.tags || []).includes(t.id)).map(t => (
                            <SmsTagChip
                                key={t.id}
                                tag={t}
                                size="sm"
                                onRemove={() => handleToggleConvTag(activeConv, t.id)}
                            />
                        ))}
                        {tags.length > 0 && (
                            <div className="relative shrink-0">
                                <button
                                    onClick={() => setShowTagPicker(v => !v)}
                                    title="Add or remove tags"
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition"
                                >
                                    <Tag size={12} /> Tags
                                </button>
                                {showTagPicker && (
                                    <div
                                        className="absolute right-0 top-full mt-2 z-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-3 w-56"
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Tag This Conversation</p>
                                        <div className="space-y-1">
                                            {tags.map(t => {
                                                const isOn = (activeConv.tags || []).includes(t.id);
                                                const c = TAG_COLOR_MAP[t.color] || TAG_COLOR_MAP.violet;
                                                return (
                                                    <button
                                                        key={t.id}
                                                        onClick={() => handleToggleConvTag(activeConv, t.id)}
                                                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition text-sm font-semibold ${isOn
                                                                ? `${c.bg} ${c.text}`
                                                                : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                                                            }`}
                                                    >
                                                        <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${isOn ? `${c.dot.replace('bg-', 'border-')} ${c.dot}` : 'border-slate-300 dark:border-slate-600'
                                                            }`}>
                                                            {isOn && <CheckCircle size={10} className="text-white" />}
                                                        </span>
                                                        {t.emoji && <span>{t.emoji}</span>}
                                                        {t.name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <button
                                            onClick={() => setShowTagPicker(false)}
                                            className="w-full mt-2 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition"
                                        >Done</button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-3 bg-slate-50 dark:bg-slate-950">
                        {loadingMsgs ? (
                            <div className="flex justify-center py-12 text-slate-400"><Loader2 size={20} className="animate-spin" /></div>
                        ) : messages.length === 0 ? (
                            <div className="text-center py-12 text-slate-400 text-sm">No messages yet</div>
                        ) : (
                            messages.map(msg => {
                                const attachmentUrls: string[] = Array.isArray(msg.mediaUrls) && msg.mediaUrls.length > 0
                                    ? msg.mediaUrls
                                    : typeof (msg as any).mediaUrl === 'string' && (msg as any).mediaUrl
                                    ? [(msg as any).mediaUrl]
                                    : Array.isArray((msg as any).mediaUrl) && (msg as any).mediaUrl.length > 0
                                    ? (msg as any).mediaUrl
                                    : Array.isArray((msg as any).attachmentUrls) && (msg as any).attachmentUrls.length > 0
                                    ? (msg as any).attachmentUrls
                                    : Array.isArray((msg as any).attachments) && (msg as any).attachments.length > 0
                                    ? (msg as any).attachments
                                    : [];

                                return (
                                    <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${msg.direction === 'outbound' ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-bl-sm'}`}>
                                            <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                                            {attachmentUrls.length > 0 && (
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {attachmentUrls.map((rawUrl, i) => {
                                                        const targetUrl = (rawUrl.includes('signalwire.com/api/laml') || rawUrl.includes('files.signalwire.com'))
                                                            ? `${API_BASE}/api/messaging/media-proxy?url=${encodeURIComponent(rawUrl)}`
                                                            : rawUrl;

                                                        const isPdf = /\.pdf(\?|$)/i.test(rawUrl) || rawUrl.includes('application/pdf');
                                                        const isVcard = /\.vcf(\?|$)/i.test(rawUrl) || rawUrl.includes('vcard');
                                                        const isAudio = /\.(mp3|wav|ogg|m4a)(\?|$)/i.test(rawUrl);
                                                        const isVideo = /\.(mp4|mov|webm)(\?|$)/i.test(rawUrl);

                                                        const isImage = !isPdf && !isVcard && !isAudio && !isVideo && (
                                                            /\.(jpg|jpeg|png|gif|webp|heic|svg)(\?|$)/i.test(rawUrl)
                                                            || rawUrl.includes('storage.googleapis.com')
                                                            || rawUrl.includes('firebasestorage.googleapis.com')
                                                            || /image\//i.test(rawUrl)
                                                        );

                                                        if (isImage) {
                                                            return (
                                                                <ThreadImageAttachment
                                                                    key={i}
                                                                    index={i}
                                                                    targetUrl={targetUrl}
                                                                    rawUrl={rawUrl}
                                                                    onExpand={() => setViewingImageUrl(targetUrl)}
                                                                />
                                                            );
                                                        }

                                                        return (
                                                            <a
                                                                key={i}
                                                                href={targetUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition shadow-sm ${
                                                                    msg.direction === 'outbound'
                                                                        ? 'bg-indigo-700/60 border-indigo-500 text-white hover:bg-indigo-700/80'
                                                                        : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800'
                                                                }`}
                                                            >
                                                                <span className="shrink-0" aria-hidden="true">{isVcard ? <IdCard size={16} /> : isPdf ? <FileText size={16} /> : isAudio ? <Music size={16} /> : isVideo ? <Film size={16} /> : <Paperclip size={16} />}</span>
                                                                <div className="flex flex-col truncate max-w-[200px]">
                                                                    <span className="truncate">{isVcard ? 'Contact Card (.vcf)' : isPdf ? 'Document (.pdf)' : `Attachment ${i + 1}`}</span>
                                                                    <span className="text-[10px] opacity-75">Click to view/download ↗</span>
                                                                </div>
                                                            </a>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            <div className={`text-[10px] mt-1 flex items-center gap-1 flex-wrap ${msg.direction === 'outbound' ? 'text-indigo-200' : 'text-slate-400'}`}>
                                                {new Date(msg.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                                {msg.direction === 'outbound' && msg.sentByName && ` • ${msg.sentByName}`}
                                                {msg.direction === 'outbound' && msg.status && (() => {
                                                    const s = msg.status;
                                                    if (s === 'delivered') return <span className="inline-flex items-center gap-0.5 text-emerald-300 font-semibold" title="Delivered"><CircleCheck size={11} aria-hidden="true" /> delivered</span>;
                                                    if (s === 'sent') return <span className="inline-flex items-center gap-0.5 text-indigo-300" title="Accepted by carrier"><Check size={11} aria-hidden="true" /> sent</span>;
                                                    if (s === 'queued') return <span className="text-indigo-300/70" title="Queued by Twilio">• queued</span>;
                                                    if (s === 'failed') return <span className="inline-flex items-center gap-0.5 text-red-400 font-bold" title="Failed ... not delivered"><CircleX size={11} aria-hidden="true" /> failed</span>;
                                                    if (s === 'undelivered') return <span className="inline-flex items-center gap-0.5 text-red-400 font-bold" title="Undelivered ... carrier rejected"><Ban size={11} aria-hidden="true" /> undelivered</span>;
                                                    return <span className="opacity-60">• {s}</span>;
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                        <div ref={messagesEndRef} aria-hidden="true" />
                    </div>

                    {viewingImageUrl && (
                        <div
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
                            onClick={() => setViewingImageUrl(null)}
                        >
                            <div className="relative max-w-4xl max-h-[90vh] overflow-hidden flex flex-col items-center">
                                <button
                                    type="button"
                                    onClick={() => setViewingImageUrl(null)}
                                    className="absolute top-2 right-2 p-2 rounded-full bg-black/60 hover:bg-black/90 text-white transition shadow-lg z-10"
                                    title="Close"
                                >
                                    <X size={20} />
                                </button>
                                <img
                                    src={viewingImageUrl}
                                    alt="Expanded attachment"
                                    className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
                                    onClick={(e) => e.stopPropagation()}
                                />
                                <div className="mt-3 flex gap-3">
                                    <a
                                        href={viewingImageUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="px-4 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-full text-xs font-semibold backdrop-blur-md transition flex items-center gap-1.5"
                                    >
                                        Open Original ↗
                                    </a>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="shrink-0 p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                        {smsAgentEnabled && userCanUseAiAgent && !activeConv.isOptedOut && aiSuggestions.length > 0 && (
                            <div className="mb-3 space-y-2">
                                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-indigo-500">
                                    <Sparkles size={10} /> AI Suggested Replies
                                </div>
                                {aiSuggestions.map(sug => (
                                    <div
                                        key={sug.id}
                                        className="flex items-start gap-2 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-xl group"
                                    >
                                        <p className="flex-1 text-sm text-indigo-900 dark:text-indigo-100 leading-snug">{sug.suggestedBody}</p>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                title="Use this reply"
                                                onClick={async () => {
                                                    setReplyBody(sug.suggestedBody);
                                                    await updateDoc(
                                                        doc(firebaseDb, 'smsConversations', activeConv.id, 'aiSuggestions', sug.id),
                                                        { status: 'accepted' }
                                                    ).catch(() => { });
                                                }}
                                                className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition"
                                            >
                                                <ChevronRight size={10} /> Use
                                            </button>
                                            <button
                                                title="Dismiss suggestion"
                                                onClick={async () => {
                                                    await updateDoc(
                                                        doc(firebaseDb, 'smsConversations', activeConv.id, 'aiSuggestions', sug.id),
                                                        { status: 'dismissed' }
                                                    ).catch(() => { });
                                                }}
                                                className="p-1 text-indigo-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition"
                                            >
                                                <X size={11} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {activeConv.isOptedOut ? (
                            <div className="flex items-center gap-2 text-xs text-red-500 font-semibold p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                                <AlertTriangle size={13} /> This contact has opted out. You cannot send them messages.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {(replyMediaUrl || replyUploading) && (
                                    <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl">
                                        {replyUploading ? (
                                            <>
                                                <Loader2 size={14} className="animate-spin text-blue-500 shrink-0" />
                                                <div className="flex-1">
                                                    <div className="h-1.5 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-blue-500 rounded-full transition-all"
                                                            style={{ width: `${replyUploadPct}%` }}
                                                        />
                                                    </div>
                                                    <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5 font-semibold">Uploading... {replyUploadPct}%</p>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <img
                                                    src={replyMediaUrl}
                                                    alt="MMS attachment"
                                                    className="w-12 h-12 object-cover rounded-lg shrink-0 border border-blue-200 dark:border-blue-700"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 truncate">Image attached (MMS)</p>
                                                    <p className="text-[10px] text-blue-500 dark:text-blue-400">Will be sent as MMS</p>
                                                </div>
                                                <button
                                                    onClick={() => setReplyMediaUrl('')}
                                                    title="Remove image"
                                                    className="p-1 text-blue-400 hover:text-red-500 rounded-lg transition shrink-0"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                )}
                                <input
                                    ref={replyFileRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/gif,image/webp,video/*,audio/*,application/pdf"
                                    className="hidden"
                                    title="Attach file"
                                    onChange={handleReplyFileChange}
                                />
                                <div className="flex items-end gap-2">
                                    {userCanUseAiAgent && (
                                        <button
                                            onClick={handleAiSuggest}
                                            disabled={aiGenerating}
                                            title="AI: Suggest a reply based on this conversation"
                                            className="flex items-center gap-1.5 px-3 h-10 shrink-0 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700 transition disabled:opacity-50 text-[11px] font-bold whitespace-nowrap"
                                        >
                                            {aiGenerating
                                                ? <Loader2 size={14} className="animate-spin" />
                                                : <Sparkles size={14} />}
                                            <span>{aiGenerating ? 'Thinking...' : 'Suggest'}</span>
                                        </button>
                                    )}
                                    <textarea
                                        ref={replyTextareaRef}
                                        rows={2}
                                        value={replyBody}
                                        onChange={e => setReplyBody(e.target.value)}
                                        placeholder={replyMediaUrl ? 'Add a caption (optional)...' : 'Type a reply...'}
                                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
                                        onFocus={() => {
                                            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 350);
                                        }}
                                        className="flex-1 text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                                    />
                                    <div className="relative shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setShowReplyEmojis(v => !v)}
                                            title="Insert emoji"
                                            className="flex items-center justify-center w-10 h-10 rounded-xl border bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                                        >
                                            <Smile size={16} />
                                        </button>
                                        {showReplyEmojis && (
                                            <div className="absolute bottom-full right-0 mb-2 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-3 grid grid-cols-5 gap-1 min-w-[170px]">
                                                {COMMON_EMOJIS.map(em => (
                                                    <button key={em} type="button" onClick={() => { insertAtReplyCursor(em); setShowReplyEmojis(false); }}
                                                        className="text-xl hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg p-1 transition leading-none" title={em}>{em}</button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => replyFileRef.current?.click()}
                                        disabled={replyUploading || isSending}
                                        title="Attach file (sends as MMS)"
                                        className={`flex items-center justify-center w-10 h-10 shrink-0 rounded-xl border transition disabled:opacity-50 ${replyMediaUrl
                                                ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                                                : 'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-500 hover:border-blue-300'
                                            }`}
                                    >
                                        <ImageIcon size={16} />
                                    </button>
                                    <button
                                        onClick={handleSendReply}
                                        disabled={(!replyBody.trim() && !replyMediaUrl) || isSending || replyUploading}
                                        className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition font-bold shrink-0"
                                    >
                                        {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                    </button>
                                </div>
                                <div className="flex items-center justify-between px-1">
                                    <div className="flex items-center gap-2">
                                        {userCanUseAiAgent && replyBody.trim() && (
                                            <button
                                                onClick={handleAiShorten}
                                                disabled={aiGenerating || replyBody.length <= 160}
                                                title={replyBody.length <= 160 ? 'Already under 160 characters' : 'AI: Shorten to under 160 characters'}
                                                className="flex items-center gap-1 text-[10px] font-bold text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200 disabled:opacity-40 transition"
                                            >
                                                <Sparkles size={11} />
                                                {aiGenerating ? 'Shortening...' : 'Shorten to 160'}
                                            </button>
                                        )}
                                        {replyMediaUrl && (
                                            <span className="flex items-center gap-1 text-[10px] font-bold text-blue-500 dark:text-blue-400">
                                                <ImageIcon size={10} /> MMS
                                            </span>
                                        )}
                                    </div>
                                    {replyBody.trim() && (
                                        <span className={`text-[10px] font-mono tabular-nums font-bold transition-colors ${replyBody.length > 160 ? 'text-red-500' :
                                                replyBody.length > 120 ? 'text-amber-500' :
                                                    'text-slate-400 dark:text-slate-500'
                                            }`}>
                                            {replyBody.length}/160
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                    <MessageSquare size={48} className="mb-3 opacity-20" />
                    <p className="font-semibold">Select a conversation</p>
                </div>
            )}
        </div>
    );
};
