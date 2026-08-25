export type MbtiDimension = 'EI' | 'SN' | 'TF' | 'JP';

export interface MbtiQuestion {
  id: number;
  text: string;
  dimension: MbtiDimension;
  /** If direction is 'high', a score of 5 points to the first letter (E, S, T, J). If 'low', a score of 5 points to the second letter (I, N, F, P). */
  direction: 'E' | 'I' | 'S' | 'N' | 'T' | 'F' | 'J' | 'P';
}

export interface MbtiTypeProfile {
  code: string;
  name: string;
  temperament: 'Analyst' | 'Diplomat' | 'Sentinel' | 'Explorer';
  tagline: string;
  shortDescription: string;
  fullDescription: string;
  ministryStrengths: string[];
  growthAreas: string[];
  communicationStyle: string;
  idealServingRoles: string[];
  color: string;
  bgLight: string;
  bgDark: string;
  textColor: string;
  borderColor: string;
}

export const MBTI_TEMPERAMENT_COLORS: Record<string, string> = {
  'Analyst': '#8b5cf6',   // Violet (NT)
  'Diplomat': '#10b981',  // Emerald (NF)
  'Sentinel': '#0284c7',  // Sky Blue (SJ)
  'Explorer': '#f59e0b',  // Amber (SP)
};

export const MBTI_TYPE_PROFILES: Record<string, MbtiTypeProfile> = {
  // ─── Analysts (NT) ──────────────────────────────────────────────────────────
  'INTJ': {
    code: 'INTJ',
    name: 'The Architect / Strategist',
    temperament: 'Analyst',
    tagline: 'Visionary strategists with an insatiable drive for improvement and clarity.',
    shortDescription: 'Insightful, independent, and strategic thinkers who excel at analyzing complex ministry systems and building long-term master plans.',
    fullDescription: 'INTJs are innovative, analytical visionaries who love turning ideas into practical, organized realities. In the church, they look beyond current traditions to formulate effective long-term strategies, theological clarity, and sustainable structures.',
    ministryStrengths: [
      'Strategic ministry planning and vision formulation',
      'System design and operational efficiency',
      'Doctrinal depth and thorough biblical research',
      'Objective problem-solving under pressure'
    ],
    growthAreas: [
      'Can appear overly critical or distant to feeling-oriented members',
      'May struggle with patience when processes move slowly',
      'Needs to remember the value of spontaneous relationship-building'
    ],
    communicationStyle: 'Direct, logical, and conceptual. Values concise, well-reasoned explanations.',
    idealServingRoles: [
      'Strategic Planning & Vision Committees',
      'Church Governance & Elder Boards',
      'Theological Research & Curriculum Design',
      'Operations & Financial Oversight'
    ],
    color: '#8b5cf6',
    bgLight: 'bg-violet-50 text-violet-700',
    bgDark: 'dark:bg-violet-950/40 dark:text-violet-300',
    textColor: 'text-violet-600 dark:text-violet-400',
    borderColor: 'border-violet-200 dark:border-violet-800'
  },
  'INTP': {
    code: 'INTP',
    name: 'The Thinker / Logician',
    temperament: 'Analyst',
    tagline: 'Philosophical innovators fascinated by deep truth, systems, and concepts.',
    shortDescription: 'Quiet, theoretical, and inquisitive minds that love exploring theological depth, apologetics, and uncovering foundational truths.',
    fullDescription: 'INTPs are relentlessly analytical thinkers who seek to understand the underlying principles of Scripture and life. They bring theological precision, problem diagnosis, and intellectual honesty to church leadership.',
    ministryStrengths: [
      'Deep biblical and theological analysis',
      'Apologetics and addressing difficult faith questions',
      'Unbiased, objective problem evaluation',
      'Designing innovative tech and knowledge systems'
    ],
    growthAreas: [
      'May become detached from practical ministry execution',
      'Can overthink decisions or delay implementation',
      'Needs encouragement to share feelings and personal stories'
    ],
    communicationStyle: 'Precise, objective, and thoughtful. Enjoys exploring multiple perspectives.',
    idealServingRoles: [
      'Apologetics & Christian Worldview Teaching',
      'Doctrinal & Bible Study Resource Teams',
      'IT, Database, & Technical Infrastructure',
      'Curriculum Review'
    ],
    color: '#8b5cf6',
    bgLight: 'bg-violet-50 text-violet-700',
    bgDark: 'dark:bg-violet-950/40 dark:text-violet-300',
    textColor: 'text-violet-600 dark:text-violet-400',
    borderColor: 'border-violet-200 dark:border-violet-800'
  },
  'ENTJ': {
    code: 'ENTJ',
    name: 'The Commander / Executive',
    temperament: 'Analyst',
    tagline: 'Bold, decisive leaders who organize people and resources to achieve grand missions.',
    shortDescription: 'Dynamic, confident, and goal-driven champions who mobilize teams to overcome challenges and reach missional targets.',
    fullDescription: 'ENTJs are natural leaders who thrive on tackling large-scale projects and organizing people into high-performing teams. In church life, they excel at leading capital campaigns, outreach initiatives, and organizational growth.',
    ministryStrengths: [
      'Decisive mission-driven leadership',
      'High organizational capacity and delegation',
      'Ability to rally volunteers around a big vision',
      'Unwavering focus on fruitfulness and results'
    ],
    growthAreas: [
      'Can come across as commanding or impatient with sensitive team members',
      'May prioritize ministry goals over interpersonal pastoral care',
      'Benefits from cultivating tender-hearted empathy'
    ],
    communicationStyle: 'Authoritative, straightforward, inspiring, and focused on decisive action.',
    idealServingRoles: [
      'Executive Leadership & Direction',
      'Building & Stewardship Campaigns',
      'Outreach Campaign Director',
      'Ministry Department Oversight'
    ],
    color: '#8b5cf6',
    bgLight: 'bg-violet-50 text-violet-700',
    bgDark: 'dark:bg-violet-950/40 dark:text-violet-300',
    textColor: 'text-violet-600 dark:text-violet-400',
    borderColor: 'border-violet-200 dark:border-violet-800'
  },
  'ENTP': {
    code: 'ENTP',
    name: 'The Visionary / Debater',
    temperament: 'Analyst',
    tagline: 'Spirited, creative problem-solvers who thrive on intellectual challenge and new frontiers.',
    shortDescription: 'Energetic, quick-witted, and pioneering leaders who inspire change and love brainstorming fresh ministry approaches.',
    fullDescription: 'ENTPs are innovative catalysts who look for creative solutions to complex challenges. They challenge the status quo, champion new ministry initiatives, and engage others in stimulating conversations about faith.',
    ministryStrengths: [
      'Creative evangelism and community engagement ideas',
      'Enthusiastic public speaking and dialogue',
      'Adapting quickly to changing church environments',
      'Pioneering new church plants and initiatives'
    ],
    growthAreas: [
      'May start many projects without following through to completion',
      'Can unintentionally trigger conflict through debate',
      'Needs strong detail-oriented partners'
    ],
    communicationStyle: 'Witty, dynamic, persuasive, and open to engaging banter and new ideas.',
    idealServingRoles: [
      'Church Planting & New Campus Launch Teams',
      'Youth & Young Adult Ministry Catalysts',
      'Creative Outreach & Media Innovation',
      'Evangelism Dialogues & College Outreach'
    ],
    color: '#8b5cf6',
    bgLight: 'bg-violet-50 text-violet-700',
    bgDark: 'dark:bg-violet-950/40 dark:text-violet-300',
    textColor: 'text-violet-600 dark:text-violet-400',
    borderColor: 'border-violet-200 dark:border-violet-800'
  },

  // ─── Diplomats (NF) ─────────────────────────────────────────────────────────
  'INFJ': {
    code: 'INFJ',
    name: 'The Counselor / Advocate',
    temperament: 'Diplomat',
    tagline: 'Quiet, deeply compassionate visionaries dedicated to inspiring spiritual growth in others.',
    shortDescription: 'Deeply intuitive, principled, and empathetic guides who discern the spiritual needs of others and shepherd them toward Christ.',
    fullDescription: 'INFJs combine profound spiritual intuition with a passionate desire to help individuals fulfill God’s purpose. In ministry, they are often trusted confidants, gifted mentors, and profound spiritual writers or counselors.',
    ministryStrengths: [
      'One-on-one pastoral counseling and spiritual direction',
      'Discerning unspoken emotional and spiritual needs',
      'Inspiring commitment to God’s heart for justice and mercy',
      'Integrity and authentic spiritual devotion'
    ],
    growthAreas: [
      'Prone to burnout from absorbing other people’s emotional burdens',
      'Can be perfectionistic about ideals and vision',
      'Needs dedicated solitude and healthy boundaries'
    ],
    communicationStyle: 'Warm, thoughtful, metaphorical, and deeply attentive to the listener.',
    idealServingRoles: [
      'Pastoral Care & Grief Counseling',
      'Spiritual Direction & Discipleship Mentorship',
      'Prayer Team Leadership',
      'Small Group Shepherding'
    ],
    color: '#10b981',
    bgLight: 'bg-emerald-50 text-emerald-700',
    bgDark: 'dark:bg-emerald-950/40 dark:text-emerald-300',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    borderColor: 'border-emerald-200 dark:border-emerald-800'
  },
  'INFP': {
    code: 'INFP',
    name: 'The Peacemaker / Mediator',
    temperament: 'Diplomat',
    tagline: 'Poetic, gentle, and altruistic souls guided by deeply held core values and faith.',
    shortDescription: 'Reflective, caring, and authentic believers who minister with tender empathy and creative expression.',
    fullDescription: 'INFPs are guided by an inner compass of devotion and authenticity. In church life, they often bring beauty through worship, creative arts, and a quiet yet powerful ministry to those who are hurting or overlooked.',
    ministryStrengths: [
      'Authentic, heart-level empathy for the broken and marginalized',
      'Worship leadership, music, and creative arts',
      'Cultivating safe, non-judgmental small group environments',
      'Deep personal devotion and prayer life'
    ],
    growthAreas: [
      'Can take criticism very personally',
      'May withdraw from interpersonal conflict or administrative friction',
      'Needs encouragement to take bold public action'
    ],
    communicationStyle: 'Gentle, genuine, personal, and encouraging. Listens with full heart.',
    idealServingRoles: [
      'Worship & Music Ministry',
      'Benevolence & Compassion Outreach',
      'Creative Writing & Visual Arts Ministry',
      'Youth & Children’s Mentoring'
    ],
    color: '#10b981',
    bgLight: 'bg-emerald-50 text-emerald-700',
    bgDark: 'dark:bg-emerald-950/40 dark:text-emerald-300',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    borderColor: 'border-emerald-200 dark:border-emerald-800'
  },
  'ENFJ': {
    code: 'ENFJ',
    name: 'The Mentor / Protagonist',
    temperament: 'Diplomat',
    tagline: 'Charismatic, inspiring leaders who bring people together and unlock their God-given potential.',
    shortDescription: 'Warm, articulate, and relational champions who naturally inspire community, discipleship, and harmonious service.',
    fullDescription: 'ENFJs are natural encouragers and connectors who radiate warmth and vision. In the church, they excel as pastors, small group coordinators, and ministry leaders who unite diverse people around a common love for God.',
    ministryStrengths: [
      'Inspirational preaching, teaching, and motivating people',
      'Unifying teams and resolving interpersonal conflicts',
      'Disciple-making and developing emerging leaders',
      'Creating warm, welcoming hospitality cultures'
    ],
    growthAreas: [
      'Can overextend themselves trying to please everyone',
      'May avoid necessary tough confrontation to preserve harmony',
      'Needs to guard personal rest and family time'
    ],
    communicationStyle: 'Passionate, expressive, uplifting, and highly empathetic.',
    idealServingRoles: [
      'Lead / Associate Pastoral Ministry',
      'Small Group Director & Facilitator',
      'Volunteer Assimilation & Connection Ministry',
      'Women’s / Men’s Ministry Leadership'
    ],
    color: '#10b981',
    bgLight: 'bg-emerald-50 text-emerald-700',
    bgDark: 'dark:bg-emerald-950/40 dark:text-emerald-300',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    borderColor: 'border-emerald-200 dark:border-emerald-800'
  },
  'ENFP': {
    code: 'ENFP',
    name: 'The Champion / Campaigner',
    temperament: 'Diplomat',
    tagline: 'Enthusiastic, free-spirited, and vibrant souls who ignite joy and hope in those around them.',
    shortDescription: 'Passionate, creative, and highly relational dynamos who infuse ministries with contagious energy, faith, and joy.',
    fullDescription: 'ENFPs see life through the lens of God’s limitless possibilities. They are fantastic at welcoming newcomers, sparking excitement for church events, and building meaningful relationships across all walks of life.',
    ministryStrengths: [
      'Contagious enthusiasm for evangelism and church life',
      'Connecting easily with strangers and visitors',
      'Creative program design and storytelling',
      'Empowering others to believe in their spiritual gifts'
    ],
    growthAreas: [
      'Can become easily distracted by new ideas before finishing existing tasks',
      'May find routine administrative tasks draining',
      'Benefits from structured accountability partners'
    ],
    communicationStyle: 'Vibrant, open, humorous, and deeply encouraging.',
    idealServingRoles: [
      'Welcome & First Impressions Team',
      'Youth & Student Ministry Leadership',
      'Community Outreach & Missions Champion',
      'Event MC & Creative Media Team'
    ],
    color: '#10b981',
    bgLight: 'bg-emerald-50 text-emerald-700',
    bgDark: 'dark:bg-emerald-950/40 dark:text-emerald-300',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    borderColor: 'border-emerald-200 dark:border-emerald-800'
  },

  // ─── Sentinels (SJ) ─────────────────────────────────────────────────────────
  'ISTJ': {
    code: 'ISTJ',
    name: 'The Pillar / Inspector',
    temperament: 'Sentinel',
    tagline: 'Dependable, practical, and grounded believers whose faithfulness upholds the ministry.',
    shortDescription: 'Loyal, thorough, and methodical servants who ensure that church operations, finances, and traditions operate with excellence.',
    fullDescription: 'ISTJs are the reliable backbone of any congregation. They value biblical fidelity, consistency, and duty. When given a responsibility in the church, they execute it with utmost integrity and attention to detail.',
    ministryStrengths: [
      'Exceptional reliability and follow-through',
      'Financial stewardship, accounting, and compliance',
      'Facility management, safety, and operational logistics',
      'Steadfast preservation of sound doctrine'
    ],
    growthAreas: [
      'May resist changes to traditional structures or methods',
      'Can be rigid when unexpected disruptions occur',
      'Encouraged to celebrate spontaneity and emotional expressions'
    ],
    communicationStyle: 'Factual, clear, concise, and grounded in proven experience.',
    idealServingRoles: [
      'Finance & Audit Committee / Treasurers',
      'Trustees & Facility Stewardship',
      'Security & Safety Teams',
      'Administrative Office Operations'
    ],
    color: '#0284c7',
    bgLight: 'bg-sky-50 text-sky-700',
    bgDark: 'dark:bg-sky-950/40 dark:text-sky-300',
    textColor: 'text-sky-600 dark:text-sky-400',
    borderColor: 'border-sky-200 dark:border-sky-800'
  },
  'ISFJ': {
    code: 'ISFJ',
    name: 'The Protector / Defender',
    temperament: 'Sentinel',
    tagline: 'Warm-hearted, dedicated guardians who tirelessly care for others behind the scenes.',
    shortDescription: 'Humble, compassionate, and conscientious servants who express Christ’s love through faithful acts of service and care.',
    fullDescription: 'ISFJs combine a heart of deep pastoral compassion with practical, hands-on diligence. They remember birthdays, notice who is absent, prepare the Lord’s Supper, and care for the vulnerable with joyful humility.',
    ministryStrengths: [
      'Selfless behind-the-scenes service and hospitality',
      'Remembering personal details and history of church members',
      'Hospital visitation, meal trains, and shut-in support',
      'Creating orderly, warm, and loving environments'
    ],
    growthAreas: [
      'May struggle to say no, leading to fatigue and quiet resentment',
      'Reluctant to ask for help or share personal struggles',
      'Can take changes to beloved routines heavily'
    ],
    communicationStyle: 'Gentle, attentive, supportive, and practical.',
    idealServingRoles: [
      'Meal Trains & Benevolence Ministry',
      'Children’s Nursery & Early Childhood Care',
      'Trustees / Building & Grounds Committee (Sanctuary & Facilities Upkeep)',
      'Shut-in Visitation & Care Teams'
    ],
    color: '#0284c7',
    bgLight: 'bg-sky-50 text-sky-700',
    bgDark: 'dark:bg-sky-950/40 dark:text-sky-300',
    textColor: 'text-sky-600 dark:text-sky-400',
    borderColor: 'border-sky-200 dark:border-sky-800'
  },
  'ESTJ': {
    code: 'ESTJ',
    name: 'The Organizer / Director',
    temperament: 'Sentinel',
    tagline: 'Practical, orderly, and dedicated leaders who manage projects and teams with precision.',
    shortDescription: 'Energetic, decisive, and organized administrators who excel at mobilizing church operations, events, and ministry teams.',
    fullDescription: 'ESTJs are natural administrators who bring order, clarity, and dependable execution to the church. They love establishing clear procedures, managing large volunteer teams, and seeing that God’s work is done decently and in order.',
    ministryStrengths: [
      'Event coordination and logistics management',
      'Leading ushering, greeter, and parking teams',
      'Establishing clear ministry policies and workflows',
      'Direct, trustworthy, and actionable leadership'
    ],
    growthAreas: [
      'Can focus so much on task execution that personal feelings are overlooked',
      'May be blunt in feedback or impatient with disorganization',
      'Encouraged to listen deeply to intuitive and feeling-led suggestions'
    ],
    communicationStyle: 'Direct, organized, actionable, and focused on clear expectations.',
    idealServingRoles: [
      'Service Operations & Usher/Greeter Director',
      'Big Event & Conference Logistics Coordinator',
      'Facility Management & Building Committees',
      'Church Administration Oversight'
    ],
    color: '#0284c7',
    bgLight: 'bg-sky-50 text-sky-700',
    bgDark: 'dark:bg-sky-950/40 dark:text-sky-300',
    textColor: 'text-sky-600 dark:text-sky-400',
    borderColor: 'border-sky-200 dark:border-sky-800'
  },
  'ESFJ': {
    code: 'ESFJ',
    name: 'The Provider / Host',
    temperament: 'Sentinel',
    tagline: 'Warm, cooperative, and highly attentive hosts who make everyone feel loved and welcomed.',
    shortDescription: 'Caring, enthusiastic, and socially connected servants who foster rich fellowship, hospitality, and pastoral care.',
    fullDescription: 'ESFJs are the heart of church community and hospitality. They naturally notice the emotional tone in a room, introduce newcomers, organize church potlucks, and ensure that every person in the congregation feels valued and connected.',
    ministryStrengths: [
      'Outstanding hospitality, ushering, and welcoming',
      'Organizing church dinners, fellowships, and community meals',
      'Connecting members and fostering group bonding',
      'Faithful, tender pastoral support in times of grief or illness'
    ],
    growthAreas: [
      'Can be sensitive to social tension or lack of appreciation',
      'May avoid necessary tough conversations to maintain peace',
      'Needs space to receive care, not just give it'
    ],
    communicationStyle: 'Warm, enthusiastic, personal, and affirming.',
    idealServingRoles: [
      'Hospitality & Fellowship Team Leader',
      'Newcomer Welcome & Coffee Bar Ministry',
      'Women’s/Men’s Fellowship Events Coordinator',
      'Pastoral Care & Follow-Up Team'
    ],
    color: '#0284c7',
    bgLight: 'bg-sky-50 text-sky-700',
    bgDark: 'dark:bg-sky-950/40 dark:text-sky-300',
    textColor: 'text-sky-600 dark:text-sky-400',
    borderColor: 'border-sky-200 dark:border-sky-800'
  },

  // ─── Explorers (SP) ─────────────────────────────────────────────────────────
  'ISTP': {
    code: 'ISTP',
    name: 'The Craftsman / Artisan',
    temperament: 'Explorer',
    tagline: 'Practical, observant, and versatile problem-solvers who serve with hands-on skill.',
    shortDescription: 'Quiet, adaptable, and pragmatic believers who excel at solving tangible problems, technical tasks, and hands-on service.',
    fullDescription: 'ISTPs are hands-on doers who quietly fix things and troubleshoot technical or physical challenges. In the church, they often shine in audio/visual production, building maintenance, disaster relief, and practical benevolence.',
    ministryStrengths: [
      'Audio, video, lighting, and livestream production',
      'Facility repairs, carpentry, and electrical maintenance',
      'Calm, steady presence during emergencies or crises',
      'Practical, non-flashy service where help is needed most'
    ],
    growthAreas: [
      'May feel uncomfortable in highly emotional or verbal small groups',
      'Can be private and reluctant to share personal vulnerabilities',
      'Encouraged to build close brotherly/sisterly friendships'
    ],
    communicationStyle: 'Concise, practical, calm, and action-oriented.',
    idealServingRoles: [
      'A/V & Production Tech Team',
      'Handyman & Maintenance Ministry',
      'Disaster Relief & Practical Benevolence Missions',
      'Setup & Teardown Crews'
    ],
    color: '#f59e0b',
    bgLight: 'bg-amber-50 text-amber-700',
    bgDark: 'dark:bg-amber-950/40 dark:text-amber-300',
    textColor: 'text-amber-600 dark:text-amber-400',
    borderColor: 'border-amber-200 dark:border-amber-800'
  },
  'ISFP': {
    code: 'ISFP',
    name: 'The Artist / Composer',
    temperament: 'Explorer',
    tagline: 'Gentle, authentic, and sensitive believers who enrich worship with heartfelt devotion.',
    shortDescription: 'Modest, caring, and artistic souls who serve with quiet compassion, musical talent, and visual craftsmanship.',
    fullDescription: 'ISFPs worship and serve from a place of deep personal integrity and aesthetic sensitivity. They rarely seek the limelight, preferring to express God’s beauty through music, graphic design, staging, or one-on-one acts of mercy.',
    ministryStrengths: [
      'Heartfelt worship team involvement (instruments / vocal)',
      'Visual arts, stage design, and church aesthetics',
      'Gentle, quiet compassion toward the hurting',
      'Non-judgmental, accepting presence with outsiders'
    ],
    growthAreas: [
      'Can be hesitant to step into public leadership roles',
      'May feel overwhelmed by rigid administrative demands',
      'Needs affirmation and a safe space to share their gifts'
    ],
    communicationStyle: 'Gentle, unassuming, reflective, and supportive.',
    idealServingRoles: [
      'Worship & Instrumental Band',
      'Visual Arts & Graphic / Stage Design',
      'Food Pantry & Street Ministry Outreach',
      'Children’s Crafts & Activity Team'
    ],
    color: '#f59e0b',
    bgLight: 'bg-amber-50 text-amber-700',
    bgDark: 'dark:bg-amber-950/40 dark:text-amber-300',
    textColor: 'text-amber-600 dark:text-amber-400',
    borderColor: 'border-amber-200 dark:border-amber-800'
  },
  'ESTP': {
    code: 'ESTP',
    name: 'The Catalyst / Dynamo',
    temperament: 'Explorer',
    tagline: 'Energetic, bold, and adaptable action-takers who thrive in dynamic ministry settings.',
    shortDescription: 'Outgoing, spontaneous, and bold leaders who love active outreach, sports ministries, and solving immediate real-time challenges.',
    fullDescription: 'ESTPs bring an infectious energy and readiness to act. They are at their best in fast-paced ministry environments like youth camps, sports outreach, and community events where quick thinking and boldness make a major impact.',
    ministryStrengths: [
      'Engaging unchurched people in casual, real-world settings',
      'Leading sports camps, youth games, and dynamic events',
      'Crisis response and handling spontaneous emergencies',
      'Enthusiastic and action-driven volunteer recruitment'
    ],
    growthAreas: [
      'May find routine meetings and abstract discussions boring',
      'Can act before fully thinking through long-term consequences',
      'Benefits from steady mentors who help with follow-through'
    ],
    communicationStyle: 'Direct, energetic, humorous, and relatable.',
    idealServingRoles: [
      'Youth & Middle School Activities Leader',
      'Sports & Recreation Ministry',
      'Community Outreach & Block Party Events',
      'Security & Emergency Response'
    ],
    color: '#f59e0b',
    bgLight: 'bg-amber-50 text-amber-700',
    bgDark: 'dark:bg-amber-950/40 dark:text-amber-300',
    textColor: 'text-amber-600 dark:text-amber-400',
    borderColor: 'border-amber-200 dark:border-amber-800'
  },
  'ESFP': {
    code: 'ESFP',
    name: 'The Encourager / Performer',
    temperament: 'Explorer',
    tagline: 'Joyful, spontaneous, and vibrant believers who make church feel alive, welcoming, and celebratory.',
    shortDescription: 'Warm, fun-loving, and expressive champions who bring celebration, hospitality, and enthusiastic community engagement.',
    fullDescription: 'ESFPs love people and love life. In the church, they make Sunday mornings vibrant and joyful. They excel in children’s ministry, hospitality, theatrical drama, and any role where sharing God’s love with excitement and laughter is key.',
    ministryStrengths: [
      'Engaging children with high-energy stories and songs',
      'Vibrant hospitality and making newcomers feel welcomed',
      'Organizing fun church celebrations and community picnics',
      'Spontaneous generosity and cheering up the discouraged'
    ],
    growthAreas: [
      'Can be prone to avoiding solemn or heavy administrative tasks',
      'May struggle with long-range strategic planning',
      'Needs encouragement to develop regular devotional discipline'
    ],
    communicationStyle: 'Lively, expressive, engaging, and full of warmth.',
    idealServingRoles: [
      'Children’s Church Host & Puppetry/Drama',
      'Welcome Team & Greeter Captain',
      'Church Social Events & Fellowship Team',
      'Youth Camp Counselor'
    ],
    color: '#f59e0b',
    bgLight: 'bg-amber-50 text-amber-700',
    bgDark: 'dark:bg-amber-950/40 dark:text-amber-300',
    textColor: 'text-amber-600 dark:text-amber-400',
    borderColor: 'border-amber-200 dark:border-amber-800'
  }
};

/**
 * 28-Question Calibrated Myers-Briggs Assessment
 * 7 Questions per dimension:
 *   - Questions 1–7:   Extraversion (E) vs. Introversion (I)
 *   - Questions 8–14:  Sensing (S) vs. Intuition (N)
 *   - Questions 15–21: Thinking (T) vs. Feeling (F)
 *   - Questions 22–28: Judging (J) vs. Perceiving (P)
 */
export const MBTI_QUESTIONS: MbtiQuestion[] = [
  // ── Extraversion vs. Introversion (Q1 - Q7) ──────────────────────────────────
  { id: 1,  dimension: 'EI', direction: 'E', text: 'I gain energy and feel refreshed when interacting with large groups of people.' },
  { id: 2,  dimension: 'EI', direction: 'I', text: 'After a busy social event or Sunday service, I need quiet alone time to recharge my energy.' },
  { id: 3,  dimension: 'EI', direction: 'E', text: 'I tend to process my thoughts and ideas out loud by talking them through with others.' },
  { id: 4,  dimension: 'EI', direction: 'I', text: 'I prefer having deep conversations with one or two close friends over mingling in large gatherings.' },
  { id: 5,  dimension: 'EI', direction: 'E', text: 'I easily start conversations with new visitors and strangers at church.' },
  { id: 6,  dimension: 'EI', direction: 'I', text: 'I usually prefer to observe and listen in group settings before speaking up.' },
  { id: 7,  dimension: 'EI', direction: 'E', text: 'I feel enthusiastic when working in bustling, active team environments.' },

  // ── Sensing vs. Intuition (Q8 - Q14) ─────────────────────────────────────────
  { id: 8,  dimension: 'SN', direction: 'S', text: 'I prefer concrete facts, practical examples, and proven methods over abstract theories.' },
  { id: 9,  dimension: 'SN', direction: 'N', text: 'I am drawn to visionary ideas, future possibilities, and discovering the deeper meaning behind things.' },
  { id: 10, dimension: 'SN', direction: 'S', text: 'I pay close attention to immediate practical details and realistic logistics in ministry projects.' },
  { id: 11, dimension: 'SN', direction: 'N', text: 'I enjoy reading between the lines and spotting big-picture patterns and metaphors in Scripture.' },
  { id: 12, dimension: 'SN', direction: 'S', text: 'I trust hands-on experience and what has demonstrably worked in the past.' },
  { id: 13, dimension: 'SN', direction: 'N', text: 'I find routine methods uninspiring and prefer inventing fresh, new approaches to challenges.' },
  { id: 14, dimension: 'SN', direction: 'S', text: 'When listening to a sermon or teaching, I look for step-by-step practical applications for daily life.' },

  // ── Thinking vs. Feeling (Q15 - Q21) ─────────────────────────────────────────
  { id: 15, dimension: 'TF', direction: 'T', text: 'When making important decisions, I prioritize objective logic and consistency over personal feelings.' },
  { id: 16, dimension: 'TF', direction: 'F', text: 'When making decisions, I carefully weigh how the outcome will affect people’s emotions and relationships.' },
  { id: 17, dimension: 'TF', direction: 'T', text: 'I am comfortable offering constructive criticism if it helps solve a ministry problem.' },
  { id: 18, dimension: 'TF', direction: 'F', text: 'I naturally prioritize harmony, encouragement, and ensuring everyone feels valued in team discussions.' },
  { id: 19, dimension: 'TF', direction: 'T', text: 'I value fairness based on clear, uniform standards applied equally to all situations.' },
  { id: 20, dimension: 'TF', direction: 'F', text: 'I am very sensitive to the personal struggles of others and often lead with mercy over rigid rules.' },
  { id: 21, dimension: 'TF', direction: 'T', text: 'I prefer analyzing issues with a cool head rather than being swayed by emotional appeals.' },

  // ── Judging vs. Perceiving (Q22 - Q28) ───────────────────────────────────────
  { id: 22, dimension: 'JP', direction: 'J', text: 'I feel most peaceful when my schedule and responsibilities are planned and settled in advance.' },
  { id: 23, dimension: 'JP', direction: 'P', text: 'I enjoy being spontaneous and keeping my options open rather than sticking to a rigid agenda.' },
  { id: 24, dimension: 'JP', direction: 'J', text: 'I like completing tasks well ahead of deadlines and checking items off my to-do list.' },
  { id: 25, dimension: 'JP', direction: 'P', text: 'I work well under the pressure of upcoming deadlines and adapt quickly to sudden changes.' },
  { id: 26, dimension: 'JP', direction: 'J', text: 'Disorganized environments and last-minute changes create stress for me.' },
  { id: 27, dimension: 'JP', direction: 'P', text: 'I see rules and schedules as flexible guidelines that can be altered as new opportunities arise.' },
  { id: 28, dimension: 'JP', direction: 'J', text: 'I appreciate clear structures, orderly outlines, and predictable ministry workflows.' }
];

export interface CalculatedMbtiResult {
  mbtiType: string;
  profile: MbtiTypeProfile;
  dimensionScores: {
    eScore: number;
    iScore: number;
    sScore: number;
    nScore: number;
    tScore: number;
    fScore: number;
    jScore: number;
    pScore: number;
  };
  traitPercentages: {
    energy: { type: 'E' | 'I'; percent: number; ePercent: number; iPercent: number };
    information: { type: 'S' | 'N'; percent: number; sPercent: number; nPercent: number };
    decisions: { type: 'T' | 'F'; percent: number; tPercent: number; fPercent: number };
    structure: { type: 'J' | 'P'; percent: number; jPercent: number; pPercent: number };
  };
}

/**
 * Calculates MBTI Personality Type and detailed dimension percentages from 28 answers.
 */
export function calculateMbtiType(answers: Record<number, number>): CalculatedMbtiResult {
  let eScore = 0;
  let iScore = 0;
  let sScore = 0;
  let nScore = 0;
  let tScore = 0;
  let fScore = 0;
  let jScore = 0;
  let pScore = 0;

  MBTI_QUESTIONS.forEach(q => {
    const val = Number(answers[q.id]) || 3; // default neutral 3 if missing
    
    switch (q.dimension) {
      case 'EI':
        if (q.direction === 'E') {
          eScore += val;
          iScore += (6 - val);
        } else {
          iScore += val;
          eScore += (6 - val);
        }
        break;

      case 'SN':
        if (q.direction === 'S') {
          sScore += val;
          nScore += (6 - val);
        } else {
          nScore += val;
          sScore += (6 - val);
        }
        break;

      case 'TF':
        if (q.direction === 'T') {
          tScore += val;
          fScore += (6 - val);
        } else {
          fScore += val;
          tScore += (6 - val);
        }
        break;

      case 'JP':
        if (q.direction === 'J') {
          jScore += val;
          pScore += (6 - val);
        } else {
          pScore += val;
          jScore += (6 - val);
        }
        break;
    }
  });

  // Calculate percentages with division-by-zero safeguards
  const eTotal = (eScore + iScore) || 1;
  const sTotal = (sScore + nScore) || 1;
  const tTotal = (tScore + fScore) || 1;
  const jTotal = (jScore + pScore) || 1;

  const ePercent = Math.min(100, Math.max(0, Math.round((eScore / eTotal) * 100)));
  const iPercent = 100 - ePercent;

  const sPercent = Math.min(100, Math.max(0, Math.round((sScore / sTotal) * 100)));
  const nPercent = 100 - sPercent;

  const tPercent = Math.min(100, Math.max(0, Math.round((tScore / tTotal) * 100)));
  const fPercent = 100 - tPercent;

  const jPercent = Math.min(100, Math.max(0, Math.round((jScore / jTotal) * 100)));
  const pPercent = 100 - jPercent;

  // Determine letters (ties default to E, N, F, J)
  const letter1 = eScore >= iScore ? 'E' : 'I';
  const letter2 = nScore >= sScore ? 'N' : 'S';
  const letter3 = fScore >= tScore ? 'F' : 'T';
  const letter4 = jScore >= pScore ? 'J' : 'P';

  const mbtiType = `${letter1}${letter2}${letter3}${letter4}`;
  const profile = MBTI_TYPE_PROFILES[mbtiType] || MBTI_TYPE_PROFILES['ENFJ'];

  return {
    mbtiType,
    profile,
    dimensionScores: {
      eScore, iScore,
      sScore, nScore,
      tScore, fScore,
      jScore, pScore
    },
    traitPercentages: {
      energy: {
        type: letter1,
        percent: letter1 === 'E' ? ePercent : iPercent,
        ePercent,
        iPercent
      },
      information: {
        type: letter2,
        percent: letter2 === 'S' ? sPercent : nPercent,
        sPercent,
        nPercent
      },
      decisions: {
        type: letter3,
        percent: letter3 === 'T' ? tPercent : fPercent,
        tPercent,
        fPercent
      },
      structure: {
        type: letter4,
        percent: letter4 === 'J' ? jPercent : pPercent,
        jPercent,
        pPercent
      }
    }
  };
}
