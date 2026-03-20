
import { GoogleGenAI } from "@google/genai";
import { 
    AttendanceData, GivingData, PeopleDashboardData, GivingAnalytics, 
    GeoInsight, GroupsDashboardData, ServicesDashboardData, CensusStats, 
    BudgetRecord, PcoFund, GroupRiskSettings, PcoGroup, PastoralNote, PcoPerson 
} from "../types";

export const generateGlobalInsights = async (
    context: {
        people: PeopleDashboardData | null,
        giving: GivingAnalytics | null,
        groups: GroupsDashboardData | null,
        services: ServicesDashboardData | null,
        attendance: AttendanceData[],
        census: CensusStats | null,
        churchName: string
    }
): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Construct a dense summary of the church's health
    const attendanceTrend = context.attendance.slice(-4).map(a => a.attendance).join(', ');
    const growthStats = context.people ? `Total: ${context.people.stats.total}, New(30d): ${context.people.stats.newThisMonth}` : 'N/A';
    const givingStats = context.giving ? `Total: $${context.giving.totalGiving}, Donors: ${context.giving.contributingPeople}, Recurring: ${context.giving.recurringGivers}` : 'N/A';
    const groupStats = context.groups ? `Groups: ${context.groups.stats.totalGroups}, Enrolled: ${context.groups.stats.totalEnrollment}` : 'N/A';
    const volunteerStats = context.services ? `Volunteers: ${context.services.stats.uniqueVolunteers}, Open Roles: ${context.services.stats.positionsOpen}` : 'N/A';
    const censusContext = context.census ? `Loc: ${context.census.locationName}, Pop: ${context.census.totalPopulation}` : 'N/A';

    const prompt = `
    Act as an Executive Pastor Consultant. Analyze the latest data refresh for **${context.churchName}** and provide a "Executive Briefing".

    **Current Data Snapshot:**
    - **Attendance Trend (Last 4 wks):** ${attendanceTrend}
    - **People Growth:** ${growthStats}
    - **Financials:** ${givingStats}
    - **Community (Groups):** ${groupStats}
    - **Volunteers:** ${volunteerStats}
    - **Context:** ${censusContext}

    **Task:**
    Provide 3 distinct, high-impact insights. Do not summarize the numbers; interpret them.
    1. **Celebration:** What is going well? (e.g. growth, high volunteering, stable giving).
    2. **Watchout:** What is a potential risk? (e.g. donor concentration, declining attendance, low group enrollment).
    3. **Action:** One specific strategic move for this week.

    **Format:**
    Use Markdown. Use emojis for bullet points. Keep it concise (under 150 words).
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
        });
        return response.text || "Unable to generate insights.";
    } catch (error) {
        console.error("Gemini Global Insight Error:", error);
        return "The AI consultant is currently analyzing other data. Please try again later.";
    }
};

export const generateGroupsStrategy = async (
    groupsData: GroupsDashboardData,
    peopleData: PeopleDashboardData | null
): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Calculate metrics for context
    const totalAdults = peopleData?.stats.total || 1;
    const enrolled = groupsData.stats.totalEnrollment;
    const participationRate = Math.round((enrolled / totalAdults) * 100);
    const avgSize = groupsData.stats.averageGroupSize;
    const groupsCount = groupsData.stats.totalGroups;

    const prompt = `
    You are an expert in the **"Activate" Small Group System** (by Nelson Searcy). You believe in the semester-based model (Fall/Spring/Summer) and that **100% of the church should be in a group**.

    **Current Church Metrics:**
    - **Total Church Size (Adults/Attendees):** ${totalAdults}
    - **Total Group Enrollment:** ${enrolled} (${participationRate}%)
    - **Number of Groups:** ${groupsCount}
    - **Average Group Size:** ${avgSize}
    - **Group Types:** ${JSON.stringify(groupsData.groupsByType)}

    **Your Philosophy (Activate):**
    1.  **Goal:** 100% participation. Sign-ups are more important than show-ups.
    2.  **Structure:** Semester-based (10-12 weeks) with big promotion months (Feb, Sept).
    3.  **Strategy:** Multiplication happens by finding new leaders (Apprentices), not splitting groups.
    4.  **Growth:** Don't force intimacy; create environments for friendship. "Stress and Release" cycles are healthy.

    **Task:**
    Provide a strategic "Activate" analysis of the current group health.
    1.  **Participation Audit:** Evaluate the ${participationRate}% rate. If under 50%, be urgent. If under 100%, encourage the "Big Ask".
    2.  **Semester Strategy:** Recommend a specific action based on the current time of year (e.g. if it's Aug/Sept -> Promote Fall Semester; if Dec -> Rest/Release).
    3.  **Leader Multiplication:** Based on the group count (${groupsCount}) and avg size (${avgSize}), do we need more groups? Suggest how to find them (look for Coordinators).
    4.  **Ideas:** Suggest 2 creative group types based on the mix provided to attract unengaged people.

    **Format:**
    Markdown. Be encouraging but challenging. Use "Activate" terminology (Semesters, Big Ask, Coordinators).
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
        });
        return response.text || "Unable to generate groups strategy.";
    } catch (error) {
        console.error("Gemini Groups Strategy Error:", error);
        return "The Activate Agent is currently offline.";
    }
};

export const generateGroupRiskAnalysis = async (
    enrichedGroups: any[], // Passed with health status and breakdown
    settings: GroupRiskSettings
): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // 1. Analyze Distributions
    const total = enrichedGroups.length;
    const thriving = enrichedGroups.filter(g => g.health.status === 'Thriving');
    const warning = enrichedGroups.filter(g => g.health.status === 'Warning');
    const critical = enrichedGroups.filter(g => g.health.status === 'Critical');

    // 2. Identify Systemic Failures
    // Calculate average score for each component across ALL groups to see which metric is dragging the church down
    let avgAttendance = 0, avgRetention = 0, avgLeadership = 0, avgEngagement = 0;
    
    if (total > 0) {
        enrichedGroups.forEach(g => {
            const bd = g.health.breakdown || { attendance: 0, retention: 0, leadership: 0, engagement: 0 };
            avgAttendance += bd.attendance;
            avgRetention += bd.retention;
            avgLeadership += bd.leadership;
            avgEngagement += bd.engagement;
        });
        avgAttendance /= total;
        avgRetention /= total;
        avgLeadership /= total;
        avgEngagement /= total;
    }

    // 3. Find "Critical" Examples
    const criticalExamples = critical.slice(0, 3).map(g => {
        const bd = g.health.breakdown;
        let lowestFactor = 'Unknown';
        if (bd) {
            const min = Math.min(bd.attendance, bd.retention, bd.leadership, bd.engagement);
            if (min === bd.attendance) lowestFactor = 'Attendance Consistency';
            else if (min === bd.retention) lowestFactor = 'Retention (Trend)';
            else if (min === bd.leadership) lowestFactor = 'Leadership Span (Ratio)';
            else lowestFactor = 'Engagement (Serving)';
        }
        return `${g.name} (${lowestFactor})`;
    });

    const prompt = `
    Act as a Data-Driven Ministry Consultant. You are analyzing the health of Small Groups based on specific "Risk Configuration" weights.

    **Configuration:**
    - Attendance Consistency: ${settings.weights.attendanceConsistency}%
    - Retention: ${settings.weights.retention}%
    - Leadership Span: ${settings.weights.leadershipSpan}%
    - Engagement (Serving): ${settings.weights.engagement}%
    
    **Current Health Snapshot:**
    - **Total Groups:** ${total}
    - **Thriving:** ${thriving.length} (Healthy & Consistent)
    - **Warning:** ${warning.length} (Showing signs of decline)
    - **Critical:** ${critical.length} (Urgent attention needed)

    **Systemic Component Scores (Avg 0-100):**
    - Attendance: ${Math.round(avgAttendance)}
    - Retention: ${Math.round(avgRetention)}
    - Leadership Span: ${Math.round(avgLeadership)}
    - Engagement: ${Math.round(avgEngagement)}

    **Critical Groups (Examples):**
    ${criticalExamples.join(', ')}

    **Task:**
    1. **Diagnosis:** Identify the *primary* systemic weakness. Is it leadership burnout (Span), lack of consistency (Attendance), or consumerism (Engagement)?
    2. **Strategic Pivot:** Provide ONE high-level strategy to address this specific weakness.
    3. **Action Plan:** Give 3 bullet points for immediate action. One must address the "Critical" groups directly.

    **Format:**
    Markdown. Tone: Professional, Urgent but Constructive.
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
        });
        return response.text || "Risk analysis unavailable.";
    } catch (error) {
        console.error("Group Risk Analysis Error:", error);
        return "Unable to consult the risk engine at this time.";
    }
};

export const generateChurchInsights = async (
  attendance: AttendanceData[],
  giving: GivingData[]
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    As an expert church growth consultant, analyze the following data from Planning Center and provide 3-4 concise, actionable insights for church leadership.
    
    Attendance Data (Last 7 weeks):
    ${JSON.stringify(attendance)}
    
    Giving Data (Last 6 months):
    ${JSON.stringify(giving)}
    
    Focus on trends, correlation between new comers and growth, and financial health. Keep the tone professional and encouraging.
    Output should be in markdown format.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text || "Unable to generate insights at this time.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Error connecting to AI advisor. Please check your data or try again later.";
  }
};

export const generatePeopleInsights = async (
  peopleData: PeopleDashboardData
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Analyze this church demographic profile and provide 3 strategic ministry recommendations.
    
    Stats Overview:
    - Total: ${peopleData.stats.total}
    - Members: ${peopleData.stats.members}
    - Visitors: ${peopleData.stats.nonMembers}
    - New This Month: ${peopleData.stats.newThisMonth}
    
    Demographics:
    - Gender: ${JSON.stringify(peopleData.genderData)}
    - Membership Type: ${JSON.stringify(peopleData.membershipData)}
    - Age Groups: ${JSON.stringify(peopleData.ageData)}
    
    Provide insights on retention, age-based ministry opportunities, and gender engagement strategies.
    Keep the tone executive, encouraging, and brief. Output markdown.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text || "Insight engine warming up...";
  } catch (error) {
    console.error("Gemini People Error:", error);
    return "AI People Advisor currently offline.";
  }
};

export const chatWithDemographicAnalyst = async (
    question: string,
    context: PeopleDashboardData
): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const systemInstruction = `
    You are the "AI Demographic Analyst" for a church. Your goal is to provide strategic ministry insights, analyze population trends, and help leadership understand their people.

    You have access to the following real-time data:

    OVERVIEW:
    - Total People: ${context.stats.total}
    - Members: ${context.stats.members}
    - Non-Members/Visitors: ${context.stats.nonMembers}
    - New Profiles (30d): ${context.stats.newThisMonth}
    - Households: ${context.stats.households} (Avg Size: ${context.householdStats?.avgSize || 'N/A'})

    DEMOGRAPHICS:
    - Age Distribution: ${JSON.stringify(context.ageData)}
    - Gender: ${JSON.stringify(context.genderData)}
    - Membership Status: ${JSON.stringify(context.membershipData)}
    
    ENGAGEMENT (Check-ins):
    ${JSON.stringify(context.engagementData)}

    GEOGRAPHY (Top Cities):
    ${JSON.stringify(context.geoData?.byCity.slice(0, 5) || [])}

    Guidelines:
    1. Be strategic and pastoral. Focus on "Discipleship Pathways", "Reach", and "Retention".
    2. If there are many visitors but few members, suggest assimilation strategies.
    3. If there is a gap in an age group (e.g. missing young adults), highlight it.
    4. Provide concrete recommendations.
    5. Format with Markdown. Use **bold** for emphasis.
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: question,
            config: {
                systemInstruction: systemInstruction,
            },
        });
        return response.text || "I couldn't analyze the demographic data at this moment.";
    } catch (e) {
        console.error("Demographic Analyst Error", e);
        return "Connection interrupted. Please try again.";
    }
};

export const generateGivingInsights = async (
  analytics: GivingAnalytics
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Analyze the following church financial data from Planning Center Giving and provide 3 strategic insights regarding donor health and financial stability.
    
    Metrics:
    - Total Giving: $${analytics.totalGiving}
    - Unique Donors: ${analytics.contributingPeople}
    - Recurring Donors: ${analytics.recurringGivers}
    - Average Gift: $${analytics.averageGift}
    
    Funds Distribution:
    ${JSON.stringify(analytics.givingByFund)}
    
    Trends (Last periods):
    ${JSON.stringify(analytics.trends.slice(-6))}
    
    Focus on:
    1. Recurring giving percentage (stability).
    2. Fund diversity (are they too reliant on one fund?).
    3. Trend direction.
    
    Keep it executive, encouraging, and brief. Use markdown.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text || "Financial analysis unavailable.";
  } catch (error) {
    console.error("Gemini Giving Error:", error);
    return "AI Financial Advisor currently offline.";
  }
};

export const chatWithGivingAnalyst = async (
    question: string,
    context: {
        analytics: GivingAnalytics,
        budgets: BudgetRecord[],
        funds: PcoFund[]
    }
): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Calculate basic budget performance for context
    const budgetContext = context.budgets.map(b => 
        `${b.fundName} (${b.year}): Budget $${b.totalAmount}`
    ).join('\n');

    const systemInstruction = `
    You are the "AI Financial Analyst" for a church. Your goal is to provide financial recommendations, donor analysis, and stewardship strategies.
    
    You have access to the following real-time data:
    
    KEY METRICS:
    - Total Giving (Selected Period): $${context.analytics.totalGiving}
    - Previous Period Giving: $${context.analytics.previousTotalGiving}
    - Unique Donors: ${context.analytics.contributingPeople}
    - Recurring Donors: ${context.analytics.recurringGivers}
    - Median Gift: $${context.analytics.medianGift}
    
    DONOR LIFECYCLE:
    - New Donors: ${context.analytics.donorLifecycle?.new || 0}
    - Active Donors: ${context.analytics.donorLifecycle?.active || 0}
    - Lapsed Donors: ${context.analytics.donorLifecycle?.lapsed || 0}
    - At Risk Donors: ${context.analytics.atRiskGiversList.length} (Specific List: ${context.analytics.atRiskGiversList.map(d => d.name).join(', ')})
    - Top 10 Concentration: ${context.analytics.topGiverConcentration.toFixed(1)}% of total giving.
    
    FUNDS & BUDGETS:
    ${JSON.stringify(context.analytics.givingByFund)}
    
    Active Budgets:
    ${budgetContext}

    Guidelines:
    1. Be strategic and pastoral. Focus on "Stewardship" and "Discipleship" alongside the math.
    2. If giving is down, suggest specific retention strategies (e.g., contacting lapsed donors).
    3. If concentration is high (>30%), warn about risk.
    4. Provide concrete recommendations.
    5. Format with Markdown. Use **bold** for emphasis.
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: question,
            config: {
                systemInstruction: systemInstruction,
            },
        });
        return response.text || "I couldn't analyze the financial data at this moment.";
    } catch (e) {
        console.error("Giving Analyst Error", e);
        return "Connection interrupted. Please try again.";
    }
};

export const generateGroupsInsights = async (
  groupsData: GroupsDashboardData,
  peopleData: PeopleDashboardData | null,
  givingAnalytics: GivingAnalytics | null
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `
    Act as a church community health expert. Analyze the following Small Group data from Planning Center, crossing it with broader church metrics.

    Group Health Data:
    - Total Groups: ${groupsData.stats.totalGroups}
    - Total Enrollment: ${groupsData.stats.totalEnrollment} (Avg Size: ${groupsData.stats.averageGroupSize})
    - Publicly Visible Groups: ${groupsData.stats.publicGroups}
    
    Group Mix:
    ${JSON.stringify(groupsData.groupsByType)}
    
    Meeting Schedule:
    ${JSON.stringify(groupsData.groupsByDay)}

    Broader Church Context:
    - Total Congregation Size: ${peopleData?.stats.total || 'Unknown'}
    - Total Active Donors: ${givingAnalytics?.contributingPeople || 'Unknown'}
    
    Please provide 3 specific, high-level insights:
    1. **Group Health**: Evaluate the variety of group types and meeting days. Are there obvious gaps in the schedule?
    2. **The "Giver-But-Not-Attender" Gap**: Compare the Total Active Donors (${givingAnalytics?.contributingPeople || 0}) to Total Group Enrollment (${groupsData.stats.totalEnrollment}). If donors > enrollment, analyze why committed givers might not be in community.
    3. **Growth Strategy**: Suggest one concrete way to close the gap between Sunday attendance/giving and Small Group participation.

    Keep it concise, encouraging, and formatted in Markdown.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text || "Community analysis unavailable.";
  } catch (error) {
    console.error("Gemini Groups Error:", error);
    return "AI Community Analyst currently offline.";
  }
};

export const generateGeoInsights = async (
  cityData: { name: string; value: number }[]
): Promise<GeoInsight> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const topCities = cityData.slice(0, 6).map(c => `${c.name} (${c.value} people)`).join(', ');
  
  const prompt = `
    The following is a list of cities where our church members live:
    ${topCities}
    
    Using Google Maps, please provide a geographic analysis of this ministry footprint.
    1. Identify the central hub or primary location relative to these cities.
    2. Describe the commute context (e.g. major highways connecting these areas).
    3. Identify any distinct clusters or regions (e.g. "North County", "Downtown").
    
    Keep the analysis concise (under 150 words) and helpful for a pastor planning events.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
      },
    });

    const text = response.text || "No analysis generated.";
    
    // Extract Maps Grounding Chunks
    const mapLinks: { title: string; uri: string }[] = [];
    
    if (response.candidates && response.candidates[0] && response.candidates[0].groundingMetadata) {
        const chunks = response.candidates[0].groundingMetadata.groundingChunks;
        if (chunks) {
            chunks.forEach((chunk: any) => {
                if (chunk.web?.uri && chunk.web?.title) {
                    mapLinks.push({ title: chunk.web.title, uri: chunk.web.uri });
                }
            });
        }
    }

    return { text, mapLinks };

  } catch (error) {
    console.error("Gemini Maps Grounding Error:", error);
    return { 
        text: "Geographic analysis unavailable. Please try again later.", 
        mapLinks: [] 
    };
  }
};

export const generateCommunityStrategy = async (
    churchDemographics: {
        age: { range: string, count: number }[],
        gender: { name: string, value: number }[]
    },
    communityContext: {
        cities: string[],
        censusData: CensusStats[]
    }
): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Format Census data for the prompt
    const censusSummary = communityContext.censusData.map(c => `
    **${c.locationName}**:
    - Median Age: ${c.demographics?.medianAge}
    - Poverty Rate: ${c.economics?.povertyRate}%
    - Single Parent Families: ${c.families?.singleParentRate}%
    - Ethnicity: White(${c.ethnicity?.white}), Hispanic(${c.ethnicity?.hispanic}), Black(${c.ethnicity?.black}), Asian(${c.ethnicity?.asian})
    `).join('\n');

    const churchSummary = `
    **Church Demographics**:
    - Age Breakdown: ${JSON.stringify(churchDemographics.age)}
    - Gender: ${JSON.stringify(churchDemographics.gender)}
    `;

    const prompt = `
    Act as a Missional Strategist. Compare the demographics of the church with the surrounding community census data to identify "Missional Gaps".

    ${churchSummary}

    **Community Census Data (Top Member Cities):**
    ${censusSummary}

    **Task:**
    1. **Identify the Gap:** Where does the church NOT reflect the community? (e.g., Community is 40% Hispanic but church is 5%; Community is young families but church is seniors).
    2. **Strategic Focus:** Based on these gaps, where should the Pastor put focus for acquiring new people?
    3. **Actionable Strategies:** Suggest 3 specific, creative outreach strategies to reach these specific unreached demographics in these cities.

    **Format:**
    Markdown. Be bold, direct, and encouraging. Focus on opportunities.
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
        });
        return response.text || "Unable to generate community strategy.";
    } catch (e) {
        console.error("Community Strategy Error", e);
        return "Community Strategy AI is currently offline.";
    }
};

export const generateCareAdvice = async (
    notes: PastoralNote[],
    recentPeople: PcoPerson[],
    churchName: string
): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const notesSummary = notes.slice(0, 10).map(n => 
        `- ${n.personName}: ${n.type} on ${n.date}. Content: ${n.content.substring(0, 50)}...`
    ).join('\n');

    const peopleSummary = recentPeople.slice(0, 5).map(p => 
        `- ${p.name}: Joined ${new Date(p.createdAt).toLocaleDateString()}. Status: ${p.membership}`
    ).join('\n');

    const prompt = `
    Act as a Pastoral Care Advisor for **${churchName}**. Your goal is to help the pastoral team prioritize their care efforts.

    **Recent Care Log Entries:**
    ${notesSummary || 'No recent notes.'}

    **New People (Last 30 days):**
    ${peopleSummary || 'No new people.'}

    **Task:**
    1. **Prioritize:** Based on the care log, who needs a follow-up this week? (Look for Crisis, Hospital, or old follow-up dates).
    2. **Assimilation:** Suggest one care-focused touchpoint for the new people to help them feel welcome.
    3. **Encouragement:** Give the pastoral team a brief word of encouragement based on their recent activity.

    **Format:**
    Markdown. Keep it brief (under 150 words). Use emojis.
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
        });
        return response.text || "Care advice unavailable.";
    } catch (e) {
        console.error("Care Advice Error", e);
        return "The Care Advisor is currently away.";
    }
};

export const askPastorAI = async (
    question: string,
    context: {
        people?: PeopleDashboardData | null,
        giving?: GivingAnalytics | null,
        groups?: GroupsDashboardData | null,
        services?: ServicesDashboardData | null,
        attendance?: AttendanceData[],
        census?: CensusStats | null,
        churchName?: string
    }
): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Construct a context summary to feed into the system instruction
    const peopleSummary = context.people ? `
    PEOPLE:
    - Total: ${context.people.stats.total} (Members: ${context.people.stats.members}, Visitors: ${context.people.stats.nonMembers})
    - New This Month: ${context.people.stats.newThisMonth}
    - Age Demographics: ${JSON.stringify(context.people.ageData)}
    - Membership: ${JSON.stringify(context.people.membershipData)}
    - Upcoming Anniversaries: ${JSON.stringify(context.people.upcomingAnniversaries.map(p => `${p.name} (${p.anniversary})`))}
    ` : 'PEOPLE: No data available.';

    const givingSummary = context.giving ? `
    GIVING:
    - Total Period: $${context.giving.totalGiving} from ${context.giving.contributingPeople} donors.
    - Recurring Donors: ${context.giving.recurringGivers}
    - Avg Gift: $${context.giving.averageGift}
    - Fund Breakdown: ${JSON.stringify(context.giving.givingByFund)}
    - Top Donors (Anonymized Context): ${context.giving.topGiversList.length} top donors tracked.
    ` : 'GIVING: No data available.';

    const groupsSummary = context.groups ? `
    GROUPS:
    - Total Groups: ${context.groups.stats.totalGroups} (Enrolled: ${context.groups.stats.totalEnrollment})
    - Avg Size: ${context.groups.stats.averageGroupSize}
    - Types: ${JSON.stringify(context.groups.groupsByType)}
    ` : 'GROUPS: No data available.';

    const servicesSummary = context.services ? `
    SERVICES:
    - Plans: ${context.services.stats.totalPlans}
    - Volunteers: ${context.services.stats.uniqueVolunteers} (Filled: ${context.services.stats.positionsFilled}, Open: ${context.services.stats.positionsOpen})
    - Top Songs: ${JSON.stringify(context.services.topSongs.slice(0, 5))}
    ` : 'SERVICES: No data available.';

    const attendanceSummary = context.attendance ? `
    ATTENDANCE:
    - Last 7 entries: ${JSON.stringify(context.attendance.slice(-7))}
    ` : 'ATTENDANCE: No data available.';

    const censusSummary = context.census ? `
    COMMUNITY CONTEXT (Census):
    - Location: ${context.census.locationName}
    - Pop: ${context.census.totalPopulation}
    - Income: $${context.census.economics?.medianHouseholdIncome}
    - Demographics: ${JSON.stringify(context.census.ethnicity)}
    ` : 'COMMUNITY: No census data.';

    const systemInstruction = `
    You are Pastor AI, an intelligent, encouraging, and data-driven administrative assistant for ${context.churchName || 'the church'}.
    
    Your goal is to answer questions based strictly on the provided real-time data snapshot.
    
    Here is the current data context for the church:
    ${peopleSummary}
    ${givingSummary}
    ${groupsSummary}
    ${servicesSummary}
    ${attendanceSummary}
    ${censusSummary}

    Guidelines:
    1. Be concise, professional, and pastoral in tone.
    2. Use the data provided. If the answer isn't in the data, say "I don't have that specific data right now."
    3. If asked to draft content (emails, announcements), use the context to make it relevant.
    4. Format your response in Markdown (use lists, bold text for key figures).
    5. Highlight trends where visible (e.g., if attendance is trending up or down).
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: question,
            config: {
                systemInstruction: systemInstruction,
            },
        });
        return response.text || "I couldn't generate a response at this time.";
    } catch (e) {
        console.error("Pastor AI Error", e);
        return "I'm having trouble connecting to my knowledge base right now. Please try again.";
    }
};
