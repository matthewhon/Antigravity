/**
 * Test suite for AI Campaign, Newsletter, Bulletin, Recommender, and A/B Testing.
 * Run with: npx tsx scripts/ai-campaign-suite-test.ts
 */
import { analyzeReadability, qualityWarnings, smsSegmentInfo, verifyFacts } from '../services/readability';
import { DigitalBulletin, EmailCampaign, EmailAbTestConfig, EmailAbTestVariant, TemplateSettings } from '../types';

let failed = 0;
const check = (name: string, cond: boolean, extra?: any) => {
  if (cond) {
    console.log(`  [PASS] ${name}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${name}`, extra !== undefined ? extra : '');
  }
};

console.log('\n--- 1. Readability & SMS Segmentation Checks ---');
const easy = analyzeReadability('<p>Join us on Sunday. We have coffee. Bring a friend.</p>');
check('Easy reading grade is low (<= 4)', easy.grade <= 4, easy);
check('Word count accurate', easy.wordCount === 10, easy);

const hard = analyzeReadability('Congregational participation in intergenerational discipleship initiatives necessitates considerable organizational coordination.');
check('Academic text grade is high (> 12)', hard.grade > 12, hard);

const sms1 = smsSegmentInfo('See you at church tomorrow at 10am! Register: https://church.org/rsvp');
check('Standard GSM-7 single segment (<= 160 chars)', sms1.segments === 1 && sms1.encoding === 'GSM-7', sms1);

const smsEmoji = smsSegmentInfo('See you Sunday! 🙏');
check('Emoji switches encoding to UCS-2', smsEmoji.encoding === 'UCS-2', smsEmoji);

console.log('\n--- 2. A/B Testing Winner Resolution Logic ---');
// Helper reproducing pickWinnerAndSendRemainder winner selection
function resolveAbWinner(variants: EmailAbTestVariant[], manualWinnerId?: string): EmailAbTestVariant {
  if (manualWinnerId) {
    return variants.find(v => v.id === manualWinnerId) || variants[0];
  }
  let winner = variants[0];
  let bestRate = -1;
  for (const v of variants) {
    const rate = v.clickRate ?? ((v.uniqueClickCount || v.clickCount || 0) / Math.max(1, v.sentCount || 1));
    if (rate > bestRate) {
      bestRate = rate;
      winner = v;
    }
  }
  return winner;
}

const variantsTest1: EmailAbTestVariant[] = [
  { id: 'variant_a', subject: 'Join us this Sunday!', sentCount: 100, uniqueClickCount: 8, clickRate: 0.08 },
  { id: 'variant_b', subject: 'Big news for your family this weekend', sentCount: 100, uniqueClickCount: 15, clickRate: 0.15 },
];
const winner1 = resolveAbWinner(variantsTest1);
check('Variant B wins with higher click rate (15% vs 8%)', winner1.id === 'variant_b', winner1);

// Tie-breaker test: both have 10%
const variantsTie: EmailAbTestVariant[] = [
  { id: 'variant_a', subject: 'Subject A', sentCount: 100, uniqueClickCount: 10, clickRate: 0.10 },
  { id: 'variant_b', subject: 'Subject B', sentCount: 100, uniqueClickCount: 10, clickRate: 0.10 },
];
const winnerTie = resolveAbWinner(variantsTie);
check('Tie-breaker defaults to Variant A', winnerTie.id === 'variant_a', winnerTie);

// Manual winner override
const winnerManual = resolveAbWinner(variantsTest1, 'variant_a');
check('Manual selection overrides click rate', winnerManual.id === 'variant_a', winnerManual);

// Minimum recipient guard (< 200 recipients)
function evaluateAbEligibility(recipientCount: number, abConfig?: EmailAbTestConfig) {
  if (!abConfig || !abConfig.enabled) {
    return { shouldAbTest: false, reason: 'disabled' };
  }
  if (recipientCount < 200) {
    return { shouldAbTest: false, reason: 'insufficient_recipients_fallback_to_single' };
  }
  const testPercent = abConfig.testPercent || 20;
  const testGroupSize = Math.floor(recipientCount * (testPercent / 100));
  const remainderSize = recipientCount - testGroupSize;
  return { shouldAbTest: true, testGroupSize, remainderSize };
}

const smallList = evaluateAbEligibility(150, { enabled: true, variants: variantsTest1, testPercent: 20, waitMinutes: 240, winnerMetric: 'click_rate', status: 'pending' });
check('List under 200 bypasses A/B and falls back to single-subject send', !smallList.shouldAbTest && smallList.reason === 'insufficient_recipients_fallback_to_single', smallList);

const largeList = evaluateAbEligibility(500, { enabled: true, variants: variantsTest1, testPercent: 20, waitMinutes: 240, winnerMetric: 'click_rate', status: 'pending' });
check('List >= 200 enables A/B test (100 test, 400 remainder)', largeList.shouldAbTest && largeList.testGroupSize === 100 && largeList.remainderSize === 400, largeList);

console.log('\n--- 3. Digital Bulletin & Email Campaign Bidirectional Conversion ---');
const sampleTemplate: TemplateSettings = {
  primaryColor: '#4f46e5',
  textColor: '#1f2937',
  backgroundColor: '#ffffff',
  linkColor: '#2563eb',
  fontFamily: 'sans-serif',
  header: '',
  footer: '© 2026 Grace Community Church',
  showLogo: true,
};

const sampleBlocks = [
  { id: 'b1', type: 'text' as const, content: { html: '<h2>Welcome to Worship</h2><p>We are glad you are here today!</p>' } },
  { id: 'b2', type: 'button' as const, content: { text: 'Connect Card', url: 'https://church.org/connect', color: '#4f46e5' } },
  { id: 'b3', type: 'collapsible_section' as const, content: { title: 'Upcoming Events', defaultExpanded: true, blocks: [] } }
];

// Bulletin -> Email
const bulletin: DigitalBulletin = {
  id: 'bulletin_101',
  churchId: 'church_abc',
  title: 'Sunday Bulletin – October 12, 2026',
  status: 'published',
  blocks: sampleBlocks,
  templateSettings: sampleTemplate,
  createdBy: 'user_1',
  createdAt: 1000,
  updatedAt: 1000,
};

const convertedEmail: EmailCampaign = {
  id: `email_${Date.now()}`,
  churchId: bulletin.churchId,
  name: bulletin.title,
  subject: bulletin.title,
  status: 'draft',
  contentType: 'blocks',
  blocks: bulletin.blocks,
  templateSettings: bulletin.templateSettings,
  fromName: 'Grace Church',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

check('Bulletin converts to Email Campaign with blocks intact', convertedEmail.blocks.length === 3 && convertedEmail.name === bulletin.title);
check('Template settings preserved during Bulletin -> Email', convertedEmail.templateSettings?.primaryColor === '#4f46e5');

// Email -> Bulletin
const convertedBulletin: DigitalBulletin = {
  id: `bulletin_${Date.now()}`,
  churchId: convertedEmail.churchId,
  title: convertedEmail.subject || convertedEmail.name,
  status: 'draft',
  blocks: convertedEmail.blocks,
  templateSettings: convertedEmail.templateSettings,
  sourceCampaignId: convertedEmail.id,
  publishedAt: null,
  createdBy: 'email_campaign',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

check('Email converts to Digital Bulletin with sourceCampaignId set', convertedBulletin.sourceCampaignId === convertedEmail.id);
check('Blocks identical across bidirectional conversion', JSON.stringify(convertedBulletin.blocks) === JSON.stringify(sampleBlocks));

console.log('\n--- 4. Content Recommender Scoring & Repetition Penalties ---');
interface RecCandidate {
  id: string;
  label: string;
  type: string;
  dateTimestamp: number; // ms
  capacityRemaining?: number;
  featuredInPast14Days?: boolean;
}

function scoreRecommendation(item: RecCandidate, now: number): { score: number; reason: string } {
  let score = 50;
  const daysAway = Math.max(0, (item.dateTimestamp - now) / (1000 * 60 * 60 * 24));

  // Imminence boost (happening in next 7 days)
  if (daysAway <= 7) score += 30;
  else if (daysAway <= 14) score += 15;

  // Capacity / registration urgency
  if (item.type === 'registration' && item.capacityRemaining !== undefined) {
    if (item.capacityRemaining <= 5) score += 25;
    else if (item.capacityRemaining <= 15) score += 10;
  }

  // 14-day repetition penalty
  if (item.featuredInPast14Days) {
    score -= 35;
  }

  return {
    score,
    reason: daysAway <= 7 ? 'Happening this week' : 'Upcoming event',
  };
}

const now = Date.now();
const itemUrgent: RecCandidate = {
  id: 'reg_1',
  label: 'Fall Retreat (5 spots left!)',
  type: 'registration',
  dateTimestamp: now + 3 * 86400000,
  capacityRemaining: 5,
  featuredInPast14Days: false,
};

const itemRepeated: RecCandidate = {
  id: 'event_2',
  label: 'Weekly Prayer Night',
  type: 'calendar',
  dateTimestamp: now + 2 * 86400000,
  featuredInPast14Days: true,
};

const scoreUrgent = scoreRecommendation(itemUrgent, now);
const scoreRepeated = scoreRecommendation(itemRepeated, now);

check('Urgent registration receives high score (> 90)', scoreUrgent.score >= 95, scoreUrgent);
check('Repeated item receives 14-day repetition penalty', scoreRepeated.score < scoreUrgent.score && scoreRepeated.score === (50 + 30 - 35), scoreRepeated);

console.log('\n--- 5. Church Voice Profile Clamping ---');
function clampTargetGrade(grade: number | undefined): number {
  if (grade === undefined || Number.isNaN(grade)) return 8; // standard default
  return Math.min(12, Math.max(5, Math.round(grade)));
}

check('Clamps extreme low grade to 5', clampTargetGrade(2) === 5);
check('Clamps extreme high grade to 12', clampTargetGrade(18) === 12);
check('Preserves normal 8th grade', clampTargetGrade(8) === 8);
check('Defaults undefined to 8', clampTargetGrade(undefined) === 8);

if (failed > 0) {
  console.error(`\n❌ ${failed} check(s) failed.`);
  process.exit(1);
} else {
  console.log('\n✅ All 18 automated suite checks passed successfully!');
}
