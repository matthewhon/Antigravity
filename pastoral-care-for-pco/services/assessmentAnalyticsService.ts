import { firestore } from './firestoreService';
import { 
  GiftsTestResponse, 
  MbtiTestResponse, 
  DiscTestResponse, 
  SpiritualGiftType, 
  PcoPerson, 
  ServicesTeam 
} from '../types';
import { SPIRITUAL_GIFTS_DEFINITIONS } from '../constants/spiritualGiftsTestData';
import { DISC_PROFILES, DISC_DIMENSIONS_INFO, DiscDimension, DiscStyleProfile } from '../constants/discTestData';
import { MBTI_TYPE_PROFILES, MbtiTypeProfile } from '../constants/mbtiTestData';

export interface AssessmentAggregates {
  totalUniquePeopleAssessed: number;
  totalAssessmentsCount: number;
  giftsCount: number;
  discCount: number;
  mbtiCount: number;
  peopleCount: number;
  adoptionRate: number; // 0 - 100

  // Gifts Intelligence
  gifts: {
    distribution: { gift: SpiritualGiftType; count: number; percent: number; color: string; shortDesc: string }[];
    topGift: { gift: SpiritualGiftType; count: number; percent: number; color: string } | null;
    scarceGift: { gift: SpiritualGiftType; count: number; percent: number; color: string } | null;
    primaryScoresAverage: Record<SpiritualGiftType, number>;
  };

  // DISC Intelligence
  disc: {
    dimensionAverages: { D: number; I: number; S: number; C: number };
    dominantDimension: DiscDimension | null;
    dominantStyleCode: string | null;
    dominantStyleProfile: DiscStyleProfile | null;
    styleDistribution: { styleCode: string; name: string; count: number; percent: number; color: string }[];
    climateSummary: string;
    changeManagementAdvice: string;
  };

  // MBTI Intelligence
  mbti: {
    temperaments: { key: 'Analyst' | 'Diplomat' | 'Sentinel' | 'Explorer'; label: string; count: number; percent: number; color: string }[];
    extravertPercent: number;
    introvertPercent: number;
    thinkingPercent: number;
    feelingPercent: number;
    sensingPercent: number;
    intuitivePercent: number;
    judgingPercent: number;
    perceivingPercent: number;
    topTypes: { type: string; name: string; count: number; percent: number; color: string }[];
  };

  // Pastoral Strategic Briefing
  briefing: {
    headline: string;
    preachingToneAdvice: string;
    visionCastingStrategy: string;
    changeManagementGuideline: string;
    fellowshipAndSmallGroupStructure: string;
    topCongregationalBlindSpots: string[];
    scriptureAnchor: { verse: string; text: string };
  };

  // Placement Matches
  placementMatches: {
    personId?: string;
    personName: string;
    email?: string;
    phone?: string;
    primaryGift: string;
    discStyle?: string;
    recommendedTeam: string;
    rationale: string;
    isServing: boolean;
  }[];

  // Care Vulnerabilities
  careVulnerabilities: {
    personId?: string;
    personName: string;
    email?: string;
    phone?: string;
    riskLevel?: 'Healthy' | 'At Risk' | 'Disconnected' | 'Unknown';
    primaryGift?: string;
    discStyle?: string;
    mbtiType?: string;
    vulnerabilityReason: string;
    recommendedPastoralAction: string;
  }[];

  // Discipleship Pathways
  discipleshipThemes: {
    theme: string;
    category: 'Doctrinal' | 'Relational' | 'Spiritual Formation' | 'Leadership';
    rationale: string;
    impactPercentage: number;
  }[];
}

export const computeAssessmentAggregates = (
  giftsResponses: GiftsTestResponse[],
  discResponses: DiscTestResponse[],
  mbtiResponses: MbtiTestResponse[],
  people: PcoPerson[] = [],
  teams: ServicesTeam[] = []
): AssessmentAggregates => {
  const peopleMap = new Map<string, PcoPerson>();
  people.forEach(p => {
    if (p.id) peopleMap.set(p.id, p);
    if (p.name) peopleMap.set(p.name.toLowerCase().trim(), p);
    if (p.primary_email) peopleMap.set(p.primary_email.toLowerCase().trim(), p);
  });

  // Unique people assessed set
  const uniquePersonKeys = new Set<string>();
  giftsResponses.forEach(r => {
    const key = r.personId || r.email || r.personName || `${r.firstName} ${r.lastName}`;
    if (key) uniquePersonKeys.add(key.toLowerCase().trim());
  });
  discResponses.forEach(r => {
    const key = r.personId || r.email || r.personName || `${r.firstName} ${r.lastName}`;
    if (key) uniquePersonKeys.add(key.toLowerCase().trim());
  });
  mbtiResponses.forEach(r => {
    const key = r.personId || r.email || `${r.firstName} ${r.lastName}`;
    if (key) uniquePersonKeys.add(key.toLowerCase().trim());
  });

  const totalUniquePeopleAssessed = uniquePersonKeys.size;
  const totalAssessmentsCount = giftsResponses.length + discResponses.length + mbtiResponses.length;
  const peopleCount = people.length || 1;
  const adoptionRate = Math.min(100, Math.round((totalUniquePeopleAssessed / peopleCount) * 100));

  // ─── 1. Spiritual Gifts Aggregation ──────────────────────────────────────────
  const giftCounts: Record<SpiritualGiftType, number> = {
    Helps: 0,
    Teaching: 0,
    Encouragement: 0,
    Administration: 0,
    Mercy: 0,
    Giving: 0
  };

  const giftScoreSums: Record<SpiritualGiftType, number> = {
    Helps: 0,
    Teaching: 0,
    Encouragement: 0,
    Administration: 0,
    Mercy: 0,
    Giving: 0
  };

  giftsResponses.forEach(r => {
    if (r.primaryGift && giftCounts[r.primaryGift] !== undefined) {
      giftCounts[r.primaryGift]++;
    }
    if (r.scores) {
      (['Helps', 'Teaching', 'Encouragement', 'Administration', 'Mercy', 'Giving'] as SpiritualGiftType[]).forEach(g => {
        const score = r.scores?.[g.toLowerCase() as keyof typeof r.scores] || 0;
        giftScoreSums[g] += score;
      });
    }
  });

  const giftsTotal = giftsResponses.length || 1;
  const giftsDistribution = (['Helps', 'Teaching', 'Encouragement', 'Administration', 'Mercy', 'Giving'] as SpiritualGiftType[]).map(g => {
    const count = giftCounts[g];
    const percent = Math.round((count / giftsTotal) * 100);
    const def = SPIRITUAL_GIFTS_DEFINITIONS[g];
    return {
      gift: g,
      count,
      percent,
      color: def?.color || '#6366f1',
      shortDesc: def?.shortDescription || ''
    };
  });

  // Sort to find top and scarce
  const sortedGifts = [...giftsDistribution].sort((a, b) => b.count - a.count);
  const topGift = sortedGifts[0]?.count > 0 ? sortedGifts[0] : null;
  const scarceGift = sortedGifts[sortedGifts.length - 1]?.count >= 0 ? sortedGifts[sortedGifts.length - 1] : null;

  const primaryScoresAverage: Record<SpiritualGiftType, number> = {
    Helps: Math.round(giftScoreSums.Helps / giftsTotal),
    Teaching: Math.round(giftScoreSums.Teaching / giftsTotal),
    Encouragement: Math.round(giftScoreSums.Encouragement / giftsTotal),
    Administration: Math.round(giftScoreSums.Administration / giftsTotal),
    Mercy: Math.round(giftScoreSums.Mercy / giftsTotal),
    Giving: Math.round(giftScoreSums.Giving / giftsTotal)
  };

  // ─── 2. DISC Climate Aggregation ───────────────────────────────────────────
  let sumD = 0, sumI = 0, sumS = 0, sumC = 0;
  const styleCodeCounts: Record<string, number> = {};

  discResponses.forEach(r => {
    if (r.percentages) {
      sumD += r.percentages.D || 0;
      sumI += r.percentages.I || 0;
      sumS += r.percentages.S || 0;
      sumC += r.percentages.C || 0;
    }
    const code = r.styleCode || r.primaryDimension || 'D';
    styleCodeCounts[code] = (styleCodeCounts[code] || 0) + 1;
  });

  const discTotal = discResponses.length || 1;
  const dimAvgRaw = {
    D: Math.round(sumD / discTotal),
    I: Math.round(sumI / discTotal),
    S: Math.round(sumS / discTotal),
    C: Math.round(sumC / discTotal)
  };
  const dimTotal = (dimAvgRaw.D + dimAvgRaw.I + dimAvgRaw.S + dimAvgRaw.C) || 100;
  const dimensionAverages = {
    D: Math.round((dimAvgRaw.D / dimTotal) * 100),
    I: Math.round((dimAvgRaw.I / dimTotal) * 100),
    S: Math.round((dimAvgRaw.S / dimTotal) * 100),
    C: Math.round((dimAvgRaw.C / dimTotal) * 100)
  };

  // Determine dominant dimension
  const maxDimEntry = Object.entries(dimensionAverages).sort((a, b) => b[1] - a[1])[0];
  const dominantDimension = (maxDimEntry ? maxDimEntry[0] : 'S') as DiscDimension;

  // Determine dominant style profile
  const sortedStyleCodes = Object.entries(styleCodeCounts).sort((a, b) => b[1] - a[1]);
  const dominantStyleCode = sortedStyleCodes[0]?.[0] || 'S';
  const dominantStyleProfile = DISC_PROFILES[dominantStyleCode] || DISC_PROFILES['S'] || null;

  const styleDistribution = Object.entries(styleCodeCounts).map(([code, count]) => {
    const prof = DISC_PROFILES[code] || DISC_PROFILES['D'];
    return {
      styleCode: code,
      name: prof.name.split('(')[0].trim(),
      count,
      percent: Math.round((count / discTotal) * 100),
      color: prof.color
    };
  }).sort((a, b) => b.count - a.count);

  let climateSummary = 'Your church body exhibits a balanced behavioral blend.';
  let changeManagementAdvice = 'Communicate with balanced clarity, rationale, and warmth.';

  if (dimensionAverages.S + dimensionAverages.C > 55) {
    climateSummary = 'Methodical, Faithful & Relationship-Driven (High S/C). The congregation deeply values doctrinal stability, warm fellowship, and dependable operational routines.';
    changeManagementAdvice = 'Provide 4–6 weeks advance notice for changes. Equip leaders with written FAQs and emphasize continuity of biblical doctrine and ministry mission.';
  } else if (dimensionAverages.D + dimensionAverages.I > 55) {
    climateSummary = 'Visionary, Energetic & Outreach-Focused (High D/I). The congregation responds well to bold vision, spontaneous outreach initiatives, and high-energy celebration.';
    changeManagementAdvice = 'Keep vision concise, highlight immediate kingdom wins, and provide clear step-by-step administrative support so ideas do not stall.';
  } else if (dimensionAverages.I + dimensionAverages.S > 55) {
    climateSummary = 'Warm, Highly Relational & Encouraging (High I/S). Fellowship, pastoral presence, and caring connections form the heartbeat of the church.';
    changeManagementAdvice = 'Frame all initiatives around personal impact, testimonies, and how it blesses families and church unity.';
  }

  // ─── 3. MBTI Intelligence Aggregation ───────────────────────────────────────
  const temperamentCounts: Record<'Analyst' | 'Diplomat' | 'Sentinel' | 'Explorer', number> = {
    Analyst: 0,
    Diplomat: 0,
    Sentinel: 0,
    Explorer: 0
  };

  let sumE = 0, sumI_mbti = 0, sumT = 0, sumF = 0, sumS_mbti = 0, sumN = 0, sumJ = 0, sumP = 0;
  const mbtiTypeCounts: Record<string, number> = {};

  mbtiResponses.forEach(r => {
    const prof = MBTI_TYPE_PROFILES[r.mbtiType] || MBTI_TYPE_PROFILES['ENFJ'];
    if (prof?.temperament) {
      temperamentCounts[prof.temperament]++;
    }
    mbtiTypeCounts[r.mbtiType] = (mbtiTypeCounts[r.mbtiType] || 0) + 1;

    if (r.traitPercentages) {
      sumE += r.traitPercentages.energy?.ePercent || 50;
      sumI_mbti += r.traitPercentages.energy?.iPercent || 50;
      sumS_mbti += r.traitPercentages.information?.sPercent || 50;
      sumN += r.traitPercentages.information?.nPercent || 50;
      sumT += r.traitPercentages.decisions?.tPercent || 50;
      sumF += r.traitPercentages.decisions?.fPercent || 50;
      sumJ += r.traitPercentages.structure?.jPercent || 50;
      sumP += r.traitPercentages.structure?.pPercent || 50;
    } else {
      if (r.mbtiType[0] === 'E') sumE += 70; else sumI_mbti += 70;
      if (r.mbtiType[1] === 'S') sumS_mbti += 70; else sumN += 70;
      if (r.mbtiType[2] === 'T') sumT += 70; else sumF += 70;
      if (r.mbtiType[3] === 'J') sumJ += 70; else sumP += 70;
    }
  });

  const mbtiTotal = mbtiResponses.length || 1;
  const temperaments = [
    { key: 'Sentinel' as const, label: 'Sentinels (Order & Faithfulness)', count: temperamentCounts.Sentinel, percent: Math.round((temperamentCounts.Sentinel / mbtiTotal) * 100), color: '#0284c7' },
    { key: 'Diplomat' as const, label: 'Diplomats (Empathy & Unity)', count: temperamentCounts.Diplomat, percent: Math.round((temperamentCounts.Diplomat / mbtiTotal) * 100), color: '#10b981' },
    { key: 'Analyst' as const, label: 'Analysts (Strategy & Truth)', count: temperamentCounts.Analyst, percent: Math.round((temperamentCounts.Analyst / mbtiTotal) * 100), color: '#8b5cf6' },
    { key: 'Explorer' as const, label: 'Explorers (Action & Outreach)', count: temperamentCounts.Explorer, percent: Math.round((temperamentCounts.Explorer / mbtiTotal) * 100), color: '#f59e0b' },
  ];

  const extravertPercent = Math.round(sumE / (sumE + sumI_mbti || 1) * 100) || 50;
  const introvertPercent = 100 - extravertPercent;
  const thinkingPercent = Math.round(sumT / (sumT + sumF || 1) * 100) || 50;
  const feelingPercent = 100 - thinkingPercent;
  const sensingPercent = Math.round(sumS_mbti / (sumS_mbti + sumN || 1) * 100) || 50;
  const intuitivePercent = 100 - sensingPercent;
  const judgingPercent = Math.round(sumJ / (sumJ + sumP || 1) * 100) || 50;
  const perceivingPercent = 100 - judgingPercent;

  const topTypes = Object.entries(mbtiTypeCounts).map(([type, count]) => {
    const prof = MBTI_TYPE_PROFILES[type] || MBTI_TYPE_PROFILES['ENFJ'];
    return {
      type,
      name: prof.name.split('/')[0].trim(),
      count,
      percent: Math.round((count / mbtiTotal) * 100),
      color: prof.color
    };
  }).sort((a, b) => b.count - a.count).slice(0, 4);

  // ─── 4. Pastoral Strategic Briefing Generation ─────────────────────────────
  let preachingToneAdvice = 'Anchor messages in sound exposition followed by practical life application and personal stories.';
  if (feelingPercent > 55) {
    preachingToneAdvice = 'The congregation has a strong Feeling (F) preference. Ground sermon applications in heartfelt vulnerability, relational restoration, and compassionate outreach rather than purely metric targets.';
  } else if (thinkingPercent > 55) {
    preachingToneAdvice = 'The congregation has a strong Thinking (T) preference. Provide structured sermon outlines, clear theological definitions, and logical apologetic defenses of biblical truth.';
  }

  let fellowshipAndSmallGroupStructure = 'Blend both structured discussion and open relational prayer in small group gatherings.';
  if (introvertPercent > 55) {
    fellowshipAndSmallGroupStructure = 'With an Introverted majority (I), avoid high-pressure public icebreakers or demanding spontaneous public speaking. Emphasize smaller table groups (4–6 people), reflective study questions sent in advance, and 1-on-1 discipleship pairs.';
  } else if (extravertPercent > 55) {
    fellowshipAndSmallGroupStructure = 'With an Extraverted majority (E), prioritize fellowship meals, active small group discussions, outreach projects, and vibrant church-wide fellowship nights.';
  }

  const topCongregationalBlindSpots: string[] = [];
  if (giftCounts.Administration < (giftsTotal * 0.1)) {
    topCongregationalBlindSpots.push('Severe Administration Deficit: High risk of visionary ideas stalling due to lack of logistical execution.');
  }
  if (giftCounts.Teaching < (giftsTotal * 0.1)) {
    topCongregationalBlindSpots.push('Teaching / Discipleship Bottleneck: Need to intentionally train and disciple emerging Bible teachers.');
  }
  if (giftCounts.Mercy + giftCounts.Helps > (giftsTotal * 0.5)) {
    topCongregationalBlindSpots.push('Compassion Fatigue Alert: High proportion of servant-hearted members at risk of over-functioning and carrying others’ burdens.');
  }
  if (topCongregationalBlindSpots.length === 0) {
    topCongregationalBlindSpots.push('Maintain healthy volunteer Sabbath rhythms and continue cross-equipping team members.');
  }

  const briefing = {
    headline: `Congregational Assessment Profile (${totalAssessmentsCount} Completed)`,
    preachingToneAdvice,
    visionCastingStrategy: `Present vision through ${dominantStyleProfile?.name || 'faithful shepherding'}: emphasize clarity, personal discipleship impact, and scriptural backing.`,
    changeManagementGuideline: changeManagementAdvice,
    fellowshipAndSmallGroupStructure,
    topCongregationalBlindSpots,
    scriptureAnchor: {
      verse: '1 Corinthians 12:4-6 (KJV)',
      text: 'Now there are diversities of gifts, but the same Spirit. And there are differences of administrations, but the same Lord. And there are diversities of operations, but it is the same God which worketh all in all.'
    }
  };

  // ─── 5. Placement Matcher (Untapped Gifts -> Serving Needs) ────────────────
  const placementMatches: AssessmentAggregates['placementMatches'] = [];

  giftsResponses.forEach(gr => {
    const fullName = gr.personName || `${gr.firstName} ${gr.lastName}`.trim();
    const pcoMatch = (gr.personId && peopleMap.get(gr.personId)) || 
                     (gr.email && peopleMap.get(gr.email.toLowerCase().trim())) || 
                     peopleMap.get(fullName.toLowerCase().trim());
    
    const discMatch = discResponses.find(d => 
      (d.personId && d.personId === gr.personId) || 
      (d.email && d.email.toLowerCase() === gr.email?.toLowerCase()) ||
      (d.personName && d.personName.toLowerCase() === fullName.toLowerCase())
    );

    const giftDef = SPIRITUAL_GIFTS_DEFINITIONS[gr.primaryGift];
    const recTeams = giftDef?.recommendedServingAreas || ['Member Care Team', 'Guest Services'];
    const targetTeam = recTeams[0];

    // Check if currently serving (from teams if available)
    const isServing = !!(pcoMatch?.membership_status === 'Member' || pcoMatch?.status === 'active');

    placementMatches.push({
      personId: gr.personId || pcoMatch?.id,
      personName: fullName,
      email: gr.email || pcoMatch?.primary_email,
      phone: gr.phone || pcoMatch?.primary_phone,
      primaryGift: gr.primaryGift,
      discStyle: discMatch?.styleCode,
      recommendedTeam: targetTeam,
      rationale: `Gift of ${gr.primaryGift} aligns directly with ${targetTeam}. ${discMatch ? `DISC (${discMatch.styleCode}) provides optimal behavioral fit.` : ''}`,
      isServing
    });
  });

  // ─── 6. Shepherding & Care Vulnerabilities ─────────────────────────────────
  const careVulnerabilities: AssessmentAggregates['careVulnerabilities'] = [];

  people.forEach(p => {
    const riskLevel = p.risk_level || 'Healthy';
    const isHighRisk = riskLevel === 'At Risk' || riskLevel === 'Disconnected';

    const giftResp = giftsResponses.find(g => g.personId === p.id || (g.email && g.email.toLowerCase() === p.primary_email?.toLowerCase()));
    const discResp = discResponses.find(d => d.personId === p.id || (d.email && d.email.toLowerCase() === p.primary_email?.toLowerCase()));
    const mbtiResp = mbtiResponses.find(m => m.personId === p.id || (m.email && m.email.toLowerCase() === p.primary_email?.toLowerCase()));

    if (giftResp || discResp || mbtiResp) {
      const isHighMercy = giftResp?.primaryGift === 'Mercy' || giftResp?.primaryGift === 'Helps';
      const isIntrovert = mbtiResp?.mbtiType?.[0] === 'I';
      const isSteadiness = discResp?.primaryDimension === 'S' || discResp?.styleCode?.includes('S');

      if (isHighRisk || (isHighMercy && isSteadiness)) {
        careVulnerabilities.push({
          personId: p.id,
          personName: p.name,
          email: p.primary_email,
          phone: p.primary_phone,
          riskLevel,
          primaryGift: giftResp?.primaryGift,
          discStyle: discResp?.styleCode,
          mbtiType: mbtiResp?.mbtiType,
          vulnerabilityReason: isHighRisk 
            ? `Engagement risk is ${riskLevel}. With ${isIntrovert ? 'Introverted (I)' : ''} ${isHighMercy ? 'High Mercy/Helps' : 'personality'}, they tend to withdraw silently under distress.`
            : `High-Mercy & Steadiness servant who absorbs burdens quietly. High risk of ministry burnout if not actively protected.`,
          recommendedPastoralAction: isHighRisk
            ? 'Schedule a warm, unhurried 1-on-1 pastoral coffee check-in. Avoid mass group reminders.'
            : 'Check in on their personal rest and ensure they have adequate serving co-leaders.'
        });
      }
    }
  });

  // ─── 7. Discipleship & Spiritual Growth Pathways ───────────────────────────
  const discipleshipThemes = [
    {
      theme: 'Biblical Conflict Resolution & Peacemaking',
      category: 'Relational' as const,
      rationale: `${dimensionAverages.S + dimensionAverages.I}% of members have High Steadiness/Influence and tend to avoid direct confrontation or suppress relational grievances.`,
      impactPercentage: Math.min(95, dimensionAverages.S + dimensionAverages.I + 20)
    },
    {
      theme: 'Spiritual Boundaries & Burnout Prevention in Ministry',
      category: 'Spiritual Formation' as const,
      rationale: `${giftCounts.Mercy + giftCounts.Helps} members have Primary Gifts of Mercy/Helps, making boundary-setting and Sabbath vital to longevity.`,
      impactPercentage: Math.round(((giftCounts.Mercy + giftCounts.Helps) / giftsTotal) * 100) || 45
    },
    {
      theme: 'Personal Evangelism & Equipping the Saints',
      category: 'Leadership' as const,
      rationale: `Equipping the congregation to leverage their unique personality types (from Introverted 1-on-1s to Extraverted hospitality) in sharing the Gospel.`,
      impactPercentage: 80
    },
    {
      theme: 'Deepening Theological Foundations & Hermeneutics',
      category: 'Doctrinal' as const,
      rationale: `Systematic Bible study tracks designed for ${temperamentCounts.Sentinel + temperamentCounts.Analyst} Sentinels and Analysts who desire deep doctrinal meat.`,
      impactPercentage: Math.round(((temperamentCounts.Sentinel + temperamentCounts.Analyst) / (mbtiTotal || 1)) * 100) || 50
    }
  ];

  return {
    totalUniquePeopleAssessed,
    totalAssessmentsCount,
    giftsCount: giftsResponses.length,
    discCount: discResponses.length,
    mbtiCount: mbtiResponses.length,
    peopleCount,
    adoptionRate,
    gifts: {
      distribution: giftsDistribution,
      topGift,
      scarceGift,
      primaryScoresAverage
    },
    disc: {
      dimensionAverages,
      dominantDimension,
      dominantStyleCode,
      dominantStyleProfile,
      styleDistribution,
      climateSummary,
      changeManagementAdvice
    },
    mbti: {
      temperaments,
      extravertPercent,
      introvertPercent,
      thinkingPercent,
      feelingPercent,
      sensingPercent,
      intuitivePercent,
      judgingPercent,
      perceivingPercent,
      topTypes
    },
    briefing,
    placementMatches: placementMatches.slice(0, 10),
    careVulnerabilities: careVulnerabilities.slice(0, 8),
    discipleshipThemes
  };
};
