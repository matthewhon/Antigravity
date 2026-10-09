import { getDb } from './firebase';
import { fetchFromPco } from './publicApi';
import { stripHtml } from '../services/readability';

export interface RecommendedItem {
    id: string;
    type: 'registration' | 'calendar' | 'group' | 'announcement' | 'service';
    label: string;
    description?: string;
    date?: string;             // Human formatted e.g. "Sat, Oct 17 @ 6:00 PM"
    startsAt?: string;         // ISO string
    url?: string;
    urgencyReason: string;     // e.g. "Closes in 2 days · 4 spots left"
    score: number;             // Higher = recommended higher
    tags: string[];            // ['closing_soon', 'limited_capacity', 'new_group']
    featuredRecently?: boolean;
}

const formatDate = (isoStr?: string | null): string => {
    if (!isoStr) return '';
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: d.getHours() || d.getMinutes() ? 'numeric' : undefined,
            minute: d.getMinutes() ? '2-digit' : undefined,
        });
    } catch {
        return '';
    }
};

const toTimestamp = (val?: string | number | Date | any | null): number | null => {
    if (val === undefined || val === null) return null;
    if (typeof val === 'number') return val;
    if (val instanceof Date) return val.getTime();
    if (typeof val?.toDate === 'function') return val.toDate().getTime();
    const parsed = new Date(String(val)).getTime();
    return isNaN(parsed) ? null : parsed;
};

const daysDiff = (target?: string | number | Date | any | null, fromTime?: string | number | Date | any | null): number | null => {
    const t = toTimestamp(target);
    const f = fromTime !== undefined && fromTime !== null ? toTimestamp(fromTime) : Date.now();
    if (t === null || f === null) return null;
    return Math.round((t - f) / (1000 * 60 * 60 * 24));
};

const normalizeName = (name: string): string =>
    (name || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Returns deterministic recommendations of what to include in upcoming campaigns.
 */
export async function getRecommendations(churchId: string, daysAhead = 14): Promise<{
    recommendations: RecommendedItem[];
    windowDays: number;
    sourcesCount: Record<string, number>;
}> {
    const db = getDb();
    const now = Date.now();
    const churchDoc = await db.collection('churches').doc(churchId).get();
    const churchData = churchDoc.exists ? churchDoc.data() : null;
    const isSimulated = churchId === 'c1' || !churchData?.pcoAccessToken;

    const rawCandidates: {
        item: RecommendedItem;
        rawName: string;
        startsAtEpoch?: number;
    }[] = [];

    const sourcesCount: Record<string, number> = {
        registrations: 0,
        calendar: 0,
        groups: 0,
        announcements: 0,
        services: 0,
    };

    // ── 1. Registrations (from Firestore pco_registrations) ──
    try {
        const regSnap = await db.collection('pco_registrations')
            .where('churchId', '==', churchId)
            .get();

        for (const doc of regSnap.docs) {
            const r = doc.data();
            const startsAt = r.startsAt || null;
            const daysToEvent = daysDiff(startsAt, now);
            const daysToClose = daysDiff(r.closeAt, now);
            const daysSinceOpen = r.openAt ? daysDiff(now, new Date(r.openAt).getTime()) : null;

            // Only consider if event is in the upcoming window or close deadline is coming up
            if (daysToEvent !== null && (daysToEvent < -1 || daysToEvent > daysAhead + 7)) {
                // Ignore events that already passed or are too far out
                continue;
            }

            let score = 50;
            const tags: string[] = [];
            const reasons: string[] = [];

            // Capacity pressure
            const signups = r.signupCount || 0;
            const limit = r.signupLimit || null;
            if (limit && limit > 0) {
                const spotsLeft = Math.max(0, limit - signups);
                const percentFull = signups / limit;
                if (spotsLeft <= 5 || percentFull >= 0.85) {
                    score += 35;
                    tags.push('limited_capacity');
                    reasons.push(spotsLeft === 0 ? 'Waitlist only' : `Only ${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left`);
                }
            }
            if ((r.waitlistedCount || 0) > 0) {
                score += 15;
                tags.push('high_demand');
                reasons.push(`${r.waitlistedCount} waitlisted`);
            }

            // Close deadline
            if (daysToClose !== null && daysToClose >= 0 && daysToClose <= 7) {
                score += daysToClose <= 3 ? 40 : 25;
                tags.push('closing_soon');
                reasons.unshift(daysToClose === 0 ? 'Registration closes today!' : `Closes in ${daysToClose} day${daysToClose === 1 ? '' : 's'}`);
            }

            // Newly opened
            if (daysSinceOpen !== null && daysSinceOpen >= 0 && daysSinceOpen <= 7) {
                score += 20;
                tags.push('newly_opened');
                reasons.push('Registration just opened');
            }

            // Low signups warning for an event happening soon
            if (daysToEvent !== null && daysToEvent <= 10 && signups < 5) {
                score += 25;
                tags.push('needs_signups');
                reasons.push(`Needs attendees (${signups} signed up)`);
            }

            const cleanDesc = stripHtml(r.description || '').slice(0, 280);
            sourcesCount.registrations++;
            rawCandidates.push({
                item: {
                    id: `reg_${doc.id}`,
                    type: 'registration',
                    label: r.name || 'Registration Event',
                    description: cleanDesc || undefined,
                    date: formatDate(startsAt),
                    startsAt: startsAt || undefined,
                    url: r.publicUrl || undefined,
                    urgencyReason: reasons.join(' · ') || 'Upcoming registration event',
                    score,
                    tags,
                },
                rawName: normalizeName(r.name || ''),
                startsAtEpoch: startsAt ? new Date(startsAt).getTime() : undefined,
            });
        }
    } catch (e) {
        console.warn('[ContentRecommender] Failed to load registrations from Firestore:', e);
    }

    // ── 2. Calendar Events (from PCO Calendar API) ──
    if (!isSimulated) {
        try {
            const data = await fetchFromPco(churchId, 'https://api.planningcenteronline.com/calendar/v2/event_instances?include=event&filter=future&per_page=100');
            const includedEvents = data.included || [];

            for (const instance of data.data || []) {
                const eventId = instance.relationships?.event?.data?.id;
                const parentEvent = includedEvents.find((inc: any) => inc.type === 'Event' && inc.id === eventId);
                const eventDetails = parentEvent ? parentEvent.attributes : {};

                const startsAt = instance.attributes.starts_at || null;
                const daysToStart = daysDiff(startsAt, now);

                if (daysToStart === null || daysToStart < 0 || daysToStart > daysAhead) {
                    continue;
                }

                let score = 40;
                const tags: string[] = ['upcoming_event'];
                let reason = `Happening in ${daysToStart} day${daysToStart === 1 ? '' : 's'}`;

                if (daysToStart === 0) {
                    score += 30;
                    reason = 'Happening today!';
                } else if (daysToStart <= 3) {
                    score += 25;
                    reason = 'This week';
                } else if (daysToStart <= 7) {
                    score += 15;
                }

                const name = eventDetails.name || instance.attributes.title || 'Church Event';
                const cleanDesc = stripHtml(eventDetails.description || '').slice(0, 280);
                sourcesCount.calendar++;

                rawCandidates.push({
                    item: {
                        id: `cal_${instance.id}`,
                        type: 'calendar',
                        label: name,
                        description: cleanDesc || undefined,
                        date: formatDate(startsAt),
                        startsAt: startsAt || undefined,
                        url: eventDetails.church_center_url || eventDetails.public_url || undefined,
                        urgencyReason: reason,
                        score,
                        tags,
                    },
                    rawName: normalizeName(name),
                    startsAtEpoch: startsAt ? new Date(startsAt).getTime() : undefined,
                });
            }
        } catch (e) {
            console.warn('[ContentRecommender] Failed to fetch PCO Calendar events:', e);
        }
    }

    // ── 3. PCO Announcements (Publishing API) ──
    if (!isSimulated) {
        try {
            const pubData = await fetchFromPco(churchId, 'https://api.planningcenteronline.com/publishing/v2/announcements?per_page=30');
            for (const ann of pubData.data || []) {
                const attrs = ann.attributes || {};
                const pubAt = attrs.published_at || null;
                const daysOld = daysDiff(now, pubAt ? new Date(pubAt).getTime() : null);

                if (daysOld !== null && daysOld > 21) continue; // Skip older announcements

                let score = 35;
                const tags: string[] = ['announcement'];
                let reason = 'Church Announcement';
                if (daysOld !== null && daysOld <= 5) {
                    score += 25;
                    tags.push('recent');
                    reason = 'New announcement this week';
                }

                sourcesCount.announcements++;
                rawCandidates.push({
                    item: {
                        id: `ann_${ann.id}`,
                        type: 'announcement',
                        label: attrs.title || 'Announcement',
                        description: attrs.summary || attrs.description || undefined,
                        date: formatDate(pubAt),
                        startsAt: pubAt || undefined,
                        urgencyReason: reason,
                        score,
                        tags,
                    },
                    rawName: normalizeName(attrs.title || ''),
                });
            }
        } catch {
            // Publishing scope may not be granted on older tokens; fail silently
        }
    }

    // ── 4. Small Groups (Firestore groups) ──
    try {
        const grpSnap = await db.collection('groups').where('churchId', '==', churchId).get();
        for (const doc of grpSnap.docs) {
            const g = doc.data();
            if (g.isPublic === false || g.archivedAt) continue;

            const daysSinceCreated = g.createdAt ? daysDiff(now, new Date(g.createdAt).getTime()) : null;
            const members = g.membersCount || 0;

            // Only highlight if new or has open room
            let score = 25;
            const tags: string[] = ['small_group'];
            const reasons: string[] = [];

            if (daysSinceCreated !== null && daysSinceCreated <= 30) {
                score += 30;
                tags.push('new_group');
                reasons.push('New group forming');
            } else if (members < 8) {
                score += 15;
                tags.push('open_spots');
                reasons.push(`${members} member${members === 1 ? '' : 's'} · Open spots`);
            } else {
                continue; // Regular established group, don't overwhelm recommendations
            }

            sourcesCount.groups++;
            rawCandidates.push({
                item: {
                    id: `grp_${doc.id}`,
                    type: 'group',
                    label: `${g.name || 'Small Group'} (${g.groupTypeName || 'Group'})`,
                    description: g.description ? stripHtml(g.description).slice(0, 240) : undefined,
                    urgencyReason: reasons.join(' · ') || 'Community Group',
                    score,
                    tags,
                },
                rawName: normalizeName(g.name || ''),
            });
        }
    } catch (e) {
        console.warn('[ContentRecommender] Failed to load groups:', e);
    }

    // ── 5. Service Plans (Firestore service_plans) ──
    try {
        const planSnap = await db.collection('service_plans').where('churchId', '==', churchId).get();
        for (const doc of planSnap.docs) {
            const p = doc.data();
            const dateStr = p.sortDate || p.dates;
            const daysToService = daysDiff(dateStr, now);

            if (daysToService !== null && daysToService >= 0 && daysToService <= 7) {
                const label = p.seriesTitle ? `${p.seriesTitle}: ${p.planTitle || 'Service'}` : (p.planTitle || 'Sunday Worship');
                sourcesCount.services++;
                rawCandidates.push({
                    item: {
                        id: `srv_${doc.id}`,
                        type: 'service',
                        label,
                        date: formatDate(dateStr),
                        startsAt: dateStr || undefined,
                        urgencyReason: 'Upcoming weekend service plan',
                        score: 45,
                        tags: ['service_plan'],
                    },
                    rawName: normalizeName(label),
                });
            }
        }
    } catch (e) {
        console.warn('[ContentRecommender] Failed to load service plans:', e);
    }

    // ── Simulated Fallback (for demo church c1 or development mode without full live tokens) ──
    if (rawCandidates.length === 0 && isSimulated) {
        const simDate = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();
        const simClose = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
        rawCandidates.push(
            {
                item: {
                    id: 'sim_reg_1',
                    type: 'registration',
                    label: 'Fall Family Camp Retreat',
                    description: 'A weekend in the mountains with family activities, worship nights, and outdoor adventure.',
                    date: formatDate(simDate),
                    startsAt: simDate,
                    url: 'https://demo.churchcenter.com/registrations/events/family-camp',
                    urgencyReason: 'Closes in 2 days · Only 4 spots left',
                    score: 95,
                    tags: ['closing_soon', 'limited_capacity'],
                },
                rawName: normalizeName('Fall Family Camp Retreat'),
            },
            {
                item: {
                    id: 'sim_cal_1',
                    type: 'calendar',
                    label: 'Water Baptism Celebration',
                    description: 'Celebrate new life in Christ with outdoor baptisms and churchwide picnic lunch.',
                    date: formatDate(new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString()),
                    url: 'https://demo.churchcenter.com/calendar/baptisms',
                    urgencyReason: 'This Sunday',
                    score: 75,
                    tags: ['upcoming_event'],
                },
                rawName: normalizeName('Water Baptism Celebration'),
            },
            {
                item: {
                    id: 'sim_grp_1',
                    type: 'group',
                    label: 'Young Adults Midweek Study (Small Group)',
                    description: 'Studying the Book of Romans on Thursday evenings with dinner and discussion.',
                    urgencyReason: 'New group forming · 6 members',
                    score: 65,
                    tags: ['new_group', 'open_spots'],
                },
                rawName: normalizeName('Young Adults Midweek Study'),
            },
            {
                item: {
                    id: 'sim_ann_1',
                    type: 'announcement',
                    label: 'Kids Ministry Volunteer Orientation',
                    description: 'Join us for a 30-minute training session after second service this Sunday.',
                    urgencyReason: 'New announcement this week',
                    score: 60,
                    tags: ['announcement'],
                },
                rawName: normalizeName('Kids Ministry Volunteer Orientation'),
            }
        );
    }

    // ── 6. Check Recent Campaigns & Bulletins (Penalize recently featured items) ──
    const recentMentionedWords = new Set<string>();
    try {
        const [campsSnap, bullSnap] = await Promise.all([
            db.collection('email_campaigns').where('churchId', '==', churchId).get(),
            db.collection('digital_bulletins').where('churchId', '==', churchId).get(),
        ]);

        const allPastTexts: string[] = [];
        for (const doc of campsSnap.docs) {
            const c = doc.data();
            const daysSinceSent = c.sentAt ? daysDiff(now, c.sentAt) : null;
            if (daysSinceSent !== null && daysSinceSent <= 14) {
                allPastTexts.push((c.subject || '') + ' ' + (c.name || ''));
            }
        }
        for (const doc of bullSnap.docs) {
            const b = doc.data();
            const daysSincePub = b.publishedAt ? daysDiff(now, b.publishedAt) : null;
            if (daysSincePub !== null && daysSincePub <= 14) {
                allPastTexts.push(b.title || '');
            }
        }

        const combinedText = allPastTexts.join(' ').toLowerCase();
        for (const cand of rawCandidates) {
            const words = cand.rawName.split(' ').filter(w => w.length > 3);
            if (words.length > 0 && words.some(w => combinedText.includes(w))) {
                cand.item.featuredRecently = true;
                cand.item.score -= 25; // Apply repetition penalty
                cand.item.urgencyReason += ' (Featured in recent send)';
            }
        }
    } catch (e) {
        console.warn('[ContentRecommender] Failed to check recent sends:', e);
    }

    // ── 7. De-duplication (merge Calendar Event into Registration Event if same event) ──
    const mergedList: RecommendedItem[] = [];
    const usedIndices = new Set<number>();

    for (let i = 0; i < rawCandidates.length; i++) {
        if (usedIndices.has(i)) continue;
        const cur = rawCandidates[i];

        // Search for matches
        for (let j = i + 1; j < rawCandidates.length; j++) {
            if (usedIndices.has(j)) continue;
            const other = rawCandidates[j];

            const nameMatch = cur.rawName.includes(other.rawName) || other.rawName.includes(cur.rawName);
            const timeDiffHours = cur.startsAtEpoch && other.startsAtEpoch
                ? Math.abs(cur.startsAtEpoch - other.startsAtEpoch) / (1000 * 60 * 60)
                : null;
            const closeInTime = timeDiffHours === null || timeDiffHours <= 36;

            if (nameMatch && closeInTime) {
                // Merge: prioritize registration event if one of them is registration
                usedIndices.add(j);
                if (cur.item.type !== 'registration' && other.item.type === 'registration') {
                    // Switch cur to the registration
                    other.item.score = Math.max(other.item.score, cur.item.score + 10);
                    other.item.date = other.item.date || cur.item.date;
                    cur.item = other.item;
                } else {
                    cur.item.score = Math.max(cur.item.score, other.item.score + 10);
                    cur.item.url = cur.item.url || other.item.url;
                    cur.item.date = cur.item.date || other.item.date;
                }
            }
        }

        mergedList.push(cur.item);
    }

    // Sort descending by score
    mergedList.sort((a, b) => b.score - a.score);

    return {
        recommendations: mergedList,
        windowDays: daysAhead,
        sourcesCount,
    };
}

/**
 * Express handler for POST /ai/content-recommendations and GET /ai/content-recommendations
 */
export async function handleContentRecommendations(req: any, res: any) {
    const churchId = (req.body?.churchId || req.query?.churchId || '').trim();
    const daysAhead = Number(req.body?.daysAhead || req.query?.daysAhead) || 14;

    if (!churchId) {
        return res.status(400).json({ error: 'churchId is required' });
    }

    try {
        const result = await getRecommendations(churchId, daysAhead);
        res.json(result);
    } catch (e: any) {
        console.error('[ContentRecommendations] error:', e?.message || e);
        res.status(500).json({ error: e?.message || 'Failed to fetch recommendations' });
    }
}
