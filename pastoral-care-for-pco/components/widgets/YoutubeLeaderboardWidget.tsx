import React from 'react';

interface SermonVideo {
    id: string;
    title: string;
    thumbnail: string;
    views: number;
    likes: number;
    comments: number;
    publishedAt: string;
    engagementScore: number;
}

interface YoutubeLeaderboardWidgetProps {
    videos?: SermonVideo[];
    channelName?: string;
}

export const YoutubeLeaderboardWidget: React.FC<YoutubeLeaderboardWidgetProps> = ({
    videos = [],
    channelName = 'YouTube'
}) => {
    // Fallback top videos if sync hasn't run yet
    const activeVideos = (videos && videos.length > 0) ? videos : [
        {
            id: 'mock_v1',
            title: `${channelName} — The Power of a Promise`,
            thumbnail: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=640&auto=format&fit=crop&q=80',
            views: 45200,
            likes: 2150,
            comments: 310,
            publishedAt: new Date().toISOString(),
            engagementScore: 12.9
        },
        {
            id: 'mock_v2',
            title: 'Overcoming Fear & Walking in Boldness',
            thumbnail: 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=640&auto=format&fit=crop&q=80',
            views: 38400,
            likes: 1840,
            comments: 240,
            publishedAt: new Date().toISOString(),
            engagementScore: 12.7
        },
        {
            id: 'mock_v3',
            title: 'Sunday Worship Experience — Live Praise',
            thumbnail: 'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?w=640&auto=format&fit=crop&q=80',
            views: 29100,
            likes: 1420,
            comments: 185,
            publishedAt: new Date().toISOString(),
            engagementScore: 12.9
        }
    ];

    const rankEmojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

    return (
        <div className="flex flex-col justify-between h-full space-y-3 min-w-0">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 flex-wrap min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xl shrink-0">🏆</span>
                    <div className="min-w-0">
                        <h5 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider truncate">
                            Sermon Video Leaderboard
                        </h5>
                        <p className="text-[11px] text-slate-400 truncate">
                            Top messages ranked by audience engagement score
                        </p>
                    </div>
                </div>

                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 shrink-0">
                    Top {activeVideos.length} Videos
                </span>
            </div>

            {/* Video List */}
            <div className="space-y-2.5 min-w-0">
                {activeVideos.map((vid, index) => (
                    <div 
                        key={vid.id || index}
                        className="bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 p-2.5 rounded-2xl flex items-center justify-between gap-2.5 transition-all min-w-0 flex-wrap sm:flex-nowrap"
                    >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {/* Rank Badge */}
                            <div className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-xs font-black text-slate-700 dark:text-slate-300 shrink-0">
                                {rankEmojis[index] || `#${index + 1}`}
                            </div>

                            {/* Thumbnail */}
                            <div className="w-12 h-8 rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-800 shrink-0 relative border border-slate-200/50 dark:border-slate-700/50">
                                {vid.thumbnail ? (
                                    <img src={vid.thumbnail} alt={vid.title} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400">▶️</div>
                                )}
                            </div>

                            {/* Title & Stats */}
                            <div className="min-w-0 flex-1">
                                <a 
                                    href={`https://youtube.com/watch?v=${vid.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs font-bold text-slate-900 dark:text-white hover:text-indigo-500 truncate block leading-snug"
                                >
                                    {vid.title}
                                </a>
                                <div className="flex items-center gap-2 text-[10px] font-medium text-slate-400 truncate mt-0.5">
                                    <span>👁️ {vid.views.toLocaleString()}</span>
                                    <span>👍 {vid.likes.toLocaleString()}</span>
                                    <span>💬 {vid.comments.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        {/* Engagement Rating Badge */}
                        <div className="shrink-0 text-right">
                            <span className="inline-block text-[9px] font-black px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 whitespace-nowrap">
                                {vid.engagementScore}% Engagement
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
