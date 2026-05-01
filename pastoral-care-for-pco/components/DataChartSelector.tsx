import React, { useState, useEffect } from 'react';
import { firestore } from '../services/firestoreService';
import { pcoService } from '../services/pcoService';
import { calculateGivingAnalytics, calculateServicesAnalytics, DEFAULT_LIFECYCLE_SETTINGS } from '../services/analyticsService';
import { Loader2, BarChart2, Users, DollarSign, ChevronRight, ChevronLeft, SlidersHorizontal, Calendar, List } from 'lucide-react';

// ─── Widget Catalogue ─────────────────────────────────────────────────────────

export type AnalyticsWidgetId =
  | 'giving_key_metrics'
  | 'giving_fund_performance'
  | 'giving_donor_lifecycle'
  | 'giving_donor_acquisition'
  | 'giving_cumulative_ytd'
  | 'giving_budget_progress'
  | 'giving_last_week_by_fund'
  | 'giving_average_giving'
  | 'people_stats'
  | 'people_age'
  | 'people_gender'
  | 'people_membership'
  | 'people_birthdays'
  | 'people_anniversaries'
  | 'services_upcoming_events'
  | 'church_progress'
  | 'upcoming_registrations'
  | 'group_attendance'
  | 'events';

// Config required before inserting a widget (null = no config needed)
export interface WidgetConfigDef {
  fundPicker?: boolean;       // Show a fund selector
  dayRangePicker?: boolean;   // Show a days-ahead range picker
  timePeriodPicker?: boolean; // Show a historical time-period selector
  pcoListPicker?: boolean;    // Show a PCO People List selector
}

interface WidgetDef {
  id: AnalyticsWidgetId;
  label: string;
  description: string;
  module: 'Giving' | 'People' | 'Services';
  icon: React.ReactNode;
  configDef?: WidgetConfigDef;  // undefined = no config required
}

// User-chosen settings before fetching data
interface WidgetConfig {
  fundName?: string;       // '' = all funds
  dayRange?: number;       // e.g. 7, 14, 30
  timePeriod?: string;     // e.g. 'This Week', 'Last Month'
  pcoListId?: string;      // PCO List ID to filter people
  pcoListName?: string;    // PCO List display name
  pcoListPeopleIds?: string[]; // Resolved people IDs from the selected list
}

const WIDGET_DEFS: WidgetDef[] = [
  {
    id: 'giving_key_metrics',
    label: 'Key Financial Overview',
    description: 'Total giving, donors, recurring & average gift',
    module: 'Giving',
    icon: <DollarSign size={14} />,
  },
  {
    id: 'giving_fund_performance',
    label: 'Fund Performance',
    description: 'Top giving funds ranked by amount — optionally filter by a single fund',
    module: 'Giving',
    icon: <DollarSign size={14} />,
    configDef: { fundPicker: true },
  },
  {
    id: 'giving_donor_lifecycle',
    label: 'Donor Lifecycle Status',
    description: 'Active, new, lapsed & recovered donors',
    module: 'Giving',
    icon: <DollarSign size={14} />,
  },
  {
    id: 'giving_donor_acquisition',
    label: 'Donor Acquisition',
    description: 'New donors vs recovered vs lapsed (last 12 months)',
    module: 'Giving',
    icon: <DollarSign size={14} />,
  },
  {
    id: 'giving_cumulative_ytd',
    label: 'Cumulative Giving (YTD)',
    description: 'Month-by-month giving total so far this year — filter by fund',
    module: 'Giving',
    icon: <DollarSign size={14} />,
    configDef: { fundPicker: true },
  },
  {
    id: 'giving_budget_progress',
    label: 'Budget Progress',
    description: 'Thermometer-style progress bars showing each fund\'s donations vs annual budget goal',
    module: 'Giving',
    icon: <DollarSign size={14} />,
  },
  {
    id: 'giving_last_week_by_fund',
    label: 'Last Week by Fund',
    description: 'Giving totals for each fund during last calendar week (Mon–Sun)',
    module: 'Giving',
    icon: <DollarSign size={14} />,
  },
  {
    id: 'giving_average_giving',
    label: 'Average Giving',
    description: 'Average weekly giving per fund over the last 12 weeks — stacked bar chart',
    module: 'Giving',
    icon: <DollarSign size={14} />,
  },
  {
    id: 'people_stats',
    label: 'People Overview',
    description: 'Total people, members, new this month & households',
    module: 'People',
    icon: <Users size={14} />,
  },
  {
    id: 'people_age',
    label: 'Age Distribution',
    description: 'Count of members by age bracket',
    module: 'People',
    icon: <Users size={14} />,
  },
  {
    id: 'people_gender',
    label: 'Gender Breakdown',
    description: 'Male, female and unknown counts',
    module: 'People',
    icon: <Users size={14} />,
  },
  {
    id: 'people_membership',
    label: 'Membership Status',
    description: 'Breakdown by membership type',
    module: 'People',
    icon: <Users size={14} />,
  },
  {
    id: 'people_birthdays',
    label: 'Upcoming Birthdays',
    description: 'Church members with birthdays in the next 30 days',
    module: 'People',
    icon: <Users size={14} />,
    configDef: { pcoListPicker: true },
  },
  {
    id: 'people_anniversaries',
    label: 'Upcoming Anniversaries',
    description: 'Couples with anniversaries in the next 30 days',
    module: 'People',
    icon: <Users size={14} />,
    configDef: { pcoListPicker: true },
  },
  // Services
  {
    id: 'services_upcoming_events',
    label: 'Upcoming Service Events',
    description: 'List of upcoming services with date, type, and staffing status',
    module: 'Services',
    icon: <Calendar size={14} />,
    configDef: { dayRangePicker: true },
  },
  {
    id: 'church_progress',
    label: 'Church Progress',
    description: 'Last 30-day vs prior 30-day comparison for group attendance, giving, and volunteers',
    module: 'Services',
    icon: <BarChart2 size={14} />,
  },
  {
    id: 'upcoming_registrations',
    label: 'Upcoming Registrations',
    description: 'Upcoming PCO registration events with attendee counts and capacity',
    module: 'People',
    icon: <Calendar size={14} />,
  },
  {
    id: 'group_attendance',
    label: 'Group Attendance',
    description: 'Aggregated group attendance for a selected time period — members vs. visitors',
    module: 'Services',
    icon: <BarChart2 size={14} />,
    configDef: { timePeriodPicker: true },
  },
  {
    id: 'events',
    label: 'Events Check-Ins',
    description: 'Events headcount and check-in summary',
    module: 'Services',
    icon: <Calendar size={14} />,
    configDef: { timePeriodPicker: true },
  },
];

// ─── Data Fetchers ────────────────────────────────────────────────────────────

async function fetchWidgetSnapshot(
  churchId: string,
  widgetId: AnalyticsWidgetId,
  config: WidgetConfig = {}
): Promise<any> {
  const fundFilter = config.fundName?.trim() || '';

  switch (widgetId) {
    case 'giving_key_metrics':
    case 'giving_fund_performance':
    case 'giving_donor_lifecycle': {
      const [rawDonations, church] = await Promise.all([
        firestore.getDetailedDonations(churchId),
        firestore.getChurch(churchId),
      ]);
      const lifecycleSettings = church?.donorLifecycleSettings || DEFAULT_LIFECYCLE_SETTINGS;
      let donations = rawDonations;
      if (fundFilter) donations = donations.filter(d => d.fundName === fundFilter);
      const analytics = calculateGivingAnalytics(donations, 'Year', undefined, [], lifecycleSettings);
      if (widgetId === 'giving_key_metrics') {
        return {
          totalGiving: analytics.totalGiving,
          previousTotalGiving: analytics.previousTotalGiving,
          contributingPeople: analytics.contributingPeople,
          recurringGivers: analytics.recurringGivers,
          averageGift: analytics.averageGift,
        };
      }
      if (widgetId === 'giving_fund_performance') {
        return { 
          givingByFund: analytics.givingByFund.slice(0, 8),
          fundFilter: fundFilter || null,
        };
      }
      if (widgetId === 'giving_donor_lifecycle') {
        return { donorLifecycle: analytics.donorLifecycle };
      }
      break;
    }
    case 'giving_donor_acquisition': {
      const [donations, church] = await Promise.all([
        firestore.getDetailedDonations(churchId),
        firestore.getChurch(churchId),
      ]);
      const lifecycleSettings = church?.donorLifecycleSettings || DEFAULT_LIFECYCLE_SETTINGS;
      const analytics = calculateGivingAnalytics(donations, 'Year', undefined, [], lifecycleSettings);
      return {
        newDonors: analytics.donorLifecycle.new,
        recoveredDonors: analytics.donorLifecycle.recovered,
        lapsedDonors: analytics.donorLifecycle.lapsed,
        secondTimeDonors: analytics.donorLifecycle.secondTime,
      };
    }
    case 'giving_cumulative_ytd': {
      const yearNow = new Date().getFullYear();
      const currentMonth = new Date().getMonth(); // 0-indexed
      const [rawDonations, budgets] = await Promise.all([
        firestore.getDetailedDonations(churchId),
        firestore.getBudgets(churchId),
      ]);
      let donations = rawDonations;
      if (fundFilter) donations = donations.filter(d => d.fundName === fundFilter);

      // Filter budgets to this year (and matching fund if selected)
      const activeBudgets = budgets.filter(
        b => b.year === yearNow && b.isActive && (!fundFilter || b.fundName === fundFilter)
      );

      const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      let runningActual = 0;
      let runningBudget = 0;
      const months = MONTHS.map((label, i) => {
        const monthStart = new Date(yearNow, i, 1);
        const monthEnd = new Date(yearNow, i + 1, 0, 23, 59, 59, 999);
        const actualInMonth = donations
          .filter(d => { const dd = new Date(d.date); return dd >= monthStart && dd <= monthEnd; })
          .reduce((s, d) => s + Number(d.amount || 0), 0);
        // Only add actual for months that have passed or are current
        if (i <= currentMonth) runningActual += actualInMonth;
        const budgetInMonth = activeBudgets.reduce(
          (s, b) => s + (b.monthlyAmounts?.[i] || 0), 0
        );
        runningBudget += budgetInMonth;
        return {
          label,
          actual: i <= currentMonth ? runningActual : null,
          budget: runningBudget,
          isPast: i <= currentMonth,
        };
      });

      const totalAnnualBudget = activeBudgets.reduce((s, b) => s + (b.totalAmount || 0), 0);
      const pctOfBudget = totalAnnualBudget > 0
        ? Math.round((runningActual / totalAnnualBudget) * 100)
        : null;
      const pctOfYtdBudget = runningBudget > 0
        ? Math.round((runningActual / runningBudget) * 100)
        : null;

      return {
        months,
        totalYTD: runningActual,
        totalAnnualBudget,
        pctOfBudget,
        pctOfYtdBudget,
        hasBudget: activeBudgets.length > 0,
        fundFilter: fundFilter || null,
      };
    }
    case 'giving_last_week_by_fund': {
      const now = new Date();
      const day = now.getDay(); // 0 = Sun
      const lwEnd = new Date(now);
      lwEnd.setDate(now.getDate() - day - 1); // last Saturday
      lwEnd.setHours(23, 59, 59, 999);
      const lwStart = new Date(lwEnd);
      lwStart.setDate(lwEnd.getDate() - 6); // previous Monday
      lwStart.setHours(0, 0, 0, 0);

      const weekLabel = `${lwStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${lwEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

      const rawDonations = await firestore.getDetailedDonations(churchId);
      const fundTotals: Record<string, number> = {};
      rawDonations.forEach(d => {
        const dDate = new Date(d.date);
        if (dDate >= lwStart && dDate <= lwEnd) {
          fundTotals[d.fundName] = (fundTotals[d.fundName] || 0) + Number(d.amount || 0);
        }
      });

      const fundRows = Object.entries(fundTotals).sort(([, a], [, b]) => b - a);
      const weekTotal = fundRows.reduce((s, [, v]) => s + v, 0);

      return {
        weekLabel,
        weekTotal,
        funds: fundRows.map(([name, amount]) => ({
          name,
          amount,
          pct: weekTotal > 0 ? Math.round((amount / weekTotal) * 100) : 0,
        })),
      };
    }
    case 'giving_budget_progress': {
      const yearNow = new Date().getFullYear();
      const now = new Date();
      const [rawDonations, budgets] = await Promise.all([
        firestore.getDetailedDonations(churchId),
        firestore.getBudgets(churchId),
      ]);
      const yearBudgets = budgets.filter(b => b.year === yearNow && b.isActive);
      const yearStart = new Date(yearNow, 0, 1);
      const fundActuals: Record<string, number> = {};
      rawDonations.forEach(d => {
        const dDate = new Date(d.date);
        if (dDate >= yearStart && dDate <= now) {
          fundActuals[d.fundName] = (fundActuals[d.fundName] || 0) + Number(d.amount || 0);
        }
      });
      const totalBudget = yearBudgets.reduce((s, b) => s + b.totalAmount, 0);
      const totalActual = yearBudgets.reduce((s, b) => s + (fundActuals[b.fundName] || 0), 0);
      const funds = yearBudgets
        .sort((a, b) => b.totalAmount - a.totalAmount)
        .map(b => ({
          name: b.fundName,
          actual: fundActuals[b.fundName] || 0,
          budget: b.totalAmount,
          pct: b.totalAmount > 0 ? Math.min(Math.round(((fundActuals[b.fundName] || 0) / b.totalAmount) * 100), 100) : 0,
        }));
      return { year: yearNow, totalBudget, totalActual, totalPct: totalBudget > 0 ? Math.min(Math.round((totalActual / totalBudget) * 100), 100) : 0, funds };
    }
    case 'services_upcoming_events': {
      const days = config.dayRange || 14;
      const [plans, teams, attendance] = await Promise.all([
        firestore.getServicePlans(churchId),
        firestore.getServicesTeams(churchId),
        firestore.getAttendance(churchId),
      ]);
      const servicesData = calculateServicesAnalytics(plans, teams, attendance, 'Year');
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setDate(now.getDate() + days);
      end.setHours(23, 59, 59, 999);
      const upcoming = (servicesData.futurePlans || []).filter(p => {
        const d = p.planTimes?.[0] ? new Date(p.planTimes[0].startsAt) : new Date(p.sortDate);
        return d >= now && d <= end;
      }).sort((a, b) => {
        const da = a.planTimes?.[0] ? new Date(a.planTimes[0].startsAt) : new Date(a.sortDate);
        const db = b.planTimes?.[0] ? new Date(b.planTimes[0].startsAt) : new Date(b.sortDate);
        return da.getTime() - db.getTime();
      }).slice(0, 10).map(p => {
        const d = p.planTimes?.[0] ? new Date(p.planTimes[0].startsAt) : new Date(p.sortDate);
        const members = p.teamMembers || [];
        const confirmed = members.filter(m => m.status === 'Confirmed').length;
        const pending = members.filter(m => m.status === 'Pending' || m.status === 'Unconfirmed').length;
        const needed = p.positionsNeeded || 0;
        return {
          id: p.id,
          serviceTypeName: p.serviceTypeName || 'Service',
          seriesTitle: p.seriesTitle || null,
          dateStr: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
          timeStr: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          confirmed,
          pending,
          needed,
          status: needed > 0 ? 'Understaffed' : pending > 0 ? 'Pending' : 'Ready',
        };
      });
      return { upcoming, dayRange: days };
    }
    case 'church_progress': {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo  = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      // Giving — unique donors this month vs last month
      const donations = await firestore.getDetailedDonations(churchId);
      const givingThis  = new Set(donations.filter(d => new Date(d.date) >= thirtyDaysAgo).map(d => d.donorId)).size;
      const givingLast  = new Set(donations.filter(d => { const dd = new Date(d.date); return dd >= sixtyDaysAgo && dd < thirtyDaysAgo; }).map(d => d.donorId)).size;

      // Services — volunteers with confirmed status
      const plans = await firestore.getServicePlans(churchId);
      const thirtyStr = thirtyDaysAgo.toISOString().split('T')[0];
      const sixtyStr  = sixtyDaysAgo.toISOString().split('T')[0];
      const todayStr  = now.toISOString().split('T')[0];
      const servingThis = new Set<string>();
      const servingLast = new Set<string>();
      plans.forEach(p => {
        const planDate = (p.sortDate || '').split('T')[0];
        if (planDate > todayStr || planDate < sixtyStr) return;
        (p.teamMembers || []).forEach((m: any) => {
          const status = m.status?.toLowerCase() || '';
          if ((status === 'confirmed' || status === 'c') && m.personId) {
            if (planDate >= thirtyStr) servingThis.add(m.personId);
            else servingLast.add(m.personId);
          }
        });
      });

      // Groups — attendance counts
      const groups = await firestore.getGroups(churchId);
      let groupThis = 0, groupLast = 0;
      groups.forEach(g => {
        (g.attendanceHistory || []).forEach((h: any) => {
          const hDate = new Date(h.date || h.startedAt || 0);
          if (hDate >= thirtyDaysAgo) groupThis += h.count || 0;
          else if (hDate >= sixtyDaysAgo) groupLast += h.count || 0;
        });
      });

      return {
        rows: [
          { label: 'Group Attendance', thisMonth: groupThis, lastMonth: groupLast },
          { label: 'Donors',           thisMonth: givingThis, lastMonth: givingLast },
          { label: 'Volunteers',       thisMonth: servingThis.size, lastMonth: servingLast.size },
        ],
      };
    }
    case 'group_attendance': {
      const period = config.timePeriod || 'This Month';
      const now2 = new Date();
      let start2 = new Date();
      let end2 = new Date();
      start2.setHours(0, 0, 0, 0);
      end2.setHours(23, 59, 59, 999);

      if (period === 'This Week') {
        const day2 = start2.getDay();
        start2.setDate(start2.getDate() - day2);
      } else if (period === 'Last Week') {
        start2.setDate(start2.getDate() - start2.getDay() - 7);
        end2 = new Date(start2);
        end2.setDate(start2.getDate() + 6);
        end2.setHours(23, 59, 59, 999);
      } else if (period === 'This Month') {
        start2.setDate(1);
      } else if (period === 'Last Month') {
        start2.setDate(1);
        start2.setMonth(start2.getMonth() - 1);
        end2 = new Date(start2);
        end2.setMonth(end2.getMonth() + 1);
        end2.setDate(0);
        end2.setHours(23, 59, 59, 999);
      } else if (period === 'Last Quarter') {
        start2.setDate(start2.getDate() - 90);
      }

      const groups = await firestore.getGroups(churchId);
      const aggMap = new Map<string, { date: string; timestamp: number; members: number; visitors: number }>();

      groups.forEach(g => {
        if (!g.attendanceHistory) return;
        g.attendanceHistory.forEach((h: any) => {
          const hDate = new Date(h.date);
          if (hDate >= start2 && hDate <= end2) {
            const y = hDate.getFullYear();
            const mo = String(hDate.getMonth() + 1).padStart(2, '0');
            const dy = String(hDate.getDate()).padStart(2, '0');
            const key = `${y}-${mo}-${dy}`;
            if (!aggMap.has(key)) aggMap.set(key, { date: key, timestamp: hDate.getTime(), members: 0, visitors: 0 });
            const entry = aggMap.get(key)!;
            entry.members += h.members || 0;
            entry.visitors += h.visitors || 0;
          }
        });
      });

      const rows2 = Array.from(aggMap.values()).sort((a, b) => a.timestamp - b.timestamp).map(d => {
        const [y, m, dy] = d.date.split('-').map(Number);
        const dateObj = new Date(y, m - 1, dy);
        return {
          name: dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          members: d.members,
          visitors: d.visitors,
          total: d.members + d.visitors,
        };
      });

      const periodTotal = rows2.reduce((s, r) => s + r.total, 0);
      const periodMembers = rows2.reduce((s, r) => s + r.members, 0);
      const periodVisitors = rows2.reduce((s, r) => s + r.visitors, 0);

      return { period, rows: rows2, periodTotal, periodMembers, periodVisitors };
    }
    case 'events': {
      const period = config.timePeriod || 'This Month';
      const now2 = new Date();
      let start2 = new Date();
      let end2 = new Date();
      start2.setHours(0, 0, 0, 0);
      end2.setHours(23, 59, 59, 999);

      if (period === 'This Week') {
        const day2 = start2.getDay();
        start2.setDate(start2.getDate() - day2);
      } else if (period === 'Last Week') {
        start2.setDate(start2.getDate() - start2.getDay() - 7);
        end2 = new Date(start2);
        end2.setDate(start2.getDate() + 6);
        end2.setHours(23, 59, 59, 999);
      } else if (period === 'This Month') {
        start2.setDate(1);
      } else if (period === 'Last 30 Days') {
        start2.setDate(start2.getDate() - 30);
      } else if (period === 'Last Month') {
        start2.setDate(1);
        start2.setMonth(start2.getMonth() - 1);
        end2 = new Date(start2);
        end2.setMonth(end2.getMonth() + 1);
        end2.setDate(0);
        end2.setHours(23, 59, 59, 999);
      } else if (period === 'Last Quarter') {
        start2.setDate(start2.getDate() - 90);
      }

      const toLocalDateStr = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      const attendance = await firestore.getAttendance(churchId);
      const startStr = toLocalDateStr(start2);
      const endStr   = toLocalDateStr(end2);

      const checkInTrends = attendance
        .filter(a => a.date >= startStr && a.date <= endStr)
        .map(a => ({
          date: a.date,
          isoDate: a.date,
          guests: a.guests || 0,
          regulars: a.regulars || 0,
          volunteers: a.volunteers || 0,
          headcount: a.headcount || 0,
          total: a.count,
          events: (a as any).events || []
        }));

      const eventsData: any[] = [];
      checkInTrends.forEach(trend => {
        if (trend.events && Array.isArray(trend.events)) {
          eventsData.push(...trend.events);
        } else {
          eventsData.push({
            name: `Daily Total`,
            startsAt: trend.date,
            guests: trend.guests,
            regulars: trend.regulars,
            volunteers: trend.volunteers,
            headcount: trend.headcount,
            total: trend.total
          });
        }
      });
      eventsData.sort((a,b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

      return { period, events: eventsData.slice(0, 10) };
    }
    case 'upcoming_registrations': {
      const regs = await firestore.getRegistrations(churchId);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 14);
      const upcoming = regs
        .filter(e => !e.startsAt || new Date(e.startsAt) >= cutoff)
        .sort((a, b) => {
          if (!a.startsAt) return 1;
          if (!b.startsAt) return -1;
          return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
        })
        .slice(0, 8)
        .map(e => {
          const confirmed = ((e.totalAttendees ?? e.signupCount) - (e.waitlistedCount ?? 0) - (e.canceledCount ?? 0));
          const displayCount = confirmed > 0 ? confirmed : e.signupCount;
          const fillPct = e.signupLimit && e.signupLimit > 0
            ? Math.min(100, Math.round((displayCount / e.signupLimit) * 100))
            : null;
          return {
            id: e.id,
            name: e.name,
            dateStr: e.startsAt
              ? new Date(e.startsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : 'Date TBD',
            signupCount: displayCount,
            signupLimit: e.signupLimit || null,
            fillPct,
            isFull: fillPct !== null && fillPct >= 100,
            waitlistedCount: e.waitlistedCount || 0,
            publicUrl: (e as any).publicUrl || null,
          };
        });
      return { upcoming };
    }
    case 'giving_average_giving': {
      const now = new Date();
      const donations = await firestore.getDetailedDonations(churchId);
      // Build 12 weekly buckets (most recent first, then reverse for display)
      const weeks: { label: string; weekStart: Date; weekEnd: Date }[] = [];
      for (let i = 11; i >= 0; i--) {
        const weekEnd = new Date(now);
        weekEnd.setDate(now.getDate() - i * 7);
        weekEnd.setHours(23, 59, 59, 999);
        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekEnd.getDate() - 6);
        weekStart.setHours(0, 0, 0, 0);
        const label = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        weeks.push({ label, weekStart, weekEnd });
      }

      // Collect all fund names
      const fundSet = new Set<string>();
      donations.forEach(d => fundSet.add(d.fundName));
      const fundNames = Array.from(fundSet).sort();

      // For each week, total by fund
      const weekData = weeks.map(w => {
        const byFund: Record<string, number> = {};
        fundNames.forEach(f => (byFund[f] = 0));
        donations.forEach(d => {
          const dDate = new Date(d.date);
          if (dDate >= w.weekStart && dDate <= w.weekEnd) {
            byFund[d.fundName] = (byFund[d.fundName] || 0) + Number(d.amount || 0);
          }
        });
        const total = Object.values(byFund).reduce((s, v) => s + v, 0);
        return { label: w.label, byFund, total };
      });

      // Compute per-fund averages across the 12 weeks
      const fundAverages = fundNames.map(f => ({
        name: f,
        average: weekData.reduce((s, w) => s + (w.byFund[f] || 0), 0) / 12,
      })).sort((a, b) => b.average - a.average);

      const overallWeeklyAverage = weekData.reduce((s, w) => s + w.total, 0) / 12;

      return { weeks: weekData, fundNames, fundAverages, overallWeeklyAverage };
    }
    case 'people_stats':
    case 'people_age':
    case 'people_gender':
    case 'people_membership':
    case 'people_birthdays':
    case 'people_anniversaries': {
      let people = await firestore.getPeople(churchId);
      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 30);

      if (widgetId === 'people_stats') {
        const total = people.length;
        const members = people.filter(p => p.status === 'Member').length;
        const newThisMonth = people.filter(p => {
          const created = p.createdAt ? new Date(p.createdAt) : null;
          return created && created >= thirtyDaysAgo;
        }).length;
        const households = new Set(people.map(p => p.householdId).filter(Boolean)).size;
        return { total, members, newThisMonth, households };
      }
      if (widgetId === 'people_age') {
        const buckets: Record<string, number> = {
          '0–17': 0, '18–29': 0, '30–44': 0, '45–59': 0, '60–74': 0, '75+': 0, 'Unknown': 0
        };
        people.forEach(p => {
          if (!p.birthdate) { buckets['Unknown']++; return; }
          const age = Math.floor((now.getTime() - new Date(p.birthdate).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
          if (age < 18) buckets['0–17']++;
          else if (age < 30) buckets['18–29']++;
          else if (age < 45) buckets['30–44']++;
          else if (age < 60) buckets['45–59']++;
          else if (age < 75) buckets['60–74']++;
          else buckets['75+']++;
        });
        return {
          ageData: Object.entries(buckets).map(([range, count]) => ({ range, count }))
        };
      }
      if (widgetId === 'people_gender') {
        const counts: Record<string, number> = { Male: 0, Female: 0, Unknown: 0 };
        people.forEach(p => {
          const g = p.gender || 'Unknown';
          counts[g] = (counts[g] || 0) + 1;
        });
        return {
          genderData: Object.entries(counts).map(([name, value]) => ({ name, value }))
        };
      }
      if (widgetId === 'people_membership') {
        const counts: Record<string, number> = {};
        people.forEach(p => {
          const s = p.status || 'Unknown';
          counts[s] = (counts[s] || 0) + 1;
        });
        return {
          membershipData: Object.entries(counts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
        };
      }
      if (widgetId === 'people_birthdays') {
        const EXCLUDED = ['Inactive', 'Archived'];
        // If a PCO list is selected, filter to only those people IDs
        const listPeopleIds = config.pcoListPeopleIds && config.pcoListPeopleIds.length > 0
          ? new Set(config.pcoListPeopleIds)
          : null;
        const upcoming = people
          .filter(p => !!p.birthdate && !EXCLUDED.includes(p.status || '') && (!listPeopleIds || listPeopleIds.has(p.id)))
          .map(p => {
            const bd = new Date(p.birthdate!);
            const thisYear = new Date(now.getFullYear(), bd.getMonth(), bd.getDate());
            if (thisYear < now) thisYear.setFullYear(now.getFullYear() + 1);
            const daysUntil = Math.ceil((thisYear.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
            return { name: p.name, daysUntil, dateStr: thisYear.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };
          })
          .filter(p => p.daysUntil <= 30)
          .sort((a, b) => a.daysUntil - b.daysUntil)
          .slice(0, 15);
        return { upcoming, listFilter: config.pcoListName || null };
      }
      if (widgetId === 'people_anniversaries') {
        const EXCLUDED = ['Inactive', 'Archived'];
        // If a PCO list is selected, filter to only those people IDs
        const listPeopleIds = config.pcoListPeopleIds && config.pcoListPeopleIds.length > 0
          ? new Set(config.pcoListPeopleIds)
          : null;
        const upcoming = people
          .filter(p => !!p.anniversary && !EXCLUDED.includes(p.status || '') && (!listPeopleIds || listPeopleIds.has(p.id)))
          .map(p => {
            const ann = new Date(p.anniversary!);
            const thisYear = new Date(now.getFullYear(), ann.getMonth(), ann.getDate());
            if (thisYear < now) thisYear.setFullYear(now.getFullYear() + 1);
            const daysUntil = Math.ceil((thisYear.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
            const yearsMarried = now.getFullYear() - ann.getFullYear();
            return { name: p.name, daysUntil, dateStr: thisYear.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), years: yearsMarried };
          })
          .filter(p => p.daysUntil <= 30)
          .sort((a, b) => a.daysUntil - b.daysUntil)
          .slice(0, 15);
        return { upcoming, listFilter: config.pcoListName || null };
      }
      break;
    }
  }
  return {};
}

// ─── Canvas Block Renderer ───────────────────────────────────────────────────

function fmt(n: number, currency = false) {
  if (currency) return `$${Math.round(n).toLocaleString()}`;
  return n.toLocaleString();
}

export const AnalyticsWidgetBlock: React.FC<{ widgetId: AnalyticsWidgetId; data: any; label: string }> = ({ widgetId, data, label }) => {
  if (!data || Object.keys(data).length === 0) return (
    <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 dark:bg-slate-900 rounded-lg p-3">
      <BarChart2 size={14} /> {label} — no data
    </div>
  );

  switch (widgetId) {
    case 'giving_key_metrics': {
      const growth = data.previousTotalGiving > 0
        ? Math.round(((data.totalGiving - data.previousTotalGiving) / data.previousTotalGiving) * 100)
        : null;
      return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5">
            <p className="text-[11px] font-bold text-emerald-100 uppercase tracking-widest">Key Financial Overview</p>
          </div>
          <div className="bg-white dark:bg-slate-800 px-4 py-4">
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Giving</p>
                <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight mt-0.5">{fmt(data.totalGiving, true)}</p>
              </div>
              {growth !== null && (
                <div className={`text-sm font-black px-2.5 py-1 rounded-full ${growth >= 0 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'}`}>
                  {growth >= 0 ? '↗' : '↘'} {Math.abs(growth)}%
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-100 dark:border-slate-700">
              {[
                { label: 'Unique Donors', value: fmt(data.contributingPeople), color: 'text-indigo-600 dark:text-indigo-400' },
                { label: 'Recurring', value: fmt(data.recurringGivers), color: 'text-cyan-600 dark:text-cyan-400' },
                { label: 'Avg Gift', value: fmt(data.averageGift, true), color: 'text-violet-600 dark:text-violet-400' },
              ].map(s => (
                <div key={s.label}>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{s.label}</p>
                  <p className={`text-xl font-black ${s.color} mt-0.5`}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    case 'giving_fund_performance': {
      const funds: { name: string; value: number }[] = data.givingByFund || [];
      const max = funds[0]?.value || 1;
      return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5">
            <p className="text-[11px] font-bold text-indigo-100 uppercase tracking-widest">Fund Performance</p>
          </div>
          <div className="bg-white dark:bg-slate-800 px-4 py-3 space-y-2">
            {funds.map((f, i) => (
              <div key={i}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[60%]">{f.name}</span>
                  <span className="font-black text-slate-900 dark:text-white">{fmt(f.value, true)}</span>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full">
                  <div className="bar-fill bg-indigo-500" style={{ '--bar-w': `${(f.value / max) * 100}%` } as React.CSSProperties} />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'giving_donor_lifecycle': {
      const lc = data.donorLifecycle || {};
      const rows = [
        { label: 'Active', value: lc.active || 0, color: 'bg-emerald-500' },
        { label: 'New', value: lc.new || 0, color: 'bg-indigo-500' },
        { label: 'Recovered', value: lc.recovered || 0, color: 'bg-cyan-500' },
        { label: 'Lapsed', value: lc.lapsed || 0, color: 'bg-amber-500' },
      ];
      const max = Math.max(...rows.map(r => r.value), 1);
      return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5">
            <p className="text-[11px] font-bold text-amber-100 uppercase tracking-widest">Donor Lifecycle</p>
          </div>
          <div className="bg-white dark:bg-slate-800 px-4 py-3 space-y-2">
            {rows.map(r => (
              <div key={r.label}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{r.label}</span>
                  <span className="font-black text-slate-900 dark:text-white">{fmt(r.value)}</span>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full">
                  <div className={`bar-fill ${r.color}`} style={{ '--bar-w': `${(r.value / max) * 100}%` } as React.CSSProperties} />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'people_stats': {
      const stats = [
        { label: 'Total People', value: fmt(data.total), color: 'text-indigo-600 dark:text-indigo-400' },
        { label: 'Members', value: fmt(data.members), color: 'text-emerald-600 dark:text-emerald-400' },
        { label: 'New (30d)', value: fmt(data.newThisMonth), color: 'text-violet-600 dark:text-violet-400' },
        { label: 'Households', value: fmt(data.households), color: 'text-amber-600 dark:text-amber-400' },
      ];
      return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2.5">
            <p className="text-[11px] font-bold text-indigo-100 uppercase tracking-widest">People Overview</p>
          </div>
          <div className="bg-white dark:bg-slate-800 px-4 py-4 grid grid-cols-2 gap-4">
            {stats.map(s => (
              <div key={s.label}>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{s.label}</p>
                <p className={`text-2xl font-black ${s.color} mt-0.5`}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'people_age': {
      const rows: { range: string; count: number }[] = data.ageData || [];
      const max = Math.max(...rows.map(r => r.count), 1);
      return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-gradient-to-r from-pink-500 to-rose-500 px-4 py-2.5">
            <p className="text-[11px] font-bold text-pink-100 uppercase tracking-widest">Age Distribution</p>
          </div>
          <div className="bg-white dark:bg-slate-800 px-4 py-3 space-y-2">
            {rows.map(r => (
              <div key={r.range}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{r.range}</span>
                  <span className="font-black text-slate-900 dark:text-white">{fmt(r.count)}</span>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full">
                  <div className="bar-fill bg-pink-400" style={{ '--bar-w': `${(r.count / max) * 100}%` } as React.CSSProperties} />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'people_gender': {
      const rows: { name: string; value: number }[] = data.genderData || [];
      const total = rows.reduce((s, r) => s + r.value, 0) || 1;
      const gColors: Record<string, string> = { Male: 'bg-indigo-500', Female: 'bg-pink-500', Unknown: 'bg-slate-400' };
      return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-gradient-to-r from-pink-500 to-indigo-500 px-4 py-2.5">
            <p className="text-[11px] font-bold text-pink-100 uppercase tracking-widest">Gender Breakdown</p>
          </div>
          <div className="bg-white dark:bg-slate-800 px-4 py-3 space-y-2">
            {rows.map(r => (
              <div key={r.name}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{r.name}</span>
                  <span className="font-black text-slate-900 dark:text-white">{fmt(r.value)} <span className="text-slate-400 font-normal">({Math.round((r.value / total) * 100)}%)</span></span>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full">
                  <div className={`bar-fill ${gColors[r.name] || 'bg-slate-400'}`} style={{ '--bar-w': `${(r.value / total) * 100}%` } as React.CSSProperties} />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'people_membership': {
      const rows: { name: string; value: number }[] = data.membershipData || [];
      const total = rows.reduce((s, r) => s + r.value, 0) || 1;
      const mColors = ['bg-indigo-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-pink-500', 'bg-cyan-500'];
      return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-600 to-slate-800 px-4 py-2.5">
            <p className="text-[11px] font-bold text-slate-200 uppercase tracking-widest">Membership Status</p>
          </div>
          <div className="bg-white dark:bg-slate-800 px-4 py-3 space-y-2">
            {rows.map((r, i) => (
              <div key={r.name}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{r.name}</span>
                  <span className="font-black text-slate-900 dark:text-white">{fmt(r.value)} <span className="text-slate-400 font-normal">({Math.round((r.value / total) * 100)}%)</span></span>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full">
                  <div className={`bar-fill ${mColors[i % mColors.length]}`} style={{ '--bar-w': `${(r.value / total) * 100}%` } as React.CSSProperties} />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'giving_donor_acquisition': {
      const rows = [
        { label: 'New',       value: data.newDonors || 0,       color: 'bg-indigo-500' },
        { label: 'Recovered', value: data.recoveredDonors || 0, color: 'bg-cyan-500' },
        { label: '2nd Gift',  value: data.secondTimeDonors || 0, color: 'bg-violet-500' },
        { label: 'Lapsed',    value: data.lapsedDonors || 0,    color: 'bg-amber-500' },
      ];
      const max = Math.max(...rows.map(r => r.value), 1);
      return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-cyan-600 px-4 py-2.5">
            <p className="text-[11px] font-bold text-indigo-100 uppercase tracking-widest">Donor Acquisition</p>
          </div>
          <div className="bg-white dark:bg-slate-800 px-4 py-3 space-y-2">
            {rows.map(r => (
              <div key={r.label}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{r.label}</span>
                  <span className="font-black text-slate-900 dark:text-white">{fmt(r.value)}</span>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full">
                  <div className={`bar-fill ${r.color}`} style={{ '--bar-w': `${(r.value / max) * 100}%` } as React.CSSProperties} />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'giving_cumulative_ytd': {
      const months: { label: string; actual: number | null; budget: number; isPast: boolean }[] = data.months || [];
      const maxVal = Math.max(...months.map(m => Math.max(m.actual || 0, m.budget)), 1);
      const hasBudget: boolean = data.hasBudget;
      const pctOfYtdBudget: number | null = data.pctOfYtdBudget;
      const pctColor = pctOfYtdBudget === null ? '' :
        pctOfYtdBudget >= 100 ? 'text-emerald-600 dark:text-emerald-400' :
        pctOfYtdBudget >= 80 ? 'text-amber-600 dark:text-amber-400' :
        'text-red-600 dark:text-red-400';
      const statusLabel = pctOfYtdBudget === null ? null :
        pctOfYtdBudget >= 100 ? 'On Target' :
        pctOfYtdBudget >= 80 ? 'Near Target' : 'Below Target';
      return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-600 to-green-600 px-4 py-2.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-emerald-100 uppercase tracking-widest">Cumulative Giving (YTD)</p>
                {data.fundFilter && <p className="text-[10px] text-emerald-200 mt-0.5">{data.fundFilter}</p>}
              </div>
              <div className="text-right">
                <span className="text-sm font-black text-emerald-100">{fmt(data.totalYTD || 0, true)}</span>
                {hasBudget && data.totalAnnualBudget > 0 && (
                  <p className="text-[10px] text-emerald-200 mt-0.5">of {fmt(data.totalAnnualBudget, true)} budget</p>
                )}
              </div>
            </div>
          </div>

          {/* Budget % stat row */}
          {hasBudget && pctOfYtdBudget !== null && (
            <div className="bg-slate-50 dark:bg-slate-900 px-4 py-2 flex items-center justify-between border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-emerald-400" />
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Actual</span>
                <div className="w-3 h-0.5 bg-slate-400 ml-2 dcs-legend-budget-dash" />
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Budget</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-xs font-black ${pctColor}`}>{pctOfYtdBudget}%</span>
                {statusLabel && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    pctOfYtdBudget >= 100 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                    pctOfYtdBudget >= 80  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}>{statusLabel}</span>
                )}
              </div>
            </div>
          )}

          {/* Chart */}
          <div className="bg-white dark:bg-slate-800 px-4 py-3">
            {months.length === 0 && <p className="text-xs text-slate-400 text-center py-2">No YTD data yet</p>}
            <div className="dcs-mini-bar-chart flex items-end gap-0.5">
              {months.map((m, i) => {
                const actualH = m.actual !== null ? Math.max(2, Math.round((m.actual / maxVal) * 56)) : 0;
                const budgetH = Math.max(2, Math.round((m.budget / maxVal) * 56));
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5 relative">
                    {/* Budget bar (behind) */}
                    {hasBudget && (
                      <div
                        className="budget-tick border-slate-300 dark:border-slate-500"
                        style={{ '--tick-bottom': `${budgetH + 12}px` } as React.CSSProperties}
                        title={`Budget: ${fmt(m.budget, true)}`}
                      />
                    )}
                    {/* Actual bar */}
                    <div
                      className={`bar-seg rounded-sm transition-all ${ m.isPast ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-600' }`}
                      style={{ '--seg-h': actualH > 0 ? `${actualH}px` : '2px', '--seg-opacity': m.isPast ? '1' : '0.4' } as React.CSSProperties}
                      title={`${m.label}: ${m.actual !== null ? fmt(m.actual, true) : 'Future'}`}
                    />
                    <span className="text-[7px] text-slate-400 leading-none">{m.label.charAt(0)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    case 'people_birthdays': {
      const upcoming: { name: string; daysUntil: number; dateStr: string }[] = data.upcoming || [];
      const listFilter: string | null = data.listFilter || null;
      return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-gradient-to-r from-pink-500 to-rose-500 px-4 py-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-pink-100 uppercase tracking-widest">Upcoming Birthdays</p>
              <span className="text-xs font-bold text-pink-100">Next 30 days</span>
            </div>
            {listFilter && (
              <div className="flex items-center gap-1 mt-1">
                <List size={9} className="text-pink-200" />
                <span className="text-[9px] text-pink-200 font-medium truncate">{listFilter}</span>
              </div>
            )}
          </div>
          <div className="bg-white dark:bg-slate-800 px-4 py-2">
            {upcoming.length === 0 && <p className="text-xs text-slate-400 py-2 text-center">No birthdays in next 30 days{listFilter ? ` in "${listFilter}"` : ''}</p>}
            {upcoming.map((p, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-50 dark:border-slate-700/50 last:border-0">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{p.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400">{p.dateStr}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    p.daysUntil <= 7 ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                  }`}>{p.daysUntil === 0 ? 'Today!' : `${p.daysUntil}d`}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'people_anniversaries': {
      const upcoming: { name: string; daysUntil: number; dateStr: string; years: number }[] = data.upcoming || [];
      const listFilter: string | null = data.listFilter || null;
      return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-4 py-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-violet-100 uppercase tracking-widest">Upcoming Anniversaries</p>
              <span className="text-xs font-bold text-violet-100">Next 30 days</span>
            </div>
            {listFilter && (
              <div className="flex items-center gap-1 mt-1">
                <List size={9} className="text-violet-200" />
                <span className="text-[9px] text-violet-200 font-medium truncate">{listFilter}</span>
              </div>
            )}
          </div>
          <div className="bg-white dark:bg-slate-800 px-4 py-2">
            {upcoming.length === 0 && <p className="text-xs text-slate-400 py-2 text-center">No anniversaries in next 30 days{listFilter ? ` in "${listFilter}"` : ''}</p>}
            {upcoming.map((p, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-50 dark:border-slate-700/50 last:border-0">
                <div>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{p.name}</span>
                  {p.years > 0 && <span className="ml-1.5 text-[10px] text-violet-500 dark:text-violet-400">• {p.years} yr{p.years !== 1 ? 's' : ''}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400">{p.dateStr}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    p.daysUntil <= 7 ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                  }`}>{p.daysUntil === 0 ? 'Today!' : `${p.daysUntil}d`}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'giving_budget_progress': {
      const { year, totalBudget, totalActual, totalPct, funds = [] } = data;
      const barColor = (pct: number) =>
        pct >= 75 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#f43f5e';
      const badgeCls = (pct: number) =>
        pct >= 75
          ? 'bg-emerald-100 text-emerald-700'
          : pct >= 40
          ? 'bg-amber-100 text-amber-700'
          : 'bg-rose-100 text-rose-700';
      return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 flex items-center justify-between">
            <p className="text-[11px] font-bold text-teal-100 uppercase tracking-widest">Budget Progress</p>
            <span className="text-[10px] font-bold text-teal-200">{year}</span>
          </div>
          <div className="bg-white dark:bg-slate-800 px-4 py-4 space-y-4">
            {/* Overall bar */}
            {totalBudget > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Overall</span>
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${badgeCls(totalPct)}`}>{totalPct}%</span>
                </div>
                <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className="bar-fill-color" style={{ '--bar-w': `${totalPct}%`, '--bar-color': barColor(totalPct) } as React.CSSProperties} />
                </div>
                <div className="flex justify-between text-[9px] text-slate-400">
                  <span>{fmt(totalActual, true)} raised</span>
                  <span>{fmt(totalBudget, true)} goal</span>
                </div>
              </div>
            )}
            {/* Per-fund rows */}
            {(funds as { name: string; actual: number; budget: number; pct: number }[]).map((f, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[55%]">{f.name}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[9px] font-black px-1 py-0.5 rounded ${badgeCls(f.pct)}`}>{f.pct}%</span>
                    <span className="text-[9px] text-slate-400">{fmt(f.actual, true)} / {fmt(f.budget, true)}</span>
                  </div>
                </div>
                <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className="bar-fill-color" style={{ '--bar-w': `${f.pct}%`, '--bar-color': barColor(f.pct), '--bar-opacity': '0.85' } as React.CSSProperties} />
                </div>
              </div>
            ))}
            {(funds as any[]).length === 0 && (
              <p className="text-xs text-slate-400 text-center py-2">No active budgets for {year}</p>
            )}
          </div>
        </div>
      );
    }

    case 'giving_last_week_by_fund': {
      const { weekLabel, weekTotal = 0, funds = [] } = data;
      const FUND_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#06b6d4', '#f43f5e', '#8b5cf6', '#ec4899', '#14b8a6'];
      return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 flex items-center justify-between">
            <p className="text-[11px] font-bold text-indigo-100 uppercase tracking-widest">Last Week by Fund</p>
            <span className="text-[10px] font-bold text-indigo-200">{weekLabel}</span>
          </div>
          <div className="bg-white dark:bg-slate-800 px-4 py-4 space-y-3">
            {/* Week total */}
            {weekTotal > 0 && (
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Week Total</span>
                <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">{fmt(weekTotal, true)}</span>
              </div>
            )}
            {/* Per-fund rows */}
            {(funds as { name: string; amount: number; pct: number }[]).map((f, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="color-dot" style={{ '--dot-color': FUND_COLORS[i % FUND_COLORS.length] } as React.CSSProperties} />
                    <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[55%]">{f.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black text-slate-900 dark:text-white">{fmt(f.amount, true)}</span>
                    <span className="text-[9px] text-slate-400">{f.pct}%</span>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full">
                  <div className="bar-fill-color" style={{ '--bar-w': `${f.pct}%`, '--bar-color': FUND_COLORS[i % FUND_COLORS.length], '--bar-opacity': '0.85' } as React.CSSProperties} />
                </div>
              </div>
            ))}
            {(funds as any[]).length === 0 && (
              <p className="text-xs text-slate-400 text-center py-2">No giving recorded last week</p>
            )}
          </div>
        </div>
      );
    }

    case 'church_progress': {
      const rows: { label: string; thisMonth: number; lastMonth: number }[] = data.rows || [];
      return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 flex items-center justify-between">
            <p className="text-[11px] font-bold text-indigo-100 uppercase tracking-widest">Church Progress</p>
            <span className="text-[10px] font-bold text-indigo-200">Last 30 Days</span>
          </div>
          <div className="bg-white dark:bg-slate-800 px-4 py-3 space-y-3">
            {rows.map(r => {
              const diff = r.thisMonth - r.lastMonth;
              const isUp = diff >= 0;
              const pctChange = r.lastMonth > 0 ? Math.round((Math.abs(diff) / r.lastMonth) * 100) : null;
              return (
                <div key={r.label} className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{r.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-900 dark:text-white">{fmt(r.thisMonth)}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      isUp ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                    }`}>
                      {isUp ? '▲' : '▼'} {pctChange !== null ? `${pctChange}%` : fmt(Math.abs(diff))}
                    </span>
                  </div>
                </div>
              );
            })}
            {rows.length === 0 && <p className="text-xs text-slate-400 text-center py-2">No progress data available</p>}
          </div>
        </div>
      );
    }

    case 'upcoming_registrations': {
      const events: { name: string; dateStr: string; signupCount: number; signupLimit: number | null; fillPct: number | null; isFull: boolean; waitlistedCount: number; publicUrl: string | null }[] = data.upcoming || [];
      return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2.5 flex items-center justify-between">
            <p className="text-[11px] font-bold text-violet-100 uppercase tracking-widest">Upcoming Registrations</p>
            <span className="text-xs font-bold text-violet-200">{events.length} event{events.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="bg-white dark:bg-slate-800 px-4 py-2">
            {events.length === 0 && <p className="text-xs text-slate-400 py-2 text-center">No upcoming registration events</p>}
            {events.map((e, i) => (
              <div key={i} className="py-2 border-b border-slate-50 dark:border-slate-700/50 last:border-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{e.name}</p>
                    <p className="text-[10px] text-indigo-500 dark:text-indigo-400 mt-0.5">{e.dateStr}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-black text-slate-900 dark:text-white">
                      {fmt(e.signupCount)}{e.signupLimit ? ` / ${fmt(e.signupLimit)}` : ''}
                    </p>
                    {e.isFull && <span className="text-[9px] font-bold text-rose-600 dark:text-rose-400 uppercase">Full</span>}
                    {!e.isFull && e.waitlistedCount > 0 && <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 uppercase">{e.waitlistedCount} waitlisted</span>}
                  </div>
                </div>
                {e.fillPct !== null && (
                  <div className="mt-1 h-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className={`bar-fill ${e.isFull ? 'bg-rose-400' : e.fillPct >= 80 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ '--bar-w': `${e.fillPct}%` } as React.CSSProperties} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'group_attendance': {
      const rows: { name: string; members: number; visitors: number; total: number }[] = data.rows || [];
      const maxVal = Math.max(...rows.map(r => r.total), 1);
      return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2.5 flex items-center justify-between">
            <p className="text-[11px] font-bold text-indigo-100 uppercase tracking-widest">Group Attendance</p>
            <span className="text-[10px] font-bold text-indigo-200">{data.period || 'This Month'}</span>
          </div>
          <div className="bg-white dark:bg-slate-800 px-4 py-3">
            <div className="flex gap-6 mb-3">
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total</p>
                <p className="text-xl font-black text-slate-900 dark:text-white">{fmt(data.periodTotal || 0)}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">Members</p>
                <p className="text-xl font-black text-indigo-600 dark:text-indigo-400">{fmt(data.periodMembers || 0)}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest">Visitors</p>
                <p className="text-xl font-black text-amber-500 dark:text-amber-400">{fmt(data.periodVisitors || 0)}</p>
              </div>
            </div>
            {rows.length === 0 && <p className="text-xs text-slate-400 text-center py-2">No attendance data for this period</p>}
            <div className="flex items-end gap-0.5 dcs-mini-bar-chart">
              {rows.slice(-20).map((r, i) => {
                const mH = Math.max(2, Math.round((r.members / maxVal) * 48));
                const vH = Math.max(r.visitors > 0 ? 2 : 0, Math.round((r.visitors / maxVal) * 48));
                return (
                  <div key={i} className="flex-1 flex flex-col justify-end" title={`${r.name}: ${r.total} total`}>
                    {vH > 0 && <div className="bar-seg bg-amber-400 rounded-t-sm" style={{ '--seg-h': `${vH}px` } as React.CSSProperties} />}
                    <div className="bar-seg bg-indigo-500 rounded-t-sm" style={{ '--seg-h': `${mH}px` } as React.CSSProperties} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    case 'events': {
      const events: { name: string; startsAt: string; guests?: number; regulars?: number; volunteers?: number; headcount?: number; total: number }[] = data.events || [];
      return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 flex items-center justify-between">
            <p className="text-[11px] font-bold text-violet-100 uppercase tracking-widest">Events</p>
            <span className="text-[10px] font-bold text-violet-200">{data.period || 'This Month'}</span>
          </div>
          <div className="bg-white dark:bg-slate-800 px-4 py-2">
            {events.length === 0 && <p className="text-xs text-slate-400 py-2 text-center">No event check-ins for this period</p>}
            {events.map((e, i) => {
              const displayDate = new Date(e.startsAt);
              const dateStr = displayDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
              const timeStr = (!e.startsAt.includes('T') && e.name === 'Daily Total') ? '' : displayDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
              const checkinsCount = (e.guests || 0) + (e.regulars || 0) + (e.volunteers || 0);

              return (
                <div key={i} className="py-2 border-b border-slate-50 dark:border-slate-700/50 last:border-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{e.name}</p>
                      <p className="text-[10px] text-indigo-500 dark:text-indigo-400 mt-0.5">{dateStr}{timeStr ? ` • ${timeStr}` : ''}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                        {fmt(e.total)} Total
                      </p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">
                        {checkinsCount} In • {e.headcount || 0} HC
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    case 'giving_average_giving': {
      const weeks: { label: string; byFund: Record<string, number>; total: number }[] = data.weeks || [];
      const fundNames: string[] = data.fundNames || [];
      const fundAverages: { name: string; average: number }[] = data.fundAverages || [];
      const overallWeeklyAverage: number = data.overallWeeklyAverage || 0;

      const FUND_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#06b6d4', '#f43f5e', '#8b5cf6', '#ec4899', '#14b8a6'];
      const maxWeekTotal = Math.max(...weeks.map(w => w.total), 1);

      return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-600 to-cyan-600 px-4 py-2.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-emerald-100 uppercase tracking-widest">Average Giving</p>
              <p className="text-[10px] text-emerald-200 mt-0.5">Last 12 Weeks</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-black text-emerald-100">{fmt(overallWeeklyAverage, true)}</p>
              <p className="text-[10px] text-emerald-200">weekly avg</p>
            </div>
          </div>

          {/* Stacked bar chart */}
          <div className="bg-white dark:bg-slate-800 px-4 pt-3 pb-1">
            {weeks.length === 0 && <p className="text-xs text-slate-400 text-center py-2">No giving data available</p>}
            <div className="dcs-mini-bar-chart flex items-end gap-0.5">
              {weeks.map((w, wi) => {
                const totalH = Math.max(2, Math.round((w.total / maxWeekTotal) * 56));
                return (
                  <div
                    key={wi}
                    className="flex-1 flex flex-col justify-end"
                    title={`${w.label}: ${fmt(w.total, true)}`}
                  >
                    {fundNames.map((f, fi) => {
                      const val = w.byFund[f] || 0;
                      if (val <= 0) return null;
                      const segH = Math.max(1, Math.round((val / maxWeekTotal) * 56));
                      return (
                        <div
                          key={f}
                          className="bar-seg"
                          style={{ '--seg-h': `${segH}px`, '--seg-color': FUND_COLORS[fi % FUND_COLORS.length], '--seg-opacity': '0.85' } as React.CSSProperties}
                          title={`${f}: ${fmt(val, true)}`}
                        />
                      );
                    })}
                    {w.total === 0 && <div className="bar-seg bg-slate-100 dark:bg-slate-700 rounded-sm" style={{ '--seg-h': '2px' } as React.CSSProperties} />}
                  </div>
                );
              })}
            </div>
            {/* X-axis labels: show first and last */}
            {weeks.length > 0 && (
              <div className="flex justify-between mt-0.5">
                <span className="text-[7px] text-slate-400">{weeks[0]?.label}</span>
                <span className="text-[7px] text-slate-400">{weeks[weeks.length - 1]?.label}</span>
              </div>
            )}
          </div>

          {/* Fund legend & averages */}
          <div className="bg-slate-50 dark:bg-slate-900 px-4 py-3 border-t border-slate-100 dark:border-slate-700 space-y-1.5">
            {fundAverages.length === 0 && <p className="text-xs text-slate-400 text-center py-1">No fund data</p>}
            {fundAverages.slice(0, 6).map((f, fi) => {
              const colorIdx = fundNames.indexOf(f.name);
              return (
                <div key={f.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div
                      className="color-dot" style={{ '--dot-color': FUND_COLORS[colorIdx % FUND_COLORS.length] } as React.CSSProperties}
                    />
                    <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[120px]">{f.name}</span>
                  </div>
                  <span className="text-[10px] font-black text-slate-900 dark:text-white shrink-0 ml-2">{fmt(f.average, true)}<span className="text-slate-400 font-normal">/wk</span></span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    default:
      return null;
  }
};

// ─── Picker Component (used in EmailBuilder sidebar) ──────────────────────────

interface Props {
  churchId: string;
  onInsert: (widgetId: AnalyticsWidgetId, label: string, data: any, config?: Record<string, any>) => void;
}

// ─── Widget Config Panel ──────────────────────────────────────────────────────

const WidgetConfigPanel: React.FC<{
  widget: WidgetDef;
  churchId: string;
  onConfirm: (config: WidgetConfig) => void;
  onBack: () => void;
  isLoading: boolean;
}> = ({ widget, churchId, onConfirm, onBack, isLoading }) => {
  const [funds, setFunds] = useState<{ id: string; name: string }[]>([]);
  const [loadingFunds, setLoadingFunds] = useState(false);
  const [fundName, setFundName] = useState('');
  const [dayRange, setDayRange] = useState('14');
  const [timePeriod, setTimePeriod] = useState('Last 30 Days');

  // PCO List state
  const [pcoLists, setPcoLists] = useState<{ id: string; name: string; totalPeople: number }[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [pcoListId, setPcoListId] = useState('');
  const [pcoListName, setPcoListName] = useState('');
  const [resolvingListMembers, setResolvingListMembers] = useState(false);

  useEffect(() => {
    if (!widget.configDef?.fundPicker) return;
    setLoadingFunds(true);
    firestore.getFunds(churchId)
      .then(f => setFunds(f.map(x => ({ id: x.id, name: (x as any).name || x.id })).sort((a, b) => a.name.localeCompare(b.name))))
      .finally(() => setLoadingFunds(false));
  }, [widget.id, churchId]);

  useEffect(() => {
    if (!widget.configDef?.pcoListPicker) return;
    setLoadingLists(true);
    pcoService.getPeopleLists(churchId)
      .then(raw => {
        setPcoLists(
          (raw || []).map((item: any) => ({
            id: item.id,
            name: item.attributes?.name || 'Unnamed List',
            totalPeople: item.attributes?.total_people || 0,
          })).sort((a: any, b: any) => a.name.localeCompare(b.name))
        );
      })
      .catch(() => {})
      .finally(() => setLoadingLists(false));
  }, [widget.id, churchId]);

  const handleConfirm = async () => {
    let pcoListPeopleIds: string[] | undefined;

    // If a list is selected for birthday/anniversary widgets, resolve the member PCO IDs
    if (widget.configDef?.pcoListPicker && pcoListId) {
      setResolvingListMembers(true);
      try {
        pcoListPeopleIds = await pcoService.getListPeopleIds(churchId, pcoListId);
      } catch {
        // Non-fatal: proceed without list filter
      } finally {
        setResolvingListMembers(false);
      }
    }

    onConfirm({
      fundName,
      dayRange: parseInt(dayRange, 10),
      timePeriod,
      pcoListId: pcoListId || undefined,
      pcoListName: pcoListName || undefined,
      pcoListPeopleIds,
    });
  };

  const isBusy = isLoading || resolvingListMembers;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          aria-label="Back to widget list"
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
        >
          <ChevronLeft size={15} />
        </button>
        <div>
          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{widget.label}</p>
          <p className="text-[10px] text-slate-400">{widget.description}</p>
        </div>
      </div>

      {/* PCO List Picker */}
      {widget.configDef?.pcoListPicker && (
        <div>
          <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
            Filter by Planning Center List <span className="font-normal normal-case text-slate-400">(optional)</span>
          </label>
          <p className="text-[10px] text-slate-400 mb-2 leading-snug">
            Only show people who are members of the selected PCO list. Leave blank to show everyone.
          </p>
          {loadingLists ? (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
              <Loader2 size={12} className="animate-spin" /> Loading PCO Lists…
            </div>
          ) : (
            <select
              aria-label="Filter by Planning Center List"
              value={pcoListId}
              onChange={e => {
                const selected = pcoLists.find(l => l.id === e.target.value);
                setPcoListId(e.target.value);
                setPcoListName(selected?.name || '');
              }}
              className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All People (no list filter)</option>
              {pcoLists.map(l => (
                <option key={l.id} value={l.id}>{l.name}{l.totalPeople > 0 ? ` (${l.totalPeople})` : ''}</option>
              ))}
            </select>
          )}
          {pcoLists.length === 0 && !loadingLists && (
            <p className="text-[10px] text-slate-400 mt-1">No lists found — connect PCO and sync first.</p>
          )}
          {pcoListId && (
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-indigo-600 dark:text-indigo-400">
              <List size={11} />
              <span>Widget will show only members of <strong>{pcoListName}</strong></span>
            </div>
          )}
        </div>
      )}

      {/* Fund Picker */}
      {widget.configDef?.fundPicker && (
        <div>
          <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
            Filter by Fund
          </label>
          {loadingFunds ? (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
              <Loader2 size={12} className="animate-spin" /> Loading funds…
            </div>
          ) : (
            <select
              aria-label="Filter by fund"
              value={fundName}
              onChange={e => setFundName(e.target.value)}
              className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Funds (combined)</option>
              {funds.map(f => (
                <option key={f.id} value={f.name}>{f.name}</option>
              ))}
            </select>
          )}
          {funds.length === 0 && !loadingFunds && (
            <p className="text-[10px] text-slate-400 mt-1">No funds found — sync giving data first.</p>
          )}
        </div>
      )}

      {/* Day Range Picker */}
      {widget.configDef?.dayRangePicker && (
        <div>
          <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
            Days to look ahead
          </label>
          <select
            aria-label="Days to look ahead"
            value={dayRange}
            onChange={e => setDayRange(e.target.value)}
            className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="7">7 Days</option>
            <option value="14">14 Days</option>
            <option value="30">30 Days</option>
            <option value="60">60 Days</option>
            <option value="90">90 Days</option>
          </select>
        </div>
      )}

      {/* Time Period Picker */}
      {widget.configDef?.timePeriodPicker && (
        <div>
          <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
            Time Period
          </label>
          <select
            aria-label="Time period"
            value={timePeriod}
            onChange={e => setTimePeriod(e.target.value)}
            className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="This Week">This Week</option>
            <option value="Last Week">Last Week</option>
            <option value="This Month">This Month</option>
            <option value="Last 30 Days">Last 30 Days</option>
            <option value="Last Month">Last Month</option>
            <option value="Last Quarter">Last Quarter (90 days)</option>
          </select>
        </div>
      )}

      <button
        onClick={handleConfirm}
        disabled={isBusy}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-bold rounded-xl transition"
      >
        {resolvingListMembers ? <><Loader2 size={13} className="animate-spin" /> Resolving list members…</> :
         isLoading ? <><Loader2 size={13} className="animate-spin" /> Fetching data…</> : 'Insert Widget'}
      </button>
    </div>
  );
};

// ─── Main Selector ────────────────────────────────────────────────────────────

export const DataChartSelector: React.FC<Props> = ({ churchId, onInsert }) => {
  const [activeModule, setActiveModule] = useState<'Giving' | 'People' | 'Services'>('Giving');
  const [configuringWidget, setConfiguringWidget] = useState<WidgetDef | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moduleWidgets = WIDGET_DEFS.filter(w => w.module === activeModule);

  const handlePick = (widget: WidgetDef) => {
    setError(null);
    if (widget.configDef) {
      // Go to config step
      setConfiguringWidget(widget);
    } else {
      // No config needed — fetch and insert immediately
      handleInsert(widget, {});
    }
  };

  const handleInsert = async (widget: WidgetDef, config: WidgetConfig) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWidgetSnapshot(churchId, widget.id, config);
      // Build a label that includes the fund or list filter if one was selected
      let label = widget.label;
      if (config.fundName) label = `${label} — ${config.fundName}`;
      if (config.pcoListName) label = `${label} — ${config.pcoListName}`;
      // Persist the full config so the server-side refresh uses the same settings.
      // Store in both content.config (primary, read by refreshCampaignBlocks) and
      // content.data._config (legacy fallback path).
      const fullConfig = {
        timePeriod:      config.timePeriod,
        fundName:        config.fundName,
        dayRange:        config.dayRange,
        pcoListId:       config.pcoListId,
        pcoListName:     config.pcoListName,
        pcoListPeopleIds: config.pcoListPeopleIds,
      };
      onInsert(widget.id, label, { ...data, _config: fullConfig }, fullConfig);
      setConfiguringWidget(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // ── Config view
  if (configuringWidget) {
    return (
      <div className="space-y-3">
        {error && (
          <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>
        )}
        <WidgetConfigPanel
          widget={configuringWidget}
          churchId={churchId}
          onConfirm={(config) => handleInsert(configuringWidget, config)}
          onBack={() => { setConfiguringWidget(null); setError(null); }}
          isLoading={loading}
        />
      </div>
    );
  }

  // ── List view
  return (
    <div className="space-y-3">
      {/* Module tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl">
        {(['Giving', 'People', 'Services'] as const).map(m => (
          <button
            key={m}
            onClick={() => setActiveModule(m)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeModule === m
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {m === 'Giving' ? <DollarSign size={12} /> : m === 'People' ? <Users size={12} /> : <Calendar size={12} />} {m}
          </button>
        ))}
      </div>

      {/* Widget list */}
      <div className="space-y-1.5">
        {moduleWidgets.map(widget => (
          <button
            key={widget.id}
            onClick={() => handlePick(widget)}
            disabled={loading}
            className="w-full flex items-center justify-between gap-2 p-3 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 rounded-xl transition text-left group disabled:opacity-50"
          >
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 text-indigo-500 shrink-0">{widget.icon}</div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{widget.label}</p>
                  {widget.configDef && (
                    <SlidersHorizontal size={10} className="text-indigo-400 shrink-0" title="Configurable" />
                  )}
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-snug mt-0.5">{widget.description}</p>
              </div>
            </div>
            <ChevronRight size={13} className="text-slate-300 group-hover:text-indigo-400 shrink-0 transition" />
          </button>
        ))}
      </div>

      {error && (
        <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>
      )}

      <p className="text-[10px] text-slate-400 text-center">
        Data is captured at insert time from your Firestore analytics
      </p>
    </div>
  );
};
