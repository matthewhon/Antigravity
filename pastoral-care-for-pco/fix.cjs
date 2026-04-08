const fs = require('fs');
let c = fs.readFileSync('components/ToolsView.tsx', 'utf8');
c = c.replace(/Â©/g, '©')
     .replace(/Â·/g, '·')
     .replace(/â€¦/g, '…')
     .replace(/â€”/g, '—')
     .replace(/âœ“/g, '✓')
     .replace(/â†’/g, '→')
     .replace(/â”€/g, '─');
fs.writeFileSync('components/ToolsView.tsx', c);
console.log('Fixed encoding issues in ToolsView.tsx');
