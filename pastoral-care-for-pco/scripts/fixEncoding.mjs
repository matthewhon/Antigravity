// Fix mojibake (double-encoded UTF-8) in SystemSettingsView.tsx
import { readFileSync, writeFileSync } from 'fs';

const path = 'components/SystemSettingsView.tsx';
let text = readFileSync(path, 'utf8');

const fixes: [string, string][] = [
    // Arrows
    ['\u00C3\u00A2\u00E2\u0080\u00A0\u00E2\u0080\u0099', '\u2192'],   // → right arrow
    ['\u00C3\u00A2\u00E2\u0080\u00A0\u00C2\u00BB',        '\u21BB'],   // ↻ refresh
    // Em dash / en dash
    ['\u00C3\u00A2\u00E2\u0082\u00AC\u00E2\u0080\u009C',  '\u2014'],  // —
    ['\u00E2\u0080\u0094',                                 '\u2014'],  // — (single encoding)
    ['\u00E2\u0080\u0093',                                 '\u2013'],  // –
    // Ellipsis
    ['\u00C3\u00A2\u00E2\u0082\u00AC\u00C2\u00A6',        '\u2026'],  // …
    ['\u00E2\u0080\u00A6',                                 '\u2026'],  // … (single encoding)
    // Check marks / status icons
    ['\u00C3\u00A2\u00C5\u0093\u00E2\u0080\u009C',        '\u2713'],  // ✓
    ['\u00C3\u00A2\u00C5\u0093\u00E2\u0080\u00A6',        '\u2705'],  // ✅
    ['\u00C3\u00A2\u00C5\u0093\u00C2\u00A8',              '\u2728'],  // ✨
    ['\u00C3\u00A2\u00C5\u0093\u00E2\u0080\u00A2',        '\u2715'],  // ✕
    // Warning / error
    ['\u00C3\u00A2\u00C2\u00C5\u2019',                    '\u274C'],  // ❌
    ['\u00C3\u00A2\u00C5\u00A1\u00C2\u00A0\u00C3\u00AF\u00C2\u00B8\u00C2\u00AF', '\u26A0\uFE0F'], // ⚠️
    // Triangles
    ['\u00C3\u00A2\u00E2\u0080\u009C\u00C2\u00B2',        '\u25B2'],  // ▲
    ['\u00C3\u00A2\u00E2\u0080\u009C\u00C2\u00BC',        '\u25BC'],  // ▼
    // Box drawing
    ['\u00C3\u00A2\u00E2\u0080\u00A0\u00E2\u0082\u00AC',  '\u2500'],  // ─
    // Emoji
    ['\u00C3\u00B0\u00C5\u00B8\u00E2\u0080\u009C\u00E2\u0080\u00B9', '\uD83D\uDCCB'],  // 📋
    ['\u00C3\u00B0\u00C5\u00B8\u00E2\u0084\u00A2\u00CB\u0086',       '\uD83D\uDE48'],  // 🙈
    ['\u00C3\u00B0\u00C5\u00B8\u00E2\u0080\u0098\u00C2\u00AF',       '\uD83D\uDC41'],  // 👁
    ['\u00C3\u00B0\u00C5\u00B8\u00C5\u2019\u00C2\u00B1',             '\uD83C\uDF31'],  // 🌱
    // Curly quotes
    ['\u00E2\u0080\u0098',                                '\u2018'],   // '
    ['\u00E2\u0080\u0099',                                '\u2019'],   // '
];

let count = 0;
for (const [bad, good] of fixes) {
    if (text.includes(bad)) {
        text = text.split(bad).join(good);
        console.log(`Fixed: ${JSON.stringify(bad)} → ${good}`);
        count++;
    }
}

writeFileSync(path, text, 'utf8');
console.log(`\nDone. ${count} pattern(s) fixed. File written as UTF-8.`);
