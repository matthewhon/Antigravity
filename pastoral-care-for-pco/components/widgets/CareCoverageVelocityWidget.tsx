import React, { useState, useMemo } from 'react';
import { 
  Activity, 
  Phone, 
  Home, 
  Users, 
  MessageSquare, 
  FileText, 
  ShieldAlert, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  CheckCircle,
  Heart,
  X
} from 'lucide-react';
import { PcoPerson, PastoralNote, CareFollowUpLog, SmsConversation, PrayerRequest } from '../../types';

interface CareCoverageVelocityWidgetProps {
  people: PcoPerson[];
  notes: PastoralNote[];
  followUpLog: CareFollowUpLog[];
  smsConversations?: SmsConversation[];
  prayerRequests?: PrayerRequest[];
  onRemove?: () => void;
  onOpenPersonProfile?: (personId: string) => void;
}

interface UnifiedTouchpoint {
  id: string;
  personId?: string;
  personName: string;
  date: string;
  timestamp: number;
  channel: 'Call' | 'Visit' | 'Meeting' | 'SMS' | 'Note' | 'FollowUp' | 'Prayer';
  content?: string;
  authorName?: string;
}

export const CareCoverageVelocityWidget: React.FC<CareCoverageVelocityWidgetProps> = ({
  people = [],
  notes = [],
  followUpLog = [],
  smsConversations = [],
  prayerRequests = [],
  onRemove,
  onOpenPersonProfile
}) => {
  const [timeframe, setTimeframe] = useState<'30d' | '90d'>('30d');

  // Unified touchpoints across all sources
  const allTouchpoints = useMemo<UnifiedTouchpoint[]>(() => {
    const list: UnifiedTouchpoint[] = [];
    const peopleMap = new Map(people.map(p => [p.id, p.name]));

    // 1. Pastoral Notes (Calls, Visits, Meetings, Hospital, Notes, Outreach)
    notes.forEach(n => {
      const ts = new Date(n.date).getTime() || Date.now();
      const personName = n.personName || peopleMap.get(n.personId) || 'Member';
      let channel: UnifiedTouchpoint['channel'] = 'Note';
      if (n.type === 'Call') channel = 'Call';
      else if (n.type === 'Visit' || n.type === 'Hospital') channel = 'Visit';
      else if (n.type === 'Meeting') channel = 'Meeting';
      else if (n.type === 'Note' || n.type === 'Crisis') channel = 'Note';

      list.push({
        id: `note-${n.id}`,
        personId: n.personId,
        personName,
        date: n.date,
        timestamp: ts,
        channel,
        content: n.content,
        authorName: n.authorName || (n.isOutreach ? 'Volunteer Outreach' : 'Pastoral Staff')
      });
    });

    // 2. Completed Follow-ups from Recommended Follow-ups workflow
    followUpLog.forEach(f => {
      if (f.followedUpAt) {
        const ts = f.followedUpAt;
        const personName = peopleMap.get(f.personId) || 'Member';
        list.push({
          id: `followup-${f.id}`,
          personId: f.personId,
          personName,
          date: new Date(ts).toISOString().split('T')[0],
          timestamp: ts,
          channel: 'FollowUp',
          content: 'Follow-up marked completed',
          authorName: 'Pastoral Staff'
        });
      }
    });

    // 3. Two-way SMS Conversations
    smsConversations.forEach(c => {
      const ts = c.lastMessageDate ? new Date(c.lastMessageDate).getTime() : (c.updatedAt ? new Date(c.updatedAt).getTime() : 0);
      if (ts > 0) {
        const personName = c.personName || (c.personId ? peopleMap.get(c.personId) : undefined) || 'Congregant';
        list.push({
          id: `sms-${c.id}`,
          personId: c.personId,
          personName,
          date: new Date(ts).toISOString().split('T')[0],
          timestamp: ts,
          channel: 'SMS',
          content: c.lastMessageSnippet || 'Two-way SMS communication',
          authorName: 'SMS Care Channel'
        });
      }
    });

    // 4. Prayer Requests
    prayerRequests.forEach(p => {
      const ts = p.date ? new Date(p.date).getTime() : Date.now();
      const personName = p.personName || (p.personId ? peopleMap.get(p.personId) : undefined) || 'Congregant';
      list.push({
        id: `prayer-${p.id}`,
        personId: p.personId,
        personName,
        date: p.date || new Date().toISOString().split('T')[0],
        timestamp: ts,
        channel: 'Prayer',
        content: p.request || 'Prayer Request',
        authorName: 'Prayer Ministry'
      });
    });

    // Sort newest first
    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [people, notes, followUpLog, smsConversations, prayerRequests]);

  // Aggregate metrics
  const metrics = useMemo(() => {
    const now = Date.now();
    const ms30d = 30 * 24 * 60 * 60 * 1000;
    const ms60d = 60 * 24 * 60 * 60 * 1000;
    const ms90d = 90 * 24 * 60 * 60 * 1000;

    const currentWindowMs = timeframe === '30d' ? ms30d : ms90d;
    const cutoffCurrent = now - currentWindowMs;
    const cutoffPrevious = now - (currentWindowMs * 2);

    const touchesCurrent = allTouchpoints.filter(t => t.timestamp >= cutoffCurrent);
    const touchesPrevious = allTouchpoints.filter(t => t.timestamp >= cutoffPrevious && t.timestamp < cutoffCurrent);

    // Distinct people touched in current window
    const touchedPersonIds = new Set<string>();
    touchesCurrent.forEach(t => {
      if (t.personId) touchedPersonIds.add(t.personId);
    });

    // Distinct people touched in 90 days (for lapsed calculation)
    const touched90dSet = new Set<string>();
    allTouchpoints.filter(t => t.timestamp >= (now - ms90d)).forEach(t => {
      if (t.personId) touched90dSet.add(t.personId);
    });

    const totalMembers = people.length || 1;
    const coverageRate = Math.min(100, Math.round((touchedPersonIds.size / totalMembers) * 100));

    // High risk / vulnerable people coverage
    const highRiskPeople = people.filter(p => (p.riskScore && p.riskScore >= 40) || p.membershipStatus === 'Needs Care');
    const highRiskCount = highRiskPeople.length;
    let highRiskTouched = 0;
    if (highRiskCount > 0) {
      highRiskTouched = highRiskPeople.filter(p => touchedPersonIds.has(p.id)).length;
    }
    const highRiskCoverageRate = highRiskCount > 0 ? Math.round((highRiskTouched / highRiskCount) * 100) : null;

    // Velocity trend (% change vs previous period)
    const currentCount = touchesCurrent.length;
    const prevCount = touchesPrevious.length;
    let velocityTrend = 0;
    if (prevCount > 0) {
      velocityTrend = Math.round(((currentCount - prevCount) / prevCount) * 100);
    } else if (currentCount > 0) {
      velocityTrend = 100;
    }

    // Channel breakdown
    const channelCounts: Record<string, number> = {
      Call: 0,
      Visit: 0,
      Meeting: 0,
      SMS: 0,
      FollowUp: 0,
      Note: 0
    };

    touchesCurrent.forEach(t => {
      if (channelCounts[t.channel] !== undefined) {
        channelCounts[t.channel]++;
      } else {
        channelCounts.Note++;
      }
    });

    const lapsedCount = Math.max(0, totalMembers - touched90dSet.size);

    return {
      touchesCurrentCount: currentCount,
      prevCount,
      velocityTrend,
      touchedPersonCount: touchedPersonIds.size,
      totalMembers,
      coverageRate,
      highRiskCount,
      highRiskTouched,
      highRiskCoverageRate,
      channelCounts,
      lapsedCount,
      recentTouches: allTouchpoints.slice(0, 5)
    };
  }, [allTouchpoints, people, timeframe]);

  const getChannelBadge = (channel: UnifiedTouchpoint['channel']) => {
    switch (channel) {
      case 'Call':
        return { icon: <Phone className="w-3.5 h-3.5" />, label: 'Call', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' };
      case 'Visit':
        return { icon: <Home className="w-3.5 h-3.5" />, label: 'Visit', color: 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800' };
      case 'Meeting':
        return { icon: <Users className="w-3.5 h-3.5" />, label: 'Meeting', color: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800' };
      case 'SMS':
        return { icon: <MessageSquare className="w-3.5 h-3.5" />, label: 'SMS', color: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' };
      case 'FollowUp':
        return { icon: <CheckCircle className="w-3.5 h-3.5" />, label: 'Follow-Up', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800' };
      case 'Prayer':
        return { icon: <Heart className="w-3.5 h-3.5" />, label: 'Prayer', color: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800' };
      default:
        return { icon: <FileText className="w-3.5 h-3.5" />, label: 'Note', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700' };
    }
  };

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between h-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-black text-slate-900 dark:text-white">Care Coverage & Touch Velocity</h4>
            <p className="text-[11px] text-slate-400">Multi-Source Pastoral Touchpoints & Congregational Reach</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-[10px] font-bold">
            <button
              type="button"
              onClick={() => setTimeframe('30d')}
              className={`px-2 py-1 rounded-md transition ${
                timeframe === '30d' 
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs' 
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              30 Days
            </button>
            <button
              type="button"
              onClick={() => setTimeframe('90d')}
              className={`px-2 py-1 rounded-md transition ${
                timeframe === '90d' 
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs' 
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              90 Days
            </button>
          </div>

          {onRemove && (
            <button 
              type="button"
              onClick={onRemove}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Remove widget"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {/* Coverage % */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            {timeframe === '30d' ? '30d' : '90d'} Reach
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-black text-indigo-600 dark:text-indigo-400">
              {metrics.coverageRate}%
            </span>
            <span className="text-[11px] text-slate-400 font-medium">
              ({metrics.touchedPersonCount}/{metrics.totalMembers})
            </span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
            <div 
              className="bg-indigo-600 dark:bg-indigo-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${metrics.coverageRate}%` }}
            />
          </div>
        </div>

        {/* Touch Velocity */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Total Touches
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-black text-slate-900 dark:text-white">
              {metrics.touchesCurrentCount}
            </span>
            {metrics.velocityTrend !== 0 && (
              <span className={`text-[10px] font-bold flex items-center gap-0.5 ${
                metrics.velocityTrend > 0 
                  ? 'text-emerald-600 dark:text-emerald-400' 
                  : 'text-rose-600 dark:text-rose-400'
              }`}>
                {metrics.velocityTrend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {metrics.velocityTrend > 0 ? `+${metrics.velocityTrend}%` : `${metrics.velocityTrend}%`}
              </span>
            )}
          </div>
          <span className="text-[10px] text-slate-400 block mt-1">vs. prior {timeframe}</span>
        </div>

        {/* At-Risk Coverage */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            At-Risk Touched
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-xl font-black ${
              (metrics.highRiskCoverageRate ?? 100) < 50 
                ? 'text-amber-600 dark:text-amber-400' 
                : 'text-emerald-600 dark:text-emerald-400'
            }`}>
              {metrics.highRiskCoverageRate !== null ? `${metrics.highRiskCoverageRate}%` : 'N/A'}
            </span>
            {metrics.highRiskCount > 0 && (
              <span className="text-[11px] text-slate-400 font-medium">
                ({metrics.highRiskTouched}/{metrics.highRiskCount})
              </span>
            )}
          </div>
          <span className="text-[10px] text-slate-400 block mt-1">high-vulnerability</span>
        </div>

        {/* Lapsed Care Alert */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Lapsed (&gt;90d)
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-xl font-black ${metrics.lapsedCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {metrics.lapsedCount}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">members</span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-1">need reconnecting</span>
        </div>
      </div>

      {/* Multi-Channel Distribution Pills */}
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800/60 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Channels ({timeframe === '30d' ? 'Past 30 Days' : 'Past 90 Days'})
          </span>
          <span className="text-[10px] font-bold text-slate-400">
            {metrics.touchesCurrentCount} touches across channels
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-xs font-semibold">
            <Phone className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span>Calls</span>
            <span className="font-black ml-0.5">{metrics.channelCounts.Call || 0}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-900/40 text-purple-800 dark:text-purple-300 text-xs font-semibold">
            <Home className="w-3 h-3 text-purple-600 dark:text-purple-400" />
            <span>Visits</span>
            <span className="font-black ml-0.5">{metrics.channelCounts.Visit || 0}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/40 text-blue-800 dark:text-blue-300 text-xs font-semibold">
            <Users className="w-3 h-3 text-blue-600 dark:text-blue-400" />
            <span>Meetings</span>
            <span className="font-black ml-0.5">{metrics.channelCounts.Meeting || 0}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 text-indigo-800 dark:text-indigo-300 text-xs font-semibold">
            <MessageSquare className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
            <span>SMS</span>
            <span className="font-black ml-0.5">{metrics.channelCounts.SMS || 0}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 text-xs font-semibold">
            <CheckCircle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
            <span>Follow-Ups & Notes</span>
            <span className="font-black ml-0.5">{(metrics.channelCounts.FollowUp || 0) + (metrics.channelCounts.Note || 0)}</span>
          </div>
        </div>
      </div>

      {/* Recent Care Touch Stream */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Recent Pastoral Touches
          </span>
          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
            {allTouchpoints.length} Total Logged
          </span>
        </div>

        <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
          {metrics.recentTouches.map((t, idx) => {
            const badge = getChannelBadge(t.channel);
            return (
              <div 
                key={t.id || idx} 
                className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs hover:bg-slate-100/80 dark:hover:bg-slate-800 transition"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1 shrink-0 ${badge.color}`}>
                    {badge.icon}
                    <span>{badge.label}</span>
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 dark:text-slate-200 truncate">
                      {t.personName}
                    </p>
                    {t.content && (
                      <p className="text-[11px] text-slate-400 truncate max-w-xs sm:max-w-md">
                        {t.content}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <span className="text-[10px] text-slate-400 font-medium block">
                    {t.date ? new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Recent'}
                  </span>
                  {t.authorName && (
                    <span className="text-[9px] text-slate-400/80 truncate block">
                      by {t.authorName}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {allTouchpoints.length === 0 && (
            <div className="text-center py-6 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
              <Clock className="w-6 h-6 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">No pastoral touches recorded yet</p>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                Care notes, SMS outreach, and completed follow-ups will automatically flow into this velocity index.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
