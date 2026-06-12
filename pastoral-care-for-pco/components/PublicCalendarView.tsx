import React, { useState, useEffect } from 'react';
import { PastoralCalendar } from './PastoralCalendar';
import { firestore } from '../services/firestoreService';
import { PcoPerson } from '../types';

interface PublicCalendarViewProps {
    churchId: string;
}

export const PublicCalendarView: React.FC<PublicCalendarViewProps> = ({ churchId }) => {
    const [people, setPeople] = useState<PcoPerson[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const fetchedPeople = await firestore.getPeople(churchId);
                setPeople(fetchedPeople);
            } catch (error) {
                console.error("Failed to load people for public calendar:", error);
            } finally {
                setLoading(false);
            }
        };

        if (churchId) fetchData();
    }, [churchId]);

    if (loading) {
        return <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-slate-950 text-slate-400 font-bold text-sm">Loading Calendar...</div>;
    }

    return (
        <div className="w-full h-screen bg-white dark:bg-slate-950 p-4 overflow-y-auto custom-scrollbar">
            <PastoralCalendar people={people} />
        </div>
    );
};
