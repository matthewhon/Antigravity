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
    if (!videos || videos.length === 0) {
        return (
            <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl p-6 shadow-sm">
                <p className="text-xs text-slate-400">No sermon video leaderboard data available. Sync YouTube in Settings.</p>
            </div>
        );
    }

    const rankEmojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

    return (
        <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl p-6 shadow-sm space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <span className="text-2xl">🏆</span>
                    <div>
                        <h3 className="text-sm font-black tracking-wide text-white uppercase">
                            Sermon Video Leaderboard
                        </h3>
                        <p className="text-xs text-slate-400">
                            Top performing messages ranked by audience reach & engagement score
                        </p>
                    </div>
                </div>

                <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                    Top {videos.length} Videos
                </span>
            </div>

            {/* Video List */}
            <div className="space-y-3">
                {videos.map((vid, index) => (
                    <div 
                        key={vid.id || index}
                        className="bg-slate-850 border border-slate-800 hover:border-slate-700 p-3 rounded-2xl flex items-center gap-3.5 transition-all"
                    >
                        {/* Rank Badge */}
                        <div className="w-7 h-7 rounded-xl bg-slate-800 flex items-center justify-center text-sm font-black text-slate-300 shrink-0">
                            {rankEmojis[index] || `#${index + 1}`}
                        </div>

                        {/* Thumbnail */}
                        <div className="w-16 h-10 rounded-lg overflow-hidden bg-slate-800 shrink-0 relative border border-slate-700">
                            {vid.thumbnail ? (
                                <img src={vid.thumbnail} alt={vid.title} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">▶️</div>
                            )}
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                            <a 
                                href={`https://youtube.com/watch?v=${vid.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-bold text-white hover:text-indigo-400 transition-colors line-clamp-1 block"
                            >
                                {vid.title}
                            </a>
                            <div className="flex items-center gap-3 text-[10px] font-semibold text-slate-400 mt-1">
                                <span>👁️ {vid.views.toLocaleString()} views</span>
                                <span>👍 {vid.likes.toLocaleString()}</span>
                                <span>💬 {vid.comments.toLocaleString()}</span>
                            </div>
                        </div>

                        {/* Engagement Rating Pill */}
                        <div className="text-right shrink-0">
                            <span className="inline-block text-[10px] font-black px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                {vid.engagementScore}% Engagement
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
