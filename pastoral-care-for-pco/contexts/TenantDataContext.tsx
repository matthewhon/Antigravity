import React, { createContext, useContext, ReactNode } from 'react';
import { 
  PcoPerson, PcoGroup, AttendanceRecord, DetailedDonation, PcoFund, 
  BudgetRecord, ServicesTeam, RiskChangeRecord, StatusChangeRecord, ServicesDashboardData,
  User, Church, SystemSettings
} from '../types';

interface TenantDataState {
  user: User | null;
  church: Church | null;
  allChurches: Church[];
  systemSettings: SystemSettings | null;
  widgets: string[];
  
  people: PcoPerson[];
  groups: PcoGroup[];
  attendance: AttendanceRecord[];
  donations: DetailedDonation[];
  funds: PcoFund[];
  budgets: BudgetRecord[];
  teams: ServicesTeam[];
  recentRiskChanges: RiskChangeRecord[];
  recentStatusChanges: StatusChangeRecord[];
  servicesData: ServicesDashboardData | null;
  
  // Also pass the setters if components need to update raw data locally before a sync
  setPeople: (data: PcoPerson[]) => void;
  setGroups: (data: PcoGroup[]) => void;
  setAttendance: (data: AttendanceRecord[]) => void;
  setDonations: (data: DetailedDonation[]) => void;
  setFunds: (data: PcoFund[]) => void;
  setBudgets: (data: BudgetRecord[]) => void;
  setTeams: (data: ServicesTeam[]) => void;
  setRecentRiskChanges: (data: RiskChangeRecord[]) => void;
  setRecentStatusChanges: (data: StatusChangeRecord[]) => void;
  setServicesData: (data: ServicesDashboardData | null) => void;
}

const TenantDataContext = createContext<TenantDataState | undefined>(undefined);

export function TenantDataProvider({ children, value }: { children: ReactNode; value: TenantDataState }) {
  return (
    <TenantDataContext.Provider value={value}>
      {children}
    </TenantDataContext.Provider>
  );
}

export function useTenantData() {
  const context = useContext(TenantDataContext);
  if (context === undefined) {
    throw new Error('useTenantData must be used within a TenantDataProvider');
  }
  return context;
}
