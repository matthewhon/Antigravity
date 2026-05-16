const fs = require('fs');
const path = 'c:\\Users\\matth\\OneDrive\\Antigravity\\pastoral-care-for-pco\\App.tsx';
let content = fs.readFileSync(path, 'utf8');

const targetFunctionStart = "const handleNavigate = (newView: string) => {";
const targetFunctionEnd = "  const handleUpdateWidgets =";

const startIdx = content.indexOf(targetFunctionStart);
const endIdx = content.indexOf(targetFunctionEnd);

if (startIdx !== -1 && endIdx !== -1) {
    const replacement = `const handleNavigate = (newView: string) => {
      let resolvedView = newView;
      
      if (newView === 'tools') {
          const toolViews = ['tools-emails', 'tools-sms-inbox', 'tools-workflows', 'tools-polls', 'tools-notes', 'tools-website', 'tools-qrcodes', 'tools-unsubscribers'];
          const availableTool = toolViews.find(tv => hasPermission(tv));
          resolvedView = availableTool || 'dashboard';
      }

      if (hasPermission(resolvedView)) {
          const viewToPath: Record<string, string> = {
              'dashboard': '/',
              'people': '/people',
              'people-households': '/people/households',
              'people-risk': '/people/risk',
              'people-reports': '/people/reports',
              'groups': '/groups',
              'services': '/services',
              'services-attendance': '/services/attendance',
              'services-teams': '/services/teams',
              'services-reminders': '/services/reminders',
              'giving': '/giving',
              'giving-donor': '/giving/donor',
              'giving-budgets': '/giving/budgets',
              'giving-donations': '/giving/donations',
              'giving-reports': '/giving/reports',
              'pastoral': '/care',
              'pastoral-membership': '/care/membership',
              'pastoral-community': '/care/community',
              'pastoral-care': '/care/care',
              'pastoral-calendar': '/care/calendar',
              'metrics': '/metrics',
              'metrics-input': '/metrics/input',
              'metrics-settings': '/metrics/settings',
              'settings': '/settings',
              'app-settings': '/app-settings',
              'global-admin': '/global-admin',
              'library': '/library',
              'tools-emails': '/tools/emails',
              'tools-sms-inbox': '/tools/sms/inbox',
              'tools-sms-campaigns': '/tools/sms/campaigns',
              'tools-sms-workflows': '/tools/sms/workflows',
              'tools-sms-keywords': '/tools/sms/keywords',
              'tools-sms-analytics': '/tools/sms/analytics',
              'tools-sms-agent': '/tools/sms/agent',
              'tools-workflows': '/tools/workflows',
              'tools-polls': '/tools/polls',
              'tools-notes': '/tools/notes',
              'tools-website': '/tools/website',
              'tools-qrcodes': '/tools/qrcodes',
              'tools-unsubscribers': '/tools/unsubscribers'
          };
          
          const navPath = viewToPath[resolvedView] || '/';
          navigate(navPath);
          loadWidgets(user!, resolvedView);
      }
  };

`;

    content = content.substring(0, startIdx) + replacement + content.substring(endIdx);
    fs.writeFileSync(path, content, 'utf8');
    console.log('handleNavigate updated');
} else {
    console.log('Target not found');
}
