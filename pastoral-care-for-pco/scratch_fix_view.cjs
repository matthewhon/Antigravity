const fs = require('fs');
const file = 'c:\\Users\\matth\\OneDrive\\Antigravity\\pastoral-care-for-pco\\App.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace("if (path.startsWith('/care/calendar')) return 'pastoral-calendar';", "if (path.startsWith('/care/calendar')) return 'pastoral-calendar';\n     if (path.startsWith('/care/care')) return 'pastoral-care';");

fs.writeFileSync(file, content, 'utf8');
console.log('App.tsx updated');
