import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { ShieldAlert, PhoneCall } from 'lucide-react';
import { db as firebaseDb } from '../services/firebase';
import { hasModuleAccess } from '../services/permissionService';
import { CallFlowBuilder } from './CallFlowBuilder';
import type { Church, TwilioPhoneNumber, User } from '../types';

interface VoiceToolViewProps {
    churchId: string;
    church?: Church;
    currentUser?: User;
}

export const VoiceToolView: React.FC<VoiceToolViewProps> = ({
    churchId,
    church,
    currentUser,
}) => {
    const canEdit = hasModuleAccess(currentUser || null, 'tools-voice');
    const [users, setUsers] = useState<User[]>([]);
    const [numbers, setNumbers] = useState<TwilioPhoneNumber[]>([]);

    useEffect(() => {
        if (!churchId || !canEdit) return;
        const unsubUsers = onSnapshot(
            query(collection(firebaseDb, 'users'), where('churchId', '==', churchId)),
            (snap) => {
                setUsers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as User[]);
            },
            () => {}
        );
        const unsubNums = onSnapshot(
            query(collection(firebaseDb, 'smsNumbers'), where('churchId', '==', churchId)),
            (snap) => {
                setNumbers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as TwilioPhoneNumber[]);
            },
            () => {}
        );
        return () => {
            unsubUsers();
            unsubNums();
        };
    }, [churchId, canEdit]);

    if (!canEdit) {
        return (
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-center shadow-sm">
                    <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                    <h3 className="text-base font-black text-slate-900 dark:text-white">Permission Required</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                        Only Church Administrators or users with the <strong>Messaging</strong> role can configure Voice call flows.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 max-w-7xl mx-auto w-full space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                        <PhoneCall className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Voice Call Flows</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Build drag-and-drop IVR menus, voice agent recordings, extension routing, and voicemail fallbacks.
                        </p>
                    </div>
                </div>
            </div>

            <CallFlowBuilder
                churchId={churchId}
                churchTimezone={church?.timezone || 'America/Chicago'}
                users={users}
                numbers={numbers}
            />
        </div>
    );
};
