import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { SignalWire, type Call, type CredentialProvider } from '@signalwire/js';
import { auth } from '../services/firebase';

const VoipPush = registerPlugin<any>('VoipPush');
const VoipCall = registerPlugin<any>('VoipCall');

export type VoiceConnectionStatus = 'disabled' | 'connecting' | 'ready' | 'error';

export interface ActiveCallInfo {
    id: string;
    remoteNumber: string;
    direction: 'inbound' | 'outbound';
    state: string;
    isMuted: boolean;
    startedAt: number | null;
}

export interface IncomingCallInfo {
    id: string;
    callerNumber: string;
    callerName?: string;
    call: Call;
}

interface UseSignalWireVoiceOptions {
    churchId?: string;
    voiceAddonEnabled?: boolean;
    apiBaseUrl: string;
}

function normalizeDialTarget(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return trimmed;
    if (trimmed.startsWith('/') || trimmed.startsWith('sip:') || trimmed.startsWith('subscriber:') || trimmed.startsWith('+')) {
        return trimmed;
    }
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    if (digits.length > 0) return `+${digits}`;
    return trimmed;
}

export function useSignalWireVoice({ churchId, voiceAddonEnabled, apiBaseUrl }: UseSignalWireVoiceOptions) {
    const [status, setStatus] = useState<VoiceConnectionStatus>(voiceAddonEnabled ? 'connecting' : 'disabled');
    const [error, setError] = useState<string | null>(null);
    const [activeCallInfo, setActiveCallInfo] = useState<ActiveCallInfo | null>(null);
    const [incomingCall, setIncomingCall] = useState<IncomingCallInfo | null>(null);
    const [isSpeakerOn, setIsSpeakerOn] = useState(false);

    const clientRef = useRef<SignalWire | null>(null);
    const activeCallRef = useRef<Call | null>(null);
    const incomingCallRef = useRef<IncomingCallInfo | null>(null);
    const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
    const cancelPendingDialRef = useRef(false);
    const activeCallLogMetaRef = useRef<{ callId: string; smsNumberId?: string; to?: string; from?: string; direction: 'inbound' | 'outbound'; startedAt: number | null } | null>(null);

    useEffect(() => {
        incomingCallRef.current = incomingCall;
    }, [incomingCall]);

    const logCallToServer = useCallback(async (payload: {
        callId: string;
        smsNumberId?: string;
        direction: 'inbound' | 'outbound';
        to?: string;
        from?: string;
        status: string;
        durationSec?: number;
    }) => {
        try {
            if (!churchId) return;
            const idToken = await auth.currentUser?.getIdToken();
            if (!idToken) return;
            const base = apiBaseUrl.replace(/\/$/, '');
            await fetch(`${base}/api/voice/log-call`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ churchId, ...payload }),
            });
        } catch {}
    }, [churchId, apiBaseUrl]);

    const fetchVoiceToken = useCallback(async () => {
        if (!churchId) throw new Error('Missing churchId');
        const user = auth.currentUser;
        if (!user) throw new Error('User not authenticated');
        const idToken = await user.getIdToken();
        const base = apiBaseUrl.replace(/\/$/, '');
        const res = await fetch(`${base}/api/voice/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ churchId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch voice token');
        return {
            token: data.token as string,
            expiry_at: Date.now() + 3000 * 1000,
        };
    }, [churchId, apiBaseUrl]);

    const attachCallListeners = useCallback((call: Call, remoteNumber: string, direction: 'inbound' | 'outbound', smsNumberId?: string) => {
        activeCallRef.current = call;
        const callId = call.id || activeCallLogMetaRef.current?.callId || `call_${Date.now()}`;
        activeCallLogMetaRef.current = {
            callId,
            smsNumberId,
            to: direction === 'outbound' ? remoteNumber : undefined,
            from: direction === 'inbound' ? remoteNumber : undefined,
            direction,
            startedAt: null,
        };
        setIsSpeakerOn(false);
        setActiveCallInfo({
            id: callId,
            remoteNumber,
            direction,
            state: 'connecting',
            isMuted: false,
            startedAt: null,
        });

        logCallToServer({
            callId,
            smsNumberId,
            direction,
            to: direction === 'outbound' ? remoteNumber : undefined,
            from: direction === 'inbound' ? remoteNumber : undefined,
            status: direction === 'outbound' ? 'initiated' : 'in-progress',
        });

        if (!remoteAudioRef.current) {
            const audioEl = new Audio();
            audioEl.autoplay = true;
            (audioEl as any).playsInline = true;
            remoteAudioRef.current = audioEl;
        }

        const attachRemoteStream = (stream: MediaStream | null | undefined) => {
            const audioEl = remoteAudioRef.current;
            if (!audioEl || !stream) return;
            if (audioEl.srcObject !== stream) {
                audioEl.srcObject = stream;
            }
            audioEl.play().catch(() => {});
        };

        if ((call as any).remoteStream) {
            attachRemoteStream((call as any).remoteStream);
        }
        const remoteStreamSub = (call as any).remoteStream$?.subscribe?.((stream: MediaStream | null) => {
            attachRemoteStream(stream);
        });

        const cleanupAudio = () => {
            remoteStreamSub?.unsubscribe?.();
            if (remoteAudioRef.current) {
                remoteAudioRef.current.pause();
                remoteAudioRef.current.srcObject = null;
            }
        };

        const finalizeCallLog = (finalStatus: string) => {
            const meta = activeCallLogMetaRef.current;
            if (!meta) return;
            activeCallLogMetaRef.current = null;
            const durationSec = meta.startedAt ? Math.max(1, Math.round((Date.now() - meta.startedAt) / 1000)) : 0;
            logCallToServer({
                callId: meta.callId,
                smsNumberId: meta.smsNumberId,
                direction: meta.direction,
                to: meta.to,
                from: meta.from,
                status: finalStatus,
                durationSec,
            });
        };

        const stateSub = (call as any).state$?.subscribe?.((nextState: string) => {
            const isLive = nextState === 'active' || nextState === 'answered';
            if (isLive && activeCallLogMetaRef.current && !activeCallLogMetaRef.current.startedAt) {
                activeCallLogMetaRef.current.startedAt = Date.now();
            }
            setActiveCallInfo((prev) => {
                if (!prev) return null;
                return {
                    ...prev,
                    state: nextState,
                    startedAt: prev.startedAt ?? (isLive ? Date.now() : null),
                };
            });
            if (['ended', 'destroy', 'hangup', 'failed'].includes(nextState)) {
                finalizeCallLog(nextState === 'failed' ? 'failed' : 'completed');
                cleanupAudio();
                activeCallRef.current = null;
                setActiveCallInfo(null);
                setIsSpeakerOn(false);
                if (Capacitor.getPlatform() === 'ios') VoipPush.endCall?.().catch(() => {});
                if (Capacitor.getPlatform() === 'android') VoipCall.endCall?.().catch(() => {});
            }
        });

        (call as any).on?.('destroy', () => {
            stateSub?.unsubscribe?.();
            finalizeCallLog('completed');
            cleanupAudio();
            activeCallRef.current = null;
            setActiveCallInfo(null);
            setIsSpeakerOn(false);
        });
    }, [logCallToServer]);

    const answer = useCallback(async () => {
        const inc = incomingCallRef.current;
        if (!inc) return;
        setIncomingCall(null);
        setIsSpeakerOn(false);
        if (Capacitor.getPlatform() === 'ios') {
            await VoipPush.configureAudioSession?.().catch(() => {});
        }
        await (inc.call as any).answer?.({ audio: true, video: false });
        attachCallListeners(inc.call, inc.callerNumber, 'inbound');
    }, [attachCallListeners]);

    const hangup = useCallback(async () => {
        cancelPendingDialRef.current = true;
        const call = activeCallRef.current;
        const meta = activeCallLogMetaRef.current;
        if (meta) {
            activeCallLogMetaRef.current = null;
            const durationSec = meta.startedAt ? Math.max(1, Math.round((Date.now() - meta.startedAt) / 1000)) : 0;
            logCallToServer({
                callId: meta.callId,
                smsNumberId: meta.smsNumberId,
                direction: meta.direction,
                to: meta.to,
                from: meta.from,
                status: 'completed',
                durationSec,
            });
        }
        try {
            if (call) {
                await (call as any).hangup?.();
            }
        } catch {
            // Ensure local state and native CallKit still clean up
        } finally {
            if (remoteAudioRef.current) {
                remoteAudioRef.current.pause();
                remoteAudioRef.current.srcObject = null;
            }
            activeCallRef.current = null;
            setActiveCallInfo(null);
            setIsSpeakerOn(false);
            if (Capacitor.getPlatform() === 'ios') VoipPush.endCall?.().catch(() => {});
            if (Capacitor.getPlatform() === 'android') VoipCall.endCall?.().catch(() => {});
        }
    }, [logCallToServer]);

    // Register native PushKit / CallKit / ConnectionService listeners when voiceAddonEnabled
    useEffect(() => {
        if (!churchId || !voiceAddonEnabled || !Capacitor.isNativePlatform()) return;
        const platform = Capacitor.getPlatform();
        const listeners: Array<{ remove: () => void }> = [];

        const registerDeviceToken = async (payload: { voipToken?: string; fcmToken?: string }) => {
            try {
                const idToken = await auth.currentUser?.getIdToken();
                if (!idToken) return;
                const base = apiBaseUrl.replace(/\/$/, '');
                await fetch(`${base}/api/voice/register-voip-device`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${idToken}`,
                    },
                    body: JSON.stringify({
                        churchId,
                        deviceId: `${platform}_${auth.currentUser?.uid}`,
                        platform,
                        ...payload,
                    }),
                });
            } catch {}
        };

        if (platform === 'ios') {
            VoipPush.register?.().catch(() => {});
            listeners.push(
                VoipPush.addListener?.('voipToken', (ev: { token: string }) => {
                    if (ev?.token) registerDeviceToken({ voipToken: ev.token });
                }),
                VoipPush.addListener?.('callAnswered', () => {
                    answer().catch(() => {});
                }),
                VoipPush.addListener?.('callEnded', () => {
                    hangup().catch(() => {});
                })
            );
        } else if (platform === 'android') {
            listeners.push(
                VoipCall.addListener?.('callAnswered', () => {
                    answer().catch(() => {});
                }),
                VoipCall.addListener?.('callEnded', () => {
                    hangup().catch(() => {});
                })
            );
        }

        return () => {
            listeners.forEach((l) => l?.remove?.());
        };
    }, [churchId, voiceAddonEnabled, apiBaseUrl, answer, hangup]);

    useEffect(() => {
        if (!churchId || !voiceAddonEnabled) {
            setStatus('disabled');
            if (clientRef.current) {
                try {
                    clientRef.current.disconnect();
                } catch {}
                clientRef.current = null;
            }
            return;
        }

        let cancelled = false;
        let readySub: { unsubscribe: () => void } | null = null;
        let errorSub: { unsubscribe: () => void } | null = null;
        let incomingSub: { unsubscribe: () => void } | null = null;

        const init = () => {
            setStatus('connecting');
            setError(null);
            try {
                const credentialProvider: CredentialProvider = {
                    authenticate: fetchVoiceToken,
                    refresh: fetchVoiceToken,
                };
                // SignalWire constructor automatically resolves credentials, connects, and registers.
                const client = new SignalWire(credentialProvider);
                if (cancelled) {
                    client.disconnect();
                    return;
                }
                clientRef.current = client;

                errorSub = client.errors$.subscribe((err: Error) => {
                    if (cancelled) return;
                    const msg = err?.message || 'Failed to connect voice client';
                    if (/websocket/i.test(msg)) {
                        // SignalWire WebSocketController automatically reconnects on socket drops
                        // (common when iOS backgrounds WKWebView). Keep status as connecting so
                        // ready$ can recover cleanly without locking the UI in an error state.
                        console.warn('[Voice] Transient WebSocket error (reconnecting):', msg);
                        setStatus((prev) => (prev === 'ready' ? 'connecting' : prev));
                        return;
                    }
                    setStatus('error');
                    setError(msg);
                });

                readySub = client.ready$.subscribe((isReady: boolean) => {
                    if (cancelled) return;
                    if (isReady) {
                        setStatus('ready');
                        setError(null);
                        if (!incomingSub && client.session?.incomingCalls$) {
                            incomingSub = client.session.incomingCalls$.subscribe((calls: Call[]) => {
                                if (calls.length > 0 && !activeCallRef.current) {
                                    const incoming = calls[0];
                                    setIncomingCall({
                                        id: incoming.id || `in_${Date.now()}`,
                                        callerNumber: (incoming as any).callerIdNumber || (incoming as any).from || 'Unknown Caller',
                                        callerName: (incoming as any).callerIdName,
                                        call: incoming,
                                    });
                                } else if (calls.length === 0) {
                                    setIncomingCall(null);
                                }
                            });
                        }
                    } else {
                        setStatus((prev) => (prev === 'error' ? 'error' : 'connecting'));
                    }
                });
            } catch (err: any) {
                if (!cancelled) {
                    setStatus('error');
                    setError(err?.message || 'Failed to connect voice client');
                }
            }
        };

        init();

        let appStateHandle: { remove: () => void } | null = null;
        if (Capacitor.isNativePlatform()) {
            CapacitorApp.addListener('appStateChange', ({ isActive }) => {
                if (!isActive || cancelled) return;
                const client = clientRef.current;
                if (client && !client.isConnected) {
                    setStatus('connecting');
                    client.connect().catch(() => {});
                }
            }).then((handle) => {
                if (cancelled) handle.remove();
                else appStateHandle = handle;
            }).catch(() => {});
        }

        return () => {
            cancelled = true;
            appStateHandle?.remove();
            readySub?.unsubscribe();
            errorSub?.unsubscribe();
            incomingSub?.unsubscribe();
            if (clientRef.current) {
                try {
                    clientRef.current.disconnect();
                } catch {}
                clientRef.current = null;
            }
        };
    }, [churchId, voiceAddonEnabled, fetchVoiceToken]);

    const dial = useCallback(async (toNumber: string, smsNumberId: string) => {
        if (!clientRef.current || status !== 'ready') {
            throw new Error('Voice softphone is not ready.');
        }
        const destination = normalizeDialTarget(toNumber);
        const tempId = `call_${Date.now()}`;
        cancelPendingDialRef.current = false;
        setIsSpeakerOn(false);
        activeCallLogMetaRef.current = {
            callId: tempId,
            smsNumberId,
            to: destination,
            direction: 'outbound',
            startedAt: null,
        };
        setActiveCallInfo({
            id: tempId,
            remoteNumber: destination,
            direction: 'outbound',
            state: 'dialing',
            isMuted: false,
            startedAt: null,
        });
        try {
            if (Capacitor.getPlatform() === 'ios') {
                await VoipPush.configureAudioSession?.();
            }
            const call = await clientRef.current.dial(destination, {
                audio: true,
                video: false,
                userVariables: {
                    churchId,
                    smsNumberId,
                    userId: auth.currentUser?.uid || '',
                },
            } as any);
            if (cancelPendingDialRef.current) {
                await (call as any)?.hangup?.().catch(() => {});
                return call;
            }
            attachCallListeners(call, destination, 'outbound', smsNumberId);
            return call;
        } catch (err: any) {
            activeCallLogMetaRef.current = null;
            setActiveCallInfo(null);
            setIsSpeakerOn(false);
            const inner = err?.error || err?.cause;
            const detail = inner?.message || (typeof inner === 'string' ? inner : inner ? JSON.stringify(inner) : '') || err?.message || 'Call creation failed';
            console.error('[Voice] dial failed:', err, inner);
            throw new Error(detail);
        }
    }, [status, churchId, attachCallListeners]);

    const reject = useCallback(async () => {
        if (!incomingCall) return;
        const call = incomingCall.call;
        setIncomingCall(null);
        await (call as any).hangup?.();
    }, [incomingCall]);

    const toggleMute = useCallback(async () => {
        const call = activeCallRef.current as any;
        if (!call || !activeCallInfo) return;
        const nextMuted = !activeCallInfo.isMuted;
        if (nextMuted) {
            await call.audioMute?.();
        } else {
            await call.audioUnmute?.();
        }
        setActiveCallInfo((prev) => (prev ? { ...prev, isMuted: nextMuted } : null));
    }, [activeCallInfo]);

    const toggleSpeaker = useCallback(async () => {
        const next = !isSpeakerOn;
        setIsSpeakerOn(next);
        if (Capacitor.getPlatform() === 'ios') {
            await VoipPush.setSpeakerphone?.({ enabled: next }).catch(() => {});
        }
    }, [isSpeakerOn]);

    const sendDtmf = useCallback(async (digit: string) => {
        const call = activeCallRef.current as any;
        if (!call) return;
        await call.sendDigits?.(digit);
    }, []);

    return {
        status,
        error,
        activeCall: activeCallInfo,
        incomingCall,
        isSpeakerOn,
        dial,
        answer,
        reject,
        hangup,
        toggleMute,
        toggleSpeaker,
        sendDtmf,
    };
}
