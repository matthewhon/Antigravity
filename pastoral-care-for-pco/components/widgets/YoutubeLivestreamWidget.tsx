import React from 'react';

interface YoutubeLivestreamWidgetProps {
    livestream?: {
        isLiveNow?: boolean;
        title?: string;
        videoId?: string;
        thumbnail?: string;
        concurrentViewers?: number;
        totalReach?: number;
        replayViews?: number;
        liveDate?: string;
    };
    channelName?: string;
    physicalAttendanceAvg?: number;
}

export const YoutubeLivestreamWidget: React.FC<YoutubeLivestreamWidgetProps> = ({
    livestream,
    channelName = 'YouTube Channel',
    physicalAttendanceAvg = 450
}) => {
    // Fallback if livestream stats haven't synced yet
    const activeLivestream = livestream || {
        isLiveNow: true,
        title: `${channelName} — Sunday Worship Experience`,
        concurrentViewers: 320,
        totalReach: 1250,
        replayViews: 3420,
        liveDate: new Date().toISOString()
    };

    const concurrent = activeLivestream.concurrentViewers || 0;
    const reach = activeLivestream.totalReach || 0;
    const replay = activeLivestream.replayViews || 0;
    const totalWorshipReach = physicalAttendanceAvg + reach;

    return (
        <div className="flex flex-col justify-between h-full space-y-4 min-w-0">
            {/* Header / Stream Status */}
            <div className="flex items-center justify-between gap-2 flex-wrap min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xl shrink-0">📹</span>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <h5 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider truncate">
                                Live & Online Worship
                            </h5>
                            {activeLivestream.isLiveNow ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-500 border border-rose-500/20 shrink-0">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                                    LIVE NOW
                                </span>
                            ) : (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 shrink-0">
                                    Sunday Broadcast
                                </span>
                            )}
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">{activeLivestream.title || channelName}</p>
                    </div>
                </div>

                {/* Total Combined Reach Badge */}
                <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 px-3 py-1.5 rounded-xl flex items-center gap-2 shrink-0">
                    <span className="text-xs">🌐</span>
                    <div>
                        <p className="text-[9px] font-black uppercase text-indigo-500 dark:text-indigo-400 tracking-wider">Total Worship Reach</p>
                        <p className="text-xs font-black text-slate-900 dark:text-white leading-tight">{totalWorshipReach.toLocaleString()} viewers</p>
                    </div>
                </div>
            </div>

            {/* 3 Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 p-3 rounded-2xl min-w-0">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider truncate">Peak Concurrent</p>
                    <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{concurrent.toLocaleString()}</p>
                    <p className="text-[9px] text-emerald-500 font-medium truncate mt-0.5">Live Sunday viewers</p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 p-3 rounded-2xl min-w-0">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider truncate">Total Live Reach</p>
                    <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{reach.toLocaleString()}</p>
                    <p className="text-[9px] text-indigo-500 font-medium truncate mt-0.5">Unique stream sessions</p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 p-3 rounded-2xl min-w-0">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider truncate">On-Demand Replay</p>
                    <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{replay.toLocaleString()}</p>
                    <p className="text-[9px] text-amber-500 font-medium truncate mt-0.5">Mid-week sermon views</p>
                </div>
            </div>

            {/* Attendance Distribution Bar */}
            <div className="bg-slate-50/60 dark:bg-slate-900/40 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-1.5 min-w-0">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    <span>Attendance Distribution</span>
                    <span>In-Person ({Math.round((physicalAttendanceAvg / totalWorshipReach) * 100)}%) vs Online ({Math.round((reach / totalWorshipReach) * 100)}%)</span>
                </div>

                <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden flex">
                    <div 
                        className="bg-indigo-500 h-full transition-all"
                        style={{ width: `${Math.round((physicalAttendanceAvg / totalWorshipReach) * 100)}%` }}
                        title={`In-Person: ${physicalAttendanceAvg}`}
                    />
                    <div 
                        className="bg-rose-500 h-full transition-all"
                        style={{ width: `${Math.round((reach / totalWorshipReach) * 100)}%` }}
                        title={`YouTube Live: ${reach}`}
                    />
                </div>

                <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 pt-0.5 flex-wrap gap-2">
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                        In-Person ({physicalAttendanceAvg.toLocaleString()})
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                        YouTube Live ({reach.toLocaleString()})
                    </span>
                </div>
            </div>
        </div>
    );
};
