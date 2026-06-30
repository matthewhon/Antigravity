import { firestore } from './firestoreService';
import { Church, Ministry, MetricDefinition, MetricEntry } from '../types';

export function extractChannelIdOrHandle(input: string): { id?: string; handle?: string } {
    const clean = input.trim();
    if (!clean) return {};

    // Handles format, e.g., @elevationchurch, youtube.com/@elevationchurch
    const handleMatch = clean.match(/(?:youtube\.com\/|youtu\.be\/)?@([A-Za-z0-9_.-]+)/);
    if (handleMatch) {
        return { handle: `@${handleMatch[1]}` };
    }

    // Channel ID format, e.g., UCxxxxxxxxxxxxxxxxx
    const idMatch = clean.match(/(?:youtube\.com\/channel\/)?(UC[A-Za-z0-9_-]{22})/);
    if (idMatch) {
        return { id: idMatch[1] };
    }

    if (clean.startsWith('@')) {
        return { handle: clean };
    }

    if (clean.startsWith('UC') && clean.length === 24) {
        return { id: clean };
    }

    return { handle: `@${clean}` };
}

export interface YoutubeSyncResult {
    channelName: string;
    avatarUrl: string;
    subscribers: number;
    views: number;
    videos: number;
    latestVideo?: {
        id: string;
        title: string;
        thumbnail: string;
        views: number;
        likes: number;
        comments: number;
        publishedAt: string;
    };
    isMock?: boolean;
}

export async function syncYoutubeMetrics(
    churchId: string,
    channelIdOrUrl: string,
    apiKey?: string
): Promise<YoutubeSyncResult> {
    const { id, handle } = extractChannelIdOrHandle(channelIdOrUrl);
    
    if (!id && !handle) {
        throw new Error('Invalid YouTube Channel ID, Handle, or URL format.');
    }

    let result: YoutubeSyncResult;

    if (!apiKey || apiKey.trim() === '') {
        // Fallback to Mock Sandbox Data
        result = getMockYoutubeData(handle || id || 'Channel');
    } else {
        try {
            // Live query to YouTube Data API
            result = await fetchLiveYoutubeData(id, handle, apiKey);
        } catch (e: any) {
            console.warn("YouTube API call failed, falling back to mock data:", e);
            result = getMockYoutubeData(handle || id || 'Channel');
            result.isMock = true;
        }
    }

    // Save metrics in Firestore
    await saveMetricsToFirestore(churchId, result);

    return result;
}

async function fetchLiveYoutubeData(
    id?: string,
    handle?: string,
    apiKey?: string
): Promise<YoutubeSyncResult> {
    const channelQuery = id 
        ? `id=${encodeURIComponent(id)}` 
        : `forHandle=${encodeURIComponent(handle || '')}`;
        
    const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet,contentDetails&${channelQuery}&key=${apiKey}`;
    
    const channelRes = await fetch(channelUrl);
    if (!channelRes.ok) {
        throw new Error(`YouTube API error: ${channelRes.statusText}`);
    }
    
    const channelData = await channelRes.json();
    if (!channelData.items || channelData.items.length === 0) {
        throw new Error('YouTube channel not found.');
    }

    const channel = channelData.items[0];
    const channelName = channel.snippet.title;
    const avatarUrl = channel.snippet.thumbnails?.medium?.url || channel.snippet.thumbnails?.default?.url || '';
    const subscribers = parseInt(channel.statistics.subscriberCount || '0', 10);
    const views = parseInt(channel.statistics.viewCount || '0', 10);
    const videos = parseInt(channel.statistics.videoCount || '0', 10);
    const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;

    let latestVideo: any = undefined;

    if (uploadsPlaylistId) {
        try {
            // Fetch latest playlist item (uploads playlist contains all uploaded videos ordered by date)
            const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=1&key=${apiKey}`;
            const playlistRes = await fetch(playlistUrl);
            if (playlistRes.ok) {
                const playlistData = await playlistRes.json();
                const item = playlistData.items?.[0];
                if (item) {
                    const videoId = item.contentDetails.videoId;
                    const videoTitle = item.snippet.title;
                    const videoThumb = item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url || '';
                    const publishedAt = item.snippet.publishedAt;

                    // Query video statistics
                    const videoStatsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${apiKey}`;
                    const videoStatsRes = await fetch(videoStatsUrl);
                    let videoViews = 0;
                    let videoLikes = 0;
                    let videoComments = 0;

                    if (videoStatsRes.ok) {
                        const videoStatsData = await videoStatsRes.json();
                        const vStats = videoStatsData.items?.[0]?.statistics;
                        if (vStats) {
                            videoViews = parseInt(vStats.viewCount || '0', 10);
                            videoLikes = parseInt(vStats.likeCount || '0', 10);
                            videoComments = parseInt(vStats.commentCount || '0', 10);
                        }
                    }

                    latestVideo = {
                        id: videoId,
                        title: videoTitle,
                        thumbnail: videoThumb,
                        views: videoViews,
                        likes: videoLikes,
                        comments: videoComments,
                        publishedAt
                    };
                }
            }
        } catch (videoError) {
            console.error("Failed to fetch latest video details:", videoError);
        }
    }

    return {
        channelName,
        avatarUrl,
        subscribers,
        views,
        videos,
        latestVideo
    };
}

function getMockYoutubeData(query: string): YoutubeSyncResult {
    // Generate clean church/channel name
    let name = query.replace(/^@/, '');
    name = name.split(/[-_]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    if (!name.toLowerCase().includes('church') && !name.toLowerCase().includes('ministry')) {
        name = `${name} Church`;
    }

    // Realistic stats based on Elevation Church (as a fun mock template)
    const isElevation = name.toLowerCase().includes('elevation');
    const subscribers = isElevation ? 2450000 : Math.floor(1000 + Math.random() * 50000);
    const views = isElevation ? 842100500 : Math.floor(subscribers * 80 + Math.random() * 20000);
    const videos = isElevation ? 1850 : Math.floor(100 + Math.random() * 800);

    return {
        channelName: name,
        avatarUrl: `https://images.unsplash.com/photo-1544427920-c49ccfb85579?w=150&auto=format&fit=crop&q=60`,
        subscribers,
        views,
        videos,
        latestVideo: {
            id: 'mock_video_id_123',
            title: isElevation ? 'The Power of a Promise | Pastor Steven Furtick' : 'Reclaiming Your Focus in a Busy World',
            thumbnail: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=640&auto=format&fit=crop&q=80',
            views: Math.floor(subscribers * 0.05 + Math.random() * 5000),
            likes: Math.floor(subscribers * 0.005 + Math.random() * 500),
            comments: Math.floor(subscribers * 0.0005 + Math.random() * 50),
            publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() // 3 days ago
        },
        isMock: true
    };
}

async function saveMetricsToFirestore(churchId: string, result: YoutubeSyncResult) {
    try {
        // 1. Get or create YouTube Ministry
        const ministries = await firestore.getMinistries(churchId);
        let youtubeMinistry = ministries.find(m => m.id === 'min_youtube');
        
        if (!youtubeMinistry) {
            youtubeMinistry = {
                id: 'min_youtube',
                churchId,
                name: 'YouTube',
                isActive: true
            };
            await firestore.saveMinistry(youtubeMinistry);
        }

        // 2. Get or create YouTube definitions
        const definitions = await firestore.getMetricDefinitions(churchId);
        const expectedDefs = [
            { id: 'def_yt_subscribers', name: 'YouTube Subscribers' },
            { id: 'def_yt_views', name: 'YouTube Total Views' },
            { id: 'def_yt_videos', name: 'YouTube Videos' }
        ];

        for (const expected of expectedDefs) {
            const exists = definitions.some(d => d.id === expected.id);
            if (!exists) {
                await firestore.saveMetricDefinition({
                    id: expected.id,
                    churchId,
                    ministryId: 'min_youtube',
                    name: expected.name,
                    type: 'number',
                    isActive: true
                });
            }
        }

        // 3. Save today's metric entry
        const todayStr = new Date().toISOString().split('T')[0];
        const entries = await firestore.getMetricEntries(churchId);
        const existingEntry = entries.find(e => e.date === todayStr && e.ministryId === 'min_youtube');
        
        const entryId = existingEntry ? existingEntry.id : `entry_${churchId}_min_youtube_${todayStr}`;
        const newEntryValues = {
            'def_yt_subscribers': result.subscribers,
            'def_yt_views': result.views,
            'def_yt_videos': result.videos
        };

        const metricEntry: MetricEntry = {
            id: entryId,
            churchId,
            date: todayStr,
            ministryId: 'min_youtube',
            values: newEntryValues,
            updatedAt: Date.now(),
            updatedBy: 'system'
        };
        await firestore.saveMetricEntry(metricEntry);

        // 4. (For Sandbox Mock) Write some historical metric entries to simulate a growth trend
        if (result.isMock && entries.filter(e => e.ministryId === 'min_youtube').length < 3) {
            const mockDates = [7, 14, 21, 30].map(daysAgo => {
                const d = new Date();
                d.setDate(d.getDate() - daysAgo);
                return {
                    dateStr: d.toISOString().split('T')[0],
                    factor: 1 - (daysAgo * 0.002) // subtle subtraction for older dates (growth)
                };
            });

            for (const mock of mockDates) {
                const histEntryId = `entry_${churchId}_min_youtube_${mock.dateStr}`;
                const histEntry: MetricEntry = {
                    id: histEntryId,
                    churchId,
                    date: mock.dateStr,
                    ministryId: 'min_youtube',
                    values: {
                        'def_yt_subscribers': Math.floor(result.subscribers * mock.factor),
                        'def_yt_views': Math.floor(result.views * mock.factor),
                        'def_yt_videos': Math.floor(result.videos - (30 - Math.floor(mock.factor * 30)))
                    },
                    updatedAt: Date.now(),
                    updatedBy: 'system'
                };
                await firestore.saveMetricEntry(histEntry);
            }
        }

        // 5. Update Church document with cached values
        const churchUpdates: Partial<Church> = {
            metricsSettings: {
                showCensusWidgets: false, // fallback defaults
                showCityPenetration: false,
                showMissionalGap: false,
                dashboardOrder: [],
                // Merge in existing settings
                ...(await firestore.getChurch(churchId))?.metricsSettings,
                youtubeChannelId: result.channelName,
                youtubeChannelName: result.channelName,
                youtubeChannelAvatar: result.avatarUrl,
                youtubeSubscribers: result.subscribers,
                youtubeViews: result.views,
                youtubeVideos: result.videos,
                youtubeLastSynced: Date.now(),
                youtubeLatestVideo: result.latestVideo
            }
        };

        await firestore.updateChurch(churchId, churchUpdates);

    } catch (e) {
        console.error("Failed to save YouTube metrics to Firestore:", e);
    }
}
