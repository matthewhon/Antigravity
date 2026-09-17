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
    monthlyTrend: {
        month: string;
        giving: number;
        priorGiving: number;
        attendance: number;
    }[];
    recurringGiving: {
        recurringPercent: number;
        oneTimePercent: number;
        recurringTotal: number;
        oneTimeTotal: number;
    };
    stewardshipDepth: {
        activeGiverCount: number;
        participationRate: number;
        concentrationPct: number;
        onlinePct: number;
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
        distribution: { gift: string; count: number }[];
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
    
    // Explicit 13.33 x 7.5 Widescreen Layout
    pres.defineLayout({ name: 'WIDE_16_9', width: 13.33, height: 7.5 });
    pres.layout = 'WIDE_16_9';
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
            y: 0.35,
            w: 7.5,
            h: 0.25,
            fontSize: 9,
            bold: true,
            color: PRIMARY_BLUE,
            fontFace: 'Arial'
        });

        // Main Slide Title
        slide.addText(title, {
            x: 0.8,
            y: 0.6,
            w: 8.0,
            h: 0.45,
            fontSize: 18,
            bold: true,
            color: TEXT_DARK,
            fontFace: 'Arial'
        });

        // Church & Cohort in top right
        slide.addText(`${data.churchName} • FY${data.year} (${data.cohortLabel})`, {
            x: 7.5,
            y: 0.45,
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
            y: 1.15,
            w: 11.7,
            h: 0,
            line: { color: BORDER_COLOR, width: 1 }
        });
    };

    // ──────────────────────────────────────────────────────────────────────────
    // SLIDE 1: Title Slide (Dark Executive Theme)
    // ──────────────────────────────────────────────────────────────────────────
    const slide1 = pres.addSlide();
    slide1.background = { color: NAVY };

    // Badge
    slide1.addShape(pres.ShapeType.roundRect, {
        x: 1.0,
        y: 1.2,
        w: 3.0,
        h: 0.4,
        rectRadius: 0.1,
        fill: { color: '312E81' },
        line: { color: '6366F1', width: 1 }
    });
    slide1.addText('BARNABAS AI EXECUTIVE REPORT', {
        x: 1.0,
        y: 1.2,
        w: 3.0,
        h: 0.4,
        fontSize: 10,
        bold: true,
        color: 'A5B4FC',
        align: 'center',
        valign: 'middle'
    });

    // Church Name & Main Title
    slide1.addText(data.churchName, {
        x: 1.0,
        y: 1.9,
        w: 11.3,
        h: 0.8,
        fontSize: 32,
        bold: true,
        color: 'FFFFFF',
        fontFace: 'Arial'
    });
    slide1.addText(`Executive & Board Health Briefing • Fiscal Year ${data.year}`, {
        x: 1.0,
        y: 2.7,
        w: 11.3,
        h: 0.5,
        fontSize: 18,
        color: '94A3B8',
        fontFace: 'Arial'
    });

    // Metadata Card
    slide1.addShape(pres.ShapeType.roundRect, {
        x: 1.0,
        y: 3.6,
        w: 11.3,
        h: 2.8,
        rectRadius: 0.15,
        fill: { color: SLATE },
        line: { color: '334155', width: 1 }
    });

    slide1.addText([
        { text: 'Active Cohort Scope: ', options: { bold: true, color: 'FFFFFF', fontSize: 13 } },
        { text: `${data.cohortLabel}\n`, options: { color: '818CF8', bold: true, fontSize: 13 } },
        { text: `${data.cohortDescription}\n\n`, options: { color: '94A3B8', fontSize: 11 } },
        { text: 'Reporting Methodology:\n', options: { bold: true, color: 'FFFFFF', fontSize: 12 } },
        { text: `• Cohort Size: ${data.cohortSize.toLocaleString()} individuals (${((data.cohortSize / Math.max(data.totalPeopleCount, 1)) * 100).toFixed(1)}% of ${data.totalPeopleCount.toLocaleString()} total database profiles)\n`, options: { color: 'CBD5E1', fontSize: 11 } },
        { text: `• Operating Budget Pacing: Filtered strictly to ${data.financials.operatingFundNames.length || 1} active operating funds (Designated giving separated)\n`, options: { color: 'CBD5E1', fontSize: 11 } },
        { text: `• Generated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} • Confidential Board Copy`, options: { color: '94A3B8', fontSize: 10 } }
    ], {
        x: 1.3,
        y: 3.8,
        w: 10.7,
        h: 2.4,
        valign: 'top'
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SLIDE 2: Executive Scorecard
    // ──────────────────────────────────────────────────────────────────────────
    const slide2 = pres.addSlide();
    addHeader(slide2, '1. Executive Scorecard & Core KPIs', 'VITAL HEALTH PILLARS');

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
            y: 1.4,
            w: 2.8,
            h: 5.4,
            rectRadius: 0.15,
            fill: { color: CARD_BG },
            line: { color: BORDER_COLOR, width: 1 }
        });

        // Top Accent Strip
        slide2.addShape(pres.ShapeType.roundRect, {
            x: xPos,
            y: 1.4,
            w: 2.8,
            h: 0.12,
            rectRadius: 0.05,
            fill: { color: c.color }
        });

        slide2.addText(c.title.toUpperCase(), {
            x: xPos + 0.2,
            y: 1.7,
            w: 2.4,
            h: 0.4,
            fontSize: 10,
            bold: true,
            color: TEXT_MUTED
        });

        slide2.addText(c.value, {
            x: xPos + 0.2,
            y: 2.3,
            w: 2.4,
            h: 0.8,
            fontSize: 26,
            bold: true,
            color: TEXT_DARK
        });

        slide2.addText(c.sub, {
            x: xPos + 0.2,
            y: 3.3,
            w: 2.4,
            h: 0.4,
            fontSize: 13,
            bold: true,
            color: c.color
        });

        slide2.addShape(pres.ShapeType.line, {
            x: xPos + 0.2,
            y: 4.6,
            w: 2.4,
            h: 0,
            line: { color: 'E2E8F0', width: 1 }
        });

        slide2.addText(c.detail, {
            x: xPos + 0.2,
            y: 4.9,
            w: 2.4,
            h: 0.8,
            fontSize: 11,
            color: TEXT_MUTED
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SLIDE 3: Operating Budget Pacing & 12-Month Revenue Chart
    // ──────────────────────────────────────────────────────────────────────────
    const slide3 = pres.addSlide();
    addHeader(slide3, '2. Operating Budget vs. Actual Pacing', 'FINANCIAL STEWARDSHIP');

    // Left Summary Card
    slide3.addShape(pres.ShapeType.roundRect, {
        x: 0.8,
        y: 1.4,
        w: 5.2,
        h: 5.4,
        rectRadius: 0.15,
        fill: { color: CARD_BG },
        line: { color: BORDER_COLOR, width: 1 }
    });

    slide3.addText('Operating Budget Performance', {
        x: 1.1,
        y: 1.6,
        w: 4.6,
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
        { text: 'Designated & Restricted Giving: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `$${Math.round(data.financials.designatedActual).toLocaleString()}\n\n`, options: { bold: true, color: PRIMARY_BLUE } },
        { text: 'Active Operating Funds:\n', options: { bold: true, color: TEXT_DARK } },
        { text: `${data.financials.operatingFundNames.join(', ') || 'General Ministry Budget'}`, options: { color: TEXT_MUTED, fontSize: 10 } }
    ], {
        x: 1.1,
        y: 2.1,
        w: 4.6,
        h: 4.4,
        fontSize: 11
    });

    // Right Native Area/Line Chart: 12-Month Trajectory
    if (data.monthlyTrend && data.monthlyTrend.length > 0) {
        slide3.addChart(
            pres.ChartType.line,
            [
                {
                    name: `FY${data.year} Operating Giving`,
                    labels: data.monthlyTrend.map(m => m.month),
                    values: data.monthlyTrend.map(m => m.giving)
                },
                {
                    name: 'Prior Year Giving',
                    labels: data.monthlyTrend.map(m => m.month),
                    values: data.monthlyTrend.map(m => m.priorGiving)
                }
            ],
            {
                x: 6.3,
                y: 1.4,
                w: 6.2,
                h: 5.4,
                showLegend: true,
                legendPos: 't',
                chartColors: ['4F46E5', '94A3B8'],
                lineDataSymbol: 'circle',
                lineDataSymbolSize: 5,
                fill: 'FFFFFF',
                line: { color: 'CBD5E1', width: 1 },
                title: '12-Month Giving Trajectory vs Prior Year',
                titleFontSize: 12,
                titleColor: TEXT_DARK
            }
        );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SLIDE 4: Stewardship Depth & Giver Pipeline
    // ──────────────────────────────────────────────────────────────────────────
    const slide4 = pres.addSlide();
    addHeader(slide4, '3. Stewardship Depth & Recurring Sustainability', 'FINANCIAL PIPELINE');

    // Left: Native Doughnut Chart of Recurring vs One-time
    slide4.addChart(
        pres.ChartType.doughnut,
        [
            {
                name: 'Giving Frequency',
                labels: ['Automated Recurring', 'One-Time / Plate'],
                values: [data.recurringGiving.recurringPercent, data.recurringGiving.oneTimePercent]
            }
        ],
        {
            x: 0.8,
            y: 1.4,
            w: 5.5,
            h: 5.4,
            showLegend: true,
            legendPos: 'b',
            chartColors: ['059669', '64748B'],
            holeSize: 55,
            showValue: true,
            fill: 'FFFFFF',
            line: { color: 'CBD5E1', width: 1 },
            title: 'Stewardship Sustainability (Recurring vs One-Time)',
            titleFontSize: 12,
            titleColor: TEXT_DARK
        }
    );

    // Right: Giver Pipeline Card
    slide4.addShape(pres.ShapeType.roundRect, {
        x: 6.6,
        y: 1.4,
        w: 5.9,
        h: 5.4,
        rectRadius: 0.15,
        fill: { color: CARD_BG },
        line: { color: BORDER_COLOR, width: 1 }
    });
    slide4.addText('Giver Pipeline & Concentration Health', {
        x: 6.9,
        y: 1.7,
        w: 5.3,
        h: 0.4,
        fontSize: 14,
        bold: true,
        color: TEXT_DARK
    });
    slide4.addText([
        { text: 'Active Unique Givers: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.stewardshipDepth.activeGiverCount.toLocaleString()} donors\n\n`, options: { bold: true, color: TEXT_DARK } },
        { text: 'Giving Participation Rate: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.stewardshipDepth.participationRate}% of active cohort\n\n`, options: { bold: true, color: ACCENT_EMERALD } },
        { text: 'Digital / Online Giving Rate: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.stewardshipDepth.onlinePct}% of total donations\n\n`, options: { bold: true, color: PRIMARY_BLUE } },
        { text: 'Top 10% Donor Concentration: ', options: { bold: true, color: TEXT_MUTED } },
        { 
            text: `${data.stewardshipDepth.concentrationPct}%\n`, 
            options: { bold: true, color: data.stewardshipDepth.concentrationPct > 60 ? ACCENT_AMBER : ACCENT_EMERALD } 
        },
        { 
            text: data.stewardshipDepth.concentrationPct > 60 
                ? '⚠️ High concentration risk: Top 10% of households drive the majority of revenue.' 
                : 'Healthy donor distribution across congregation.',
            options: { color: TEXT_MUTED, fontSize: 10 } 
        }
    ], {
        x: 6.9,
        y: 2.3,
        w: 5.3,
        h: 4.2,
        fontSize: 11
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SLIDE 5: NextGen & Family Vitality
    // ──────────────────────────────────────────────────────────────────────────
    const slide5 = pres.addSlide();
    addHeader(slide5, '4. NextGen & Family Vitality', 'FAMILY DISCIPLESHIP');

    // Left: NextGen Metrics Card
    slide5.addShape(pres.ShapeType.roundRect, {
        x: 0.8,
        y: 1.4,
        w: 5.5,
        h: 5.4,
        rectRadius: 0.15,
        fill: { color: CARD_BG },
        line: { color: BORDER_COLOR, width: 1 }
    });
    slide5.addText('NextGen & Family Stickiness', {
        x: 1.1,
        y: 1.7,
        w: 4.9,
        h: 0.4,
        fontSize: 14,
        bold: true,
        color: TEXT_DARK
    });
    slide5.addText([
        { text: 'Weekly Avg Kids Attendance: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.nextGen.weeklyAvgKids.toLocaleString()} kids/wk\n\n`, options: { bold: true, color: PRIMARY_BLUE } },
        { text: 'Share of Sunday Attendance: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.nextGen.kidsPctOfTotal}% of total Sunday congregation\n\n`, options: { bold: true, color: ACCENT_EMERALD } },
        { text: 'Unique Children in Database: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.nextGen.uniqueKidsCount.toLocaleString()} children\n\n`, options: { bold: true, color: TEXT_DARK } },
        { text: 'Family Retention Rate (≥2x/mo): ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.nextGen.familyRetentionRate}%\n`, options: { bold: true, color: ACCENT_EMERALD } },
        { text: 'Consistent attendance among families with children.', options: { color: TEXT_MUTED, fontSize: 10 } }
    ], {
        x: 1.1,
        y: 2.3,
        w: 4.9,
        h: 4.2,
        fontSize: 11
    });

    // Right: Native Bar Chart for NextGen vs Adults
    slide5.addChart(
        pres.ChartType.bar,
        [
            {
                name: 'Weekly Attendance',
                labels: ['NextGen (Kids/Youth)', 'Adult Attendance', 'Total Church'],
                values: [
                    data.nextGen.weeklyAvgKids, 
                    Math.max(data.attendance.totalAvgWeekly - data.nextGen.weeklyAvgKids, 0),
                    data.attendance.totalAvgWeekly
                ]
            }
        ],
        {
            x: 6.6,
            y: 1.4,
            w: 5.9,
            h: 5.4,
            showLegend: false,
            chartColors: ['059669', '4F46E5', '0F172A'],
            barDir: 'col',
            showValue: true,
            fill: 'FFFFFF',
            line: { color: 'CBD5E1', width: 1 },
            title: 'Weekly Attendance Composition',
            titleFontSize: 12,
            titleColor: TEXT_DARK
        }
    );

    // ──────────────────────────────────────────────────────────────────────────
    // SLIDE 6: Pastoral Shepherding & Care Velocity
    // ──────────────────────────────────────────────────────────────────────────
    const slide6 = pres.addSlide();
    addHeader(slide6, '5. Pastoral Shepherding & Care Velocity', 'CARE & OUTREACH');

    // Left: Shepherding Card
    slide6.addShape(pres.ShapeType.roundRect, {
        x: 0.8,
        y: 1.4,
        w: 5.5,
        h: 5.4,
        rectRadius: 0.15,
        fill: { color: CARD_BG },
        line: { color: BORDER_COLOR, width: 1 }
    });
    slide6.addText('Pastoral Outreach & Response', {
        x: 1.1,
        y: 1.7,
        w: 4.9,
        h: 0.4,
        fontSize: 14,
        bold: true,
        color: TEXT_DARK
    });
    slide6.addText([
        { text: 'Completed Pastoral Touches: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.pastoralCare.completedTouches} of ${data.pastoralCare.totalTouches} sessions\n\n`, options: { bold: true, color: PRIMARY_BLUE } },
        { text: 'Vulnerable Member Coverage: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.pastoralCare.shepherdingCoveragePct}% reached\n`, options: { bold: true, color: ACCENT_EMERALD } },
        { text: `(${data.pastoralCare.vulnerableContactedCount} of ${data.pastoralCare.vulnerableTotal} At-Risk / Disconnected contacted in 60d)\n\n`, options: { color: TEXT_MUTED, fontSize: 10 } },
        { text: 'Average Care Velocity: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.pastoralCare.careVelocityDays} days avg time to pastoral contact\n\n`, options: { bold: true, color: TEXT_DARK } },
        { text: 'Outreach Target: ', options: { bold: true, color: TEXT_MUTED } },
        { text: 'Aim for ≥80% coverage on vulnerable profiles each month.', options: { color: TEXT_MUTED, fontSize: 10 } }
    ], {
        x: 1.1,
        y: 2.3,
        w: 4.9,
        h: 4.2,
        fontSize: 11
    });

    // Right: Native Doughnut Chart of Shepherding Coverage
    slide6.addChart(
        pres.ChartType.doughnut,
        [
            {
                name: 'Vulnerable Profiles',
                labels: ['Shepherded (Contacted)', 'Pending Outreach'],
                values: [
                    data.pastoralCare.vulnerableContactedCount, 
                    Math.max(data.pastoralCare.vulnerableTotal - data.pastoralCare.vulnerableContactedCount, 0)
                ]
            }
        ],
        {
            x: 6.6,
            y: 1.4,
            w: 5.9,
            h: 5.4,
            showLegend: true,
            legendPos: 'b',
            chartColors: ['059669', 'D97706'],
            holeSize: 50,
            showValue: true,
            fill: 'FFFFFF',
            line: { color: 'CBD5E1', width: 1 },
            title: 'Pastoral Coverage on Vulnerable Members',
            titleFontSize: 12,
            titleColor: TEXT_DARK
        }
    );

    // ──────────────────────────────────────────────────────────────────────────
    // SLIDE 7: Volunteer Sustainability & Capacity
    // ──────────────────────────────────────────────────────────────────────────
    const slide7 = pres.addSlide();
    addHeader(slide7, '6. Volunteer Sustainability & Capacity Health', 'SERVING MOBILIZATION');

    // Left: Volunteer Stats Card
    slide7.addShape(pres.ShapeType.roundRect, {
        x: 0.8,
        y: 1.4,
        w: 5.5,
        h: 5.4,
        rectRadius: 0.15,
        fill: { color: CARD_BG },
        line: { color: BORDER_COLOR, width: 1 }
    });
    slide7.addText('Serving Health & Capacity Indicators', {
        x: 1.1,
        y: 1.7,
        w: 4.9,
        h: 0.4,
        fontSize: 14,
        bold: true,
        color: TEXT_DARK
    });
    slide7.addText([
        { text: '3-Week Forward Roster Fill: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.volunteerSustainability.forwardRosterFillPct}%\n\n`, options: { bold: true, color: ACCENT_EMERALD } },
        { text: 'Burnout Watch Alerts: ', options: { bold: true, color: TEXT_MUTED } },
        { 
            text: `${data.volunteerSustainability.highFatigueCount} volunteers\n`, 
            options: { bold: true, color: data.volunteerSustainability.highFatigueCount > 0 ? ACCENT_AMBER : ACCENT_EMERALD } 
        },
        { text: `(Serving >${data.volunteerSustainability.burnoutConsecutive} consecutive Sundays without rotation)\n\n`, options: { color: TEXT_MUTED, fontSize: 10 } },
        { text: 'Facility Capacity Bottlenecks: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.volunteerSustainability.highCapacityServices > 0 ? `${data.volunteerSustainability.highCapacityServices} services over capacity` : '0 facility bottlenecks'}\n\n`, options: { bold: true, color: TEXT_DARK } },
        { text: 'Target Thresholds: ', options: { bold: true, color: TEXT_MUTED } },
        { text: 'Maintain Roster Fill ≥85% and rotation rest after 3 consecutive weeks.', options: { color: TEXT_MUTED, fontSize: 10 } }
    ], {
        x: 1.1,
        y: 2.3,
        w: 4.9,
        h: 4.2,
        fontSize: 11
    });

    // Right: Native Bar Chart for Roster Health
    slide7.addChart(
        pres.ChartType.bar,
        [
            {
                name: 'Percentage',
                labels: ['Roster Fill Rate', 'Benchmark Target', 'Burnout Safety'],
                values: [
                    data.volunteerSustainability.forwardRosterFillPct,
                    85,
                    Math.max(100 - (data.volunteerSustainability.highFatigueCount * 5), 60)
                ]
            }
        ],
        {
            x: 6.6,
            y: 1.4,
            w: 5.9,
            h: 5.4,
            showLegend: false,
            chartColors: ['059669', '4F46E5', 'D97706'],
            barDir: 'col',
            showValue: true,
            fill: 'FFFFFF',
            line: { color: 'CBD5E1', width: 1 },
            title: 'Roster Fill Rate vs Benchmark (%)',
            titleFontSize: 12,
            titleColor: TEXT_DARK
        }
    );

    // ──────────────────────────────────────────────────────────────────────────
    // SLIDE 8: Spiritual Gifts & Discipleship Alignment
    // ──────────────────────────────────────────────────────────────────────────
    const slide8 = pres.addSlide();
    addHeader(slide8, '7. Spiritual Gifts & Discipleship Mobilization', 'GIFT ALIGNMENT');

    // Left: Alignment Card
    slide8.addShape(pres.ShapeType.roundRect, {
        x: 0.8,
        y: 1.4,
        w: 5.5,
        h: 5.4,
        rectRadius: 0.15,
        fill: { color: CARD_BG },
        line: { color: BORDER_COLOR, width: 1 }
    });
    slide8.addText('Assessment Adoption & Ministry Placement', {
        x: 1.1,
        y: 1.7,
        w: 4.9,
        h: 0.4,
        fontSize: 14,
        bold: true,
        color: TEXT_DARK
    });
    slide8.addText([
        { text: 'Assessment Adoption Rate: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.spiritualGifts.adoptionPct}% (${data.spiritualGifts.assessedCount} assessed)\n\n`, options: { bold: true, color: ACCENT_VIOLET } },
        { text: 'Ministry Placement Alignment: ', options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.spiritualGifts.giftDeploymentRate}%\n`, options: { bold: true, color: ACCENT_EMERALD } },
        { text: 'Percentage of assessed individuals serving on gift-aligned teams.\n\n', options: { color: TEXT_MUTED, fontSize: 10 } },
        { text: 'Top Congregational Spiritual Gifts:\n', options: { bold: true, color: TEXT_DARK } },
        { text: `${data.spiritualGifts.topGiftsText}\n\n`, options: { color: ACCENT_VIOLET, bold: true } },
        { text: 'Discipleship Goal: ', options: { bold: true, color: TEXT_MUTED } },
        { text: 'Deploy every assessed member into their primary spiritual gift area.', options: { color: TEXT_MUTED, fontSize: 10 } }
    ], {
        x: 1.1,
        y: 2.3,
        w: 4.9,
        h: 4.2,
        fontSize: 11
    });

    // Right: Native Bar Chart of Spiritual Gifts Distribution
    if (data.spiritualGifts.distribution && data.spiritualGifts.distribution.length > 0) {
        slide8.addChart(
            pres.ChartType.bar,
            [
                {
                    name: 'Assessed Count',
                    labels: data.spiritualGifts.distribution.map(d => d.gift),
                    values: data.spiritualGifts.distribution.map(d => d.count)
                }
            ],
            {
                x: 6.6,
                y: 1.4,
                w: 5.9,
                h: 5.4,
                showLegend: false,
                chartColors: ['7C3AED'],
                barDir: 'col',
                showValue: true,
                fill: 'FFFFFF',
                line: { color: 'CBD5E1', width: 1 },
                title: 'Congregational Spiritual Gifts Distribution',
                titleFontSize: 12,
                titleColor: TEXT_DARK
            }
        );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SLIDE 9: Member Risk Distribution & Visitor Assimilation
    // ──────────────────────────────────────────────────────────────────────────
    const slide9 = pres.addSlide();
    addHeader(slide9, '8. Risk Distribution & Visitor Assimilation', 'RETENTION & CONVERSION');

    // Left: Native Doughnut Chart of Risk Distribution
    slide9.addChart(
        pres.ChartType.doughnut,
        [
            {
                name: 'Congregation Risk',
                labels: [
                    `Healthy (${data.riskDistribution.healthyPct}%)`,
                    `At Risk (${data.riskDistribution.atRiskPct}%)`,
                    `Disconnected (${data.riskDistribution.disconnectedPct}%)`
                ],
                values: [
                    data.riskDistribution.healthyPct,
                    data.riskDistribution.atRiskPct,
                    data.riskDistribution.disconnectedPct
                ]
            }
        ],
        {
            x: 0.8,
            y: 1.4,
            w: 5.5,
            h: 5.4,
            showLegend: true,
            legendPos: 'b',
            chartColors: ['059669', 'D97706', 'E11D48'],
            holeSize: 50,
            showValue: true,
            fill: 'FFFFFF',
            line: { color: 'CBD5E1', width: 1 },
            title: 'Congregational Risk Breakdown',
            titleFontSize: 12,
            titleColor: TEXT_DARK
        }
    );

    // Right: Native Bar Chart for Visitor Funnel
    slide9.addChart(
        pres.ChartType.bar,
        [
            {
                name: 'Visitors',
                labels: ['1st-Time Guests', '2nd Visit Return', 'Fully Assimilated'],
                values: [
                    data.visitorFunnel.firstVisitCount,
                    data.visitorFunnel.secondVisitCount,
                    data.visitorFunnel.assimilatedCount
                ]
            }
        ],
        {
            x: 6.6,
            y: 1.4,
            w: 5.9,
            h: 5.4,
            showLegend: false,
            chartColors: ['4F46E5', '7C3AED', '059669'],
            barDir: 'col',
            showValue: true,
            fill: 'FFFFFF',
            line: { color: 'CBD5E1', width: 1 },
            title: `Visitor Funnel (Conversion: ${data.visitorFunnel.conversionRate}%)`,
            titleFontSize: 12,
            titleColor: TEXT_DARK
        }
    );

    // ──────────────────────────────────────────────────────────────────────────
    // SLIDE 10: Congregational Engagement Tiers
    // ──────────────────────────────────────────────────────────────────────────
    const slide10 = pres.addSlide();
    addHeader(slide10, '9. Congregational Engagement Tiers', 'ATTENDANCE PATTERNS');

    // Left: Engagement Tiers Overview Card
    slide10.addShape(pres.ShapeType.roundRect, {
        x: 0.8,
        y: 1.4,
        w: 5.5,
        h: 5.4,
        rectRadius: 0.15,
        fill: { color: CARD_BG },
        line: { color: BORDER_COLOR, width: 1 }
    });
    slide10.addText('Attendance Engagement Breakdown', {
        x: 1.1,
        y: 1.7,
        w: 4.9,
        h: 0.4,
        fontSize: 14,
        bold: true,
        color: TEXT_DARK
    });
    slide10.addText([
        { text: `Core Attenders (3–4x/mo): `, options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.engagementTiers.corePct}% (${data.engagementTiers.coreCount.toLocaleString()})\n\n`, options: { bold: true, color: ACCENT_EMERALD } },
        { text: `Regular Attenders (2x/mo): `, options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.engagementTiers.regularPct}% (${data.engagementTiers.regularCount.toLocaleString()})\n\n`, options: { bold: true, color: PRIMARY_BLUE } },
        { text: `Casual Attenders (1x/mo): `, options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.engagementTiers.casualPct}% (${data.engagementTiers.casualCount.toLocaleString()})\n\n`, options: { bold: true, color: ACCENT_AMBER } },
        { text: `Fading / Infrequent: `, options: { bold: true, color: TEXT_MUTED } },
        { text: `${data.engagementTiers.fadingPct}% (${data.engagementTiers.fadingCount.toLocaleString()})\n\n`, options: { bold: true, color: ACCENT_ROSE } },
        { text: 'Health Benchmark: ', options: { bold: true, color: TEXT_DARK } },
        { text: 'Healthy congregations target Core ≥ 40% and Fading ≤ 15%.', options: { color: TEXT_MUTED, fontSize: 10 } }
    ], {
        x: 1.1,
        y: 2.3,
        w: 4.9,
        h: 4.2,
        fontSize: 11
    });

    // Right: Native Bar Chart of Engagement Tiers
    slide10.addChart(
        pres.ChartType.bar,
        [
            {
                name: 'Congregation %',
                labels: ['Core (3-4x/mo)', 'Regular (2x/mo)', 'Casual (1x/mo)', 'Fading'],
                values: [
                    data.engagementTiers.corePct,
                    data.engagementTiers.regularPct,
                    data.engagementTiers.casualPct,
                    data.engagementTiers.fadingPct
                ]
            }
        ],
        {
            x: 6.6,
            y: 1.4,
            w: 5.9,
            h: 5.4,
            showLegend: false,
            chartColors: ['059669', '4F46E5', 'D97706', 'E11D48'],
            barDir: 'col',
            showValue: true,
            fill: 'FFFFFF',
            line: { color: 'CBD5E1', width: 1 },
            title: 'Attendance Frequency Breakdown (%)',
            titleFontSize: 12,
            titleColor: TEXT_DARK
        }
    );

    // ──────────────────────────────────────────────────────────────────────────
    // SLIDE 11: Strategic Insights & Elder Takeaways
    // ──────────────────────────────────────────────────────────────────────────
    const slide11 = pres.addSlide();
    addHeader(slide11, '10. Strategic Insights & Executive Takeaways', 'AI MINISTRY RECOMMENDATIONS');

    slide11.addShape(pres.ShapeType.roundRect, {
        x: 0.8,
        y: 1.4,
        w: 11.7,
        h: 5.4,
        rectRadius: 0.15,
        fill: { color: CARD_BG },
        line: { color: BORDER_COLOR, width: 1 }
    });

    const bulletItems = data.insights.map((item, i) => ({
        text: `${i + 1}. ${item}\n\n`,
        options: { fontSize: 12, color: TEXT_DARK, bold: false }
    }));

    slide11.addText(bulletItems, {
        x: 1.2,
        y: 1.8,
        w: 10.9,
        h: 4.6,
        valign: 'top'
    });

    // Generate & download PPTX
    const filename = `${data.churchName.replace(/[^a-zA-Z0-9]/g, '_')}_Board_Report_FY${data.year}.pptx`;
    await pres.writeFile({ fileName: filename });
};
