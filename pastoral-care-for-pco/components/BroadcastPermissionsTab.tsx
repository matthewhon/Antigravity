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

export const BroadcastPermissionsTab: React.FC<BroadcastPermissionsTabProps> = ({ churchId, church, currentUser, allUsers, onUpdateChurch }) => {
    const [lists, setLists] = useState<any[]>([]);
    const [groups, setGroups] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [saving, setSaving] = useState<string | null>(null);
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
    const [members, setMembers] = useState<any[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [selectedItems, setSelectedItems] = useState<string[]>([]);

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

    const handleUserToggle = async (itemId: string, userId: string) => {
        setSaving(itemId);
        const access = broadcastPermissions.allowedAccess[itemId] || { roles: [], userIds: [] };
        const currentUserIds = access.userIds || [];
        const newUserIds = currentUserIds.includes(userId) 
            ? currentUserIds.filter((id: string) => id !== userId)
            : [...currentUserIds, userId];
        
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

    const handleViewMembers = async (item: any) => {
        setSelectedItem(item);
        setLoadingMembers(true);
        setMembers([]);
        try {
            if (item.type === 'list') {
                const data = await pcoService.getListMembersDetails(churchId, item.id);
                setMembers(data);
            } else {
                const data = await pcoService.getGroupMembersDetails(churchId, item.id);
                setMembers(data);
            }
        } catch (e) {
            console.error('Failed to fetch members', e);
        } finally {
            setLoadingMembers(false);
        }
    };

    const handleBulkAssign = async (userId: string) => {
        if (!userId || selectedItems.length === 0) return;
        
        const newAccessMap = { ...broadcastPermissions.allowedAccess };
        
        selectedItems.forEach(itemId => {
            const access = newAccessMap[itemId] || { roles: [], userIds: [] };
            const currentUserIds = access.userIds || [];
            if (!currentUserIds.includes(userId)) {
                newAccessMap[itemId] = { ...access, userIds: [...currentUserIds, userId] };
            }
        });

        try {
            await updateDoc(doc(firebaseDb, 'churches', churchId), {
                'broadcastPermissions.allowedAccess': newAccessMap
            });
            if (onUpdateChurch) {
                onUpdateChurch({ broadcastPermissions: { allowedAccess: newAccessMap } });
            }
            setSelectedItems([]); 
        } catch (e) {
            console.error('Failed to update bulk permissions', e);
        }
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>, currentItems: any[]) => {
        if (e.target.checked) {
            const allIds = currentItems.map(i => i.id);
            setSelectedItems(Array.from(new Set([...selectedItems, ...allIds])));
        } else {
            const allIds = currentItems.map(i => i.id);
            setSelectedItems(selectedItems.filter(id => !allIds.includes(id)));
        }
    };

    const handleSelectItem = (id: string) => {
        setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
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

            {selectedItems.length > 0 && (
                <div className="mb-6 p-4 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 rounded-2xl flex items-center justify-between">
                    <span className="text-indigo-800 dark:text-indigo-200 font-semibold text-sm">
                        {selectedItems.length} item{selectedItems.length > 1 ? 's' : ''} selected
                    </span>
                    <div className="flex items-center gap-3">
                        <select
                            className="px-3 py-2 rounded-lg text-sm font-semibold border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-slate-800 text-indigo-900 dark:text-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                            value=""
                            onChange={(e) => {
                                if (e.target.value) handleBulkAssign(e.target.value);
                            }}
                        >
                            <option value="">+ Assign User to Selected</option>
                            {allUsers
                                .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                                .map(u => (
                                    <option key={u.id} value={u.id}>
                                        {u.name || u.email}
                                    </option>
                                ))
                            }
                        </select>
                        <button 
                            onClick={() => setSelectedItems([])}
                            className="text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                        >
                            Clear Selection
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <th className="px-6 py-4 w-10">
                                <input 
                                    type="checkbox"
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-700 dark:border-slate-600 cursor-pointer w-4 h-4"
                                    checked={combinedItems.length > 0 && combinedItems.every(i => selectedItems.includes(i.id))}
                                    onChange={(e) => handleSelectAll(e, combinedItems)}
                                />
                            </th>
                            <th className="px-6 py-4">Name</th>
                            <th className="px-6 py-4">Type / Count</th>
                            <th className="px-6 py-4">Allowed Users</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                        {combinedItems.map(item => {
                            const access = broadcastPermissions.allowedAccess[item.id] || { roles: [], userIds: [] };
                            const hasAccess = access.roles.length > 0 || access.userIds.length > 0;
                            const isSelected = selectedItems.includes(item.id);

                            return (
                                <tr key={item.id} className={`${isSelected ? 'bg-indigo-50/50 dark:bg-indigo-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'} transition`}>
                                    <td className="px-6 py-4">
                                        <input 
                                            type="checkbox"
                                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-700 dark:border-slate-600 cursor-pointer w-4 h-4"
                                            checked={isSelected}
                                            onChange={() => handleSelectItem(item.id)}
                                        />
                                    </td>
                                    <td className="px-6 py-4">
                                        <div 
                                            className="flex items-center gap-2 cursor-pointer group"
                                            onClick={() => handleViewMembers(item)}
                                        >
                                            {!hasAccess && <ShieldAlert size={14} className="text-amber-500 shrink-0" title="Restricted by default" />}
                                            <span className="font-semibold text-slate-900 dark:text-white group-hover:text-indigo-500 transition">{item.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-500">
                                        <span className="capitalize font-medium">{item.type}</span> 
                                        <span className="opacity-50 mx-2">•</span> 
                                        {item.count} people
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-2 items-center">
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
                                                        <Check size={12} /> {u ? (u.name || u.email) : 'Unknown User'}
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
                                                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                                                    .map(u => (
                                                        <option key={u.id} value={u.id}>
                                                            {u.name || u.email}
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
                                <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                                    No lists or groups found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {selectedItem && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-3xl flex flex-col max-h-[85vh]">
                        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700/50">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                                    {selectedItem.name}
                                </h3>
                                <p className="text-sm text-slate-500 capitalize">
                                    {selectedItem.type} Members ({selectedItem.count})
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedItem(null)}
                                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto flex-1">
                            {loadingMembers ? (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                    <Loader2 size={32} className="animate-spin mb-4" />
                                    <p>Loading members...</p>
                                </div>
                            ) : (
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                            <th className="px-4 py-3">Name</th>
                                            <th className="px-4 py-3">Phone</th>
                                            <th className="px-4 py-3">Email</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                        {members.map((member: any, i: number) => (
                                            <tr key={member.id || i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                                <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">
                                                    {member.name}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-500">
                                                    {member.phones?.length > 0 ? member.phones.join(', ') : <span className="text-slate-300 italic">None</span>}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-500">
                                                    {member.emails?.length > 0 ? member.emails.join(', ') : <span className="text-slate-300 italic">None</span>}
                                                </td>
                                            </tr>
                                        ))}
                                        {members.length === 0 && (
                                            <tr>
                                                <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                                                    No members found.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
