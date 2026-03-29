import React, { useState, useEffect } from 'react';
import { firestore } from '../services/firestoreService';
import { calculateGivingAnalytics, calculateServicesAnalytics, DEFAULT_LIFECYCLE_SETTINGS } from '../services/analyticsService';
import { Loader2, BarChart2, Users, DollarSign, ChevronRight, ChevronLeft, SlidersHorizontal, Calendar } from 'lucide-react';

// ─── Widget Catalogue ─────────────────────────────────────────────────────────

export type AnalyticsWidgetId =
  | 'giving_key_metrics'
  | 'giving_fund_performance'
  | 'giving_donor_lifecycle'
  | 'giving_donor_acquisition'
  | 'giving_cumulative_ytd'
  | 'giving_budget_progress'
  | 'giving_last_week_by_fund'
  | 'people_stats'
  | 'people_age'
  | 'people_gender'
  | 'people_membership'
  | 'people_birthdays'
  | 'people_anniversaries'
  | 'services_upcoming_events';

// Config required before inserting a widget (null = no config needed)
export interface WidgetConfigDef {
  fundPicker?: boolean;   // Show a fund selector
  dayRangePicker?: boolean; // Show a days-ahead range picker
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
  fundName?: string;  // '' = all funds
  dayRange?: number;  // e.g. 7, 14, 30
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
  },
  {
    id: 'people_anniversaries',
    label: 'Upcoming Anniversaries',
    description: 'Couples with anniversaries in the next 30 days',
    module: 'People',
    icon: <Users size={14} />,
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
          .reduce((s, d) => s + d.amount, 0);
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
          fundTotals[d.fundName] = (fundTotals[d.fundName] || 0) + d.amount;
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
          fundActuals[d.fundName] = (fundActuals[d.fundName] || 0) + d.amount;
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
    case 'people_stats':
    case 'people_age':
    case 'people_gender':
    case 'people_membership':
    case 'people_birthdays':
    case 'people_anniversaries': {
      const people = await firestore.getPeople(churchId);
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
        const upcoming = people
          .filter(p => !!p.birthdate && !EXCLUDED.includes(p.status || ''))
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
        return { upcoming };
      }
      if (widgetId === 'people_anniversaries') {
        const EXCLUDED = ['Inactive', 'Archived'];
        const upcoming = people
          .filter(p => !!p.anniversary && !EXCLUDED.includes(p.status || ''))
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
        return { upcoming };
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
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(f.value / max) * 100}%` }} />
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
                  <div className={`h-full ${r.color} rounded-full`} style={{ width: `${(r.value / max) * 100}%` }} />
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
                  <div className="h-full bg-pink-400 rounded-full" style={{ width: `${(r.count / max) * 100}%` }} />
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
                  <div className={`h-full ${gColors[r.name] || 'bg-slate-400'} rounded-full`} style={{ width: `${(r.value / total) * 100}%` }} />
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
                  <div className={`h-full ${mColors[i % mColors.length]} rounded-full`} style={{ width: `${(r.value / total) * 100}%` }} />
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
                  <div className={`h-full ${r.color} rounded-full`} style={{ width: `${(r.value / max) * 100}%` }} />
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
                <div className="w-3 h-0.5 bg-slate-400 ml-2" style={{ borderTop: '2px dashed' }} />
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
            <div className="flex items-end gap-0.5" style={{ height: 64 }}>
              {months.map((m, i) => {
                const actualH = m.actual !== null ? Math.max(2, Math.round((m.actual / maxVal) * 56)) : 0;
                const budgetH = Math.max(2, Math.round((m.budget / maxVal) * 56));
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5 relative">
                    {/* Budget bar (behind) */}
                    {hasBudget && (
                      <div
                        className="absolute bottom-4 w-full border-t-2 border-dashed border-slate-300 dark:border-slate-500"
                        style={{ bottom: `${budgetH + 12}px` }}
                        title={`Budget: ${fmt(m.budget, true)}`}
                      />
                    )}
                    {/* Actual bar */}
                    <div
                      className={`w-full rounded-sm transition-all ${
                        m.isPast ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-600'
                      }`}
                      style={{ height: actualH > 0 ? `${actualH}px` : '2px', minHeight: 2, opacity: m.isPast ? 1 : 0.4 }}
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
      return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-gradient-to-r from-pink-500 to-rose-500 px-4 py-2.5 flex items-center justify-between">
            <p className="text-[11px] font-bold text-pink-100 uppercase tracking-widest">Upcoming Birthdays</p>
            <span className="text-xs font-bold text-pink-100">Next 30 days</span>
          </div>
          <div className="bg-white dark:bg-slate-800 px-4 py-2">
            {upcoming.length === 0 && <p className="text-xs text-slate-400 py-2 text-center">No birthdays in next 30 days</p>}
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
      return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-4 py-2.5 flex items-center justify-between">
            <p className="text-[11px] font-bold text-violet-100 uppercase tracking-widest">Upcoming Anniversaries</p>
            <span className="text-xs font-bold text-violet-100">Next 30 days</span>
          </div>
          <div className="bg-white dark:bg-slate-800 px-4 py-2">
            {upcoming.length === 0 && <p className="text-xs text-slate-400 py-2 text-center">No anniversaries in next 30 days</p>}
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
                  <div className="h-full rounded-full transition-all" style={{ width: `${totalPct}%`, backgroundColor: barColor(totalPct) }} />
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
                  <div className="h-full rounded-full" style={{ width: `${f.pct}%`, backgroundColor: barColor(f.pct), opacity: 0.85 }} />
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
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: FUND_COLORS[i % FUND_COLORS.length] }} />
                    <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[55%]">{f.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black text-slate-900 dark:text-white">{fmt(f.amount, true)}</span>
                    <span className="text-[9px] text-slate-400">{f.pct}%</span>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full">
                  <div className="h-full rounded-full" style={{ width: `${f.pct}%`, backgroundColor: FUND_COLORS[i % FUND_COLORS.length], opacity: 0.85 }} />
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

    default:
      return null;
  }
};

// ─── Picker Component (used in EmailBuilder sidebar) ──────────────────────────

interface Props {
  churchId: string;
  onInsert: (widgetId: AnalyticsWidgetId, label: string, data: any) => void;
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

  useEffect(() => {
    if (!widget.configDef?.fundPicker) return;
    setLoadingFunds(true);
    firestore.getFunds(churchId)
      .then(f => setFunds(f.map(x => ({ id: x.id, name: (x as any).name || x.id })).sort((a, b) => a.name.localeCompare(b.name))))
      .finally(() => setLoadingFunds(false));
  }, [widget.id, churchId]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
        >
          <ChevronLeft size={15} />
        </button>
        <div>
          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{widget.label}</p>
          <p className="text-[10px] text-slate-400">{widget.description}</p>
        </div>
      </div>

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

      <button
        onClick={() => onConfirm({ fundName, dayRange: parseInt(dayRange, 10) })}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-bold rounded-xl transition"
      >
        {isLoading ? <><Loader2 size={13} className="animate-spin" /> Fetching data…</> : 'Insert Widget'}
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
      // Build a label that includes the fund filter if one was selected
      const label = config.fundName ? `${widget.label} — ${config.fundName}` : widget.label;
      onInsert(widget.id, label, data);
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
