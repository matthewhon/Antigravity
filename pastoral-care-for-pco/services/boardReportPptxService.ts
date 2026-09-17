import pptxgen from 'pptxgenjs';

export interface BoardReportExportData {
    churchName: string;
    year: number;
    cohortLabel: string;
    cohortDescription: string;
    cohortSize: number;
    totalPeopleCount: number;
    
    // KPIs
    attendance: {
        cohortAvgWeekly: number;
        totalAvgWeekly: number;
        attYoYChange: number;
    };
    financials: {
        operatingActual: number;
        ytdBudgetTarget: number;
        variancePct: number;
        varianceAmount: number;
        designatedActual: number;
        operatingYoYChange: number;
        operatingFundNames: string[];
    };
    averageGift: {
        cohortAvg: number;
        churchWideAvg: number;
        avgGiftYoYChange: number;
    };
    groups: {
        cohortRate: number;
        cohortCount: number;
        allRate: number;
    };
    nextGen: {
        weeklyAvgKids: number;
        uniqueKidsCount: number;
        familyRetentionRate: number;
        kidsPctOfTotal: number;
    };
    pastoralCare: {
        completedTouches: number;
        totalTouches: number;
        shepherdingCoveragePct: number;
        vulnerableContactedCount: number;
        vulnerableTotal: number;
        careVelocityDays: number;
    };
    volunteerSustainability: {
        forwardRosterFillPct: number;
        highFatigueCount: number;
        burnoutConsecutive: number;
        highCapacityServices: number;
    };
    spiritualGifts: {
        adoptionPct: number;
        assessedCount: number;
        giftDeploymentRate: number;
        topGiftsText: string;
    };
    riskDistribution: {
        healthyPct: number;
        healthyCount: number;
        atRiskPct: number;
        atRiskCount: number;
        disconnectedPct: number;
        disconnectedCount: number;
    };
    visitorFunnel: {
        firstVisitCount: number;
        secondVisitCount: number;
        assimilatedCount: number;
        conversionRate: number;
        stalledCount: number;
    };
    engagementTiers: {
        corePct: number;
        coreCount: number;
        regularPct: number;
        regularCount: number;
        casualPct: number;
        casualCount: number;
        fadingPct: number;
        fadingCount: number;
    };
    insights: string[];
}

export const generateBoardReportPresentation = async (data: BoardReportExportData): Promise<void> => {
    const pres = new pptxgen();
    pres.layout = 'LAYOUT_16x9';
    pres.author = 'Barnabas AI';
    pres.company = data.churchName;
    pres.title = `${data.churchName} - Board Health Report FY${data.year}`;

    // Color Palette
    const NAVY = '0F172A';
    const SLATE = '1E293B';
    const LIGHT_BG = 'F8FAFC';
    const CARD_BG = 'FFFFFF';
    const PRIMARY_BLUE = '4F46E5'; // Indigo 600
    const ACCENT_EMERALD = '059669'; // Emerald 600
    const ACCENT_AMBER = 'D97706'; // Amber 600
    const ACCENT_ROSE = 'E11D48'; // Rose 600
    const ACCENT_VIOLET = '7C3AED'; // Violet 600
    const TEXT_DARK = '0F172A';
    const TEXT_MUTED = '64748B';
    const BORDER_COLOR = 'CBD5E1';

    const addHeader = (slide: pptxgen.Slide, title: string, category: string = 'EXECUTIVE BOARD REPORT') => {
        slide.background = { color: LIGHT_BG };
        
        // Category / Subtitle
        slide.addText(category.toUpperCase(), {
            x: 0.8,
            y: 0.4,
            w: 8.0,
            h: 0.3,
            fontSize: 10,
            bold: true,
            color: PRIMARY_BLUE,
            fontFace: 'Arial'
        });

        // Main Slide Title
        slide.addText(title, {
            x: 0.8,
            y: 0.65,
            w: 8.5,
            h: 0.5,
            fontSize: 20,
            bold: true,
            color: TEXT_DARK,
            fontFace: 'Arial'
        });

        // Church & Cohort Pill in top right
        slide.addText(`${data.churchName} • FY${data.year} (${data.cohortLabel})`, {
            x: 7.5,
            y: 0.4,
            w: 5.0,
            h: 0.3,
            fontSize: 10,
            align: 'right',
            color: TEXT_MUTED,
            fontFace: 'Arial'
        });

        // Header separator line
        slide.addShape(pres.ShapeType.line, {
            x: 0.8,
            y: 1.2,
            w: 11.7,
            h: 0,
            line: { color: BORDER_COLOR, width: 1 }
        });
    };

    // ──────────────────────────────────────────────────────────────────────────
    // SLIDE 1: Title Slide (Dark Navy)
    // ──────────────────────────────────────────────────────────────────────────
    const slide1 = pres.addSlide();
    slide1.background = { color: NAVY };

    // Badge
    slide1.addShape(pres.ShapeType.roundRect, {
        x: 1.0,
        y: 1.5,
        w: 2.8,
        h: 0.45,
        rectRadius: 0.2,
        fill: { color: '312E81' },
        line: { color: '6366F1', width: 1 }
    });
    slide1.addText('BARNABAS AI EXECUTIVE REPORT', {
        x: 1.0,
        y: 1.5,
        w: 2.8,
        h: 0.45,
        fontSize: 10,
        bold: true,
        color: 'A5B4FC',
        align: 'center',
        valign: 'middle'
    });

    // Church Name & Main Title
    slide1.addText(data.churchName, {
        x: 1.0,
        y: 2.2,
        w: 11.0,
        h: 0.8,
        fontSize: 34,
        bold: true,
        color: 'FFFFFF',
        fontFace: 'Arial'
    });
    slide1.addText(`Executive & Board Health Briefing • Fiscal Year ${data.year}`, {
        x: 1.0,
        y: 3.0,
        w: 11.0,
        h: 0.5,
        fontSize: 18,
        color: '94A3B8',
        fontFace: 'Arial'
    });

    // Metadata Card
    slide1.addShape(pres.ShapeType.roundRect, {
        x: 1.0,
        y: 4.2,
        w: 11.3,
        h: 1.8,
        rectRadius: 0.15,
        fill: { color: SLATE },
        line: { color: '334155', width: 1 }
    });

    slide1.addText([
        { text: 'Active Cohort Scope: ', options: { bold: true, color: 'FFFFFF' } },
        { text: `${data.cohortLabel}\n`, options: { color: '818CF8', bold: true } },
        { text: `${data.cohortDescription}\n\n`, options: { color: '94A3B8', fontSize: 11 } },
        { text: `Cohort Members: ${data.cohortSize.toLocaleString()} profiles (${((data.cohortSize / Math.max(data.totalPeopleCount, 1)) * 100).toFixed(1)}% of ${data.totalPeopleCount.toLocaleString()} total database contacts)`, options: { color: 'E2E8F0', fontSize: 11 } }
    ], {
        x: 1.3,
        y: 4.4,
        w: 10.7,
        h: 1.4,
        fontSize: 13,
        valign: 'top'
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SLIDE 2: Executive Scorecard
    // ──────────────────────────────────────────────────────────────────────────
    const slide2 = pres.addSlide();
    addHeader(slide2, '1. Executive KPI Scorecard', 'VITAL HEALTH PILLARS');

    const cardData = [
        {
            title: 'Weekly Attendance',
            value: `${data.attendance.cohortAvgWeekly.toLocaleString()}`,
            sub: `${data.attendance.attYoYChange >= 0 ? '+' : ''}${Math.round(data.attendance.attYoYChange)}% YoY`,
            detail: `Church Total: ${data.attendance.totalAvgWeekly.toLocaleString()}/wk`,
            color: PRIMARY_BLUE
        },
        {
            title: 'Operating Giving (YTD)',
            value: `$${Math.round(data.financials.operatingActual).toLocaleString()}`,
            sub: `${data.financials.variancePct >= 0 ? '+' : ''}${data.financials.variancePct}% vs Budget`,
            detail: `Designated: $${Math.round(data.financials.designatedActual).toLocaleString()}`,
            color: ACCENT_EMERALD
        },
        {
            title: 'Average Gift',
            value: `$${data.averageGift.cohortAvg.toLocaleString()}`,
            sub: `${data.averageGift.avgGiftYoYChange >= 0 ? '+' : ''}${Math.round(data.averageGift.avgGiftYoYChange)}% YoY`,
            detail: `Church Avg: $${data.averageGift.churchWideAvg.toLocaleString()}/gift`,
            color: ACCENT_AMBER
        },
        {
            title: 'Group Assimilation',
            value: `${data.groups.cohortRate}%`,
            sub: `${data.groups.cohortCount} in groups`,
            detail: `Whole DB: ${data.groups.allRate}%`,
            color: ACCENT_ROSE
        }
    ];

    cardData.forEach((c, idx) => {
        const xPos = 0.8 + idx * 2.95;
        slide2.addShape(pres.ShapeType.roundRect, {
            x: xPos,
            y: 1.6,
            w: 2.75,
            h: 4.6,
            rectRadius: 0.15,
            fill: { color: CARD_BG },
            line: { color: BORDER_COLOR, width: 1 }
        });

        // Top Color Bar
        slide2.addShape(pres.ShapeType.roundRect, {
            x: xPos,
            y: 1.6,
            w: 2.75,
            h: 0.15,
            rectRadius: 0.05,
            fill: { color: c.color }
        });

        slide2.addText(c.title.toUpperCase(), {
            x: xPos + 0.2,
            y: 1.9,
            w: 2.35,
            h: 0.4,
            fontSize: 10,
            bold: true,
            color: TEXT_MUTED
        });

        slide2.addText(c.value, {
            x: xPos + 0.2,
            y: 2.4,
            w: 2.35,
            h: 0.8,
            fontSize: 26,
            bold: true,
            color: TEXT_DARK
        });

        slide2.addText(c.sub, {
            x: xPos + 0.2,
            y: 3.3,
            w: 2.35,
            h: 0.4,
            fontSize: 12,
            bold: true,
            color: c.color
        });

        slide2.addShape(pres.ShapeType.line, {
            x: xPos + 0.2,
            y: 4.5,
            w: 2.35,
            h: 0,
            line: { color: 'E2E8F0', width: 1 }
        });

        slide2.addText(c.detail, {
            x: xPos + 0.2,
            y: 4.8,
            w: 2.35,
            h: 0.6,
            fontSize: 11,
            color: TEXT_MUTED
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SLIDE 3: Operating Budget Pacing & Financial Health
    // ──────────────────────────────────────────────────────────────────────────
    const slide3 = pres.addSlide();
    addHeader(slide3, '2. Operating Budget vs. Actual Giving Pacing', 'FINANCIAL STEWARDSHIP');

    // Left Summary Card
    slide3.addShape(pres.ShapeType.roundRect, {
        x: 0.8,
        y: 1.5,
        w: 5.6,
        h: 4.8,
        rectRadius: 0.15,
        fill: { color: CARD_BG },
        line: { color: BORDER_COLOR, width: 1 }
    });

    slide3.addText('Operating Budget Performance (YTD)', {
        x: 1.1,
        y: 1.8,
        w: 5.0,
        h: 0.4,
        fontSize: 14,
        bold: true,
        color: TEXT_DARK
    });

    slide3.addText([
        { text: 'YTD Budget Target: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `$${Math.round(data.financials.ytdBudgetTarget).toLocaleString()}\n\n`, options: { bold: true, color: TEXT_DARK } },
        { text: 'Operating Giving Actual: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `$${Math.round(data.financials.operatingActual).toLocaleString()}\n\n`, options: { bold: true, color: ACCENT_EMERALD } },
        { text: 'Budget Pace Variance: ', options: { bold: true, color: TEXT_MUTED } },
        { 
            text: `${data.financials.variancePct >= 0 ? '+' : ''}$${Math.round(Math.abs(data.financials.varianceAmount)).toLocaleString()} (${data.financials.variancePct >= 0 ? '+' : ''}${data.financials.variancePct}%)\n\n`, 
            options: { bold: true, color: data.financials.variancePct >= 0 ? ACCENT_EMERALD : ACCENT_ROSE } 
        },
        { text: 'YoY Operating Giving Growth: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.financials.operatingYoYChange >= 0 ? '+' : ''}${data.financials.operatingYoYChange}% YoY\n`, options: { bold: true, color: PRIMARY_BLUE } }
    ], {
        x: 1.1,
        y: 2.3,
        w: 5.0,
        h: 3.5,
        fontSize: 12
    });

    // Right Breakdown Card: Operating Funds vs Designated
    slide3.addShape(pres.ShapeType.roundRect, {
        x: 6.7,
        y: 1.5,
        w: 5.8,
        h: 4.8,
        rectRadius: 0.15,
        fill: { color: CARD_BG },
        line: { color: BORDER_COLOR, width: 1 }
    });

    slide3.addText('Operating Funds vs Designated Giving', {
        x: 7.0,
        y: 1.8,
        w: 5.2,
        h: 0.4,
        fontSize: 14,
        bold: true,
        color: TEXT_DARK
    });

    slide3.addText([
        { text: 'Active Operating Funds in Budget:\n', options: { bold: true, color: PRIMARY_BLUE, fontSize: 12 } },
        { text: `${data.financials.operatingFundNames.join(', ') || 'General / Ministry Operating'}\n\n`, options: { color: TEXT_MUTED, fontSize: 11 } },
        { text: 'Designated & Restricted Campaigns:\n', options: { bold: true, color: ACCENT_AMBER, fontSize: 12 } },
        { text: `Total Designated Giving: $${Math.round(data.financials.designatedActual).toLocaleString()}\n`, options: { bold: true, color: TEXT_DARK, fontSize: 12 } },
        { text: 'Includes Missions, Building Fund, Benevolence, and Youth Camp registrations.', options: { color: TEXT_MUTED, fontSize: 11 } }
    ], {
        x: 7.0,
        y: 2.3,
        w: 5.2,
        h: 3.5,
        fontSize: 12
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SLIDE 4: NextGen & Pastoral Shepherding
    // ──────────────────────────────────────────────────────────────────────────
    const slide4 = pres.addSlide();
    addHeader(slide4, '3. NextGen Vitality & Pastoral Shepherding', 'FAMILY & CARE VELOCITY');

    // Left: NextGen
    slide4.addShape(pres.ShapeType.roundRect, {
        x: 0.8,
        y: 1.5,
        w: 5.6,
        h: 4.8,
        rectRadius: 0.15,
        fill: { color: CARD_BG },
        line: { color: BORDER_COLOR, width: 1 }
    });
    slide4.addText('NextGen & Family Vitality', {
        x: 1.1,
        y: 1.8,
        w: 5.0,
        h: 0.4,
        fontSize: 14,
        bold: true,
        color: TEXT_DARK
    });
    slide4.addText([
        { text: 'Weekly Avg NextGen Attendance: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.nextGen.weeklyAvgKids.toLocaleString()} kids/wk\n\n`, options: { bold: true, color: PRIMARY_BLUE } },
        { text: 'Share of Church Attendance: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.nextGen.kidsPctOfTotal}% of total Sunday congregation\n\n`, options: { bold: true, color: ACCENT_EMERALD } },
        { text: 'Active Children in DB: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.nextGen.uniqueKidsCount.toLocaleString()} children\n\n`, options: { bold: true, color: TEXT_DARK } },
        { text: 'Family Retention Rate (≥2x/mo): ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.nextGen.familyRetentionRate}% consistent family stickiness`, options: { bold: true, color: ACCENT_EMERALD } }
    ], {
        x: 1.1,
        y: 2.4,
        w: 5.0,
        h: 3.5,
        fontSize: 12
    });

    // Right: Pastoral Care
    slide4.addShape(pres.ShapeType.roundRect, {
        x: 6.7,
        y: 1.5,
        w: 5.8,
        h: 4.8,
        rectRadius: 0.15,
        fill: { color: CARD_BG },
        line: { color: BORDER_COLOR, width: 1 }
    });
    slide4.addText('Pastoral Shepherding Velocity', {
        x: 7.0,
        y: 1.8,
        w: 5.2,
        h: 0.4,
        fontSize: 14,
        bold: true,
        color: TEXT_DARK
    });
    slide4.addText([
        { text: 'Completed Pastoral Touches: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.pastoralCare.completedTouches} of ${data.pastoralCare.totalTouches} care sessions\n\n`, options: { bold: true, color: PRIMARY_BLUE } },
        { text: 'Vulnerable Member Coverage: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.pastoralCare.shepherdingCoveragePct}% reached\n`, options: { bold: true, color: ACCENT_EMERALD } },
        { text: `(${data.pastoralCare.vulnerableContactedCount} of ${data.pastoralCare.vulnerableTotal} At-Risk/Disconnected contacted in 60d)\n\n`, options: { color: TEXT_MUTED, fontSize: 11 } },
        { text: 'Care Response Velocity: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.pastoralCare.careVelocityDays} days avg time to pastoral contact`, options: { bold: true, color: TEXT_DARK } }
    ], {
        x: 7.0,
        y: 2.4,
        w: 5.2,
        h: 3.5,
        fontSize: 12
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SLIDE 5: Volunteer Sustainability & Spiritual Gifts
    // ──────────────────────────────────────────────────────────────────────────
    const slide5 = pres.addSlide();
    addHeader(slide5, '4. Volunteer Fatigue & Spiritual Gifts Alignment', 'MOBILIZATION & CAPACITY');

    // Left: Volunteer Sustainability
    slide5.addShape(pres.ShapeType.roundRect, {
        x: 0.8,
        y: 1.5,
        w: 5.6,
        h: 4.8,
        rectRadius: 0.15,
        fill: { color: CARD_BG },
        line: { color: BORDER_COLOR, width: 1 }
    });
    slide5.addText('Volunteer Sustainability & Capacity', {
        x: 1.1,
        y: 1.8,
        w: 5.0,
        h: 0.4,
        fontSize: 14,
        bold: true,
        color: TEXT_DARK
    });
    slide5.addText([
        { text: 'Forward 3-Week Roster Fill Rate: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.volunteerSustainability.forwardRosterFillPct}%\n\n`, options: { bold: true, color: ACCENT_EMERALD } },
        { text: 'Burnout Watch Alerts: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.volunteerSustainability.highFatigueCount} volunteers\n`, options: { bold: true, color: data.volunteerSustainability.highFatigueCount > 0 ? ACCENT_AMBER : ACCENT_EMERALD } },
        { text: `(Exceeding >${data.volunteerSustainability.burnoutConsecutive} consecutive Sundays served)\n\n`, options: { color: TEXT_MUTED, fontSize: 11 } },
        { text: 'Room & Facility Bottlenecks: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.volunteerSustainability.highCapacityServices > 0 ? `${data.volunteerSustainability.highCapacityServices} services over capacity` : '0 facility capacity bottlenecks'}`, options: { bold: true, color: TEXT_DARK } }
    ], {
        x: 1.1,
        y: 2.4,
        w: 5.0,
        h: 3.5,
        fontSize: 12
    });

    // Right: Spiritual Gifts
    slide5.addShape(pres.ShapeType.roundRect, {
        x: 6.7,
        y: 1.5,
        w: 5.8,
        h: 4.8,
        rectRadius: 0.15,
        fill: { color: CARD_BG },
        line: { color: BORDER_COLOR, width: 1 }
    });
    slide5.addText('Spiritual Gifts & Assessment Alignment', {
        x: 7.0,
        y: 1.8,
        w: 5.2,
        h: 0.4,
        fontSize: 14,
        bold: true,
        color: TEXT_DARK
    });
    slide5.addText([
        { text: 'Assessment Adoption Rate: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.spiritualGifts.adoptionPct}% (${data.spiritualGifts.assessedCount} assessed)\n\n`, options: { bold: true, color: ACCENT_VIOLET } },
        { text: 'Ministry Placement Alignment: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.spiritualGifts.giftDeploymentRate}% serving in gift-matching teams\n\n`, options: { bold: true, color: ACCENT_EMERALD } },
        { text: 'Top Congregational Spiritual Gifts:\n', options: { bold: true, color: TEXT_DARK } },
        { text: `${data.spiritualGifts.topGiftsText}`, options: { color: ACCENT_VIOLET, bold: true } }
    ], {
        x: 7.0,
        y: 2.4,
        w: 5.2,
        h: 3.5,
        fontSize: 12
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SLIDE 6: Member Risk Distribution & Visitor Funnel
    // ──────────────────────────────────────────────────────────────────────────
    const slide6 = pres.addSlide();
    addHeader(slide6, '5. Risk Distribution & Visitor Assimilation', 'RETENTION & INTEGRATION');

    // Left: Risk Distribution
    slide6.addShape(pres.ShapeType.roundRect, {
        x: 0.8,
        y: 1.5,
        w: 5.6,
        h: 4.8,
        rectRadius: 0.15,
        fill: { color: CARD_BG },
        line: { color: BORDER_COLOR, width: 1 }
    });
    slide6.addText('Congregational Risk Breakdown', {
        x: 1.1,
        y: 1.8,
        w: 5.0,
        h: 0.4,
        fontSize: 14,
        bold: true,
        color: TEXT_DARK
    });
    slide6.addText([
        { text: `Healthy: ${data.riskDistribution.healthyPct}% (${data.riskDistribution.healthyCount.toLocaleString()} profiles)\n`, options: { bold: true, color: ACCENT_EMERALD } },
        { text: 'Consistent attendance, small group, giving, or active serving.\n\n', options: { color: TEXT_MUTED, fontSize: 11 } },
        { text: `At Risk: ${data.riskDistribution.atRiskPct}% (${data.riskDistribution.atRiskCount.toLocaleString()} profiles)\n`, options: { bold: true, color: ACCENT_AMBER } },
        { text: 'Declining attendance or lapse in group connection.\n\n', options: { color: TEXT_MUTED, fontSize: 11 } },
        { text: `Disconnected: ${data.riskDistribution.disconnectedPct}% (${data.riskDistribution.disconnectedCount.toLocaleString()} profiles)\n`, options: { bold: true, color: ACCENT_ROSE } },
        { text: 'Zero attendance or engagement in the last 60–90 days.', options: { color: TEXT_MUTED, fontSize: 11 } }
    ], {
        x: 1.1,
        y: 2.4,
        w: 5.0,
        h: 3.5,
        fontSize: 12
    });

    // Right: Visitor Funnel
    slide6.addShape(pres.ShapeType.roundRect, {
        x: 6.7,
        y: 1.5,
        w: 5.8,
        h: 4.8,
        rectRadius: 0.15,
        fill: { color: CARD_BG },
        line: { color: BORDER_COLOR, width: 1 }
    });
    slide6.addText('Visitor Assimilation Funnel (90 Days)', {
        x: 7.0,
        y: 1.8,
        w: 5.2,
        h: 0.4,
        fontSize: 14,
        bold: true,
        color: TEXT_DARK
    });
    slide6.addText([
        { text: '1st-Time Guests: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.visitorFunnel.firstVisitCount} new visitors\n\n`, options: { bold: true, color: PRIMARY_BLUE } },
        { text: '2nd Visit Return Rate: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.visitorFunnel.conversionRate}% (${data.visitorFunnel.secondVisitCount} returned)\n\n`, options: { bold: true, color: ACCENT_EMERALD } },
        { text: 'Fully Assimilated (Joined/Groups/Serving): ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.visitorFunnel.assimilatedCount} members\n\n`, options: { bold: true, color: ACCENT_EMERALD } },
        { text: 'Stalled Guests Requiring Outreach: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.visitorFunnel.stalledCount} guests`, options: { bold: true, color: data.visitorFunnel.stalledCount > 5 ? ACCENT_AMBER : TEXT_DARK } }
    ], {
        x: 7.0,
        y: 2.4,
        w: 5.2,
        h: 3.5,
        fontSize: 12
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SLIDE 7: Strategic Insights & Elder Takeaways
    // ──────────────────────────────────────────────────────────────────────────
    const slide7 = pres.addSlide();
    addHeader(slide7, '6. Strategic Insights & Executive Takeaways', 'AI MINISTRY RECOMMENDATIONS');

    slide7.addShape(pres.ShapeType.roundRect, {
        x: 0.8,
        y: 1.5,
        w: 11.7,
        h: 4.8,
        rectRadius: 0.15,
        fill: { color: CARD_BG },
        line: { color: BORDER_COLOR, width: 1 }
    });

    const bulletItems = data.insights.map(item => ({
        text: `• ${item}\n\n`,
        options: { fontSize: 13, color: TEXT_DARK, bold: false }
    }));

    slide7.addText(bulletItems, {
        x: 1.2,
        y: 1.9,
        w: 10.9,
        h: 4.0,
        valign: 'top'
    });

    // Generate & download PPTX
    const filename = `${data.churchName.replace(/[^a-zA-Z0-9]/g, '_')}_Board_Report_FY${data.year}.pptx`;
    await pres.writeFile({ fileName: filename });
};
