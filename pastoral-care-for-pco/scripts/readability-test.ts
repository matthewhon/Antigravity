/**
 * Unit checks for services/readability.ts. Run: npx tsx scripts/readability-test.ts
 */
import { analyzeReadability, qualityWarnings, smsSegmentInfo, verifyFacts, stripHtml } from '../services/readability';

let failed = 0;
const check = (name: string, cond: boolean, extra?: any) => {
    if (cond) console.log(`  ok   ${name}`);
    else { failed++; console.error(`  FAIL ${name}`, extra ?? ''); }
};

const easy = analyzeReadability('<p>Join us on Sunday. We have coffee. Bring a friend.</p>');
check('easy text grade is low', easy.grade < 4, easy);
check('word count', easy.wordCount === 10, easy);

const hard = analyzeReadability('Congregational participation in intergenerational discipleship initiatives necessitates considerable organizational coordination.');
check('hard text grade is high', hard.grade > 14, hard);

check('stripHtml', stripHtml('<p>Hi&nbsp;<strong>there</strong></p>') === 'Hi there.'.replace('.', '') + '' || stripHtml('<p>Hi&nbsp;<strong>there</strong></p>').startsWith('Hi there'));

check('sms 160 gsm = 1 segment', smsSegmentInfo('a'.repeat(160)).segments === 1);
check('sms 161 gsm = 2 segments', smsSegmentInfo('a'.repeat(161)).segments === 2);
check('emoji -> UCS-2', smsSegmentInfo('See you Sunday 🙏').encoding === 'UCS-2');
check('ucs2 71 chars = 2 segments', smsSegmentInfo('🙏'.repeat(71)).segments === 2);

const w = qualityWarnings('CLICK HERE!!!! FREE MONEY ACT NOW!!! Hello [Name]', { channel: 'email' });
check('flags spam/caps/exclaim/placeholder', w.length >= 4, w);

const smsLong = qualityWarnings('a'.repeat(400), { channel: 'sms', maxSmsChars: 320 });
check('flags sms over limit', smsLong.some(x => x.includes('limit')), smsLong);

check('requireLink flags missing', qualityWarnings('No link here', { channel: 'email', requireLink: true }).some(x => x.includes('link')));
check('requireLink ok with href', !qualityWarnings('<a href="https://x.org">go</a>', { channel: 'email', requireLink: true }).some(x => x.includes('No link')));

check('verifyFacts catches missing url', verifyFacts('hello', [{ label: 'VBS', urls: ['https://a.org/vbs'] }]).length === 1);
check('verifyFacts passes when present', verifyFacts('see https://a.org/vbs on June 5', [{ label: 'VBS', urls: ['https://a.org/vbs'], dates: ['June 5'] }]).length === 0);

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nAll readability checks passed');
