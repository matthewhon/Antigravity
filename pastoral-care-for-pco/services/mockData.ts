
import { AttendanceData, GivingData, DemographicData, Church } from '../types';

export const MOCK_CHURCHES: Church[] = [
  {
    id: 'c1',
    name: 'Grace Community',
    subdomain: 'grace',
    pcoConnected: true
  },
  {
    id: 'c2',
    name: 'Redeemer Heights',
    subdomain: 'redeemer',
    pcoConnected: false
  }
];

export const MOCK_ATTENDANCE: AttendanceData[] = [
  { date: '2023-10-01', attendance: 450, newComers: 12 },
  { date: '2023-10-08', attendance: 475, newComers: 15 },
  { date: '2023-10-15', attendance: 440, newComers: 8 },
  { date: '2023-10-22', attendance: 510, newComers: 22 },
  { date: '2023-10-29', attendance: 490, newComers: 14 },
  { date: '2023-11-05', attendance: 520, newComers: 19 },
  { date: '2023-11-12', attendance: 545, newComers: 25 },
];

export const MOCK_GIVING: GivingData[] = [
  { month: 'Jun', amount: 45000, donors: 120 },
  { month: 'Jul', amount: 48000, donors: 125 },
  { month: 'Aug', amount: 42000, donors: 118 },
  { month: 'Sep', amount: 51000, donors: 135 },
  { month: 'Oct', amount: 55000, donors: 142 },
  { month: 'Nov', amount: 58000, donors: 150 },
];

export const MOCK_DEMOGRAPHICS: DemographicData[] = [
  { name: '18-25', value: 15 },
  { name: '26-35', value: 30 },
  { name: '36-45', value: 25 },
  { name: '46-60', value: 20 },
  { name: '60+', value: 10 },
];
