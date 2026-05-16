const fs = require('fs');
const file = 'c:\\Users\\matth\\OneDrive\\Antigravity\\pastoral-care-for-pco\\App.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add imports
if (!content.includes('useRiskEnrichedPeople')) {
    content = content.replace("import { firestore } from './services/firestoreService';", "import { firestore } from './services/firestoreService';\nimport { useRiskEnrichedPeople, usePeopleDashboardData, useGivingAnalyticsData, useGroupsDashboardData, useAttendanceChartData } from './hooks/useDashboardData';");
}

// Replace large chunk
const startMarker = "  // --- Derived Data Calculations ---";
const endMarker = "  const handleGenerateAIInsights = async () => {";

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

if (startIdx !== -1 && endIdx !== -1) {
    const replacement = `  // --- Derived Data Calculations ---

  const riskEnrichedPeople = useRiskEnrichedPeople(people, groups, donations, servicesData, teams, church?.riskSettings);
  const peopleDashboardData = usePeopleDashboardData(people, riskEnrichedPeople, recentRiskChanges, recentStatusChanges);
  const givingAnalyticsData = useGivingAnalyticsData(donations, givingFilter, givingDateRange, people, church?.donorLifecycleSettings);
  const groupsDashboardData = useGroupsDashboardData(groups, people);
  const attendanceChartData = useAttendanceChartData(attendance);

`;
    content = content.substring(0, startIdx) + replacement + content.substring(endIdx);
} else {
    console.error('Markers not found');
}

fs.writeFileSync(file, content, 'utf8');
console.log('App.tsx updated successfully.');
