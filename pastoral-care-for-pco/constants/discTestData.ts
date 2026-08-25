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
}

export const DISC_DIMENSIONS_INFO: Record<DiscDimension, {
  name: string;
  color: string;
  motto: string;
  kjvScripture: { verse: string; text: string };
  description: string;
}> = {
  'D': {
    name: 'Dominance (Decisive & Driving)',
    color: '#ef4444',
    motto: 'Direct, Goal-Oriented, Pioneering, Bold in Action',
    kjvScripture: {
      verse: '1 Corinthians 16:13 (KJV)',
      text: 'Watch ye, stand fast in the faith, quit you like men, be strong.'
    },
    description: 'Motivated by overcoming obstacles, seeing practical results, taking initiative, and leading courageously for the advancement of the Kingdom.'
  },
  'I': {
    name: 'Influence (Inspiring & Interactive)',
    color: '#f59e0b',
    motto: 'Enthusiastic, Relational, Encouraging, Friendly in Outreach',
    kjvScripture: {
      verse: 'Proverbs 18:24 (KJV)',
      text: 'A man that hath friends must shew himself friendly: and there is a friend that sticketh closer than a brother.'
    },
    description: 'Motivated by building relationships, encouraging brethren, sharing the Gospel with warmth, and fostering joyful church fellowship.'
  },
  'S': {
    name: 'Steadiness (Supportive & Stable)',
    color: '#10b981',
    motto: 'Loyal, Patient, Peaceful, Dependable in Service',
    kjvScripture: {
      verse: '1 Corinthians 15:58 (KJV)',
      text: 'Therefore, my beloved brethren, be ye stedfast, unmoveable, always abounding in the work of the Lord, forasmuch as ye know that your labour is not in vain in the Lord.'
    },
    description: 'Motivated by quiet faithfulness, supporting the flock, providing consistency, listening with compassion, and serving diligently behind the scenes.'
  },
  'C': {
    name: 'Conscientiousness (Careful & Discerning)',
    color: '#3b82f6',
    motto: 'Systematic, Accurate, Doctrinally Sound, Orderly in Stewardship',
    kjvScripture: {
      verse: '2 Timothy 2:15 (KJV)',
      text: 'Study to shew thyself approved unto God, a workman that needeth not to be ashamed, rightly dividing the word of truth.'
    },
    description: 'Motivated by biblical truth, high standards of excellence, careful stewardship of church resources, and doing all things decently and in order.'
  }
};

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

// ─── 12 DISC Pattern Profiles (Faith-Based & Baptist Distinctives) ───────────
export const DISC_PROFILES: Record<string, DiscStyleProfile> = {
  'D': {
    code: 'D',
    name: 'The Bold Pioneer (High Dominance)',
    primaryDimension: 'D',
    themeVerseKjv: {
      verse: '1 Corinthians 16:13 (KJV)',
      text: 'Watch ye, stand fast in the faith, quit you like men, be strong.'
    },
    summary: 'Direct, decisive, and courageous leader driven to accomplish major kingdom objectives and overcome ministry hurdles.',
    fullDescription: 'You possess a God-given boldness to lead, initiate, and confront challenges head-on. Like Nehemiah confronting the broken walls of Jerusalem, you look at obstacles not as dead ends, but as opportunities to trust God and mobilize for action. You value efficiency, results, and truth delivered plainly.',
    biblicalExemplar: {
      name: 'Nehemiah & The Apostle Paul',
      description: 'Nehemiah refused to be deterred by mocking enemies when rebuilding the wall, while Paul boldly planted churches across the Roman Empire despite persecution.',
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
    badgeBg: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
  },

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
    badgeBg: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800'
  },

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
    badgeBg: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800'
  },

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
    badgeBg: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
  },

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
    badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
  },

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
    badgeBg: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
  },

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
    badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
  },

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
    badgeBg: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800'
  },

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
    badgeBg: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800'
  },

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
    badgeBg: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
  },

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
    badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800'
  },

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
    badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800'
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
    const rawVal = answers[q.id] || 0;
    scores[q.dimension] += rawVal;
  });

  const maxScorePerDimension = 35; // 7 questions * 5 max points

  const percentages: Record<DiscDimension, number> = {
    'D': Math.round((scores.D / maxScorePerDimension) * 100),
    'I': Math.round((scores.I / maxScorePerDimension) * 100),
    'S': Math.round((scores.S / maxScorePerDimension) * 100),
    'C': Math.round((scores.C / maxScorePerDimension) * 100)
  };

  // Sort dimensions by score descending
  const sorted = (['D', 'I', 'S', 'C'] as DiscDimension[]).sort((a, b) => scores[b] - scores[a]);
  const primary = sorted[0];
  const secondary = sorted[1];

  // If secondary is within 5 points (or >= 70% of max), create blend style
  let styleCode = primary;
  const primaryScore = scores[primary];
  const secondaryScore = scores[secondary];

  if (secondaryScore >= 22 && (primaryScore - secondaryScore) <= 6) {
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
