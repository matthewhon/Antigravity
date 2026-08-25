import { 
  ServicesTeam, 
  ServicePlanSnapshot, 
  PcoPerson, 
  TeamHealthDiagnostic, 
  TeamCandidateSuggestion, 
  TeamFitReallocation, 
  GiftsTestResponse, 
  DiscTestResponse, 
  MbtiTestResponse, 
  SpiritualGiftType 
} from '../types';
import { SPIRITUAL_GIFTS_DEFINITIONS } from '../constants/spiritualGiftsTestData';
import { DISC_PROFILES } from '../constants/discTestData';
import { MBTI_TYPE_PROFILES } from '../constants/mbtiTestData';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Team Health Diagnostics (Struggling Teams Detection)
// ─────────────────────────────────────────────────────────────────────────────

export function analyzeTeamHealth(
  teams: ServicesTeam[],
  futurePlans: ServicePlanSnapshot[] = [],
  people: PcoPerson[] = []
): TeamHealthDiagnostic[] {
  const peopleMap = new Map<string, PcoPerson>();
  people.forEach(p => {
    if (p.id) peopleMap.set(p.id, p);
  });

  const now = new Date();
  const forwardWindowEnd = new Date();
  forwardWindowEnd.setDate(forwardWindowEnd.getDate() + 30); // 30-day forward look

  return teams.map(team => {
    let openSlotsCount = 0;
    let filledSlotsCount = 0;

    // Analyze upcoming plans
    futurePlans.forEach(plan => {
      const planDate = plan.planTimes?.[0]?.startsAt 
        ? new Date(plan.planTimes[0].startsAt) 
        : new Date(plan.sortDate);

      if (planDate >= now && planDate <= forwardWindowEnd) {
        // Open slots for this team
        (plan.neededPositions || []).forEach(np => {
          if (np.teamName?.toLowerCase().trim() === team.name?.toLowerCase().trim()) {
            openSlotsCount += np.quantity || 0;
          }
        });

        // Filled slots for this team
        (plan.teamMembers || []).forEach(tm => {
          if (tm.teamName?.toLowerCase().trim() === team.name?.toLowerCase().trim()) {
            const status = (tm.status || '').toLowerCase();
            if (status === 'confirmed' || status === 'c' || status === 'pending' || status === 'unconfirmed') {
              filledSlotsCount++;
            }
          }
        });
      }
    });

    const rosterSize = team.memberIds?.length || 0;
    const activeVolunteersCount = team.scheduledMemberIds?.length || rosterSize;

    // Check burnout count among roster members
    let burnoutCount = 0;
    (team.memberIds || []).forEach(id => {
      const p = peopleMap.get(id);
      if (p?.servingStats?.riskLevel === 'High') {
        burnoutCount++;
      }
    });

    const totalDemand = filledSlotsCount + openSlotsCount;
    const fillRate = totalDemand > 0 ? Math.round((filledSlotsCount / totalDemand) * 100) : (rosterSize > 0 ? 100 : 0);
    const burnoutRate = rosterSize > 0 ? Math.round((burnoutCount / rosterSize) * 100) : 0;
    const leaderCount = team.leaderPersonIds?.length || 0;
    const leaderNames = (team.leaderPersonIds || [])
      .map(id => peopleMap.get(id)?.name)
      .filter(Boolean) as string[];

    const riskReasons: string[] = [];

    // Diagnostic rules
    if (openSlotsCount >= 4) {
      riskReasons.push(`${openSlotsCount} open positions in upcoming 30-day plans.`);
    } else if (openSlotsCount > 0) {
      riskReasons.push(`${openSlotsCount} open serving slots needing volunteers.`);
    }

    if (fillRate < 60 && totalDemand > 0) {
      riskReasons.push(`Critically low fill rate (${fillRate}% confirmed/scheduled).`);
    } else if (fillRate < 75 && totalDemand > 0) {
      riskReasons.push(`Sub-optimal fill rate (${fillRate}% capacity).`);
    }

    if (burnoutRate >= 35) {
      riskReasons.push(`High burnout risk: ${burnoutCount} volunteers (${burnoutRate}%) serving >2x weekly.`);
    } else if (burnoutCount >= 2) {
      riskReasons.push(`${burnoutCount} key team members carrying high serving loads.`);
    }

    if (rosterSize === 0) {
      riskReasons.push('Empty team roster in Services.');
    } else if (rosterSize < 3 && totalDemand > 2) {
      riskReasons.push(`Small roster (${rosterSize} members) vulnerable to single-point absences.`);
    }

    if (leaderCount === 0) {
      riskReasons.push('No team leader or coordinator assigned.');
    }

    // Health Score calculation (0 - 100)
    let healthScore = 100;

    // Deduct for open slots (up to -40)
    healthScore -= Math.min(40, openSlotsCount * 8);

    // Deduct for poor fill rate
    if (totalDemand > 0) {
      if (fillRate < 50) healthScore -= 25;
      else if (fillRate < 75) healthScore -= 15;
      else if (fillRate < 85) healthScore -= 5;
    }

    // Deduct for burnout
    if (burnoutRate >= 40) healthScore -= 20;
    else if (burnoutRate >= 20) healthScore -= 10;

    // Deduct for thin roster
    if (rosterSize === 0) healthScore -= 25;
    else if (rosterSize < 3) healthScore -= 10;

    // Deduct for missing leadership
    if (leaderCount === 0) healthScore -= 15;

    // Clamp score
    healthScore = Math.max(10, Math.min(100, healthScore));

    let status: TeamHealthDiagnostic['status'] = 'Healthy';
    let urgency: TeamHealthDiagnostic['urgency'] = 'Low';

    if (healthScore < 50 || (openSlotsCount >= 4 && fillRate < 60)) {
      status = 'Critical';
      urgency = 'Critical';
    } else if (healthScore < 70 || openSlotsCount >= 2 || burnoutRate >= 35) {
      status = 'Struggling';
      urgency = 'High';
    } else if (healthScore < 85 || openSlotsCount > 0 || burnoutCount > 0) {
      status = 'Moderate';
      urgency = 'Medium';
    }

    return {
      teamId: team.id,
      teamName: team.name,
      serviceTypeName: team.serviceTypeName,
      healthScore,
      status,
      fillRate,
      openSlotsCount,
      filledSlotsCount,
      rosterSize,
      activeVolunteersCount,
      burnoutCount,
      burnoutRate,
      leaderCount,
      leaderPersonIds: team.leaderPersonIds || [],
      leaderNames,
      riskReasons,
      urgency
    };
  }).sort((a, b) => a.healthScore - b.healthScore);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Team Ministry Domain Profile Mapping
// ─────────────────────────────────────────────────────────────────────────────

interface MinistryDomainRule {
  keywords: string[];
  idealGifts: SpiritualGiftType[];
  idealDiscDimensions: ('D' | 'I' | 'S' | 'C')[];
  idealDiscProfiles: string[];
  idealMbtiTemperaments: ('Analyst' | 'Diplomat' | 'Sentinel' | 'Explorer')[];
  suggestedRoles: string[];
  roleDescription: string;
}

const MINISTRY_DOMAIN_RULES: MinistryDomainRule[] = [
  {
    keywords: ['hospitality', 'welcome', 'greeter', 'usher', 'first impression', 'coffee', 'guest', 'parking'],
    idealGifts: ['Encouragement', 'Mercy', 'Helps'],
    idealDiscDimensions: ['I', 'S'],
    idealDiscProfiles: ['I', 'IS', 'ID', 'SI', 'S'],
    idealMbtiTemperaments: ['Diplomat', 'Explorer'],
    suggestedRoles: ['Foyer Greeter', 'Guest Welcome Host', 'Usher Coordinator', 'Coffee Barista'],
    roleDescription: 'Warm, highly relational environment welcoming newcomers and regular attendees.'
  },
  {
    keywords: ['tech', 'audio', 'sound', 'video', 'media', 'livestream', 'production', 'slides', 'propresenter', 'lighting', 'camera'],
    idealGifts: ['Helps', 'Administration'],
    idealDiscDimensions: ['C', 'S'],
    idealDiscProfiles: ['C', 'CS', 'CD', 'SC', 'S'],
    idealMbtiTemperaments: ['Sentinel', 'Analyst'],
    suggestedRoles: ['Sound Engineer', 'Slide / Lyrics Operator', 'Livestream Director', 'Lighting Tech'],
    roleDescription: 'Methodical, attentive production execution supporting distraction-free worship.'
  },
  {
    keywords: ['kids', 'children', 'nursery', 'preschool', 'youth', 'student', 'sunday school', 'cradle'],
    idealGifts: ['Teaching', 'Encouragement', 'Helps', 'Mercy'],
    idealDiscDimensions: ['S', 'I', 'C'],
    idealDiscProfiles: ['S', 'SI', 'IS', 'SC', 'I'],
    idealMbtiTemperaments: ['Diplomat', 'Sentinel'],
    suggestedRoles: ['Sunday School Teacher', 'Small Group Leader', 'Nursery Caregiver', 'Kids Check-In Host'],
    roleDescription: 'Nurturing, faithful discipleship and safe classroom care for the next generation.'
  },
  {
    keywords: ['worship', 'band', 'choir', 'vocal', 'music', 'guitar', 'piano', 'drums', 'praise'],
    idealGifts: ['Encouragement', 'Helps', 'Teaching'],
    idealDiscDimensions: ['I', 'S'],
    idealDiscProfiles: ['I', 'IS', 'SI', 'S', 'D'],
    idealMbtiTemperaments: ['Diplomat', 'Explorer', 'Analyst'],
    suggestedRoles: ['Vocalist', 'Musician', 'Choir Member', 'Rehearsal Coordinator'],
    roleDescription: 'Spirit-led musical accompaniment and congregational praise leadership.'
  },
  {
    keywords: ['care', 'pastoral', 'prayer', 'visitation', 'benevolence', 'hospital', 'senior', 'bereavement'],
    idealGifts: ['Mercy', 'Encouragement', 'Helps'],
    idealDiscDimensions: ['S', 'I'],
    idealDiscProfiles: ['S', 'SI', 'IS'],
    idealMbtiTemperaments: ['Diplomat', 'Sentinel'],
    suggestedRoles: ['Care Caller', 'Hospital & Home Visitor', 'Intercessory Prayer Partner', 'Benevolence Supporter'],
    roleDescription: 'Compassionate one-on-one listening, prayer ministry, and tangible benevolence support.'
  },
  {
    keywords: ['facilities', 'setup', 'teardown', 'maintenance', 'safety', 'security', 'logistics', 'clean'],
    idealGifts: ['Helps', 'Administration'],
    idealDiscDimensions: ['S', 'C', 'D'],
    idealDiscProfiles: ['S', 'SC', 'CS', 'C', 'D'],
    idealMbtiTemperaments: ['Sentinel', 'Analyst'],
    suggestedRoles: ['Setup & Teardown Crew', 'Safety & Security Team', 'Building Maintenance Helper'],
    roleDescription: 'Dependable behind-the-scenes physical stewardship of church facilities and safety.'
  }
];

function resolveDomainForTeam(teamName: string): MinistryDomainRule {
  const lower = (teamName || '').toLowerCase();
  for (const rule of MINISTRY_DOMAIN_RULES) {
    if (rule.keywords.some(k => lower.includes(k))) {
      return rule;
    }
  }
  // Default fallback
  return {
    keywords: [],
    idealGifts: ['Helps', 'Encouragement', 'Administration'],
    idealDiscDimensions: ['S', 'I', 'C'],
    idealDiscProfiles: ['S', 'IS', 'SC'],
    idealMbtiTemperaments: ['Sentinel', 'Diplomat'],
    suggestedRoles: ['General Ministry Volunteer', 'Team Coordinator'],
    roleDescription: 'Faithful service supporting weekly ministry operations.'
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Assessment-Based Volunteer Suggestions for Teams
// ─────────────────────────────────────────────────────────────────────────────

export function suggestCandidatesForTeam(
  team: ServicesTeam,
  people: PcoPerson[],
  giftsResponses: GiftsTestResponse[] = [],
  discResponses: DiscTestResponse[] = [],
  mbtiResponses: MbtiTestResponse[] = []
): TeamCandidateSuggestion[] {
  const domainRule = resolveDomainForTeam(team.name);
  const teamMemberIdsSet = new Set(team.memberIds || []);

  // Build assessment lookup maps
  const giftsMap = new Map<string, GiftsTestResponse>();
  giftsResponses.forEach(r => {
    if (r.personId) giftsMap.set(r.personId, r);
    if (r.email) giftsMap.set(r.email.toLowerCase().trim(), r);
    const name = r.personName || `${r.firstName} ${r.lastName}`;
    if (name) giftsMap.set(name.toLowerCase().trim(), r);
  });

  const discMap = new Map<string, DiscTestResponse>();
  discResponses.forEach(r => {
    if (r.personId) discMap.set(r.personId, r);
    if (r.email) discMap.set(r.email.toLowerCase().trim(), r);
    const name = r.personName || `${r.firstName} ${r.lastName}`;
    if (name) discMap.set(name.toLowerCase().trim(), r);
  });

  const mbtiMap = new Map<string, MbtiTestResponse>();
  mbtiResponses.forEach(r => {
    if (r.personId) mbtiMap.set(r.personId, r);
    if (r.email) mbtiMap.set(r.email.toLowerCase().trim(), r);
    const name = `${r.firstName} ${r.lastName}`.trim();
    if (name) mbtiMap.set(name.toLowerCase().trim(), r);
  });

  const suggestions: TeamCandidateSuggestion[] = [];

  people.forEach(person => {
    // Skip if already a member of this team
    if (person.id && teamMemberIdsSet.has(person.id)) return;

    // Lookup assessments
    const pName = (person.name || '').toLowerCase().trim();
    const pEmail = (person.email || '').toLowerCase().trim();

    const giftResp = (person.id && giftsMap.get(person.id)) || (pEmail && giftsMap.get(pEmail)) || giftsMap.get(pName);
    const discResp = (person.id && discMap.get(person.id)) || (pEmail && discMap.get(pEmail)) || discMap.get(pName);
    const mbtiResp = (person.id && mbtiMap.get(person.id)) || (pEmail && mbtiMap.get(pEmail)) || mbtiMap.get(pName);

    // If person has at least one assessment completed
    if (!giftResp && !discResp && !mbtiResp) return;

    let score = 50; // Base score
    const matchingReasons: string[] = [];
    let temperamentSummary = '';

    // 1. Spiritual Gift Evaluation (+30 max)
    if (giftResp?.primaryGift) {
      const gift = giftResp.primaryGift as SpiritualGiftType;
      const giftDef = SPIRITUAL_GIFTS_DEFINITIONS[gift];

      if (domainRule.idealGifts.includes(gift)) {
        score += 30;
        matchingReasons.push(`Primary Gift of ${gift} matches ${team.name} core ministry needs.`);
      } else if (giftDef?.recommendedServingAreas?.some(area => area.toLowerCase().includes(team.name.toLowerCase()))) {
        score += 20;
        matchingReasons.push(`Spiritual Gift of ${gift} lists ${team.name} as an ideal serving area.`);
      } else {
        score += 5;
        matchingReasons.push(`Spiritual Gift of ${gift} provides secondary ministry support.`);
      }
    }

    // 2. DISC Evaluation (+20 max)
    if (discResp) {
      const styleCode = discResp.styleCode || discResp.primaryDimension || 'S';
      const primaryDim = (discResp.primaryDimension || styleCode[0] || 'S') as 'D' | 'I' | 'S' | 'C';
      const discProfile = DISC_PROFILES[styleCode];

      if (domainRule.idealDiscProfiles.includes(styleCode) || domainRule.idealDiscDimensions.includes(primaryDim)) {
        score += 20;
        matchingReasons.push(`DISC Profile (${styleCode}${discProfile ? ` - ${discProfile.name.split('(')[0].trim()}` : ''}) thrives in this team environment.`);
      } else {
        score += 5;
      }
      temperamentSummary += `DISC: ${styleCode} • `;
    }

    // 3. MBTI Evaluation (+15 max)
    if (mbtiResp?.mbtiType) {
      const mbtiType = mbtiResp.mbtiType.toUpperCase();
      const mbtiProf = MBTI_TYPE_PROFILES[mbtiType];
      const temperament = mbtiProf?.temperament;

      if (temperament && domainRule.idealMbtiTemperaments.includes(temperament)) {
        score += 15;
        matchingReasons.push(`MBTI (${mbtiType} ${temperament}) naturally brings needed cognitive balance.`);
      } else {
        score += 5;
      }
      temperamentSummary += `MBTI: ${mbtiType}`;
    }

    // 4. Serving Status Adjustment (+10 if unassigned, -15 if already overloaded)
    const isCurrentlyServing = !!(
      (person.servingStats?.last90DaysCount && person.servingStats.last90DaysCount > 0) ||
      (person.membership === 'Member' && person.status === 'active')
    );

    const currentTeams: string[] = [];
    if (person.servingStats?.recentServices) {
      person.servingStats.recentServices.forEach(rs => {
        if (rs.teamName && !currentTeams.includes(rs.teamName)) {
          currentTeams.push(rs.teamName);
        }
      });
    }

    if (!isCurrentlyServing || currentTeams.length === 0) {
      score += 10;
      matchingReasons.push('Currently unassigned to any serving team (untapped ministry talent).');
    } else if (currentTeams.length >= 3 || person.servingStats?.riskLevel === 'High') {
      score -= 15; // De-prioritize already overloaded volunteers
    }

    const finalScore = Math.max(20, Math.min(99, score));

    // Only include if score meets quality threshold (>= 65)
    if (finalScore >= 65) {
      suggestions.push({
        personId: person.id,
        personName: person.name,
        email: person.email || undefined,
        phone: person.phone || person.e164Phone || undefined,
        avatar: person.avatar || undefined,
        matchScore: finalScore,
        primaryGift: giftResp?.primaryGift,
        discStyle: discResp?.styleCode || discResp?.primaryDimension,
        mbtiType: mbtiResp?.mbtiType,
        isCurrentlyServing,
        currentTeams,
        matchingReasons: matchingReasons.slice(0, 3),
        temperamentSummary: temperamentSummary.replace(/ • $/, ''),
        suggestedRoles: domainRule.suggestedRoles
      });
    }
  });

  return suggestions.sort((a, b) => b.matchScore - a.matchScore);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Team Fit & Reallocation Advisor (Evaluating Current Team Members)
// ─────────────────────────────────────────────────────────────────────────────

export function analyzeTeamFitAndReallocations(
  teams: ServicesTeam[],
  people: PcoPerson[],
  giftsResponses: GiftsTestResponse[] = [],
  discResponses: DiscTestResponse[] = [],
  mbtiResponses: MbtiTestResponse[] = []
): TeamFitReallocation[] {
  const reallocations: TeamFitReallocation[] = [];

  const peopleMap = new Map<string, PcoPerson>();
  people.forEach(p => {
    if (p.id) peopleMap.set(p.id, p);
  });

  const giftsMap = new Map<string, GiftsTestResponse>();
  giftsResponses.forEach(r => {
    if (r.personId) giftsMap.set(r.personId, r);
    if (r.email) giftsMap.set(r.email.toLowerCase().trim(), r);
    const name = r.personName || `${r.firstName} ${r.lastName}`;
    if (name) giftsMap.set(name.toLowerCase().trim(), r);
  });

  const discMap = new Map<string, DiscTestResponse>();
  discResponses.forEach(r => {
    if (r.personId) discMap.set(r.personId, r);
    if (r.email) discMap.set(r.email.toLowerCase().trim(), r);
    const name = r.personName || `${r.firstName} ${r.lastName}`;
    if (name) discMap.set(name.toLowerCase().trim(), r);
  });

  const mbtiMap = new Map<string, MbtiTestResponse>();
  mbtiResponses.forEach(r => {
    if (r.personId) mbtiMap.set(r.personId, r);
    if (r.email) mbtiMap.set(r.email.toLowerCase().trim(), r);
    const name = `${r.firstName} ${r.lastName}`.trim();
    if (name) mbtiMap.set(name.toLowerCase().trim(), r);
  });

  teams.forEach(team => {
    (team.memberIds || []).forEach(memberId => {
      const person = peopleMap.get(memberId);
      if (!person) return;

      const pName = (person.name || '').toLowerCase().trim();
      const pEmail = (person.email || '').toLowerCase().trim();

      const giftResp = giftsMap.get(person.id) || (pEmail && giftsMap.get(pEmail)) || giftsMap.get(pName);
      const discResp = discMap.get(person.id) || (pEmail && discMap.get(pEmail)) || discMap.get(pName);
      const mbtiResp = mbtiMap.get(person.id) || (pEmail && mbtiMap.get(pEmail)) || mbtiMap.get(pName);

      // We only analyze members with assessments
      if (!giftResp && !discResp && !mbtiResp) return;

      const primaryGift = giftResp?.primaryGift as SpiritualGiftType | undefined;
      const discStyle = discResp?.styleCode || discResp?.primaryDimension;
      const mbtiType = mbtiResp?.mbtiType;

      // Diagnostic scenario 1: High Mercy / High Encouragement / Relational extrovert stuck on solitary tech / facilities
      const isRelationalSoul = primaryGift === 'Mercy' || primaryGift === 'Encouragement' || discStyle?.includes('I');
      const isSolitaryOrHighStressTeam = team.name.toLowerCase().includes('tech') || 
                                         team.name.toLowerCase().includes('audio') || 
                                         team.name.toLowerCase().includes('setup') || 
                                         team.name.toLowerCase().includes('facilities');

      // Diagnostic scenario 2: High Introvert / High Administration / High C stuck on frontline greeter / high-pressure MC
      const isAnalyticalIntrovert = (primaryGift === 'Administration' || discStyle?.includes('C')) && mbtiType?.startsWith('I');
      const isHighInterpersonalTeam = team.name.toLowerCase().includes('welcome') || 
                                      team.name.toLowerCase().includes('greeter') || 
                                      team.name.toLowerCase().includes('foyer') || 
                                      team.name.toLowerCase().includes('parking');

      if (isRelationalSoul && isSolitaryOrHighStressTeam) {
        // Recommend hospitality, care, or greeter team
        const targetTeam = teams.find(t => 
          t.id !== team.id && 
          (t.name.toLowerCase().includes('welcome') || 
           t.name.toLowerCase().includes('hospitality') || 
           t.name.toLowerCase().includes('care') || 
           t.name.toLowerCase().includes('guest'))
        );

        const recommendedTeamName = targetTeam ? targetTeam.name : 'Guest Services & Hospitality';

        reallocations.push({
          personId: person.id,
          personName: person.name,
          email: person.email || undefined,
          phone: person.phone || person.e164Phone || undefined,
          avatar: person.avatar || undefined,
          currentTeamId: team.id,
          currentTeamName: team.name,
          currentFitLevel: 'Low',
          currentFitReason: `High-empathy & relational profile (${primaryGift ? `Gift: ${primaryGift}` : ''} ${discStyle ? `DISC: ${discStyle}` : ''}) experiences social fatigue in technical teardown/isolation.`,
          recommendedTeamId: targetTeam?.id,
          recommendedTeamName,
          recommendedFitReason: `Would flourish welcoming families and newcomers with warm pastoral encouragement.`,
          primaryGift,
          discStyle,
          mbtiType,
          riskLevel: person.servingStats?.riskLevel
        });
      } else if (isAnalyticalIntrovert && isHighInterpersonalTeam) {
        // Recommend tech, administration, or check-in team
        const targetTeam = teams.find(t => 
          t.id !== team.id && 
          (t.name.toLowerCase().includes('tech') || 
           t.name.toLowerCase().includes('audio') || 
           t.name.toLowerCase().includes('check-in') || 
           t.name.toLowerCase().includes('media'))
        );

        const recommendedTeamName = targetTeam ? targetTeam.name : 'Production & Media Support';

        reallocations.push({
          personId: person.id,
          personName: person.name,
          email: person.email || undefined,
          phone: person.phone || person.e164Phone || undefined,
          avatar: person.avatar || undefined,
          currentTeamId: team.id,
          currentTeamName: team.name,
          currentFitLevel: 'Low',
          currentFitReason: `Introverted analytical temperament (${mbtiType || 'Introvert'} ${discStyle ? `DISC: ${discStyle}` : ''}) gets socially drained greeting crowds.`,
          recommendedTeamId: targetTeam?.id,
          recommendedTeamName,
          recommendedFitReason: `Detail-oriented gifts (${primaryGift || 'Administration'}) will excel in precision media, sound, or check-in logistics.`,
          primaryGift,
          discStyle,
          mbtiType,
          riskLevel: person.servingStats?.riskLevel
        });
      }
    });
  });

  return reallocations;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Team Leader Outreach Message Template Builder
// ─────────────────────────────────────────────────────────────────────────────

export function buildLeaderRecommendationTemplate(params: {
  teamName: string;
  leaderName?: string;
  candidateName: string;
  candidateGift?: string;
  candidateDisc?: string;
  candidateMbti?: string;
  candidatePhone?: string;
  candidateEmail?: string;
  matchingRationale?: string;
  isReallocation?: boolean;
  currentTeamName?: string;
  channel: 'sms' | 'email';
}): { subject: string; body: string } {
  const leaderGreeting = params.leaderName ? `Hi ${params.leaderName.split(' ')[0]}` : 'Hello Team Leader';
  const candidateTraits = [
    params.candidateGift ? `Spiritual Gift: ${params.candidateGift}` : '',
    params.candidateDisc ? `DISC: ${params.candidateDisc}` : '',
    params.candidateMbti ? `MBTI: ${params.candidateMbti}` : ''
  ].filter(Boolean).join(' | ');

  if (params.channel === 'sms') {
    if (params.isReallocation) {
      return {
        subject: `Volunteer Transfer Idea: ${params.candidateName}`,
        body: `${leaderGreeting}, our ministry team reviewed serving alignments for ${params.teamName}. We noticed ${params.candidateName} (${candidateTraits}) is currently serving on ${params.currentTeamName || 'another team'} but would be a much stronger fit for your team. Would you be open to connecting with them?`
      };
    }

    return {
      subject: `Recommended Volunteer for ${params.teamName}`,
      body: `${leaderGreeting}, our church analytics identified ${params.candidateName} as a strong candidate for ${params.teamName} (${candidateTraits}). ${params.matchingRationale || 'They have completed assessments and are ready to serve.'} Reach out or view their profile in Services!`
    };
  }

  // Email Template
  const emailSubject = params.isReallocation
    ? `Ministry Fit Recommendation for ${params.teamName}: ${params.candidateName}`
    : `Recommended Volunteer Candidate for ${params.teamName}: ${params.candidateName}`;

  const emailBody = `
${leaderGreeting},

Grace and peace to you! As we review our serving team health and upcoming service schedules for **${params.teamName}**, we wanted to recommend a wonderful volunteer match for your team.

### Candidate Profile: **${params.candidateName}**
${candidateTraits ? `- **Assessment Strengths**: ${candidateTraits}` : ''}
${params.candidatePhone ? `- **Phone**: ${params.candidatePhone}` : ''}
${params.candidateEmail ? `- **Email**: ${params.candidateEmail}` : ''}

### Why They Were Recommended:
${params.matchingRationale || 'Their spiritual gifts, behavioral temperament, and heart for service directly align with the mission of your team.'}

${params.isReallocation ? `*Note: ${params.candidateName} is currently associated with ${params.currentTeamName || 'another team'}, and our leadership team believes transitioning to ${params.teamName} would provide greater joy, longevity, and spiritual growth.*` : ''}

Please prayerfully consider reaching out to ${params.candidateName.split(' ')[0]} this week to invite them for an informal conversation or shadowing opportunity.

Blessings on your ministry leadership!
`.trim();

  return {
    subject: emailSubject,
    body: emailBody
  };
}
