const fs = require('fs');

const filePath = 'c:/Users/matth/OneDrive/Antigravity/pastoral-care-for-pco/backend/smsInbound.ts';
let content = fs.readFileSync(filePath, 'utf8');

// The sequence of replacements
const replacements = [
    { from: /Ã¢â€ â‚¬/g, to: '─' },
    { from: /Ã¢â‚¬â€ /g, to: '—' },
    { from: /Ã°Å¸â„¢Â /g, to: '🙏' },
    { from: /Ã¢â‚¬Â¦/g, to: '…' },
    { from: /Ã¢Å“â€œ/g, to: '✅' },
    { from: /Ã¢â‚¬â„¢/g, to: '’' },
    { from: /Ã¢â‚¬Å“/g, to: '“' },
    { from: /Ã¢â‚¬Â /g, to: '”' },
    { from: /Ã¢â‚¬/g, to: '—' } // Catch-all for other broken dashes if needed
];

for (const { from, to } of replacements) {
    content = content.replace(from, to);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed mojibake in smsInbound.ts');
