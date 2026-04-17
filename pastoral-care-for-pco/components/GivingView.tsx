
import React, { useState, useEffect, useMemo } from 'react';
import { 
    GivingAnalytics, GivingFilter, BudgetRecord, PcoFund, DetailedDonation, 
    Church, PcoPerson, GlobalStats, DonorLifecycleSettings 
} from '../types';
import { GIVING_WIDGETS } from '../constants/widgetRegistry';
import { WidgetWrapper, StatCard, DonorListWidget } from './SharedUI';
import WidgetsController from './WidgetsController';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line, ComposedChart, Cell 
} from 'recharts';
import { calculateGivingAnalytics } from '../services/analyticsService';
import { firestore } from '../services/firestoreService';

import { DonationReport } from './DonationReport';

interface GivingViewProps {
  analytics: GivingAnalytics | null;
  pcoConnected: boolean;
  filter: GivingFilter;
  onFilterChange: (filter: GivingFilter) => void;
  dateRange?: { start: string, end: string };
  onDateRangeChange?: (range: { start: string, end: string }) => void;
  activePage?: 'overview' | 'donor' | 'budgets' | 'donations' | 'reports';
  overviewWidgets: string[];
  donorWidgets: string[];
  onUpdateOverviewWidgets: (widgets: string[]) => void;
  onUpdateDonorWidgets: (widgets: string[]) => void;
  allowedWidgetIds?: string[];
  onSync?: () => void;
  onSyncRecent?: (startDate?: Date) => void;
  isSyncing?: boolean;
  budgets: BudgetRecord[];
  funds: PcoFund[];
  donations: DetailedDonation[];
  onSaveBudget?: (budget: BudgetRecord) => void;
  churchId: string;
  church?: Church;
  people: PcoPerson[];
  totalPeople: number;
  onUpdateTheme?: (theme: 'traditional' | 'dark') => void;
  currentTheme?: 'traditional' | 'dark';
  globalStats?: GlobalStats | null;
}

interface ReportSection {
    id: string;
    type: 'text' | 'metrics' | 'trends' | 'break';
    title: string;
    content?: string;
}

const OVERVIEW_EXCLUDED_WIDGETS = ['topGivers', 'lifecycleActive', 'lifecycleNew', 'lifecycleLapsed', 'lifecycleOccasional', 'lifecycleRecovered', 'lifecycleInactive', 'lifecycleSecond'];
const DONOR_TAB_WIDGETS = ['lifecycleNew', 'lifecycleOccasional', 'lifecycleRecovered', 'lifecycleInactive', 'lifecycleLapsed', 'lifecycleActive', 'lifecycleSecond', 'donorLifecycle'];

const TOOLTIP_STYLE = {
    borderRadius: '12px',
    border: 'none',
    backgroundColor: '#1e293b',
    color: '#fff',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
};

const getWidgetSpan = (id: string) => {
    if (['keyMetrics', 'trends', 'fundPerformance', 'cumulativeYTD', 'donorLifecycle', 'trendsComparison', 'benchmark_giving_avg', 'budgetProgress', 'givingVsBudget'].includes(id)) return 'col-span-1 md:col-span-2 lg:col-span-2';
    return 'col-span-1';
};

export const GivingView: React.FC<GivingViewProps> = ({ 
  analytics, 
  pcoConnected, 
  filter, 
  onFilterChange, 
  dateRange, 
  onDateRangeChange, 
  activePage,
  overviewWidgets,
  donorWidgets,
  onUpdateOverviewWidgets,
  onUpdateDonorWidgets,
  allowedWidgetIds,
  onSync,
  onSyncRecent,
  isSyncing,
  budgets,
  funds,
  donations,
  onSaveBudget,
  churchId,
  church,
  people,
  totalPeople,
  onUpdateTheme,
  currentTheme,
  globalStats
}) => {
  const activeTab = activePage ?? 'overview';
  
  // Widget Local States
  const [cvpFilter, setCvpFilter] = useState<GivingFilter>('Month');
  const [gvbFilter, setGvbFilter] = useState<GivingFilter>('Year');
  const [gvbFund, setGvbFund] = useState<string>('');
  const [cumulativeFundFilter, setCumulativeFundFilter] = useState<string>('');
  
  // Budget Editor State
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [budgetYear, setBudgetYear] = useState(new Date().getFullYear());
  const [editingBudget, setEditingBudget] = useState<BudgetRecord | null>(null);

  // Drag State
  const dragItem = React.useRef<number | null>(null);
  const dragOverItem = React.useRef<number | null>(null);

  // --- Auto Cleanup Effect for Bad Data ---
  useEffect(() => {
      const checkForBadData = async () => {
          if (isSyncing || !donations.length) return;

          // Identify donations from old sync logic (no underscore in ID implies old logic where we didn't split designations)
          // The new sync ensures all IDs have a suffix (e.g., "12345_0")
          const badDonations = donations.filter(d => !d.id.includes('_'));

          if (badDonations.length > 0) {
              console.log(`Found ${badDonations.length} donation records with obsolete format (missing funds). Cleaning up...`);
              
              try {
                  await firestore.deleteDonations(churchId, badDonations.map(d => d.id));
                  console.log("Obsolete records deleted. Triggering re-sync...");
                  if (onSyncRecent) onSyncRecent(); 
              } catch (e) {
                  console.error("Failed to clean up bad data:", e);
              }
          }
      };
      
      // Delay slightly to ensure render is stable
      const timer = setTimeout(checkForBadData, 1000);
      return () => clearTimeout(timer);
  }, [donations, isSyncing, churchId]); 

  const fundsWithBudget = useMemo(() => {
      return funds.filter(f => 
          budgets.some(b => b.fundName === f.name && b.year === budgetYear && b.isActive)
      ).sort((a, b) => a.name.localeCompare(b.name));
  }, [funds, budgets, budgetYear]);

  useEffect(() => {
      if (fundsWithBudget.length > 0) {
          const currentIsValid = fundsWithBudget.some(f => f.name === cumulativeFundFilter);
          if (!currentIsValid) {
              setCumulativeFundFilter(fundsWithBudget[0].name);
          }
      } else {
          setCumulativeFundFilter('');
      }
  }, [fundsWithBudget, cumulativeFundFilter]);

  const availableWidgets = useMemo(() => {
    let widgets = GIVING_WIDGETS;
    if (activeTab === 'overview') {
        widgets = widgets.filter(w => !OVERVIEW_EXCLUDED_WIDGETS.includes(w.id));
    } else if (activeTab === 'donor') {
        widgets = widgets.filter(w => DONOR_TAB_WIDGETS.includes(w.id));
    }
    
    if (!allowedWidgetIds) return widgets;
    return widgets.filter(w => allowedWidgetIds.includes(`giving:${w.id}`));
  }, [allowedWidgetIds, activeTab]);

  const safeVisibleWidgets = useMemo(() => {
      let current = activeTab === 'overview' ? overviewWidgets : donorWidgets;
      if (activeTab === 'overview') {
          current = current.filter(id => !OVERVIEW_EXCLUDED_WIDGETS.includes(id));
      } else if (activeTab === 'donor') {
          current = current.filter(id => DONOR_TAB_WIDGETS.includes(id));
      }
      return current.filter(id => !allowedWidgetIds || allowedWidgetIds.includes(`giving:${id}`));
  }, [activeTab, overviewWidgets, donorWidgets, allowedWidgetIds]);

  const onUpdateActiveWidgets = (newWidgets: string[]) => {
      if (activeTab === 'overview') onUpdateOverviewWidgets(newWidgets);
      else if (activeTab === 'donor') onUpdateDonorWidgets(newWidgets);
  };

  const widgetsToRender = safeVisibleWidgets;

  // -- Dashboard DnD Handlers --
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, position: number) => {
    dragItem.current = position;
    e.currentTarget.style.opacity = '0.5';
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, position: number) => {
    dragOverItem.current = position;
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.style.opacity = '1';
    if (dragItem.current !== null && dragOverItem.current !== null) {
      const copy = [...widgetsToRender];
      const draggedItemContent = copy[dragItem.current];
      copy.splice(dragItem.current, 1);
      copy.splice(dragOverItem.current, 0, draggedItemContent);
      onUpdateActiveWidgets(copy);
    }
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
  };

  const handleRemoveWidget = (id: string) => {
      onUpdateActiveWidgets(safeVisibleWidgets.filter(w => w !== id));
  };

  const handleEditBudget = (fundId: string, fundName: string) => {
      const existing = budgets.find(b => b.fundName === fundName && b.year === budgetYear);
      setEditingBudget(existing || {
          id: `budget_${fundId}_${budgetYear}`,
          churchId: churchId,
          year: budgetYear,
          fundName: fundName,
          totalAmount: 0,
          monthlyAmounts: new Array(12).fill(0),
          isActive: true
      });
      setIsEditingBudget(true);
  };

  const handleSaveBudgetInternal = (budget: BudgetRecord) => {
      if (onSaveBudget) {
          onSaveBudget(budget);
          setIsEditingBudget(false);
      }
  };

  const getDateRangeForFilter = (f: GivingFilter, customRangeOverride?: {start: string, end: string}) => {
    const now = new Date();
    let endDate = new Date();
    let startDate = new Date();
    
    if (f === 'Week') startDate.setDate(now.getDate() - 7);
    else if (f === 'This Week') {
        const day = now.getDay();
        startDate.setDate(now.getDate() - day); 
    }
    else if (f === 'Last Week') {
        const day = now.getDay(); // 0=Sun ... 6=Sat
        // End = last Saturday (or today if today is Sun)
        endDate = new Date(now);
        endDate.setDate(now.getDate() - day - 1); // last Saturday
        // Start = Monday 6 days before that Saturday
        startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - 6); // previous Monday
    }
    else if (f === 'Month') startDate.setDate(now.getDate() - 30);
    else if (f === 'This Month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    else if (f === 'Last Month') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
    }
    else if (f === 'Quarter') startDate.setDate(now.getDate() - 90);
    else if (f === 'This Quarter') {
        const currentMonth = now.getMonth();
        const startMonth = currentMonth - (currentMonth % 3);
        startDate = new Date(now.getFullYear(), startMonth, 1);
    }
    else if (f === 'Year') startDate.setFullYear(now.getFullYear() - 1);
    else if (f === 'This Year') {
        startDate = new Date(now.getFullYear(), 0, 1);
    }
    else if (f === 'Custom') {
        const range = customRangeOverride || dateRange;
        if (range && range.start && range.end) {
            return { startDate: new Date(range.start), endDate: new Date(range.end) };
        }
    }
    
    startDate.setHours(0,0,0,0);
    endDate.setHours(23,59,59,999);
    
    return { startDate, endDate };
  };

  // Smart Sync Logic
  const handleSmartGivingSync = () => {
      if (!onSyncRecent) return;

      const now = new Date();
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(now.getFullYear() - 2);
      
      const eighteenMonthsAgo = new Date();
      eighteenMonthsAgo.setMonth(now.getMonth() - 18);

      // 1. Check if we have data and find date range
      const validDonations = (donations || [])
          .filter(d => !isNaN(new Date(d.date).getTime()))
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (validDonations.length === 0) {
          // No data: Pull 2 years
          onSyncRecent(twoYearsAgo);
          return;
      }

      const earliestDonation = new Date(validDonations[0].date);
      const latestDonation = new Date(validDonations[validDonations.length - 1].date);

      // 2. Determine Strategy
      // If earliest donation is OLDER than 18 months ago, we have "at least 18 months history"
      const hasDeepHistory = earliestDonation <= eighteenMonthsAgo;

      if (hasDeepHistory) {
          // We have a good history baseline (up to ~18mo+). 
          // Just update from the tip (latest - 30 days) to catch recent changes/additions.
          const syncStart = new Date(latestDonation);
          syncStart.setDate(syncStart.getDate() - 30);
          onSyncRecent(syncStart);
      } else {
          // We have shallow history (less than 18 months).
          // Trigger a full 2-year backfill.
          onSyncRecent(twoYearsAgo);
      }
  };

  const getDailyBudget = (date: Date, fundName: string) => {
      const year = date.getFullYear();
      const month = date.getMonth();
      const budget = budgets.find(b => b.fundName === fundName && b.year === year && b.isActive);
      if (!budget) return 0;
      const monthlyAmount = budget.monthlyAmounts[month] || 0;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      return monthlyAmount / daysInMonth;
  };

  // Calculations & Analytics Memos
  const availableBudgetFunds = useMemo(() => {
      const { startDate, endDate } = getDateRangeForFilter(gvbFilter);
      const startYear = startDate.getFullYear();
      const endYear = endDate.getFullYear();
      return funds.filter(f => 
          budgets.some(b => 
            b.fundName === f.name && 
            b.isActive && 
            (b.year >= startYear && b.year <= endYear)
          )
      ).sort((a,b) => a.name.localeCompare(b.name));
  }, [funds, budgets, gvbFilter, dateRange]); 

  useEffect(() => {
      if (availableBudgetFunds.length > 0) {
          if (!gvbFund || !availableBudgetFunds.find(f => f.name === gvbFund)) {
              setGvbFund(availableBudgetFunds[0].name);
          }
      } else {
          setGvbFund('');
      }
  }, [availableBudgetFunds, gvbFund]);

  const gvbData = useMemo(() => {
      if (!gvbFund) return [];
      const { startDate, endDate } = getDateRangeForFilter(gvbFilter);
      const dataPoints = [];
      let currentDate = new Date(startDate);
      currentDate.setHours(0,0,0,0);
      const durationDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (durationDays <= 7 || gvbFilter === 'Week' || gvbFilter === 'This Week') {
          while (currentDate <= endDate) {
              const dayEnd = new Date(currentDate);
              dayEnd.setHours(23, 59, 59, 999);
              const actual = donations
                  .filter(d => {
                      const dDate = new Date(d.date);
                      return d.fundName === gvbFund && dDate >= currentDate && dDate <= dayEnd;
                  })
                  .reduce((sum, d) => sum + d.amount, 0);
              const budget = getDailyBudget(currentDate, gvbFund);
              dataPoints.push({
                  name: currentDate.toLocaleDateString('en-US', { weekday: 'short' }),
                  Budget: Math.round(budget),
                  Given: Math.round(actual)
              });
              currentDate.setDate(currentDate.getDate() + 1);
          }
      } else {
          currentDate.setDate(1); 
          while (currentDate <= endDate) {
              const bucketStart = new Date(currentDate);
              const bucketEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
              bucketEnd.setHours(23, 59, 59, 999);
              const actual = donations
                  .filter(d => {
                      const dDate = new Date(d.date);
                      return d.fundName === gvbFund && dDate >= bucketStart && dDate <= bucketEnd && dDate >= startDate && dDate <= endDate;
                  })
                  .reduce((sum, d) => sum + d.amount, 0);
              const budgetRecord = budgets.find(b => b.fundName === gvbFund && b.year === bucketStart.getFullYear() && b.isActive);
              const monthlyBudget = budgetRecord ? (budgetRecord.monthlyAmounts[bucketStart.getMonth()] || 0) : 0;
              dataPoints.push({
                  name: bucketStart.toLocaleDateString('en-US', { month: 'short' }),
                  Budget: Math.round(monthlyBudget),
                  Given: Math.round(actual)
              });
              currentDate.setMonth(currentDate.getMonth() + 1);
          }
      }
      return dataPoints;
  }, [funds, donations, budgets, gvbFilter, gvbFund, dateRange]);

  const cumulativeChartData = useMemo(() => {
      if (!cumulativeFundFilter) return [];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const dataPoints = [];
      let runningActual = 0;
      let runningBudget = 0;
      
      const budgetRecord = budgets.find(b => b.fundName === cumulativeFundFilter && b.year === budgetYear && b.isActive);
      const now = new Date();
      const currentYear = now.getFullYear();

      for (let i = 0; i < 12; i++) {
          const monthStart = new Date(budgetYear, i, 1);
          const monthEnd = new Date(budgetYear, i + 1, 0);
          monthEnd.setHours(23, 59, 59, 999);
          
          const actualInMonth = donations
              .filter(d => {
                  const dDate = new Date(d.date);
                  return d.fundName === cumulativeFundFilter && dDate >= monthStart && dDate <= monthEnd;
              })
              .reduce((sum, d) => sum + d.amount, 0);
          
          let showActual = false;
          if (budgetYear < currentYear) showActual = true;
          else if (budgetYear > currentYear) showActual = false;
          else if (monthStart <= now) showActual = true;

          if (showActual) {
              runningActual += actualInMonth;
          }
          
          const budgetInMonth = budgetRecord ? (budgetRecord.monthlyAmounts[i] || 0) : 0;
          runningBudget += budgetInMonth;
          
          dataPoints.push({
              name: months[i],
              Actual: showActual ? runningActual : null,
              Budget: runningBudget
          });
      }
      return dataPoints;
  }, [donations, budgets, cumulativeFundFilter, budgetYear]);

  const acquisitionData = useMemo(() => {
      const donorFirstGift = new Map<string, number>();
      donations.forEach(d => {
          const t = new Date(d.date).getTime();
          if (!donorFirstGift.has(d.donorId) || t < donorFirstGift.get(d.donorId)!) {
              donorFirstGift.set(d.donorId, t);
          }
      });

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      return months.map((monthName, index) => {
          const monthStart = new Date(budgetYear, index, 1);
          const monthEnd = new Date(budgetYear, index + 1, 0);
          monthEnd.setHours(23, 59, 59, 999);
          
          const donorsInMonth = new Set<string>();
          donations.forEach(d => {
              const dDate = new Date(d.date);
              if (dDate >= monthStart && dDate <= monthEnd) {
                  donorsInMonth.add(d.donorId);
              }
          });

          let newGivers = 0;
          let returningGivers = 0;

          donorsInMonth.forEach(id => {
              const firstDate = donorFirstGift.get(id);
              if (firstDate && firstDate >= monthStart.getTime() && firstDate <= monthEnd.getTime()) {
                  newGivers++;
              } else {
                  returningGivers++;
              }
          });

          return {
              name: monthName,
              Returning: returningGivers,
              New: newGivers
          };
      });
  }, [donations, budgetYear]);

  const calculateBudgetMetrics = () => {
      const endOfYear = new Date(budgetYear, 11, 31);
      const now = new Date();
      let ytdMonthIndex = 11;
      if (budgetYear === now.getFullYear()) {
          ytdMonthIndex = now.getMonth();
      } else if (budgetYear > now.getFullYear()) {
          ytdMonthIndex = -1; 
      }
      const totalAnnualBudget = budgets
        .filter(b => b.year === budgetYear && b.isActive)
        .reduce((sum, b) => sum + b.totalAmount, 0);
      const totalYtdBudget = budgets
        .filter(b => b.year === budgetYear && b.isActive)
        .reduce((sum, b) => {
            const ytdSum = b.monthlyAmounts.slice(0, ytdMonthIndex + 1).reduce((a, v) => a + v, 0);
            return sum + ytdSum;
        }, 0);
      const totalYtdActual = donations
        .filter(d => {
            const date = new Date(d.date);
            return date.getFullYear() === budgetYear && date <= (budgetYear === now.getFullYear() ? now : endOfYear);
        })
        .reduce((sum, d) => sum + d.amount, 0);
      const percentOfBudget = totalAnnualBudget > 0 ? (totalYtdActual / totalAnnualBudget) * 100 : 0;
      const percentOfYtdBudget = totalYtdBudget > 0 ? (totalYtdActual / totalYtdBudget) * 100 : 0;
      return { totalAnnualBudget, totalYtdBudget, totalYtdActual, percentOfBudget, percentOfYtdBudget };
  };

  const budgetMetrics = calculateBudgetMetrics();

  const renderBenchmarkPlaceholder = (title: string, removeId: string) => (
      <div className="col-span-1">
          <WidgetWrapper title={title} onRemove={() => handleRemoveWidget(removeId)} source="Benchmarks">
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                  <div className="text-4xl grayscale opacity-30">⚖️</div>
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-500">Benchmark Data Unavailable</p>
                  <p className="text-[10px] text-slate-400 max-w-xs">Enable data sharing in Settings {'>'} Organization to unlock aggregated community benchmarks.</p>
              </div>
          </WidgetWrapper>
      </div>
  );

  const gridColor = currentTheme === 'dark' ? '#334155' : '#f1f5f9';
  const axisColor = currentTheme === 'dark' ? '#94a3b8' : '#94a3b8';

  const renderWidget = (id: string) => {
      if (!analytics) return null;

      switch(id) {
          case 'budgetProgress': {
              const now = new Date();
              const activeYear = budgetYear;
              const yearBudgets = budgets.filter(b => b.year === activeYear && b.isActive);
              if (yearBudgets.length === 0) {
                  return (
                      <WidgetWrapper title="Budget Progress" onRemove={() => handleRemoveWidget(id)} source="PCO & Budgets">
                          <div className="flex flex-col items-center justify-center h-32 text-center space-y-2">
                              <div className="text-3xl opacity-30">🌡️</div>
                              <p className="text-xs font-bold text-slate-400 dark:text-slate-500">No active budgets for {activeYear}</p>
                              <p className="text-[10px] text-slate-400">Add budgets in the Budgets tab to see progress here.</p>
                          </div>
                      </WidgetWrapper>
                  );
              }

              // Compute per-fund YTD actuals
              const yearStart = new Date(activeYear, 0, 1);
              const yearEnd = activeYear < now.getFullYear() ? new Date(activeYear, 11, 31, 23, 59, 59) : now;

              const fundActuals: Record<string, number> = {};
              donations.forEach(d => {
                  const dDate = new Date(d.date);
                  if (dDate >= yearStart && dDate <= yearEnd) {
                      fundActuals[d.fundName] = (fundActuals[d.fundName] || 0) + d.amount;
                  }
              });

              const totalBudget = yearBudgets.reduce((s, b) => s + b.totalAmount, 0);
              const totalActual = yearBudgets.reduce((s, b) => s + (fundActuals[b.fundName] || 0), 0);
              const totalPct = totalBudget > 0 ? Math.min((totalActual / totalBudget) * 100, 100) : 0;

              // Pace-aware colour logic:
              // Expected YTD = sum of passed monthly budgets + (current month budget * (current day / days in month))
              const currentMonth = activeYear === now.getFullYear() ? now.getMonth() : (activeYear < now.getFullYear() ? 11 : -1);
              const currentDay = activeYear === now.getFullYear() ? now.getDate() : (activeYear < now.getFullYear() ? 31 : 0);
              const daysInCurrentMonth = activeYear === now.getFullYear() ? new Date(activeYear, currentMonth + 1, 0).getDate() : 31;
              const monthFraction = activeYear === now.getFullYear() ? (currentDay / daysInCurrentMonth) : (activeYear < now.getFullYear() ? 1 : 0);

              const getExpectedYTD = (amounts: number[]) => {
                  if (currentMonth < 0) return 0;
                  const pastSum = amounts.slice(0, currentMonth).reduce((a, v) => a + v, 0);
                  const currentMonthAmount = amounts[currentMonth] || 0;
                  return pastSum + (currentMonthAmount * monthFraction);
              };

              const totalExpectedYTD = yearBudgets.reduce((s, b) => s + getExpectedYTD(b.monthlyAmounts), 0);
              const expectedPct = totalBudget > 0 ? Math.min((totalExpectedYTD / totalBudget) * 100, 100) : 0;
              // paceRatio: how actual giving compares to where we should be this month (% of expected)
              const paceRatio = totalExpectedYTD > 0 ? (totalActual / totalExpectedYTD) * 100 : 100;
              // Colour ramp: green = within 10% of pace, yellow = 10-20% behind, red = >20% behind
              const statusColor = (ratio: number) =>
                  ratio >= 90 ? '#10b981' : ratio >= 80 ? '#f59e0b' : '#f43f5e';
              const totalColor = statusColor(paceRatio);
              // Per-fund expected YTD helper
              const fundExpectedYTD = (b: typeof yearBudgets[0]) => getExpectedYTD(b.monthlyAmounts);

              return (
                  <WidgetWrapper
                      title="Budget Progress"
                      onRemove={() => handleRemoveWidget(id)}
                      source="PCO & Budgets"
                      headerControl={
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{activeYear}</span>
                      }
                  >
                      <div className="space-y-5">
                          {/* Overall summary bar */}
                          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-2">
                              <div className="flex items-center justify-between">
                                  <span className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">Overall {activeYear} Budget</span>
                                  <span className={`text-sm font-black px-2 py-0.5 rounded-full ${
                                      paceRatio >= 90 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' :
                                      paceRatio >= 80 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' :
                                      'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400'
                                  }`}>{Math.round(totalPct)}%</span>
                              </div>
                              <div className="relative h-5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                  <div
                                      className="h-full rounded-full transition-all duration-700"
                                      style={{ width: `${totalPct}%`, background: `linear-gradient(90deg, ${totalColor}, ${totalColor}cc)` }}
                                  />
                                  {/* Expected pace marker */}
                                  {expectedPct > 0 && expectedPct < 99 && (
                                      <div className="absolute top-0 h-full" style={{ left: `${expectedPct}%`, transform: 'translateX(-50%)', width: '2px', backgroundColor: 'rgba(100,116,139,0.6)' }} />
                                  )}
                              </div>
                              <div className="flex justify-between text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                  <span>${totalActual.toLocaleString(undefined, { maximumFractionDigits: 0 })} raised</span>
                                  <span className="opacity-60">pace: ${totalExpectedYTD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                  <span>${totalBudget.toLocaleString(undefined, { maximumFractionDigits: 0 })} goal</span>
                              </div>
                          </div>

                          {/* Per-fund rows */}
                          <div className="space-y-3">
                              {yearBudgets
                                  .sort((a, b) => b.totalAmount - a.totalAmount)
                                  .map(budget => {
                                      const actual = fundActuals[budget.fundName] || 0;
                                      const pct = budget.totalAmount > 0 ? Math.min((actual / budget.totalAmount) * 100, 100) : 0;
                                      const remaining = Math.max(budget.totalAmount - actual, 0);
                                      const expectedForFund = fundExpectedYTD(budget);
                                      const fundPaceRatio = expectedForFund > 0 ? (actual / expectedForFund) * 100 : 100;
                                      const color = statusColor(fundPaceRatio);
                                      const fundExpectedPct = budget.totalAmount > 0 ? Math.min((expectedForFund / budget.totalAmount) * 100, 100) : 0;
                                      return (
                                          <div key={budget.id} className="space-y-1.5">
                                              <div className="flex items-center justify-between">
                                                  <div className="flex items-center gap-2">
                                                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate max-w-[140px]">{budget.fundName}</span>
                                                  </div>
                                                  <div className="flex items-center gap-2">
                                                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                                                          fundPaceRatio >= 90 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' :
                                                          fundPaceRatio >= 80 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' :
                                                          'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400'
                                                      }`}>{Math.round(pct)}%</span>
                                                      <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">${remaining.toLocaleString(undefined, { maximumFractionDigits: 0 })} left</span>
                                                  </div>
                                              </div>
                                              {/* Progress bar */}
                                              <div className="relative h-3 bg-slate-100 dark:bg-slate-700/60 rounded-full overflow-hidden">
                                                  <div
                                                      className="h-full rounded-full transition-all duration-700"
                                                      style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.85 }}
                                                  />
                                                  {/* Expected pace marker */}
                                                  {fundExpectedPct > 0 && fundExpectedPct < 99 && (
                                                      <div className="absolute top-0 h-full" style={{ left: `${fundExpectedPct}%`, transform: 'translateX(-50%)', width: '2px', backgroundColor: 'rgba(100,116,139,0.5)' }} />
                                                  )}
                                              </div>
                                              <div className="flex justify-between text-[9px] text-slate-400 dark:text-slate-500">
                                                  <span>${actual.toLocaleString(undefined, { maximumFractionDigits: 0 })} raised</span>
                                                  <span>${budget.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} goal</span>
                                              </div>
                                          </div>
                                      );
                                  })}
                          </div>
                      </div>
                  </WidgetWrapper>
              );
          }
          case 'keyMetrics':
              return (
                  <WidgetWrapper title="Key Financial Overview" onRemove={() => handleRemoveWidget(id)} source="PCO Giving">
                      <div className="flex flex-col h-full justify-between gap-4">
                          <div className="flex items-center justify-between">
                              <div>
                                  <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Total Giving</p>
                                  <p className="text-5xl font-black text-emerald-600 dark:text-emerald-400 tracking-tighter mt-2">${analytics.totalGiving.toLocaleString()}</p>
                              </div>
                              <div className="text-right">
                                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Growth</p>
                                  <div className={`text-xl font-black flex items-center justify-end gap-1 ${analytics.totalGiving >= analytics.previousTotalGiving ? 'text-emerald-500' : 'text-rose-500'}`}>
                                      {analytics.totalGiving >= analytics.previousTotalGiving ? '↗' : '↘'}
                                      {analytics.previousTotalGiving > 0 
                                        ? Math.round(((analytics.totalGiving - analytics.previousTotalGiving) / analytics.previousTotalGiving) * 100) + '%' 
                                        : '-'}
                                  </div>
                              </div>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-4 pt-6 border-t border-slate-100 dark:border-slate-800">
                              <div>
                                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Unique Donors</p>
                                  <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{analytics.contributingPeople.toLocaleString()}</p>
                                  <div className={`text-[11px] font-bold flex items-center gap-0.5 mt-1 ${analytics.contributingPeople >= analytics.previousContributingPeople ? 'text-emerald-500' : 'text-rose-500'}`}>
                                      {analytics.contributingPeople >= analytics.previousContributingPeople ? '↑' : '↓'}
                                      {analytics.previousContributingPeople > 0
                                          ? Math.abs(Math.round(((analytics.contributingPeople - analytics.previousContributingPeople) / analytics.previousContributingPeople) * 100)) + '% vs prev'
                                          : 'vs prev'}
                                  </div>
                              </div>
                              <div className="border-l border-slate-100 dark:border-slate-800 pl-4">
                                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Recurring</p>
                                  <p className="text-2xl font-black text-cyan-600 dark:text-cyan-400">{analytics.recurringGivers.toLocaleString()}</p>
                                  <div className={`text-[11px] font-bold flex items-center gap-0.5 mt-1 ${analytics.recurringGivers >= analytics.previousRecurringGivers ? 'text-emerald-500' : 'text-rose-500'}`}>
                                      {analytics.recurringGivers >= analytics.previousRecurringGivers ? '↑' : '↓'}
                                      {analytics.previousRecurringGivers > 0
                                          ? Math.abs(Math.round(((analytics.recurringGivers - analytics.previousRecurringGivers) / analytics.previousRecurringGivers) * 100)) + '% vs prev'
                                          : 'vs prev'}
                                  </div>
                              </div>
                              <div className="border-l border-slate-100 dark:border-slate-800 pl-4">
                                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Avg Gift</p>
                                  <p className="text-2xl font-black text-violet-600 dark:text-violet-400">${Math.round(analytics.averageGift).toLocaleString()}</p>
                                  <div className={`text-[11px] font-bold flex items-center gap-0.5 mt-1 ${analytics.averageGift >= analytics.previousAverageGift ? 'text-emerald-500' : 'text-rose-500'}`}>
                                      {analytics.averageGift >= analytics.previousAverageGift ? '↑' : '↓'}
                                      {analytics.previousAverageGift > 0
                                          ? Math.abs(Math.round(((analytics.averageGift - analytics.previousAverageGift) / analytics.previousAverageGift) * 100)) + '% vs prev'
                                          : 'vs prev'}
                                  </div>
                              </div>
                          </div>
                      </div>
                  </WidgetWrapper>
              );
          case 'trends':
              return (
                  <WidgetWrapper title="Giving Trends" onRemove={() => handleRemoveWidget(id)} source="PCO Giving">
                      <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                              <BarChart data={analytics.trends}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: axisColor}} tickFormatter={(val: string) => {
                                        // Handles both "2026-03" and "2026_03" formats
                                        const normalized = val.replace('_', '-');
                                        const [year, month] = normalized.split('-');
                                        if (!year || !month) return val;
                                        const d = new Date(Number(year), Number(month) - 1, 1);
                                        return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                                    }} />
                                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: axisColor}} />
                                  <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} cursor={{fill: currentTheme === 'dark' ? '#334155' : '#f8fafc'}} formatter={(value: number) => `$${value.toLocaleString()}`} />
                                  <Bar dataKey="amount" fill="#10b981" radius={[4, 4, 0, 0]} />
                              </BarChart>
                          </ResponsiveContainer>
                      </div>
                  </WidgetWrapper>
              );
          case 'trendsComparison':
              return (
                  <WidgetWrapper title="Giving Time Comparison" onRemove={() => handleRemoveWidget(id)} source="Current vs Prev">
                      <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                              <BarChart data={analytics.comparisonTrends}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: axisColor}} />
                                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: axisColor}} />
                                  <Tooltip cursor={{fill: currentTheme === 'dark' ? '#334155' : '#f8fafc'}} contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} formatter={(value: number) => `$${value.toLocaleString()}`} />
                                  <Legend verticalAlign="top" iconType="circle" wrapperStyle={{fontSize: '10px'}} />
                                  <Bar dataKey="current" name={analytics.currentLabel || "Current"} fill="#6366f1" radius={[4, 4, 0, 0]} />
                                  <Bar dataKey="previous" name={analytics.previousLabel || "Previous"} fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                              </BarChart>
                          </ResponsiveContainer>
                      </div>
                      {analytics.timePeriodLabel && (
                          <div className="text-center mt-2 text-[10px] text-slate-400 dark:text-slate-500 font-medium tracking-wide">
                              {analytics.timePeriodLabel}
                          </div>
                      )}
                  </WidgetWrapper>
              );
          case 'fundPerformance':
              return (
                  <WidgetWrapper title="Fund Performance" onRemove={() => handleRemoveWidget(id)} source="PCO Funds">
                      <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                              <BarChart data={analytics.givingByFund.slice(0, 8)} layout="vertical" margin={{ left: 40 }}>
                                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                                  <XAxis type="number" hide />
                                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: axisColor}} width={100} />
                                  <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} cursor={{fill: currentTheme === 'dark' ? '#334155' : '#f8fafc'}} formatter={(value: number) => `$${value.toLocaleString()}`} />
                                  <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} />
                              </BarChart>
                          </ResponsiveContainer>
                      </div>
                  </WidgetWrapper>
              );
          case 'givingVsBudget':
              return (
                  <WidgetWrapper 
                      title={`Giving vs Budget (${gvbFilter})`} 
                      onRemove={() => handleRemoveWidget(id)} 
                      source="PCO & Budgets"
                      headerControl={
                          <div className="flex gap-2">
                              <select 
                                  value={gvbFund} 
                                  onChange={(e) => setGvbFund(e.target.value)} 
                                  className="bg-slate-100 dark:bg-slate-800 border-none text-[10px] font-bold uppercase rounded-lg py-1 px-2 outline-none text-slate-600 dark:text-slate-300"
                              >
                                  {availableBudgetFunds.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
                              </select>
                              <select 
                                  value={gvbFilter} 
                                  onChange={(e) => setGvbFilter(e.target.value as GivingFilter)}
                                  className="bg-slate-100 dark:bg-slate-800 border-none text-[10px] font-bold uppercase rounded-lg py-1 px-2 outline-none text-slate-600 dark:text-slate-300"
                              >
                                  <option value="Week">Week</option>
                                  <option value="Month">Month</option>
                                  <option value="Quarter">Quarter</option>
                                  <option value="This Quarter">This Quarter</option>
                                  <option value="Year">Year</option>
                                  <option value="This Year">This Year</option>
                              </select>
                          </div>
                      }
                  >
                      <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                              <ComposedChart data={gvbData}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: axisColor}} />
                                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: axisColor}} />
                                  <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} cursor={{fill: currentTheme === 'dark' ? '#334155' : '#f8fafc'}} />
                                  <Legend verticalAlign="top" iconType="circle" wrapperStyle={{fontSize: '10px'}} />
                                  <Bar dataKey="Given" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                                  <Line type="monotone" dataKey="Budget" stroke="#6366f1" strokeWidth={3} dot={false} />
                              </ComposedChart>
                          </ResponsiveContainer>
                      </div>
                  </WidgetWrapper>
              );
          case 'cumulativeYTD':
              return (
                  <WidgetWrapper 
                      title="Cumulative Giving (YTD)" 
                      onRemove={() => handleRemoveWidget(id)} 
                      source="PCO & Budgets"
                      headerControl={
                          <select 
                              value={cumulativeFundFilter} 
                              onChange={(e) => setCumulativeFundFilter(e.target.value)}
                              className="bg-slate-100 dark:bg-slate-800 border-none text-[10px] font-bold uppercase rounded-lg py-1 px-2 outline-none text-slate-600 dark:text-slate-300"
                          >
                              {fundsWithBudget.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
                          </select>
                      }
                  >
                      <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                              <LineChart data={cumulativeChartData}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: axisColor}} />
                                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: axisColor}} />
                                  <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} cursor={{fill: currentTheme === 'dark' ? '#334155' : '#f8fafc'}} />
                                  <Legend verticalAlign="top" iconType="circle" wrapperStyle={{fontSize: '10px'}} />
                                  <Line type="monotone" dataKey="Budget" stroke="#94a3b8" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                                  <Line type="monotone" dataKey="Actual" stroke="#10b981" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                              </LineChart>
                          </ResponsiveContainer>
                      </div>
                  </WidgetWrapper>
              );
          case 'donorAcquisition':
              return (
                  <WidgetWrapper title="Donor Acquisition" onRemove={() => handleRemoveWidget(id)} source="PCO Giving">
                      <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                              <BarChart data={acquisitionData}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: axisColor}} />
                                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: axisColor}} />
                                  <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} cursor={{fill: currentTheme === 'dark' ? '#334155' : '#f8fafc'}} />
                                  <Legend verticalAlign="top" iconType="circle" wrapperStyle={{fontSize: '10px'}} />
                                  <Bar dataKey="Returning" stackId="a" fill="#cbd5e1" radius={[0, 0, 4, 4]} />
                                  <Bar dataKey="New" stackId="a" fill="#6366f1" radius={[4, 4, 0, 0]} />
                              </BarChart>
                          </ResponsiveContainer>
                      </div>
                  </WidgetWrapper>
              );
          case 'donorLifecycle':
              const lifecycleData = [
                  { name: 'Active', value: analytics.donorLifecycle?.active || 0, color: '#10b981' },
                  { name: 'Lapsed', value: analytics.donorLifecycle?.lapsed || 0, color: '#f59e0b' },
                  { name: 'Recovered', value: analytics.donorLifecycle?.recovered || 0, color: '#06b6d4' },
                  { name: 'New', value: analytics.donorLifecycle?.new || 0, color: '#6366f1' },
              ];
              return (
                  <WidgetWrapper title="Donor Lifecycle Status" onRemove={() => handleRemoveWidget(id)} source="Retention">
                      <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                              <BarChart data={lifecycleData}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: axisColor}} />
                                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: axisColor}} />
                                  <Tooltip cursor={{fill: currentTheme === 'dark' ? '#334155' : '#f8fafc'}} contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} />
                                  <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={40}>
                                      {lifecycleData.map((entry, index) => (
                                          <Cell key={`cell-${index}`} fill={entry.color} />
                                      ))}
                                  </Bar>
                              </BarChart>
                          </ResponsiveContainer>
                      </div>
                  </WidgetWrapper>
              );
          case 'lifecycleHeadline':
              return (
                  <div className="h-full">
                       <StatCard label="Donor Retention" value={`${analytics.donorLifecycle?.active ? Math.round((analytics.donorLifecycle.active / (analytics.contributingPeople || 1)) * 100) : 0}%`} color="emerald" source="Lifecycle" subValue="% Active of Total" />
                  </div>
              );
          case 'benchmark_giving_avg':
              if (!globalStats) return renderBenchmarkPlaceholder("Avg Giving Benchmark", id);
              const avgData = [
                  { name: 'You', value: analytics.averageGift, fill: '#6366f1' },
                  { name: 'Global', value: globalStats.metrics.avgWeeklyGiving, fill: '#94a3b8' } // Added .metrics
              ];
              return (
                  <WidgetWrapper title="Avg Gift Benchmark" onRemove={() => handleRemoveWidget(id)} source="Benchmark">
                       <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                              <BarChart data={avgData} layout="vertical" margin={{left: 20}}>
                                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                                  <XAxis type="number" hide />
                                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 700, fill: axisColor}} width={50} />
                                  <Tooltip cursor={{fill: currentTheme === 'dark' ? '#334155' : '#f8fafc'}} contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} formatter={(v:number) => `$${Math.round(v)}`} />
                                  <Bar dataKey="value" radius={[0, 10, 10, 0]} barSize={30}>
                                       <Cell fill="#6366f1" />
                                       <Cell fill="#94a3b8" />
                                  </Bar>
                              </BarChart>
                          </ResponsiveContainer>
                       </div>
                  </WidgetWrapper>
              );
          case 'lifecycleActive': return <DonorListWidget title="Active Donors" donors={analytics.lists?.active || []} color="emerald" onRemove={() => handleRemoveWidget(id)} />;
          case 'lifecycleNew': return <DonorListWidget title="New Donors" donors={analytics.lists?.new || []} color="indigo" onRemove={() => handleRemoveWidget(id)} />;
          case 'lifecycleLapsed': return <DonorListWidget title="Lapsed Donors" donors={analytics.lists?.lapsed || []} color="amber" onRemove={() => handleRemoveWidget(id)} />;
          case 'lifecycleOccasional': return <DonorListWidget title="Occasional Donors" donors={analytics.lists?.occasional || []} color="slate" onRemove={() => handleRemoveWidget(id)} />;
          case 'lifecycleRecovered': return <DonorListWidget title="Recovered Donors" donors={analytics.lists?.recovered || []} color="cyan" onRemove={() => handleRemoveWidget(id)} />;
          case 'lifecycleInactive': return <DonorListWidget title="Inactive Donors" donors={analytics.lists?.inactive || []} color="rose" onRemove={() => handleRemoveWidget(id)} />;
          case 'lifecycleSecond': return <DonorListWidget title="Second Time Donors" donors={analytics.lists?.secondTime || []} color="violet" onRemove={() => handleRemoveWidget(id)} />;
          case 'lastWeekFunds': {
              // Calculate Mon-Sun of last calendar week
              const lwNow = new Date();
              const lwDay = lwNow.getDay(); // 0=Sun
              const lwEnd = new Date(lwNow);
              lwEnd.setDate(lwNow.getDate() - lwDay - 1); // last Saturday
              lwEnd.setHours(23, 59, 59, 999);
              const lwStart = new Date(lwEnd);
              lwStart.setDate(lwEnd.getDate() - 6); // previous Monday
              lwStart.setHours(0, 0, 0, 0);

              const weekLabel = `${lwStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${lwEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

              // Aggregate donations per fund for last week
              const fundTotals: Record<string, number> = {};
              donations.forEach(d => {
                  const dDate = new Date(d.date);
                  if (dDate >= lwStart && dDate <= lwEnd) {
                      fundTotals[d.fundName] = (fundTotals[d.fundName] || 0) + d.amount;
                  }
              });

              const fundRows = Object.entries(fundTotals)
                  .sort(([, a], [, b]) => b - a);

              const weekTotal = fundRows.reduce((s, [, v]) => s + v, 0);

              // Colour palette for fund rows
              const FUND_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#06b6d4', '#f43f5e', '#8b5cf6', '#ec4899', '#14b8a6'];

              return (
                  <WidgetWrapper
                      title="Last Week by Fund"
                      onRemove={() => handleRemoveWidget(id)}
                      source="PCO Giving"
                      headerControl={
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">{weekLabel}</span>
                      }
                  >
                      {fundRows.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-32 text-center space-y-2">
                              <div className="text-3xl opacity-30">📭</div>
                              <p className="text-xs font-bold text-slate-400 dark:text-slate-500">No giving recorded last week</p>
                          </div>
                      ) : (
                          <div className="space-y-4">
                              {/* Week total hero */}
                              <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-50 to-emerald-50 dark:from-indigo-900/20 dark:to-emerald-900/20 flex items-center justify-between">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Week Total</p>
                                  <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">${weekTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                              </div>
                              {/* Per-fund rows */}
                              <div className="space-y-3">
                                  {fundRows.map(([fundName, amount], i) => {
                                      const pct = weekTotal > 0 ? (amount / weekTotal) * 100 : 0;
                                      const color = FUND_COLORS[i % FUND_COLORS.length];
                                      return (
                                          <div key={fundName} className="space-y-1">
                                              <div className="flex items-center justify-between">
                                                  <div className="flex items-center gap-2">
                                                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                                                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate max-w-[140px]">{fundName}</span>
                                                  </div>
                                                  <div className="flex items-center gap-2">
                                                      <span className="text-xs font-black text-slate-800 dark:text-white">${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                                      <span className="text-[10px] text-slate-400 dark:text-slate-500 w-8 text-right">{Math.round(pct)}%</span>
                                                  </div>
                                              </div>
                                              <div className="relative h-2 bg-slate-100 dark:bg-slate-700/60 rounded-full overflow-hidden">
                                                  <div
                                                      className="h-full rounded-full transition-all duration-700"
                                                      style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.85 }}
                                                  />
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>
                      )}
                  </WidgetWrapper>
              );
          }
          default: return null;
      }
  };

  const renderFilterControls = () => (
      <div className="flex justify-end mb-8 animate-in fade-in slide-in-from-top-2 no-print">
          <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-2 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
              <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest pl-3">Time Range</span>
              <select 
                  value={filter} 
                  onChange={(e) => onFilterChange(e.target.value as GivingFilter)}
                  className="bg-slate-100 dark:bg-slate-900 border-none text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 rounded-xl py-2 px-4 cursor-pointer outline-none focus:ring-2 focus:ring-indigo-500"
              >
                  <option value="Week">Last 7 Days</option>
                  <option value="This Week">This Week</option>
                  <option value="Last Week">Last Week</option>
                  <option value="Month">Last 30 Days</option>
                  <option value="This Month">This Month</option>
                  <option value="Last Month">Last Month</option>
                  <option value="Quarter">Last 90 Days</option>
                  <option value="This Quarter">This Quarter</option>
                  <option value="Year">Last 365 Days</option>
                  <option value="This Year">This Year</option>
                  <option value="Custom">Custom Range</option>
              </select>
              {filter === 'Custom' && onDateRangeChange && (
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 p-1 rounded-xl border border-slate-100 dark:border-slate-800">
                      <input 
                          type="date"
                          value={dateRange?.start || ''}
                          onChange={(e) => onDateRangeChange({ start: e.target.value, end: dateRange?.end || '' })}
                          className="px-3 py-2 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 border-none outline-none text-slate-700 dark:text-slate-300 w-28"
                      />
                      <span className="text-[10px] text-slate-400 font-bold">-</span>
                      <input 
                          type="date"
                          value={dateRange?.end || ''}
                          onChange={(e) => onDateRangeChange({ start: dateRange?.start || '', end: e.target.value })}
                          className="px-3 py-2 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 border-none outline-none text-slate-700 dark:text-slate-300 w-28"
                      />
                  </div>
              )}
              {activeTab === 'overview' && onSyncRecent && (
                  <div className="border-l border-slate-100 dark:border-slate-700 pl-2">
                      <button 
                          onClick={handleSmartGivingSync}
                          disabled={isSyncing}
                          className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 border-none text-[10px] font-black uppercase tracking-widest rounded-xl py-2 px-4 transition-colors disabled:opacity-50"
                      >
                          {isSyncing ? 'Syncing...' : 'Giving Sync'}
                      </button>
                  </div>
              )}
          </div>
      </div>
  );

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
        <style>{`
            @media print {
                body { background: white; }
                .no-print { display: none !important; }
                .print-only { display: block !important; }
                .report-container { 
                    box-shadow: none !important; 
                    border: none !important; 
                    max-width: none !important; 
                    width: 100% !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }
                @page { margin: 1cm; size: auto; }
            }
        `}</style>
        
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 no-print">
            <div>
            <h3 className="text-4xl font-black tracking-tighter text-slate-900 dark:text-white">Giving Analytics</h3>
            <p className="text-slate-400 dark:text-slate-500 font-medium uppercase text-[10px] tracking-widest mt-1">Financial Health & Donor Stewardship</p>
            </div>
            
            <div className="flex items-center gap-4">
                {onSync && (
                    <button 
                        onClick={onSync}
                        disabled={isSyncing}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-black text-[10px] uppercase tracking-widest hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors disabled:opacity-50"
                    >
                        <span className={isSyncing ? 'animate-spin' : ''}>↻</span>
                        <span>{isSyncing ? 'Syncing...' : 'Refresh from PCO'}</span>
                    </button>
                )}


                {(activeTab === 'overview' || activeTab === 'donor') && (
                    <WidgetsController 
                        availableWidgets={availableWidgets} 
                        visibleWidgets={safeVisibleWidgets} 
                        onUpdate={onUpdateActiveWidgets} 
                        onUpdateTheme={onUpdateTheme}
                        currentTheme={currentTheme}
                    />
                )}
            </div>
        </header>

        {/* Tab Content */}
        {activeTab === 'overview' && (
            <div className="space-y-8 animate-in fade-in no-print">
                {renderFilterControls()}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    {widgetsToRender.map((id, index) => {
                        return (
                            <div 
                                key={id} 
                                className={`${getWidgetSpan(id)} cursor-grab active:cursor-grabbing transition-transform`}
                                draggable
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragEnter={(e) => handleDragEnter(e, index)}
                                onDragEnd={handleDragEnd}
                                onDragOver={handleDragOver}
                            >
                                {renderWidget(id)}
                            </div>
                        );
                    })}
                </div>
            </div>
        )}
        
        {activeTab === 'donor' && (
            <div className="space-y-8 animate-in fade-in no-print">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    {widgetsToRender.map((id, index) => {
                        return (
                            <div 
                                key={id} 
                                className={`${getWidgetSpan(id)} cursor-grab active:cursor-grabbing transition-transform`} 
                                draggable 
                                onDragStart={(e) => handleDragStart(e, index)} 
                                onDragEnter={(e) => handleDragEnter(e, index)} 
                                onDragEnd={handleDragEnd} 
                                onDragOver={handleDragOver}
                            >
                                {renderWidget(id)}
                            </div>
                        );
                    })}
                </div>
            </div>
        )}

        {activeTab === 'budgets' && (
            <div className="space-y-8 animate-in slide-in-from-right-4 fade-in no-print">
                <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-10 text-[12rem] font-black leading-none">{budgetYear}</div>
                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-8">
                            <div><h2 className="text-3xl font-black mb-1">Budget Overview</h2></div>
                            <div className="flex bg-white/10 rounded-xl p-1"><button onClick={() => setBudgetYear(budgetYear - 1)} className="px-3 py-1 hover:bg-white/20 rounded-lg transition-colors">←</button><span className="px-4 py-1 font-black text-sm">{budgetYear}</span><button onClick={() => setBudgetYear(budgetYear + 1)} className="px-3 py-1 hover:bg-white/20 rounded-lg transition-colors">→</button></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Annual Budget</p><p className="text-4xl font-black">${budgetMetrics.totalAnnualBudget.toLocaleString()}</p></div>
                            <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">YTD Budget Goal</p><p className="text-4xl font-black">${budgetMetrics.totalYtdBudget.toLocaleString()}</p></div>
                            <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">YTD Actual Giving</p><p className={`text-4xl font-black ${budgetMetrics.totalYtdActual >= budgetMetrics.totalYtdBudget ? 'text-emerald-400' : 'text-rose-400'}`}>${budgetMetrics.totalYtdActual.toLocaleString()}</p></div>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-850 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="p-8 border-b border-slate-50 dark:border-slate-800 flex justify-between items-center"><h3 className="font-black text-slate-900 dark:text-white">Fund Budgets</h3></div>
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 dark:bg-slate-900/50">
                            <tr>
                                <th className="p-6 text-xs font-black text-slate-400 uppercase tracking-widest">Fund Name</th>
                                <th className="p-6 text-right text-xs font-black text-slate-400 uppercase tracking-widest">Annual Budget</th>
                                <th className="p-6 text-right text-xs font-black text-slate-400 uppercase tracking-widest">YTD Budget</th>
                                <th className="p-6 text-right text-xs font-black text-slate-400 uppercase tracking-widest">YTD Actual</th>
                                <th className="p-6 text-right text-xs font-black text-slate-400 uppercase tracking-widest">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                            {funds.map(fund => {
                                const budget = budgets.find(b => b.fundName === fund.name && b.year === budgetYear);
                                const totalAmount = budget ? budget.totalAmount : 0;
                                
                                // Calculate YTD Budget
                                const currentMonthIndex = new Date().getFullYear() === budgetYear ? new Date().getMonth() : (budgetYear < new Date().getFullYear() ? 11 : -1);
                                const ytdBudget = budget 
                                    ? budget.monthlyAmounts.slice(0, currentMonthIndex + 1).reduce((a, b) => a + b, 0)
                                    : 0;

                                // Calculate YTD Actual
                                const ytdActual = donations
                                    .filter(d => {
                                        const date = new Date(d.date);
                                        return d.fundName === fund.name && 
                                               date.getFullYear() === budgetYear && 
                                               date <= new Date(); 
                                    })
                                    .reduce((sum, d) => sum + d.amount, 0);

                                return (
                                    <tr key={fund.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="p-6 font-bold text-slate-900 dark:text-white">{fund.name}</td>
                                        <td className="p-6 text-right font-mono text-slate-600 dark:text-slate-400">
                                            {budget ? `$${totalAmount.toLocaleString()}` : <span className="text-slate-300 italic">Not Set</span>}
                                        </td>
                                        <td className="p-6 text-right font-mono text-slate-600 dark:text-slate-400">
                                            ${ytdBudget.toLocaleString()}
                                        </td>
                                        <td className={`p-6 text-right font-mono font-bold ${ytdActual >= ytdBudget ? 'text-emerald-500' : 'text-slate-900 dark:text-white'}`}>
                                            ${ytdActual.toLocaleString()}
                                        </td>
                                        <td className="p-6 text-right">
                                            <button 
                                                onClick={() => handleEditBudget(fund.id, fund.name)} 
                                                className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-bold text-xs uppercase tracking-wider"
                                            >
                                                {budget ? 'Edit' : 'Set Budget'}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {funds.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-slate-400 text-xs italic">
                                        No funds found. Sync giving data to populate funds.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {activeTab === 'donations' && (
            <div className="space-y-8 animate-in slide-in-from-right-4 fade-in no-print">
                <div className="flex justify-end mb-4">
                        <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-2">Fiscal Year</span>
                        <select 
                            value={budgetYear} 
                            onChange={(e) => setBudgetYear(parseInt(e.target.value))}
                            className="bg-slate-50 dark:bg-slate-700 border-none text-xs font-bold text-slate-700 dark:text-slate-300 rounded-lg py-1 px-3 outline-none cursor-pointer"
                        >
                            {Array.from({length: 5}, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                        </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="col-span-1 md:col-span-2">
                        {renderWidget('fundPerformance')}
                    </div>
                    <div className="col-span-1">
                        {renderWidget('cumulativeYTD')}
                    </div>
                    <div className="col-span-1">
                        {renderWidget('donorAcquisition')}
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'reports' && (
            <div className="space-y-8 animate-in slide-in-from-right-4 fade-in no-print">
                <DonationReport donations={donations} people={people} />
            </div>
        )}

        {isEditingBudget && editingBudget && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200 no-print">
                <div className="bg-white dark:bg-slate-900 rounded-[2rem] w-full max-w-lg p-8 shadow-2xl border border-slate-100 dark:border-slate-800 relative max-h-[90vh] overflow-y-auto custom-scrollbar">
                    <div className="flex justify-between items-center mb-6"><div><h3 className="text-xl font-black text-slate-900 dark:text-white">{editingBudget.fundName} Budget</h3></div><button onClick={() => setIsEditingBudget(false)} className="text-slate-300 hover:text-slate-500 text-2xl">×</button></div>
                    
                    <div className="space-y-4">
                        {editingBudget.monthlyAmounts.map((amt, idx) => (<div key={idx} className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700"><span className="text-xs font-bold text-slate-700 dark:text-slate-300 w-24">{new Date(0, idx).toLocaleString('default', { month: 'long' })}</span><div className="flex items-center gap-2 flex-1 justify-end"><input type="number" value={amt} onChange={(e) => { const newAmts = [...editingBudget.monthlyAmounts]; newAmts[idx] = parseFloat(e.target.value) || 0; const newTotal = newAmts.reduce((a, b) => a + b, 0); setEditingBudget({ ...editingBudget, monthlyAmounts: newAmts, totalAmount: newTotal }); }} className="w-32 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-right text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white" /></div></div>))}
                    </div>
                    
                    <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-4">
                        <div className="flex items-end gap-3">
                             <div className="flex-1">
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Total Annual Budget</label>
                                <div className="relative mt-1">
                                    <span className="absolute left-3 top-2.5 text-slate-400 font-bold">$</span>
                                    <input 
                                        type="number" 
                                        value={editingBudget.totalAmount}
                                        onChange={(e) => setEditingBudget({ ...editingBudget, totalAmount: parseFloat(e.target.value) || 0 })}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-7 pr-4 py-2 font-black text-xl text-emerald-600 dark:text-emerald-400 outline-none focus:ring-2 focus:ring-emerald-500"
                                    />
                                </div>
                             </div>
                             <button 
                                onClick={() => {
                                    const monthly = editingBudget.totalAmount / 12;
                                    setEditingBudget({
                                        ...editingBudget,
                                        monthlyAmounts: new Array(12).fill(monthly)
                                    });
                                }}
                                className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700 h-[46px]"
                                title="Divide total evenly by 12"
                             >
                                Spread Evenly
                             </button>
                        </div>
                        <button onClick={() => handleSaveBudgetInternal(editingBudget)} className="bg-slate-900 dark:bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-800 dark:hover:bg-indigo-700 transition-all shadow-lg w-full">Save Budget</button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
