import React, { useEffect, useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Grid, PhoneIncoming } from 'lucide-react';
import type { ActiveCallInfo, IncomingCallInfo } from '../hooks/useSignalWireVoice';

interface VoiceSoftphoneProps {
    activeCall: ActiveCallInfo | null;
    incomingCall: IncomingCallInfo | null;
    onAnswer: () => void;
    onReject: () => void;
    onHangup: () => void;
    onToggleMute: () => void;
    onSendDtmf: (digit: string) => void;
}

const DTMF_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

export const VoiceSoftphone: React.FC<VoiceSoftphoneProps> = ({
    activeCall,
    incomingCall,
    onAnswer,
    onReject,
    onHangup,
    onToggleMute,
    onSendDtmf,
}) => {
    const [showKeypad, setShowKeypad] = useState(false);
    const [elapsedSec, setElapsedSec] = useState(0);

    useEffect(() => {
        if (!activeCall?.startedAt) {
            setElapsedSec(0);
            return;
        }
        const update = () => setElapsedSec(Math.floor((Date.now() - activeCall.startedAt!) / 1000));
        update();
        const timer = setInterval(update, 1000);
        return () => clearInterval(timer);
    }, [activeCall?.startedAt]);

    const formatDuration = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    if (!incomingCall && !activeCall) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 z-50 flex flex-col gap-3 sm:left-auto sm:w-80">
            {incomingCall && !activeCall && (
                <div className="rounded-2xl bg-slate-900 text-white p-4 shadow-2xl border border-slate-700">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center animate-pulse">
                            <PhoneIncoming className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Incoming Call</p>
                            <p className="text-sm font-black truncate">{incomingCall.callerName || incomingCall.callerNumber}</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={onReject} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-bold">
                            <PhoneOff className="w-4 h-4" /> Decline
                        </button>
                        <button onClick={onAnswer} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold">
                            <Phone className="w-4 h-4" /> Answer
                        </button>
                    </div>
                </div>
            )}

            {activeCall && (
                <div className="rounded-2xl bg-slate-900 text-white p-4 shadow-2xl border border-slate-700">
                    <div className="flex items-center justify-between mb-3">
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                                {activeCall.direction === 'outbound' ? 'Outbound Call' : 'Inbound Call'} · {activeCall.state}
                            </p>
                            <p className="text-sm font-black truncate">{activeCall.remoteNumber}</p>
                        </div>
                        <span className="font-mono text-xs font-bold bg-slate-800 px-2.5 py-1 rounded-lg text-emerald-400">
                            {activeCall.startedAt ? formatDuration(elapsedSec) : 'Ringing...'}
                        </span>
                    </div>

                    {showKeypad && (
                        <div className="grid grid-cols-3 gap-1.5 mb-3 bg-slate-800/70 p-2 rounded-xl">
                            {DTMF_KEYS.map((key) => (
                                <button
                                    key={key}
                                    onClick={() => onSendDtmf(key)}
                                    className="py-2 rounded-lg bg-slate-700 text-xs font-black"
                                >
                                    {key}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                        <button
                            onClick={onToggleMute}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold ${
                                activeCall.isMuted ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-slate-800 text-slate-200'
                            }`}
                        >
                            {activeCall.isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                            {activeCall.isMuted ? 'Unmute' : 'Mute'}
                        </button>
                        <button
                            onClick={() => setShowKeypad((v) => !v)}
                            className={`px-3.5 py-2.5 rounded-xl text-xs font-bold ${showKeypad ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200'}`}
                        >
                            <Grid className="w-4 h-4" />
                        </button>
                        <button onClick={onHangup} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-bold">
                            <PhoneOff className="w-4 h-4" /> End
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
