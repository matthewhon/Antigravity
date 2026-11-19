import { useState, useEffect, useRef, useCallback } from 'react';
import { SignalWire, type Call, type CredentialProvider } from '@signalwire/js';
import { auth } from '../services/firebase';
import { stripeService } from '../services/stripeService';

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
}

export function useSignalWireVoice({ churchId, voiceAddonEnabled }: UseSignalWireVoiceOptions) {
    const [status, setStatus] = useState<VoiceConnectionStatus>(voiceAddonEnabled ? 'connecting' : 'disabled');
    const [error, setError] = useState<string | null>(null);
    const [activeCallInfo, setActiveCallInfo] = useState<ActiveCallInfo | null>(null);
    const [incomingCall, setIncomingCall] = useState<IncomingCallInfo | null>(null);

    const clientRef = useRef<SignalWire | null>(null);
    const activeCallRef = useRef<Call | null>(null);

    const fetchVoiceToken = useCallback(async () => {
        if (!churchId) throw new Error('Missing churchId');
        const user = auth.currentUser;
        if (!user) throw new Error('User not authenticated');
        const idToken = await user.getIdToken();
        const baseUrl = await stripeService.getApiUrl();
        const res = await fetch(`${baseUrl}/api/voice/token`, {
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
            expiry_at: Math.floor(Date.now() / 1000) + 3000,
        };
    }, [churchId]);

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
        let sub: { unsubscribe: () => void } | null = null;

        const init = async () => {
            setStatus('connecting');
            setError(null);
            try {
                const credentialProvider: CredentialProvider = {
                    authenticate: fetchVoiceToken,
                    refresh: fetchVoiceToken,
                };
                const client = new SignalWire(credentialProvider);
                if (cancelled) {
                    client.disconnect();
                    return;
                }
                clientRef.current = client;

                await client.connect();
                await client.register();
                if (cancelled) return;

                setStatus('ready');

                sub = client.session.incomingCalls$.subscribe((calls: Call[]) => {
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
            if (sub) sub.unsubscribe();
            if (clientRef.current) {
                try {
                    clientRef.current.disconnect();
                } catch {}
                clientRef.current = null;
            }
        };
    }, [churchId, voiceAddonEnabled, fetchVoiceToken]);

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
            }
        });

        (call as any).on?.('destroy', () => {
            stateSub?.unsubscribe?.();
            activeCallRef.current = null;
            setActiveCallInfo(null);
        });
    }, []);

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

    const answer = useCallback(async () => {
        if (!incomingCall) return;
        const call = incomingCall.call;
        setIncomingCall(null);
        await (call as any).answer?.({ audio: true, video: false });
        attachCallListeners(call, incomingCall.callerNumber, 'inbound');
    }, [incomingCall, attachCallListeners]);

    const reject = useCallback(async () => {
        if (!incomingCall) return;
        const call = incomingCall.call;
        setIncomingCall(null);
        await (call as any).hangup?.();
    }, [incomingCall]);

    const hangup = useCallback(async () => {
        const call = activeCallRef.current;
        if (!call) return;
        await (call as any).hangup?.();
        activeCallRef.current = null;
        setActiveCallInfo(null);
    }, []);

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
