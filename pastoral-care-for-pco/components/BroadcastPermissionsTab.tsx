import React, { useState, useEffect } from 'react';
import { Church, User, UserRole } from '../types';
import { pcoService } from '../services/pcoService';
import { db as firebaseDb } from '../services/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Loader2, Shield, Search, Check, X, ShieldAlert } from 'lucide-react';

interface BroadcastPermissionsTabProps {
    churchId: string;
    church: Church;
    currentUser: User;
    allUsers: User[];
    onUpdateChurch?: (updates: Partial<Church>) => void;
}

const ROLES: UserRole[] = [
    'Church Admin', 'Pastor', 'Pastor AI', 'People', 'Services', 'Groups', 'Giving', 
    'Finance', 'Pastoral Care', 'Metrics', 'System Administration', 'Messaging', 
    'Email', 'Polls', 'Workflows', 'Notes'
];

export const BroadcastPermissionsTab: React.FC<BroadcastPermissionsTabProps> = ({ churchId, church, currentUser, allUsers, onUpdateChurch }) => {
    const [lists, setLists] = useState<any[]>([]);
    const [groups, setGroups] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [saving, setSaving] = useState<string | null>(null);

    const broadcastPermissions = church.broadcastPermissions || { allowedAccess: {} };

    useEffect(() => {
        setLoading(true);
        Promise.all([
            pcoService.getPeopleLists(churchId),
            pcoService.getGroups(churchId)
        ]).then(([rawLists, rawGroups]) => {
            setLists(rawLists.map((l: any) => ({
                id: l.id,
                name: l.attributes?.name || l.name || 'Unnamed List',
                count: l.attributes?.total_people ?? l.total_people ?? 0,
                type: 'list'
            })));
            setGroups(rawGroups.map((g: any) => ({
                id: g.id,
                name: g.attributes?.name || g.name || 'Unnamed Group',
                count: g.attributes?.members_count ?? g.attributes?.member_count ?? g.memberCount ?? 0,
                type: 'group'
            })));
        }).catch(err => {
            console.error('Error fetching PCO lists/groups:', err);
        }).finally(() => {
            setLoading(false);
        });
    }, [churchId]);

    const handleRoleToggle = async (itemId: string, role: string) => {
        setSaving(itemId);
        const access = broadcastPermissions.allowedAccess[itemId] || { roles: [], userIds: [] };
        const newRoles = access.roles.includes(role) 
            ? access.roles.filter(r => r !== role)
            : [...access.roles, role];
        
        const newAccessMap = {
            ...broadcastPermissions.allowedAccess,
            [itemId]: { ...access, roles: newRoles }
        };

        try {
            await updateDoc(doc(firebaseDb, 'churches', churchId), {
                'broadcastPermissions.allowedAccess': newAccessMap
            });
            if (onUpdateChurch) {
                onUpdateChurch({ broadcastPermissions: { allowedAccess: newAccessMap } });
            }
        } catch (e) {
            console.error('Failed to update permissions', e);
        } finally {
            setSaving(null);
        }
    };

    const handleUserToggle = async (itemId: string, userId: string) => {
        setSaving(itemId);
        const access = broadcastPermissions.allowedAccess[itemId] || { roles: [], userIds: [] };
        const newUserIds = access.userIds.includes(userId) 
            ? access.userIds.filter((id: string) => id !== userId)
            : [...access.userIds, userId];
        
        const newAccessMap = {
            ...broadcastPermissions.allowedAccess,
            [itemId]: { ...access, userIds: newUserIds }
        };

        try {
            await updateDoc(doc(firebaseDb, 'churches', churchId), {
                'broadcastPermissions.allowedAccess': newAccessMap
            });
            if (onUpdateChurch) {
                onUpdateChurch({ broadcastPermissions: { allowedAccess: newAccessMap } });
            }
        } catch (e) {
            console.error('Failed to update permissions', e);
        } finally {
            setSaving(null);
        }
    };

    const combinedItems = [...lists, ...groups].filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <Loader2 size={32} className="animate-spin mb-4" />
                <p>Loading Planning Center Lists and Groups...</p>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                    <Shield className="text-indigo-600 dark:text-indigo-400" size={20} />
                </div>
                <div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white">Broadcast Permissions</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Restrict who can send SMS and Email broadcasts to specific Planning Center Groups and Lists. 
                        By default, all lists and groups are restricted to Church Admins and System Administrators.
                    </p>
                </div>
            </div>

            <div className="relative mb-6">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                    type="text"
                    placeholder="Search groups and lists..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                />
            </div>

            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <th className="px-6 py-4">Name</th>
                            <th className="px-6 py-4">Type / Count</th>
                            <th className="px-6 py-4">Allowed Roles & Users</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                        {combinedItems.map(item => {
                            const access = broadcastPermissions.allowedAccess[item.id] || { roles: [], userIds: [] };
                            const hasAccess = access.roles.length > 0 || access.userIds.length > 0;

                            return (
                                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            {!hasAccess && <ShieldAlert size={14} className="text-amber-500 shrink-0" title="Restricted by default" />}
                                            <span className="font-semibold text-slate-900 dark:text-white">{item.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-500">
                                        <span className="capitalize font-medium">{item.type}</span> 
                                        <span className="opacity-50 mx-2">•</span> 
                                        {item.count} people
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-2 items-center">
                                            {/* Common roles for quick selection */}
                                            {['Pastor', 'Groups', 'Messaging'].map(role => {
                                                const isActive = access.roles.includes(role);
                                                return (
                                                    <button
                                                        key={role}
                                                        onClick={() => handleRoleToggle(item.id, role)}
                                                        disabled={saving === item.id}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border
                                                            ${isActive 
                                                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-300' 
                                                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700'
                                                            } ${saving === item.id ? 'opacity-50 cursor-not-allowed' : ''}
                                                        `}
                                                    >
                                                        {isActive && <Check size={12} />}
                                                        {role}
                                                    </button>
                                                )
                                            })}
                                            {/* If they want more roles, we can expand it, but these 3 cover 90% of use cases. 
                                                We'll add a catch-all indicator if there are other roles */}
                                            {access.roles.filter((r: string) => !['Pastor', 'Groups', 'Messaging'].includes(r)).map((r: string) => (
                                                <button
                                                    key={r}
                                                    onClick={() => handleRoleToggle(item.id, r)}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 border border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-300 flex items-center gap-1.5"
                                                >
                                                    <Check size={12} /> {r}
                                                </button>
                                            ))}
                                            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-2"></div>
                                            {/* Specific Users */}
                                            {access.userIds?.map((uid: string) => {
                                                const u = allUsers.find(x => x.id === uid);
                                                return (
                                                    <button
                                                        key={uid}
                                                        onClick={() => handleUserToggle(item.id, uid)}
                                                        disabled={saving === item.id}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-300 ${saving === item.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                    >
                                                        <Check size={12} /> {u ? (u.firstName + ' ' + u.lastName).trim() || u.email : 'Unknown User'}
                                                    </button>
                                                );
                                            })}
                                            <select
                                                className={`px-2 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer ${saving === item.id ? 'opacity-50' : ''}`}
                                                disabled={saving === item.id}
                                                value=""
                                                onChange={(e) => {
                                                    if (e.target.value) handleUserToggle(item.id, e.target.value);
                                                }}
                                            >
                                                <option value="">+ Add User</option>
                                                {allUsers
                                                    .filter(u => !access.userIds?.includes(u.id))
                                                    .sort((a, b) => (a.firstName || '').localeCompare(b.firstName || ''))
                                                    .map(u => (
                                                        <option key={u.id} value={u.id}>
                                                            {(u.firstName + ' ' + u.lastName).trim() || u.email}
                                                        </option>
                                                    ))
                                                }
                                            </select>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {combinedItems.length === 0 && (
                            <tr>
                                <td colSpan={3} className="px-6 py-12 text-center text-slate-500">
                                    No lists or groups found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
