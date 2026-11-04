import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTeamChat } from '../../contexts/TeamChatContext';
import { TeamChatWorkspace } from './TeamChatWorkspace';

export const TeamChatDrawer: React.FC = () => {
    const { isDrawerOpen, setIsDrawerOpen } = useTeamChat();
    const navigate = useNavigate();

    useEffect(() => {
        if (!isDrawerOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsDrawerOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isDrawerOpen, setIsDrawerOpen]);

    if (!isDrawerOpen) return null;

    return (
        <div className="fixed inset-0 z-[95] flex justify-end pointer-events-none">
            {/* Subtle backdrop on mobile only so desktop users can inspect dashboard behind the drawer */}
            <div
                className="fixed inset-0 bg-slate-950/30 sm:bg-transparent pointer-events-auto sm:pointer-events-none"
                onClick={() => setIsDrawerOpen(false)}
            />
            <div className="relative w-full sm:w-[460px] md:w-[500px] h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl pointer-events-auto flex flex-col animate-in slide-in-from-right duration-200">
                <TeamChatWorkspace
                    isCompactDrawer
                    onCloseDrawer={() => setIsDrawerOpen(false)}
                    onExpandToFullPage={() => {
                        setIsDrawerOpen(false);
                        navigate('/tools/team-chat');
                    }}
                />
            </div>
        </div>
    );
};
