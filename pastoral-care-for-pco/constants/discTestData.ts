// ─────────────────────────────────────────────────────────────────────────────
// Faith-Based DISC Personality Assessment
// Grounded in King James Version (KJV) Scripture & Baptist Theological Distinctives
// ─────────────────────────────────────────────────────────────────────────────

export type DiscDimension = 'D' | 'I' | 'S' | 'C';

export interface DiscQuestion {
  id: number;
  dimension: DiscDimension;
  trait: string;
  text: string;
  biblicalContext: string;
  kjvReference: string;
}

export interface DiscStyleProfile {
  code: string; // e.g. "D", "DI", "DC", "I", "IS", "ID", "S", "SC", "SI", "C", "CS", "CD"
  name: string; // e.g. "The Bold Pioneer (High Dominance)"
  primaryDimension: DiscDimension;
  secondaryDimension?: DiscDimension;
  themeVerseKjv: {
    verse: string;
    text: string;
  };
  summary: string;
  fullDescription: string;
  biblicalExemplar: {
    name: string;
    description: string;
    kjvPassage: string;
  };
  baptistMinistryStrengths: string[];
  idealServingRoles: string[];
  spiritualGrowthAreas: string[];
  communicationTips: string;
  color: string;
  badgeBg: string;

  // ── Extended 3-Part Report Fields ──────────────────────────────
  workStyleTendencies: string[]; // Optimal ministry/work environments
  motivations: string[]; // What spiritually energizes and drives this profile
  stressors: string[]; // What drains energy, causes frustration, or leads to burnout
  communicationPreferences: {
    howYouSpeak: string; // Expressive outward voice
    howToSpeakToYou: string; // How pastors/leaders/peers should communicate with you
  };
  styleToStyleStrategies: {
    withD: string; // Interaction strategy with High Dominance
    withI: string; // Interaction strategy with High Influence
    withS: string; // Interaction strategy with High Steadiness
    withC: string; // Interaction strategy with High Conscientiousness
  };
  biblicalActionPrinciples: string[]; // Practical scriptural action & conflict resolution principles
}

export interface DiscFoundationalOverview {
  dimension: DiscDimension;
  name: string;
  title: string;
  motto: string;
  color: string;
  bgLight: string;
  bgDark: string;
  textColor: string;
  borderColor: string;
  kjvScripture: { verse: string; text: string };
  behavioralLens: string;
  coreStrengths: string[];
  blindSpots: string[];
  inTheBodyOfChrist: string;
}

export const DISC_FOUNDATIONAL_INFO: Record<DiscDimension, DiscFoundationalOverview> = {
  'D': {
    dimension: 'D',
    name: 'Dominance',
    title: 'The Decisive & Pioneering Driver',
    motto: 'Direct, Goal-Oriented, Pioneering, Bold in Action',
    color: '#ef4444',
    bgLight: 'bg-red-50 text-red-700',
    bgDark: 'dark:bg-red-950/40 dark:text-red-300',
    textColor: 'text-red-600 dark:text-red-400',
    borderColor: 'border-red-200 dark:border-red-800',
    kjvScripture: {
      verse: '1 Corinthians 16:13 (KJV)',
      text: 'Watch ye, stand fast in the faith, quit you like men, be strong.'
    },
    behavioralLens: 'Sees the church through the lens of challenges to overcome, vision to achieve, and kingdom frontiers to advance.',
    coreStrengths: [
      'Decisive crisis leadership and initiative',
      'Courageous defense of biblical truth',
      'Goal-oriented execution and overcoming roadblocks',
      'Mobilizing church growth and expansion projects'
    ],
    blindSpots: [
      'Can appear impatient or blunt with gentler members',
      'May move ahead before praying through counsel',
      'Risk of steamrolling slower, thoughtful consensus'
    ],
    inTheBodyOfChrist: 'God places High D believers in the church to cast courageous vision, lead difficult outreach projects, and ensure the congregation moves boldly forward in obedience to the Great Commission.'
  },
  'I': {
    dimension: 'I',
    name: 'Influence',
    title: 'The Inspiring & Relational Connector',
    motto: 'Enthusiastic, Relational, Encouraging, Friendly in Outreach',
    color: '#f59e0b',
    bgLight: 'bg-amber-50 text-amber-700',
    bgDark: 'dark:bg-amber-950/40 dark:text-amber-300',
    textColor: 'text-amber-600 dark:text-amber-400',
    borderColor: 'border-amber-200 dark:border-amber-800',
    kjvScripture: {
      verse: 'Proverbs 18:24 (KJV)',
      text: 'A man that hath friends must shew himself friendly: and there is a friend that sticketh closer than a brother.'
    },
    behavioralLens: 'Sees the church through the lens of people, joy, fellowship, and winning souls through genuine warmth.',
    coreStrengths: [
      'Evangelistic zeal and warm hospitality',
      'Connecting newcomers and making people feel loved',
      'Inspiring, upbeat communication from the stage or in groups',
      'Fostering joyful, welcoming church culture'
    ],
    blindSpots: [
      'May avoid solemn or difficult confrontation',
      'Prone to overcommitting and dropping administrative details',
      'Can seek approval of men over faithful obedience'
    ],
    inTheBodyOfChrist: 'God places High I believers in the church to bring warmth, joy, and evangelistic magnetism, ensuring no newcomer feels isolated and that the body rejoices together in the Lord.'
  },
  'S': {
    dimension: 'S',
    name: 'Steadiness',
    title: 'The Faithful & Supportive Cornerstone',
    motto: 'Loyal, Patient, Peaceful, Dependable in Service',
    color: '#10b981',
    bgLight: 'bg-emerald-50 text-emerald-700',
    bgDark: 'dark:bg-emerald-950/40 dark:text-emerald-300',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
    kjvScripture: {
      verse: '1 Corinthians 15:58 (KJV)',
      text: 'Therefore, my beloved brethren, be ye stedfast, unmoveable, always abounding in the work of the Lord, forasmuch as ye know that your labour is not in vain in the Lord.'
    },
    behavioralLens: 'Sees the church through the lens of faithful service, loving relationships, calm stability, and quiet loyalty.',
    coreStrengths: [
      'Unfailing weekly dependability and humble service',
      'Compassionate listening and emotional support',
      'Calming presence during seasons of church change',
      'Faithful behind-the-scenes execution of vital duties'
    ],
    blindSpots: [
      'Hesitation to embrace necessary change or risk',
      'Tendency to bottle up personal frustrations',
      'Reluctance to step into public leadership when called'
    ],
    inTheBodyOfChrist: 'God places High S believers in the church as the dependable pillars who preserve unity, care for the hurting, and faithfully carry out the week-to-week ministries that sustain the congregation.'
  },
  'C': {
    dimension: 'C',
    name: 'Conscientiousness',
    title: 'The Discerning & Doctrinal Guardian',
    motto: 'Systematic, Accurate, Doctrinally Sound, Orderly in Stewardship',
    color: '#3b82f6',
    bgLight: 'bg-blue-50 text-blue-700',
    bgDark: 'dark:bg-blue-950/40 dark:text-blue-300',
    textColor: 'text-blue-600 dark:text-blue-400',
    borderColor: 'border-blue-200 dark:border-blue-800',
    kjvScripture: {
      verse: '2 Timothy 2:15 (KJV)',
      text: 'Study to shew thyself approved unto God, a workman that needeth not to be ashamed, rightly dividing the word of truth.'
    },
    behavioralLens: 'Sees the church through the lens of biblical truth, sound doctrine, orderly processes, and responsible stewardship.',
    coreStrengths: [
      'Expository depth and doctrinal discernment',
      'Meticulous financial, legal, and operational stewardship',
      'Organized systems that prevent chaos and errors',
      'High standards of excellence in ministry delivery'
    ],
    blindSpots: [
      'Can slip into critical legalism or perfectionism',
      'May struggle to extend grace to messy, imperfect people',
      'Over-analyzing decisions leading to delayed action'
    ],
    inTheBodyOfChrist: 'God places High C believers in the church to guard the pulpit and Sunday school against theological error, maintain ethical integrity in finances, and ensure that all things are done decently and in order.'
  }
};

export const DISC_DIMENSIONS_INFO = DISC_FOUNDATIONAL_INFO;

// ─── 28 Calibrated Faith-Based Assessment Statements (7 per dimension) ──────
export const DISC_QUESTIONS: DiscQuestion[] = [
  // ── D: Dominance (1 to 7) ──────────────────────────────────────────────────
  {
    id: 1,
    dimension: 'D',
    trait: 'Decisive Leadership',
    text: 'When church projects or ministries face obstacles, I am quick to take charge, make firm decisions, and push forward toward the goal.',
    biblicalContext: 'Taking courageous initiative like Nehemiah rebuilding the walls of Jerusalem.',
    kjvReference: 'Nehemiah 2:18'
  },
  {
    id: 2,
    dimension: 'D',
    trait: 'Bold Witness',
    text: 'I feel a strong urge to speak up boldly for the truth of God’s Word, even when it is unpopular or challenging to do so.',
    biblicalContext: 'Proclaiming the Word with holy boldness.',
    kjvReference: 'Acts 4:29'
  },
  {
    id: 3,
    dimension: 'D',
    trait: 'Results-Oriented Ministry',
    text: 'I prefer church meetings and committee efforts to be focused, action-oriented, and direct rather than spending excessive time on discussion.',
    biblicalContext: 'Diligent execution of the Master’s work.',
    kjvReference: 'Romans 12:8'
  },
  {
    id: 4,
    dimension: 'D',
    trait: 'Pioneering Vision',
    text: 'I am excited by new ministry ventures, church planting efforts, or launching fresh outreach programs where others might hesitate.',
    biblicalContext: 'Paul striving to preach where Christ had not yet been named.',
    kjvReference: 'Romans 15:20'
  },
  {
    id: 5,
    dimension: 'D',
    trait: 'Direct Communication',
    text: 'In personal and church discussions, I express my thoughts directly and straightforwardly, valuing clear honesty above all else.',
    biblicalContext: 'Speaking the truth in love directly without ambiguity.',
    kjvReference: 'Ephesians 4:15'
  },
  {
    id: 6,
    dimension: 'D',
    trait: 'Competitive & Driven',
    text: 'I thrive on challenging spiritual goals and feel motivated when given big responsibilities to accomplish for the Lord.',
    biblicalContext: 'Pressing toward the mark of the high calling of God in Christ Jesus.',
    kjvReference: 'Philippians 3:14'
  },
  {
    id: 7,
    dimension: 'D',
    trait: 'Standing Firm',
    text: 'When conflict arises in doctrine or ministry, I am willing to stand firm and confront the issue directly rather than avoid it.',
    biblicalContext: 'Contending earnestly for the faith once delivered unto the saints.',
    kjvReference: 'Jude 1:3'
  },

  // ── I: Influence (8 to 14) ─────────────────────────────────────────────────
  {
    id: 8,
    dimension: 'I',
    trait: 'Warm Hospitality',
    text: 'I naturally enjoy meeting visitors, welcoming newcomers, and helping everyone feel instantly at home in our church family.',
    biblicalContext: 'Showing hospitality without grudging.',
    kjvReference: '1 Peter 4:9'
  },
  {
    id: 9,
    dimension: 'I',
    trait: 'Joyful Inspiration',
    text: 'I often use humor, enthusiasm, and uplifting words to encourage brethren who are discouraged or weary.',
    biblicalContext: 'Barnabas, the son of consolation, exhorting the believers to cleave unto the Lord.',
    kjvReference: 'Acts 11:23'
  },
  {
    id: 10,
    dimension: 'I',
    trait: 'Conversational Evangelism',
    text: 'I find it easy to start conversations with strangers and look for natural opportunities to share my testimony and the Gospel.',
    biblicalContext: 'Being ready always to give an answer to every man with meekness and fear.',
    kjvReference: '1 Peter 3:15'
  },
  {
    id: 11,
    dimension: 'I',
    trait: 'Team Motivator',
    text: 'I love rallying volunteers together, creating excitement, and making serving the Lord feel joyful and collaborative.',
    biblicalContext: 'Serving the Lord with gladness.',
    kjvReference: 'Psalm 100:2'
  },
  {
    id: 12,
    dimension: 'I',
    trait: 'Expressive Worship',
    text: 'I readily express my praise, thanksgiving, and emotional joy in worship, fellowship gatherings, and small group prayer.',
    biblicalContext: 'Praising the Lord with the whole heart in the assembly of the upright.',
    kjvReference: 'Psalm 111:1'
  },
  {
    id: 13,
    dimension: 'I',
    trait: 'Optimistic Faith',
    text: 'I tend to look on the bright side of difficult ministry circumstances, trusting God with infectious optimism.',
    biblicalContext: 'Rejoicing in hope and being patient in tribulation.',
    kjvReference: 'Romans 12:12'
  },
  {
    id: 14,
    dimension: 'I',
    trait: 'People-First Focus',
    text: 'I prioritize people’s feelings and personal relationships over rigid rules or strict task timelines in church life.',
    biblicalContext: 'Putting charity above all things as the bond of perfectness.',
    kjvReference: 'Colossians 3:14'
  },

  // ── S: Steadiness (15 to 21) ───────────────────────────────────────────────
  {
    id: 15,
    dimension: 'S',
    trait: 'Patient Listening',
    text: 'I am a patient listener who prefers to understand someone’s heart and burdens before offering advice or speaking.',
    biblicalContext: 'Swift to hear, slow to speak, slow to wrath.',
    kjvReference: 'James 1:19'
  },
  {
    id: 16,
    dimension: 'S',
    trait: 'Consistent Faithfulness',
    text: 'I am dependable in attendance and reliable in fulfilling whatever humble ministry role is assigned to me week in and week out.',
    biblicalContext: 'Faithful in that which is least as well as in much.',
    kjvReference: 'Luke 16:10'
  },
  {
    id: 17,
    dimension: 'S',
    trait: 'Peacemaking & Harmony',
    text: 'I strive to maintain unity and peaceful relationships among church members, seeking to calm tension whenever possible.',
    biblicalContext: 'Blessed are the peacemakers: for they shall be called the children of God.',
    kjvReference: 'Matthew 5:9'
  },
  {
    id: 18,
    dimension: 'S',
    trait: 'Loyal Companionship',
    text: 'I develop deep, lasting bonds with friends and stay supportive through their trials, grief, and spiritual struggles.',
    biblicalContext: 'Ruth expressing unwavering loyalty: whither thou goest, I will go.',
    kjvReference: 'Ruth 1:16'
  },
  {
    id: 19,
    dimension: 'S',
    trait: 'Quiet Service',
    text: 'I am completely comfortable serving behind the scenes without public recognition or applause, as long as God is glorified.',
    biblicalContext: 'Doing good in secret so that our Father which seeth in secret shall reward openly.',
    kjvReference: 'Matthew 6:4'
  },
  {
    id: 20,
    dimension: 'S',
    trait: 'Stability in Routine',
    text: 'I value traditional church rhythms, proven methods, and predictable routines rather than frequent or sudden changes.',
    biblicalContext: 'Standing in the ways, and asking for the old paths, where is the good way, and walking therein.',
    kjvReference: 'Jeremiah 6:16'
  },
  {
    id: 21,
    dimension: 'S',
    trait: 'Gentle Caregiver',
    text: 'I have a tender heart for the elderly, widows, children, and those who are hurting, and I naturally step in to help them in practical ways.',
    biblicalContext: 'Pure religion and undefiled before God to visit the fatherless and widows in their affliction.',
    kjvReference: 'James 1:27'
  },

  // ── C: Conscientiousness (22 to 28) ────────────────────────────────────────
  {
    id: 22,
    dimension: 'C',
    trait: 'Doctrinal Accuracy',
    text: 'I place great importance on biblical sound doctrine, precise biblical truth, and ensuring all teaching adheres strictly to Scripture.',
    biblicalContext: 'Holding fast the form of sound words in faith and love which is in Christ Jesus.',
    kjvReference: '2 Timothy 1:13'
  },
  {
    id: 23,
    dimension: 'C',
    trait: 'Decently and in Order',
    text: 'I believe church finances, records, event planning, and facility administration should always be handled with meticulous care and organization.',
    biblicalContext: 'Letting all things be done decently and in order.',
    kjvReference: '1 Corinthians 14:40'
  },
  {
    id: 24,
    dimension: 'C',
    trait: 'High Standards of Excellence',
    text: 'When I take on a task for the church, I double-check details to make sure the work is done thoroughly and to the highest quality.',
    biblicalContext: 'Whatsoever ye do, do it heartily, as to the Lord, and not unto men.',
    kjvReference: 'Colossians 3:23'
  },
  {
    id: 25,
    dimension: 'C',
    trait: 'Biblical Discernment',
    text: 'I carefully analyze ideas, proposals, and curricula before accepting them, verifying whether they align with the Bible.',
    biblicalContext: 'The Bereans searching the scriptures daily, whether those things were so.',
    kjvReference: 'Acts 17:11'
  },
  {
    id: 26,
    dimension: 'C',
    trait: 'Cautious Planning',
    text: 'I prefer having clear instructions, well-defined procedures, and sufficient time to plan ahead rather than improvising on the fly.',
    biblicalContext: 'Counting the cost before building the tower.',
    kjvReference: 'Luke 14:28'
  },
  {
    id: 27,
    dimension: 'C',
    trait: 'Faithful Stewardship',
    text: 'I am careful with church resources, equipment, and finances, wanting to ensure nothing is wasted and everything is accounted for.',
    biblicalContext: 'Moreover it is required in stewards, that a man be found faithful.',
    kjvReference: '1 Corinthians 4:2'
  },
  {
    id: 28,
    dimension: 'C',
    trait: 'Thoughtful Preparation',
    text: 'When leading, teaching, or serving, I dedicate extensive time to study, preparation, and prayerful analysis of the material.',
    biblicalContext: 'Ezra preparing his heart to seek the law of the Lord, and to do it, and to teach.',
    kjvReference: 'Ezra 7:10'
  }
];

// ─── 12 Calibrated Faith-Based DISC Personality Profiles ─────────────────────

export const DISC_PROFILES: Record<string, DiscStyleProfile> = {
  // ── 1. High D ─────────────────────────────────────────────────────────────
  'D': {
    code: 'D',
    name: 'The Bold Pioneer (High Dominance)',
    primaryDimension: 'D',
    themeVerseKjv: {
      verse: '1 Corinthians 16:13 (KJV)',
      text: 'Watch ye, stand fast in the faith, quit you like men, be strong.'
    },
    summary: 'Decisive, courageous, and goal-oriented leader who tackles big challenges and advances the Kingdom with boldness.',
    fullDescription: 'You possess a God-given boldness to confront difficult obstacles, take righteous initiative, and lead people toward clear kingdom objectives. Like Nehemiah confronting the broken walls of Jerusalem, you are motivated by seeing tangible progress, standing firm in spiritual battles, and mobilizing resources to achieve victory for Christ.',
    biblicalExemplar: {
      name: 'Nehemiah & The Apostle Paul',
      description: 'Nehemiah overcame mockery and opposition to rebuild Jerusalem’s walls in 52 days, while Paul pressed forward through shipwrecks, prisons, and trials to plant churches across the Roman Empire.',
      kjvPassage: 'Nehemiah 6:3 (KJV) — "I am doing a great work, so that I cannot come down."'
    },
    baptistMinistryStrengths: [
      'Vision casting and church expansion initiatives',
      'Direct, unapologetic defense of biblical truth',
      'Decisive crisis management and problem-solving',
      'Motivating committees toward concrete milestones'
    ],
    idealServingRoles: [
      'Deacon Board / Leadership Council',
      'Building & Grounds Expansion Committee',
      'Disaster Relief / Missions Trip Coordinator',
      'Security & Safety Team Leadership'
    ],
    spiritualGrowthAreas: [
      'Cultivating patience and tenderness with gentler brethren (Galatians 6:1 KJV)',
      'Listening fully before making executive decisions (Proverbs 18:13 KJV)',
      'Relying on prayerful humility rather than human self-reliance (Proverbs 3:5–6 KJV)'
    ],
    communicationTips: 'Be concise and direct. State the bottom line first, outline the goal, and focus on practical solutions.',
    color: '#ef4444',
    badgeBg: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800',

    workStyleTendencies: [
      'Thrives in fast-paced, autonomous environments with minimal bureaucracy',
      'Excels when given full ownership of challenging ministry problems and clear targets',
      'Prefers leading pioneering initiatives rather than maintaining routine, repetitive tasks',
      'Maintains high energy when overcoming roadblocks and driving visible progress'
    ],
    motivations: [
      'Seeing measurable salvations, church growth, and spiritual milestones',
      'Overcoming formidable obstacles for the glory of Christ',
      'Having the authority to take initiative and eliminate bottlenecks',
      'Being challenged with ambitious kingdom goals'
    ],
    stressors: [
      'Indecision, endless committee debates, and slow bureaucratic meetings',
      'Micromanagement or having decision-making authority withheld',
      'Apathy, complacency, or lack of commitment in ministry teams',
      'Loss of control over key projects or being forced to proceed without clear direction'
    ],
    communicationPreferences: {
      howYouSpeak: 'Direct, candid, concise, and focused on the bottom line. You speak with authority, state goals clearly, and prefer addressing issues immediately without unnecessary pleasantries.',
      howToSpeakToYou: 'Be brief, direct, and prepared with solutions. State the primary point first, outline the objective, avoid emotional rabbit trails, and ask for a clear decision.'
    },
    styleToStyleStrategies: {
      withD: 'Respect their leadership, establish boundaries early, state facts concisely, and focus on mutual kingdom goals rather than competing for dominance.',
      withI: 'Acknowledge their enthusiasm and relational warmth, allow a few moments of friendly connection, but guide discussions toward actionable deadlines and measurable commitments.',
      withS: 'Slow your pace, tone down intensity, listen patiently, and provide step-by-step clarity rather than demanding instant changes or snapping at hesitation.',
      withC: 'Provide solid facts, logical rationale, and written details; give them time to analyze data before demanding an immediate verdict.'
    },
    biblicalActionPrinciples: [
      'James 1:19 (KJV) — "Wherefore, my beloved brethren, let every man be swift to hear, slow to speak, slow to wrath."',
      'Ephesians 4:2 (KJV) — "With all lowliness and meekness, with longsuffering, forbearing one another in love."',
      'Proverbs 15:1 (KJV) — "A soft answer turneth away wrath: but grievous words stir up anger."'
    ]
  },

  // ── 2. DI ─────────────────────────────────────────────────────────────────
  'DI': {
    code: 'DI',
    name: 'The Inspiring Trailblazer (Dominance / Influence)',
    primaryDimension: 'D',
    secondaryDimension: 'I',
    themeVerseKjv: {
      verse: 'Romans 12:8 (KJV)',
      text: 'He that exhorteth, on exhortation: he that giveth, let him do it with simplicity; he that ruleth, with diligence; he that sheweth mercy, with cheerfulness.'
    },
    summary: 'Enthusiastic and persuasive visionary who inspires brethren to take bold steps of faith and reach the community.',
    fullDescription: 'You combine the decisive drive of Dominance with the relational warmth of Influence. You cast contagious visions that get others excited to serve. You are an energetic evangelist and church leader who loves seeing people saved and ministries thriving.',
    biblicalExemplar: {
      name: 'Peter (The Bold Apostle)',
      description: 'Peter stepped out of the boat onto the water and stood on the Day of Pentecost to preach with inspiring, direct conviction.',
      kjvPassage: 'Acts 2:14 (KJV) — "Peter, standing up with the eleven, lifted up his voice, and said unto them, Ye men of Judaea... hearken to my words."'
    },
    baptistMinistryStrengths: [
      'Passionate evangelistic outreach and revival campaigns',
      'Dynamic preaching, teaching, and stage communication',
      'Rallying volunteers for major churchwide events',
      'Championing world missions and community engagement'
    ],
    idealServingRoles: [
      'Evangelism / Outreach Ministry Leader',
      'Youth / Young Adults Director',
      'VBS & Major Community Event Coordinator',
      'Missions Committee Director'
    ],
    spiritualGrowthAreas: [
      'Ensuring administrative follow-through after launching new initiatives',
      'Guarding against overcommitting personal and family time',
      'Allowing quiet, steady workers to share their perspective'
    ],
    communicationTips: 'Keep presentations fast-paced, inspiring, and focused on big-picture impact and eternal value.',
    color: '#f97316',
    badgeBg: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800',

    workStyleTendencies: [
      'Flourishes in dynamic, high-energy settings where creative ideas can be implemented quickly',
      'Excels at public persuasion, volunteer recruitment, and launching exciting church initiatives',
      'Prefers delegating detailed operational routines to conscientious teammates',
      'Loves fast momentum, dynamic stage presence, and outward community involvement'
    ],
    motivations: [
      'Rallying large groups toward bold evangelistic campaigns',
      'Public affirmation, spiritual excitement, and visible ministry breakthroughs',
      'Freedom to innovate and pioneer fresh ways to engage the unchurched',
      'Seeing lukewarm believers catch fire for the Lord'
    ],
    stressors: [
      'Pessimism, negativity, or resistance to forward-moving vision',
      'Tedious spreadsheets, rigid paperwork, and isolating administrative duties',
      'Slow-moving committee meetings that squash enthusiasm',
      'Micromanagement and excessive procedural constraints'
    ],
    communicationPreferences: {
      howYouSpeak: 'Energetic, persuasive, expressive, and visionary. You talk with passion about big ideas, use humor and engaging stories, and motivate people to jump on board.',
      howToSpeakToYou: 'Match their energy and optimism. Focus on the big-picture vision, celebrate past wins, give them freedom to innovate, and keep administrative requests clear and concise.'
    },
    styleToStyleStrategies: {
      withD: 'Keep discussions focused on high-level strategy, respect their drive, avoid emotional debates, and align on mutual victory.',
      withI: 'Share in their excitement and celebrate ideas, but gently establish clear deadlines and accountability checks to ensure follow-through.',
      withS: 'Express personal appreciation, give them time to adapt to changes, and don’t overwhelm them with sudden shifts in direction.',
      withC: 'Bring clear facts and structured data to support your ideas; show respect for their desire to do things properly and orderly.'
    },
    biblicalActionPrinciples: [
      'Hebrews 10:24 (KJV) — "And let us consider one another to provoke unto love and to good works."',
      'Proverbs 16:3 (KJV) — "Commit thy works unto the Lord, and thy thoughts shall be established."',
      'Philippians 2:3 (KJV) — "Let nothing be done through strife or vainglory; but in lowliness of mind let each esteem other better than themselves."'
    ]
  },

  // ── 3. DC ─────────────────────────────────────────────────────────────────
  'DC': {
    code: 'DC',
    name: 'The Strategic Director (Dominance / Conscientiousness)',
    primaryDimension: 'D',
    secondaryDimension: 'C',
    themeVerseKjv: {
      verse: 'Proverbs 24:3–4 (KJV)',
      text: 'Through wisdom is an house builded; and by understanding it is established: And by knowledge shall the chambers be filled with all precious and pleasant riches.'
    },
    summary: 'Thorough, principled leader who executes goals with high standards, sound doctrine, and strategic excellence.',
    fullDescription: 'You combine a relentless drive for results with high standards of doctrinal and administrative precision. You are analytical, calculated, and determined. When you build a ministry, you ensure the theological and operational foundations are rock-solid.',
    biblicalExemplar: {
      name: 'King Solomon & Ezra the Scribe',
      description: 'Solomon organized the construction of the Temple with precise specifications, while Ezra combined leadership with meticulous study of the Law.',
      kjvPassage: '1 Kings 6:38 (KJV) — "In the eleventh year, in the month Bul, was the house finished throughout all the parts thereof, and according to all the fashion of it."'
    },
    baptistMinistryStrengths: [
      'Strategic church budgeting and stewardship planning',
      'Establishing clear ministry policies and doctrinal standards',
      'Evaluating ministry effectiveness and resolving inefficiencies',
      'Leading complex construction or organizational projects'
    ],
    idealServingRoles: [
      'Church Treasurer / Finance Committee Chair',
      'Constitution & Bylaws Committee',
      'Facility Management Director',
      'Theological / Doctrinal Review Team'
    ],
    spiritualGrowthAreas: [
      'Balancing high standards with gracious forbearance (Colossians 3:13 KJV)',
      'Avoiding harshness when team members make honest mistakes',
      'Expressing verbal appreciation to those who labor faithfully'
    ],
    communicationTips: 'Provide clear facts, logical frameworks, and well-defined timelines without fluff.',
    color: '#8b5cf6',
    badgeBg: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',

    workStyleTendencies: [
      'Thrives in structured, goal-driven environments requiring strategic planning and doctrinal fidelity',
      'Excels at analyzing complex logistical or financial challenges and developing systematic solutions',
      'Prefers working with competent, disciplined teammates who respect deadlines and standards',
      'Expects excellence, thorough preparation, and high accountability in all church operations'
    ],
    motivations: [
      'Building enduring, structurally sound church ministries and systems',
      'Upholding uncompromising biblical standards and fiscal integrity',
      'Solving complex organizational puzzles and eliminating inefficiency',
      'Clear metrics, high quality, and tangible progress'
    ],
    stressors: [
      'Disorganization, sloppy workmanship, and theological flippancy',
      'Emotional decisions that ignore facts, budgets, or biblical guidelines',
      'Vague goals, lack of clear metrics, or broken commitments',
      'Being pressured into ill-conceived, hasty decisions without analysis'
    ],
    communicationPreferences: {
      howYouSpeak: 'Logical, direct, objective, and precise. You focus on facts, systematic reasoning, and practical feasibility, expecting conversations to stay on topic.',
      howToSpeakToYou: 'Come prepared with written outlines, accurate data, and logical arguments. Be concise, respect their time, and present clear pros and cons.'
    },
    styleToStyleStrategies: {
      withD: 'Focus on mutual strategic objectives, back your positions with solid facts, and negotiate timelines logically without emotional confrontation.',
      withI: 'Appreciate their enthusiasm and outreach ability, but help them anchor their ideas with concrete logistics, budgets, and operational schedules.',
      withS: 'Be mindful of your direct tone, communicate changes with sufficient lead time, and reassure them of security and consistency.',
      withC: 'Enjoy shared analytical rigor, align on high standards, and establish clear division of responsibilities to avoid territorial friction.'
    },
    biblicalActionPrinciples: [
      'Colossians 4:6 (KJV) — "Let your speech be alway with grace, seasoned with salt, that ye may know how ye ought to answer every man."',
      'Proverbs 18:13 (KJV) — "He that answereth a matter before he heareth it, it is folly and shame unto him."',
      '1 Corinthians 14:40 (KJV) — "Let all things be done decently and in order."'
    ]
  },

  // ── 4. High I ─────────────────────────────────────────────────────────────
  'I': {
    code: 'I',
    name: 'The Joyful Encourager (High Influence)',
    primaryDimension: 'I',
    themeVerseKjv: {
      verse: 'Proverbs 18:24 (KJV)',
      text: 'A man that hath friends must shew himself friendly: and there is a friend that sticketh closer than a brother.'
    },
    summary: 'Warm, magnetic, and relational encourager who connects people, radiates joy, and welcomes all into church fellowship.',
    fullDescription: 'You are God’s instrument of joy and warmth in the congregation. You never meet a stranger and have a heart for connecting people to Christ and the local body. You bring enthusiasm, optimism, and genuine love to every gathering.',
    biblicalExemplar: {
      name: 'Barnabas (Son of Consolation)',
      description: 'Barnabas took the newly converted Saul under his wing when others feared him, and later restored John Mark to useful ministry.',
      kjvPassage: 'Acts 4:36 (KJV) — "Joses, who by the apostles was surnamed Barnabas, (which is, being interpreted, The son of consolation)..."'
    },
    baptistMinistryStrengths: [
      'First-time visitor assimilation and follow-up',
      'Hospitality, greeting, and fellowship meal leadership',
      'Uplifting weary brethren through personal encouragement',
      'Vibrant choir, music, and children’s ministry energy'
    ],
    idealServingRoles: [
      'Welcome / Greeter Ministry Director',
      'Assimilation / New Member Host',
      'Choir / Worship Vocalist',
      'Children’s Church / Sunday School Teacher'
    ],
    spiritualGrowthAreas: [
      'Developing disciplined personal devotional habits (Psalm 119:11 KJV)',
      'Guarding against the fear of man when hard truths must be shared (Proverbs 29:25 KJV)',
      'Ensuring attention to administrative commitments and deadlines'
    ],
    communicationTips: 'Be warm, expressive, friendly, and allow time for personal relational connection.',
    color: '#f59e0b',
    badgeBg: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',

    workStyleTendencies: [
      'Thrives in people-centered, collaborative, and socially vibrant environments',
      'Excels at hospitality, greeting, public storytelling, and generating community enthusiasm',
      'Works best in team settings with opportunities for verbal brainstorming and fellowship',
      'Struggles with prolonged isolation, heavy paperwork, or rigid solitary tasks'
    ],
    motivations: [
      'Warm fellowship, brotherly love, and seeing newcomers feel genuinely welcomed',
      'Public affirmation, encouragement, and collaborative team unity',
      'Sharing God’s goodness and testimonies of salvation with others',
      'Fun, celebratory church events and joyful worship'
    ],
    stressors: [
      'Social isolation, rejection, or cold, uninviting church environments',
      'Strict, repetitive paperwork without human interaction',
      'Harsh criticism, conflict, or legalistic skepticism',
      'Rigid agendas that leave no room for spontaneous fellowship'
    ],
    communicationPreferences: {
      howYouSpeak: 'Warm, expressive, enthusiastic, and highly relational. You share personal stories, speak with optimism, use vocal variety, and seek emotional connection.',
      howToSpeakToYou: 'Be warm, friendly, and take time for relational check-ins. Ask for their ideas, affirm their contributions publicly, and keep written instructions light and engaging.'
    },
    styleToStyleStrategies: {
      withD: 'Be punctual, get to the main point quickly, avoid excessive storytelling, and show how your ideas produce practical kingdom results.',
      withI: 'Enjoy mutual joy and shared fellowship, but agree on written next steps and deadlines to ensure great ideas turn into reality.',
      withS: 'Slow down, listen carefully to their quiet thoughts, show genuine care for their feelings, and avoid overwhelming them with sudden changes.',
      withC: 'Respect their need for precision, show up on time, come prepared with facts, and don’t dismiss their detailed questions as negativity.'
    },
    biblicalActionPrinciples: [
      '1 Thessalonians 5:11 (KJV) — "Wherefore comfort yourselves together, and edify one another, even as also ye do."',
      'Proverbs 27:17 (KJV) — "Iron sharpeneth iron; so a man sharpeneth the countenance of his friend."',
      'Ephesians 4:29 (KJV) — "Let no corrupt communication proceed out of your mouth, but that which is good to the use of edifying, that it may minister grace unto the hearers."'
    ]
  },

  // ── 5. IS ─────────────────────────────────────────────────────────────────
  'IS': {
    code: 'IS',
    name: 'The Caring Shepherd (Influence / Steadiness)',
    primaryDimension: 'I',
    secondaryDimension: 'S',
    themeVerseKjv: {
      verse: '1 Thessalonians 2:7–8 (KJV)',
      text: 'But we were gentle among you, even as a nurse cherisheth her children: So being affectionately desirous of you, we were willing to have imparted unto you, not the gospel of God only, but also our own souls, because ye were dear unto us.'
    },
    summary: 'Compassionate, approachable, and warm relational minister who nurtures the flock and heals broken hearts.',
    fullDescription: 'You blend the outgoing warmth of Influence with the quiet loyalty of Steadiness. People naturally confide in you because you are approachable, empathetic, and trustworthy. You love walking alongside individuals through life’s joys and deep valleys.',
    biblicalExemplar: {
      name: 'Hannah & The Apostle John',
      description: 'Hannah was a woman of deep, heartfelt prayer, while John was the beloved disciple whose epistles overflowed with Christlike brotherly love.',
      kjvPassage: '1 John 4:7 (KJV) — "Beloved, let us love one another: for love is of God; and every one that loveth is born of God, and knoweth God."'
    },
    baptistMinistryStrengths: [
      'Pastoral care, counseling, and crisis support',
      'Shut-in and hospital visitation ministry',
      'Discipling new believers with patient kindness',
      'Fostering warm, transparent small group communities'
    ],
    idealServingRoles: [
      'Care & Visitation Team',
      'Bereavement / Meals Ministry Coordinator',
      'Women’s / Men’s Discipleship Mentor',
      'Small Group / Sunday School Shepherd'
    ],
    spiritualGrowthAreas: [
      'Speaking biblical truth when loving confrontation is needed (Ephesians 4:15 KJV)',
      'Setting healthy boundaries to prevent emotional burnout',
      'Not taking ministry criticism too personally'
    ],
    communicationTips: 'Be gentle, genuine, supportive, and communicate with personal warmth and active listening.',
    color: '#10b981',
    badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',

    workStyleTendencies: [
      'Thrives in supportive, caring ministry environments where genuine relationships are prioritized',
      'Excels at pastoral counseling, hospital visitation, grief support, and small group shepherding',
      'Prefers peaceful, collaborative team dynamics where conflict is resolved gently',
      'Works diligently when knowing their personal contributions directly comfort others'
    ],
    motivations: [
      'Comforting hurting believers and watching lives restored by God’s grace',
      'Deep, authentic Christian friendships and harmonious fellowship',
      'Helping new believers grow in Christ at a patient, supportive pace',
      'Being trusted with personal confidences and spiritual burdens'
    ],
    stressors: [
      'Hostility, harsh interpersonal arguments, and church factionalism',
      'Demanding, high-pressure environments that treat people like numbers',
      'Overextending emotional energy without setting boundaries for personal rest',
      'Having to deliver harsh reprimands or engage in divisive confrontations'
    ],
    communicationPreferences: {
      howYouSpeak: 'Gentle, affirming, empathetic, and encouraging. You speak with genuine warmth, validate emotions, listen deeply, and offer prayerful comfort.',
      howToSpeakToYou: 'Be supportive, gentle, and respectful. Avoid aggressive or rushed demands, affirm their faithful heart, and give them a safe space to share.'
    },
    styleToStyleStrategies: {
      withD: 'Do not take their bluntness personally; state your recommendations calmly and show how caring for people strengthens the overall mission.',
      withI: 'Enjoy the warmth and shared enthusiasm, and collaborate on hospitality and welcoming new families into church life.',
      withS: 'Share in their mutual love for quiet faithfulness, pray together, and support one another in patient service.',
      withC: 'Appreciate their doctrinal care and accuracy; remind them gently of the pastoral need to season truth with grace.'
    },
    biblicalActionPrinciples: [
      'Ephesians 4:32 (KJV) — "And be ye kind one to another, tenderhearted, forgiving one another, even as God for Christ\'s sake hath forgiven you."',
      'Galatians 6:2 (KJV) — "Bear ye one another\'s burdens, and so fulfil the law of Christ."',
      'Colossians 3:12 (KJV) — "Put on therefore, as the elect of God, holy and beloved, bowels of mercies, kindness, humbleness of mind, meekness, longsuffering."'
    ]
  },

  // ── 6. ID ─────────────────────────────────────────────────────────────────
  'ID': {
    code: 'ID',
    name: 'The Dynamic Catalyst (Influence / Dominance)',
    primaryDimension: 'I',
    secondaryDimension: 'D',
    themeVerseKjv: {
      verse: '1 Corinthians 9:22 (KJV)',
      text: 'To the weak became I as weak, that I might gain the weak: I am made all things to all men, that I might by all means save some.'
    },
    summary: 'High-energy, persuasive communicator who thrives on public engagement, casting vision, and winning souls.',
    fullDescription: 'You possess a charismatic, proactive personality that inspires action. You are confident in front of crowds and relentless in your pursuit of reaching the lost. You excel at turning ideas into exciting ministry movements.',
    biblicalExemplar: {
      name: 'Apollos (The Eloquent Preacher)',
      description: 'Apollos was mighty in the Scriptures and fervent in spirit, speaking and teaching diligently the things of the Lord.',
      kjvPassage: 'Acts 18:24 (KJV) — "An eloquent man, and mighty in the scriptures, came to Ephesus."'
    },
    baptistMinistryStrengths: [
      'Evangelistic preaching and community crusade leadership',
      'Mobilizing churchwide evangelistic door-to-door efforts',
      'Dynamic youth camp and revival speaking',
      'Public relations and community partnership outreach'
    ],
    idealServingRoles: [
      'Evangelism Director',
      'Campus / Bus Ministry Coordinator',
      'Worship & Creative Arts Leader',
      'Church Camp / Youth Retreat Director'
    ],
    spiritualGrowthAreas: [
      'Seeking quiet solitude and contemplation in prayer (Mark 1:35 KJV)',
      'Cultivating humility when God brings visible success',
      'Patiently mentoring those who learn more slowly'
    ],
    communicationTips: 'Be dynamic, engaging, and focus on exciting outcomes and inspiring testimonies.',
    color: '#e11d48',
    badgeBg: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',

    workStyleTendencies: [
      'Thrives in fast-paced, outward-focused environments with frequent public engagement',
      'Excels at rally events, youth campaigns, revival meetings, and community outreach',
      'Enjoys pitching bold initiatives, casting vision, and persuading others to join the work',
      'Requires operational support to ensure fine administrative details are managed'
    ],
    motivations: [
      'Public platforms to proclaim Christ and win souls',
      'High-energy ministry projects with visible, immediate momentum',
      'Inspiring people to take bold faith-filled steps',
      'Freedom to lead with creative flair and spontaneity'
    ],
    stressors: [
      'Routine administrative maintenance and tedious paperwork',
      'Excessive criticism or rigid traditionalism that stifles outreach innovation',
      'Quiet, solitary work environments without human energy',
      'Micromanagement and strict, slow-moving approval processes'
    ],
    communicationPreferences: {
      howYouSpeak: 'Charismatic, fast-paced, persuasive, and bold. You use vivid illustrations, humor, and compelling urgency to move people to action.',
      howToSpeakToYou: 'Be upbeat, open-minded, and express confidence in their leadership. Discuss big-picture goals, celebrate progress, and keep administrative checkpoints brief.'
    },
    styleToStyleStrategies: {
      withD: 'Align on shared kingdom objectives, respect their authority, and leverage your relational persuasion alongside their executive drive.',
      withI: 'Brainstorm creatively, celebrate vision, but establish mutually agreed-upon checkpoints so tasks cross the finish line.',
      withS: 'Slow your pace, reassure them of stability, and provide step-by-step guidance rather than sweeping them into sudden shifts.',
      withC: 'Bring clear biblical backing and logical evidence to your ideas; appreciate their desire for doctrinal and structural soundness.'
    },
    biblicalActionPrinciples: [
      'Acts 18:28 (KJV) — "For he mightily convinced the Jews, and that publickly, shewing by the scriptures that Jesus was Christ."',
      'Proverbs 25:11 (KJV) — "A word fitly spoken is like apples of gold in pictures of silver."',
      '1 Peter 5:5 (KJV) — "Yea, all of you be subject one to another, and be clothed with humility: for God resisteth the proud, and giveth grace to the humble."'
    ]
  },

  // ── 7. High S ─────────────────────────────────────────────────────────────
  'S': {
    code: 'S',
    name: 'The Faithful Servant (High Steadiness)',
    primaryDimension: 'S',
    themeVerseKjv: {
      verse: '1 Corinthians 15:58 (KJV)',
      text: 'Therefore, my beloved brethren, be ye stedfast, unmoveable, always abounding in the work of the Lord, forasmuch as ye know that your labour is not in vain in the Lord.'
    },
    summary: 'Dependable, patient, and loyal cornerstone of the local church who serves faithfully behind the scenes.',
    fullDescription: 'You are the quiet backbone of the local assembly. Like Ruth standing faithfully alongside Naomi, you are dependable, steadfast, and trustworthy. You bring calm stability to seasons of turbulence and take genuine pleasure in serving Christ without fanfare.',
    biblicalExemplar: {
      name: 'Ruth & Timothy',
      description: 'Ruth showed extraordinary faithfulness through famine and loss, while Timothy served with Paul as a son with the father in the gospel.',
      kjvPassage: 'Philippians 2:20 (KJV) — "For I have no man likeminded, who will naturally care for your state."'
    },
    baptistMinistryStrengths: [
      'Unfailing consistency in weekly ministry duties',
      'Faithful intercessory prayer warrior ministry',
      'Quiet, steadfast support during church pastoral transitions',
      'Dependable nursery, maintenance, and kitchen service'
    ],
    idealServingRoles: [
      'Prayer Ministry Team',
      'Nursery & Toddler Ministry',
      'Church Food Pantry / Benevolence Committee',
      'Sound & Audio/Visual Team'
    ],
    spiritualGrowthAreas: [
      'Stepping out of your comfort zone when God calls you to lead (Joshua 1:9 KJV)',
      'Embracing necessary ministry changes with confident faith',
      'Expressing your personal thoughts when decisions are being made'
    ],
    communicationTips: 'Be courteous, gentle, respectful, and provide clear step-by-step clarity without rushing.',
    color: '#10b981',
    badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',

    workStyleTendencies: [
      'Thrives in peaceful, predictable, and cooperative ministry environments',
      'Excels at weekly operational continuity, behind-the-scenes support, and long-term service',
      'Prefers clear guidelines, established routines, and collaborative team harmony',
      'Works diligently when given sufficient time to complete tasks without sudden disruption'
    ],
    motivations: [
      'Quiet, faithful service that genuinely helps the church family run smoothly',
      'Sincere personal appreciation from pastors and leaders for faithful labor',
      'Stable, harmonious relationships free from discord and strife',
      'Deep, long-standing friendships built on trust and mutual care'
    ],
    stressors: [
      'Sudden, unannounced changes in church schedule, leadership, or procedures',
      'Conflict, yelling, or intense aggressive confrontation among brethren',
      'Being rushed into decisions without time to process or prepare',
      'Feeling unappreciated or taken for granted after years of loyal service'
    ],
    communicationPreferences: {
      howYouSpeak: 'Calm, humble, respectful, and patient. You listen attentively, speak gently, avoid self-promotion, and express genuine care for others.',
      howToSpeakToYou: 'Be courteous, sincere, and unhurried. Explain the reasons behind changes, provide clear step-by-step instructions, and express heartfelt appreciation for their loyalty.'
    },
    styleToStyleStrategies: {
      withD: 'Do not be intimidated by their directness; state your progress calmly, communicate realistic timelines, and speak up when help is needed.',
      withI: 'Enjoy their joyful energy, but gently help them maintain focus on agreed schedules and consistent follow-through.',
      withS: 'Share in mutual loyalty and support, pray together, and encourage one another to step out in faith when God calls.',
      withC: 'Appreciate their thoroughness and order; work together to establish dependable systems that serve the church family.'
    },
    biblicalActionPrinciples: [
      'Galatians 6:9 (KJV) — "And let us not be weary in well doing: for in due season we shall reap, if we faint not."',
      'Proverbs 3:3 (KJV) — "Let not mercy and truth forsake thee: bind them about thy neck; write them upon the table of thine heart."',
      'Romans 12:18 (KJV) — "If it be possible, as much as lieth in you, live peaceably with all men."'
    ]
  },

  // ── 8. SC ─────────────────────────────────────────────────────────────────
  'SC': {
    code: 'SC',
    name: 'The Diligent Steward (Steadiness / Conscientiousness)',
    primaryDimension: 'S',
    secondaryDimension: 'C',
    themeVerseKjv: {
      verse: 'Colossians 3:23–24 (KJV)',
      text: 'And whatsoever ye do, do it heartily, as to the Lord, and not unto men; Knowing that of the Lord ye shall receive the reward of the inheritance: for ye serve the Lord Christ.'
    },
    summary: 'Thorough, humble, and reliable worker who handles critical church operations with quiet excellence.',
    fullDescription: 'You unite the dependable loyalty of Steadiness with the precision and discernment of Conscientiousness. You are calm, methodical, and deeply committed to doing things the right way. Your work is consistently accurate, orderly, and trustworthy.',
    biblicalExemplar: {
      name: 'Luke (The Beloved Physician)',
      description: 'Luke traveled faithfully with Paul and meticulously investigated all eyewitness accounts to write an orderly Gospel account and the Book of Acts.',
      kjvPassage: 'Luke 1:3 (KJV) — "It seemed good to me also, having had perfect understanding of all things from the very first, to write unto thee in order..."'
    },
    baptistMinistryStrengths: [
      'Accurate church membership and attendance records',
      'Reliable financial counting and internal auditing',
      'Careful coordination of baptismal and Lord’s Supper supplies',
      'Maintenance of church library, archives, and curriculum'
    ],
    idealServingRoles: [
      'Church Clerk / Records Administrator',
      'Offering Counter / Financial Assistant',
      'Lord’s Supper & Ordinances Preparer',
      'Church Librarian / Resource Center Coordinator'
    ],
    spiritualGrowthAreas: [
      'Guarding against anxiety when routines are interrupted (Philippians 4:6–7 KJV)',
      'Sharing your valuable insights and wisdom more vocal in committee meetings',
      'Remaining flexible when unexpected pastoral needs arise'
    ],
    communicationTips: 'Provide structured details, written agendas, and realistic timelines in a calm, respectful tone.',
    color: '#06b6d4',
    badgeBg: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800',

    workStyleTendencies: [
      'Thrives in quiet, organized, and methodical environments where thoroughness is valued',
      'Excels at data management, financial counting, church archives, and technical setups',
      'Prefers working steadily through well-defined checklists without sudden emergencies',
      'Ensures consistent accuracy, dependability, and humble adherence to policy'
    ],
    motivations: [
      'Knowing that church operations, records, and finances are accurate and above reproach',
      'A calm, structured, and predictable ministry environment',
      'Serving the Lord with quiet, uncompromised craftsmanship',
      'Being given sufficient time to complete assignments to the highest standard'
    ],
    stressors: [
      'Last-minute chaos, disorganization, and rushed deadlines',
      'Ambiguous directions, shifting expectations, or sloppy record-keeping',
      'Aggressive conflict or loud confrontations in church meetings',
      'Having to make snap decisions without verifying the facts'
    ],
    communicationPreferences: {
      howYouSpeak: 'Thoughtful, calm, precise, and modest. You speak with careful accuracy, avoid exaggeration, provide helpful details, and prefer written documentation.',
      howToSpeakToYou: 'Be clear, organized, and respectful. Provide written agendas and guidelines in advance, speak in a calm tone, and avoid springing last-minute surprises.'
    },
    styleToStyleStrategies: {
      withD: 'Present your completed work cleanly with key summary metrics; reassure them that the details are handled so they can focus on big decisions.',
      withI: 'Appreciate their joyful energy; help keep them grounded by managing the schedules and tracking logistics they may overlook.',
      withS: 'Share in dependable, quiet partnership; pray together and encourage each other in faithful behind-the-scenes service.',
      withC: 'Collaborate seamlessly on high standards, sound doctrine, and orderly processes, enjoying mutual respect for accuracy.'
    },
    biblicalActionPrinciples: [
      '1 Peter 4:10 (KJV) — "As every man hath received the gift, even so minister the same one to another, as good stewards of the manifold grace of God."',
      'Philippians 4:6–7 (KJV) — "Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God."',
      '1 Thessalonians 4:11 (KJV) — "And that ye study to be quiet, and to do your own business, and to work with your own hands, as we commanded you."'
    ]
  },

  // ── 9. SI ─────────────────────────────────────────────────────────────────
  'SI': {
    code: 'SI',
    name: 'The Peacemaking Servant (Steadiness / Influence)',
    primaryDimension: 'S',
    secondaryDimension: 'I',
    themeVerseKjv: {
      verse: 'Romans 12:10 (KJV)',
      text: 'Be kindly affectioned one to another with brotherly love; in honour preferring one another.'
    },
    summary: 'Patient, warm, and friendly helper who builds harmonious relationships and supports the church family with kindness.',
    fullDescription: 'You bring a gentle, welcoming spirit that puts everyone at ease. You value community harmony and go out of your way to help people feel valued and loved. You serve faithfully and love bringing people together in Christ.',
    biblicalExemplar: {
      name: 'Dorcas (Tabitha)',
      description: 'Dorcas was a woman full of good works and almsdeeds which she did, making garments and coats for widows with selfless love.',
      kjvPassage: 'Acts 9:36 (KJV) — "This woman was full of good works and almsdeeds which she did."'
    },
    baptistMinistryStrengths: [
      'Building team unity and soothing church friction',
      'Welcoming guests with gentle, unhurried warmth',
      'Providing dependable benevolence and practical care',
      'Encouraging Sunday school and small group attendance'
    ],
    idealServingRoles: [
      'Benevolence / Deacons Mercy Ministry',
      'Hospitality & Fellowship Team',
      'Greeter / Usher Ministry',
      'Senior Saints / Widows Ministry'
    ],
    spiritualGrowthAreas: [
      'Not avoiding necessary truth when conflict occurs (Proverbs 27:6 KJV)',
      'Speaking up for personal needs and family balance',
      'Stepping into decisive leadership when required'
    ],
    communicationTips: 'Be supportive, encourage their input, and acknowledge their humble contributions.',
    color: '#14b8a6',
    badgeBg: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800',

    workStyleTendencies: [
      'Thrives in warm, harmonious, and supportive church team environments',
      'Excels at hospitality, caring for the elderly, preparing fellowship meals, and greeting',
      'Prefers cooperative, friendly workflows where everyone supports each other',
      'Works diligently with patient, steady loyalty to encourage church unity'
    ],
    motivations: [
      'Promoting genuine peace, warmth, and brotherly love in the church',
      'Helping practical needs behind the scenes (meals, rides, visitations)',
      'A welcoming environment where newcomers and lonely members feel loved',
      'Working alongside humble, friendly brothers and sisters in Christ'
    ],
    stressors: [
      'Divisive politics, gossip, or angry arguments within the church body',
      'High-pressure environments that disregard people’s feelings and well-being',
      'Being forced into harsh confrontational roles without support',
      'Feeling unappreciated or having their gentle nature taken advantage of'
    ],
    communicationPreferences: {
      howYouSpeak: 'Kind, encouraging, welcoming, and considerate. You speak gently, check on how people are doing, express gratitude, and avoid harsh speech.',
      howToSpeakToYou: 'Be warm, encouraging, and friendly. Speak with a gentle tone, validate their dedicated service, and invite their perspective without putting them on the spot.'
    },
    styleToStyleStrategies: {
      withD: 'Do not fear their direct approach; share how taking care of team morale helps them accomplish their leadership objectives faster.',
      withI: 'Enjoy the vibrant fellowship and shared love for people; work together on welcoming guests and organizing church fellowship meals.',
      withS: 'Enjoy steady, peaceful ministry partnership; pray together and encourage each other to speak up when decisions are made.',
      withC: 'Appreciate their desire for orderly church processes; gently remind them to speak the truth in love and keep people at the center.'
    },
    biblicalActionPrinciples: [
      'Matthew 5:9 (KJV) — "Blessed are the peacemakers: for they shall be called the children of God."',
      'Proverbs 16:24 (KJV) — "Pleasant words are as an honeycomb, sweet to the soul, and health to the bones."',
      'Romans 14:19 (KJV) — "Let us therefore follow after the things which make for peace, and things wherewith one may edify another."'
    ]
  },

  // ── 10. High C ────────────────────────────────────────────────────────────
  'C': {
    code: 'C',
    name: 'The Doctrinal Guardian (High Conscientiousness)',
    primaryDimension: 'C',
    themeVerseKjv: {
      verse: '2 Timothy 2:15 (KJV)',
      text: 'Study to shew thyself approved unto God, a workman that needeth not to be ashamed, rightly dividing the word of truth.'
    },
    summary: 'Discerning, systematic, and analytical steward committed to biblical truth, sound doctrine, and orderly operations.',
    fullDescription: 'You have a passion for biblical truth, precision, and doing all things decently and in order. Like the Bereans, you search the Scriptures daily. You ensure that your church’s doctrine, teaching materials, and stewardship reflect the highest standards of integrity.',
    biblicalExemplar: {
      name: 'Ezra the Priest & The Bereans',
      description: 'Ezra prepared his heart to seek the Law of the Lord and teach its statutes, while the Bereans examined every sermon against the written Word.',
      kjvPassage: 'Acts 17:11 (KJV) — "They received the word with all readiness of mind, and searched the scriptures daily, whether those things were so."'
    },
    baptistMinistryStrengths: [
      'Expository Bible teaching and deep theological study',
      'Careful vetting of Sunday School literature and doctrine',
      'Meticulous church financial audits and legal compliance',
      'Developing structured training materials for church workers'
    ],
    idealServingRoles: [
      'Adult Sunday School Teacher / Bible Institute Instructor',
      'Audit & Stewardship Committee',
      'Curriculum & Literature Reviewer',
      'Church Historian & Records Archivist'
    ],
    spiritualGrowthAreas: [
      'Guarding against a critical spirit toward imperfect brethren (Ephesians 4:2 KJV)',
      'Recognizing that love and grace must accompany truth (1 Corinthians 13:1–3 KJV)',
      'Accepting that ministry sometimes involves messy, unscripted situations'
    ],
    communicationTips: 'Provide accurate facts, scriptural backing, written details, and logical reasons.',
    color: '#3b82f6',
    badgeBg: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',

    workStyleTendencies: [
      'Thrives in organized, intellectually rigorous environments where accuracy is prioritized',
      'Excels at theological research, curriculum evaluation, financial auditing, and compliance',
      'Prefers clear standards, well-documented procedures, and solitary study time',
      'Ensures uncompromised doctrinal integrity and precision in all church materials'
    ],
    motivations: [
      'Sound doctrine, biblical accuracy, and upholding historic Baptist distinctives',
      'Orderly stewardship, financial transparency, and systematic church processes',
      'Discovering deeper biblical insights through disciplined expository study',
      'Excellence and quality in every facet of ministry administration'
    ],
    stressors: [
      'Theological compromise, sloppy teaching, and superficial doctrine',
      'Disorganization, lack of planning, and sudden haphazard changes',
      'Subjective, emotional arguments that ignore Scripture and factual evidence',
      'Unrealistic deadlines that compromise quality and accuracy'
    ],
    communicationPreferences: {
      howYouSpeak: 'Analytical, objective, measured, and scripturally grounded. You present facts, cite scripture references, point out logical flaws, and avoid superficial fluff.',
      howToSpeakToYou: 'Be precise, logical, and provide written documentation and scriptural backing. Respect their expertise, give them time to research, and avoid emotional manipulation.'
    },
    styleToStyleStrategies: {
      withD: 'State conclusions concisely, support your analysis with facts and metrics, and show how sound preparation prevents costly mistakes.',
      withI: 'Appreciate their evangelistic enthusiasm; gently provide the theological depth and operational structure that will make their outreach sustainable.',
      withS: 'Enjoy steady, dependable collaboration; respect their loyalty and communicate doctrinal or procedural adjustments with patience.',
      withC: 'Engage in rich theological and logistical discussions; celebrate shared commitment to truth and accuracy while maintaining brotherly grace.'
    },
    biblicalActionPrinciples: [
      'Ephesians 4:15 (KJV) — "But speaking the truth in love, may grow up into him in all things, which is the head, even Christ."',
      'Titus 2:7–8 (KJV) — "In all things shewing thyself a pattern of good works: in doctrine shewing uncorruptness, gravity, sincerity, Sound speech, that cannot be condemned."',
      '1 Corinthians 13:2 (KJV) — "And though I have the gift of prophecy, and understand all mysteries, and all knowledge... and have not charity, I am nothing."'
    ]
  },

  // ── 11. CS ────────────────────────────────────────────────────────────────
  'CS': {
    code: 'CS',
    name: 'The Quiet Architect (Conscientiousness / Steadiness)',
    primaryDimension: 'C',
    secondaryDimension: 'S',
    themeVerseKjv: {
      verse: '1 Corinthians 14:40 (KJV)',
      text: 'Let all things be done decently and in order.'
    },
    summary: 'Thoughtful, reliable, and organized craftsman who creates orderly systems and preserves sound biblical traditions.',
    fullDescription: 'You combine systematic discernment with calm, humble faithfulness. You rarely seek the limelight, yet your careful planning and steady work keep the entire ministry machinery running without a hitch.',
    biblicalExemplar: {
      name: 'Bezaleel & Aholiab (The Temple Craftsmen)',
      description: 'Filled with the Spirit of God in wisdom, understanding, and knowledge to execute every detail of the Tabernacle according to the pattern showed on the mount.',
      kjvPassage: 'Exodus 31:3 (KJV) — "And I have filled him with the spirit of God, in wisdom, and in understanding, and in knowledge, and in all manner of workmanship."'
    },
    baptistMinistryStrengths: [
      'Creating dependable ministry schedules and rosters',
      'Managing church audio/visual and streaming technology',
      'Maintaining church financial and membership databases',
      'Organizing structured Bible study courses and handouts'
    ],
    idealServingRoles: [
      'Church Technology & Media Director',
      'Database & Communications Administrator',
      'Sunday School Superintendent Assistant',
      'Church Properties & Facilities Steward'
    ],
    spiritualGrowthAreas: [
      'Sharing your valuable insights freely instead of keeping quiet',
      'Avoiding frustration when church members deviate from plans',
      'Rejoicing in imperfect progress rather than demanding flawless execution'
    ],
    communicationTips: 'Communicate with clear structure, respect their need for time to process, and avoid sudden surprises.',
    color: '#4f46e5',
    badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800',

    workStyleTendencies: [
      'Thrives in calm, orderly, and well-structured ministry environments',
      'Excels at database administration, technical systems (A/V, live stream), and curriculum design',
      'Prefers predictable workflows with clear guidelines and sufficient preparation time',
      'Works with quiet excellence, dependability, and conscientious attention to detail'
    ],
    motivations: [
      'Creating reliable, seamless systems that support the ministry without failing',
      'Orderly execution of church operations and technological systems',
      'Preserving sound doctrinal standards and church historical records',
      'Working in a peaceful, respectful environment with competent leaders'
    ],
    stressors: [
      'Haphazard planning, last-minute emergencies, and sudden technological failures',
      'Disorder, broken ministry processes, and inconsistent leadership directives',
      'Loud, high-pressure environments that demand immediate answers without preparation',
      'Having to defend necessary procedures against impatient pushback'
    ],
    communicationPreferences: {
      howYouSpeak: 'Quiet, systematic, accurate, and respectful. You present well-organized thoughts, provide written summaries, and prefer substance over flashiness.',
      howToSpeakToYou: 'Provide written agendas, give advance notice of upcoming needs, speak calmly, and respect their thoughtful technical and administrative recommendations.'
    },
    styleToStyleStrategies: {
      withD: 'Deliver structured executive summaries with clear bottom-line recommendations, showing how your systems keep the church running smoothly.',
      withI: 'Help organize their dynamic outreach events by setting up the sound, media, and registration systems behind the scenes.',
      withS: 'Share in quiet, faithful fellowship; collaborate seamlessly on routine church operations and pray for one another.',
      withC: 'Enjoy shared analytical rigor, align on high standards of excellence, and work together on church policies and archives.'
    },
    biblicalActionPrinciples: [
      'Proverbs 22:29 (KJV) — "Seest thou a man diligent in his business? he shall stand before kings; he shall not stand before mean men."',
      'Ecclesiastes 9:10 (KJV) — "Whatsoever thy hand findeth to do, do it with thy might."',
      'Colossians 3:23 (KJV) — "And whatsoever ye do, do it heartily, as to the Lord, and not unto men."'
    ]
  },

  // ── 12. CD ────────────────────────────────────────────────────────────────
  'CD': {
    code: 'CD',
    name: 'The Reformer & Logician (Conscientiousness / Dominance)',
    primaryDimension: 'C',
    secondaryDimension: 'D',
    themeVerseKjv: {
      verse: 'Titus 1:9 (KJV)',
      text: 'Holding fast the faithful word as he hath been taught, that he may be able by sound doctrine both to exhort and to convince the gainsayers.'
    },
    summary: 'Principled, analytical problem-solver who addresses structural issues, defends orthodoxy, and establishes order.',
    fullDescription: 'You unite analytical precision with decisive boldness. You have a keen eye for systemic problems, theological drift, or administrative disorder, and you possess the courage to address and fix them systematically.',
    biblicalExemplar: {
      name: 'The Prophet Daniel & King Josiah',
      description: 'Daniel excelled in wisdom and stood unwavering for righteousness in Babylon, while Josiah rediscovered the Book of the Law and systematically purged the land of idolatry.',
      kjvPassage: 'Daniel 6:3 (KJV) — "An excellent spirit was in him; and the king thought to set him over the whole realm."'
    },
    baptistMinistryStrengths: [
      'Defending the historic Baptist distinctives and biblical doctrines',
      'Restructuring struggling ministries to be effective and sound',
      'Thorough risk assessment and church safety protocols',
      'Expository apologetics and theological instruction'
    ],
    idealServingRoles: [
      'Doctrinal Review Committee',
      'Church Safety & Security Director',
      'Theology & Apologetics Teacher',
      'Strategic Planning & By-laws Committee'
    ],
    spiritualGrowthAreas: [
      'Clothing truth in warmth and gentleness (2 Timothy 2:24–25 KJV)',
      'Avoiding overly critical skepticism of others’ motives',
      'Allowing room for creative methods that do not compromise Scripture'
    ],
    communicationTips: 'Be logical, provide scriptural evidence, outline facts, and demonstrate clear practical competence.',
    color: '#6366f1',
    badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800',

    workStyleTendencies: [
      'Thrives in challenging environments that require strategic reform, problem-solving, and doctrinal defense',
      'Excels at identifying operational bottlenecks, drafting church policies, and executing audits',
      'Prefers autonomous authority to diagnose problems and implement structured fixes',
      'Demands high accountability, factual rigor, and adherence to biblical standards'
    ],
    motivations: [
      'Restoring biblical order, structural integrity, and doctrinal purity in ministries',
      'Solving complex organizational vulnerabilities and legal/safety risks',
      'Defending Christian truth with rigorous apologetics and sound logic',
      'Seeing ministries operate with high excellence and measurable impact'
    ],
    stressors: [
      'Compromised standards, unchecked disorder, and intellectual laziness',
      'Illogical decisions based on emotional impulses rather than Scripture and data',
      'Incompetence or lack of follow-through from ministry partners',
      'Resistance to necessary structural reforms due to complacent tradition'
    ],
    communicationPreferences: {
      howYouSpeak: 'Logical, candid, incisive, and direct. You present facts, highlight discrepancies, point out structural flaws, and challenge assumptions.',
      howToSpeakToYou: 'Be objective, direct, and back assertions with verifiable facts and Scripture. Respect their analytical intellect and present reasoned solutions rather than emotional appeals.'
    },
    styleToStyleStrategies: {
      withD: 'Engage them with direct, factual clarity; respect their authority while offering calculated solutions that advance leadership goals.',
      withI: 'Acknowledge their relational gift, but keep discussions tethered to biblical doctrine, feasibility, and structured implementation.',
      withS: 'Soft-pedal your critique, recognize their faithful service, and guide them through changes with gentle reassurance.',
      withC: 'Enjoy shared analytical rigor and doctrinal depth; ensure you maintain humility and avoid debates over non-essential details.'
    },
    biblicalActionPrinciples: [
      '2 Timothy 2:24–25 (KJV) — "And the servant of the Lord must not strive; but be gentle unto all men, apt to teach, patient, In meekness instructing those that oppose themselves..."',
      'Proverbs 15:2 (KJV) — "The tongue of the wise useth knowledge aright: but the mouth of fools poureth out foolishness."',
      'Philippians 1:9–10 (KJV) — "And this I pray, that your love may abound yet more and more in knowledge and in all judgment; That ye may approve things that are excellent."'
    ]
  }
};

// ─── Scoring Engine ──────────────────────────────────────────────────────────
export interface DiscCalculationResult {
  scores: Record<DiscDimension, number>;
  maxScorePerDimension: number; // 35 (7 questions * 5)
  percentages: Record<DiscDimension, number>;
  primaryDimension: DiscDimension;
  secondaryDimension?: DiscDimension;
  styleCode: string; // e.g. "D", "DI", "DC"
  profile: DiscStyleProfile;
}

export function calculateDiscScores(answers: Record<number, number>): DiscCalculationResult {
  const scores: Record<DiscDimension, number> = {
    'D': 0,
    'I': 0,
    'S': 0,
    'C': 0
  };

  DISC_QUESTIONS.forEach(q => {
    const rawVal = Number(answers[q.id]) || 3; // neutral default if missing
    scores[q.dimension] += rawVal;
  });

  const maxScorePerDimension = 35; // 7 questions * 5 max points

  const percentages: Record<DiscDimension, number> = {
    'D': Math.min(100, Math.max(0, Math.round((scores.D / maxScorePerDimension) * 100))),
    'I': Math.min(100, Math.max(0, Math.round((scores.I / maxScorePerDimension) * 100))),
    'S': Math.min(100, Math.max(0, Math.round((scores.S / maxScorePerDimension) * 100))),
    'C': Math.min(100, Math.max(0, Math.round((scores.C / maxScorePerDimension) * 100)))
  };

  // Sort dimensions by score descending
  const sorted = (['D', 'I', 'S', 'C'] as DiscDimension[]).sort((a, b) => scores[b] - scores[a]);
  const primary = sorted[0];
  const secondary = sorted[1];

  // If secondary is within 6 points and >= 20 points, create blend style
  let styleCode: string = primary;
  const primaryScore = scores[primary];
  const secondaryScore = scores[secondary];

  if (secondaryScore >= 20 && (primaryScore - secondaryScore) <= 6) {
    const candidateCode = `${primary}${secondary}`;
    if (DISC_PROFILES[candidateCode]) {
      styleCode = candidateCode;
    }
  }

  const profile = DISC_PROFILES[styleCode] || DISC_PROFILES[primary] || DISC_PROFILES['D'];

  return {
    scores,
    maxScorePerDimension,
    percentages,
    primaryDimension: primary,
    secondaryDimension: styleCode.length > 1 ? secondary : undefined,
    styleCode,
    profile
  };
}
