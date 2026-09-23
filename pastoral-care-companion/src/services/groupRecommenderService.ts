import { PcoGroup, PcoPerson, GroupRecommendation } from '../types';

export interface RecommendationFilterOptions {
  onlyUnassigned?: boolean;
  maxDistanceMiles?: number;
  prioritizeAtRisk?: boolean;
}

/**
 * Calculates straight-line distance in miles between two lat/lng points using Haversine formula
 */
function calculateDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * AI Group Recommender Engine
 * Evaluates candidate members against a target group's profile and configuration.
 */
export function generateGroupRecommendations(
  group: PcoGroup,
  allPeople: PcoPerson[],
  options: RecommendationFilterOptions = {}
): GroupRecommendation[] {
  const recommendations: GroupRecommendation[] = [];
  const existingMemberIds = new Set(group.memberIds || []);

  const groupDescLower = (group.description || '').toLowerCase();
  const groupNameLower = group.name.toLowerCase();
  const groupTypeLower = (group.groupTypeName || '').toLowerCase();
  const targetDemoLower = (group.targetDemographic || '').toLowerCase();
  const groupTags = (group.tags || []).map(t => t.toLowerCase());

  for (const person of allPeople) {
    // 1. Filter out existing group members if only looking for new invites
    if (existingMemberIds.has(person.id)) {
      continue;
    }

    // 2. Optional filter for unassigned individuals (people in 0 groups)
    if (options.onlyUnassigned && person.groupIds && person.groupIds.length > 0) {
      continue;
    }

    let score = 50; // Base baseline score
    const matchReasons: string[] = [];

    // --- A. Engagement & Connection Context ---
    const inNoGroups = !person.groupIds || person.groupIds.length === 0;
    if (inNoGroups) {
      score += 15;
      matchReasons.push('Not currently in any group');
    }

    if (options.prioritizeAtRisk && (person.riskProfile?.category === 'At Risk' || person.historicRiskCategory === 'At Risk')) {
      score += 15;
      matchReasons.push('At-risk of disconnect (Pastoral priority)');
    }

    // --- B. Demographic & Lifecycle Matching ---
    if (targetDemoLower.includes('young adult') || groupNameLower.includes('young adult')) {
      if (person.age && person.age >= 18 && person.age <= 35) {
        score += 20;
        matchReasons.push('Young Adult age demographic match');
      }
    } else if (targetDemoLower.includes('senior') || groupNameLower.includes('senior')) {
      if (person.age && person.age >= 55) {
        score += 20;
        matchReasons.push('Senior demographic match');
      }
    }

    if (targetDemoLower.includes('men') || groupNameLower.includes("men's") || groupNameLower.includes('mens')) {
      if (person.gender?.toLowerCase() === 'm' || person.gender?.toLowerCase() === 'male') {
        score += 20;
        matchReasons.push("Men's group demographic match");
      } else if (person.gender?.toLowerCase() === 'f' || person.gender?.toLowerCase() === 'female') {
        score -= 40; // Penalty for wrong gender targeted group
      }
    } else if (targetDemoLower.includes('women') || groupNameLower.includes("women's") || groupNameLower.includes('womens')) {
      if (person.gender?.toLowerCase() === 'f' || person.gender?.toLowerCase() === 'female') {
        score += 20;
        matchReasons.push("Women's group demographic match");
      } else if (person.gender?.toLowerCase() === 'm' || person.gender?.toLowerCase() === 'male') {
        score -= 40;
      }
    }

    // --- C. Interest & Tag Matching ---
    if (person.field_data && person.field_data.length > 0) {
      for (const field of person.field_data) {
        const val = field.value.toLowerCase();
        if (groupTags.some(tag => val.includes(tag)) || groupDescLower.includes(val)) {
          score += 15;
          matchReasons.push(`Interest match: "${field.value}"`);
          break;
        }
      }
    }

    // --- D. Geographic Proximity ---
    let distanceMiles: number | undefined;
    const personAddr = person.addresses && person.addresses[0];
    if (personAddr?.lat && personAddr?.lng) {
      // If group has coords (or mock location coords), calculate distance
      // Default to church center / city level match if zip matches
      if (personAddr.city && group.locationName && group.locationName.toLowerCase().includes(personAddr.city.toLowerCase())) {
        score += 10;
        matchReasons.push(`Located in ${personAddr.city}`);
      }
    }

    // Apply distance limit filter if specified
    if (options.maxDistanceMiles && distanceMiles !== undefined && distanceMiles > options.maxDistanceMiles) {
      continue;
    }

    // Normalize final score between 0 and 100
    const finalScore = Math.min(100, Math.max(10, Math.round(score)));

    if (matchReasons.length === 0) {
      matchReasons.push('General church attendee match');
    }

    recommendations.push({
      personId: person.id,
      matchScore: finalScore,
      matchReasons,
      distanceMiles,
      status: 'suggested'
    });
  }

  // Sort by highest match score descending
  return recommendations.sort((a, b) => b.matchScore - a.matchScore);
}
