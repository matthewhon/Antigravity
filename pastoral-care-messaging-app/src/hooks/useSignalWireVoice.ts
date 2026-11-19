import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
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

export function useSignalWireVoice({ churchId, voiceAddonEnabled, apiBaseUrl }: UseSignalWireVoiceOptions) {
    const [status, setStatus] = useState<VoiceConnectionStatus>(voiceAddonEnabled ? 'connecting' : 'disabled');
    const [error, setError] = useState<string | null>(null);
    const [activeCallInfo, setActiveCallInfo] = useState<ActiveCallInfo | null>(null);
    const [incomingCall, setIncomingCall] = useState<IncomingCallInfo | null>(null);

    const clientRef = useRef<SignalWire | null>(null);
    const activeCallRef = useRef<Call | null>(null);
    const incomingCallRef = useRef<IncomingCallInfo | null>(null);

    useEffect(() => {
        incomingCallRef.current = incomingCall;
    }, [incomingCall]);

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

    const attachCallListeners = useCallback((call: Call, remoteNumber: string, direction: 'inbound' | 'outbound') => {
        activeCallRef.current = call;
        setActiveCallInfo({
            id: call.id || `call_${Date.now()}`,
            remoteNumber,
            direction,
            state: 'connecting',
            isMuted: false,
            startedAt: null,
        });

        const stateSub = (call as any).state$?.subscribe?.((nextState: string) => {
            setActiveCallInfo((prev) => {
                if (!prev) return null;
                const isLive = nextState === 'active' || nextState === 'answered';
                return {
                    ...prev,
                    state: nextState,
                    startedAt: prev.startedAt ?? (isLive ? Date.now() : null),
                };
            });
            if (['ended', 'destroy', 'hangup', 'failed'].includes(nextState)) {
                activeCallRef.current = null;
                setActiveCallInfo(null);
                if (Capacitor.getPlatform() === 'ios') VoipPush.endCall?.().catch(() => {});
                if (Capacitor.getPlatform() === 'android') VoipCall.endCall?.().catch(() => {});
            }
        });

        (call as any).on?.('destroy', () => {
            stateSub?.unsubscribe?.();
            activeCallRef.current = null;
            setActiveCallInfo(null);
        });
    }, []);

    const answer = useCallback(async () => {
        const inc = incomingCallRef.current;
        if (!inc) return;
        setIncomingCall(null);
        await (inc.call as any).answer?.({ audio: true, video: false });
        attachCallListeners(inc.call, inc.callerNumber, 'inbound');
    }, [attachCallListeners]);

    const hangup = useCallback(async () => {
        const call = activeCallRef.current;
        if (!call) return;
        await (call as any).hangup?.();
        activeCallRef.current = null;
        setActiveCallInfo(null);
        if (Capacitor.getPlatform() === 'ios') VoipPush.endCall?.().catch(() => {});
        if (Capacitor.getPlatform() === 'android') VoipCall.endCall?.().catch(() => {});
    }, []);

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
                    setStatus('error');
                    setError(err?.message || 'Failed to connect voice client');
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

        return () => {
            cancelled = true;
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
        const call = await clientRef.current.dial(toNumber, {
            audio: true,
            video: false,
            userVariables: {
                churchId,
                smsNumberId,
                userId: auth.currentUser?.uid || '',
            },
        } as any);
        attachCallListeners(call, toNumber, 'outbound');
        return call;
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
        dial,
        answer,
        reject,
        hangup,
        toggleMute,
        sendDtmf,
    };
}
