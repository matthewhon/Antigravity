export type SpiritualGiftType = 'Helps' | 'Teaching' | 'Encouragement' | 'Administration' | 'Mercy' | 'Giving';

export interface SpiritualGiftsTestQuestion {
  id: number;
  text: string;
  category: SpiritualGiftType;
}

export interface SpiritualGiftDefinition {
  name: SpiritualGiftType;
  biblicalTitle?: string;
  shortDescription: string;
  fullDescription: string;
  scriptureReferences: string[];
  recommendedServingAreas: string[];
  color: string;
  bgLight: string;
  bgDark: string;
  textColor: string;
  borderColor: string;
}

export const SPIRITUAL_GIFTS_DEFINITIONS: Record<SpiritualGiftType, SpiritualGiftDefinition> = {
  'Helps': {
    name: 'Helps',
    biblicalTitle: 'Ministry / Helps',
    shortDescription: 'A desire to serve and help God’s people with practical needs.',
    fullDescription: 'The spiritual gift of Helps (also referred to as Ministry) is the God-given desire and capability to invest energy and effort in practical ways to assist and relieve others, freeing them up and strengthening the work of the church behind the scenes.',
    scriptureReferences: ['Romans 12:7', '1 Corinthians 12:28', '1 Peter 4:10'],
    recommendedServingAreas: [
      'Hospitality & Ushering Team',
      'Event Setup & Facilities Crew',
      'Food Pantry & Benevolence Ministry',
      'Production & Tech Support',
      'Children & Youth Logistics'
    ],
    color: '#0284c7', // Sky blue
    bgLight: 'bg-sky-50 text-sky-700',
    bgDark: 'dark:bg-sky-950/40 dark:text-sky-300',
    textColor: 'text-sky-600 dark:text-sky-400',
    borderColor: 'border-sky-200 dark:border-sky-800'
  },
  'Teaching': {
    name: 'Teaching',
    biblicalTitle: 'Teaching',
    shortDescription: 'The ability to teach God’s truth and help people understand how His Word applies to them.',
    fullDescription: 'The spiritual gift of Teaching is the God-given ability to understand, clearly explain, and systematically communicate biblical truth so that believers grow in faith and understanding of Scripture.',
    scriptureReferences: ['Romans 12:7', '1 Corinthians 12:28', 'Ephesians 4:11', 'Colossians 3:16'],
    recommendedServingAreas: [
      'Adult Bible Fellowships & Small Group Leaders',
      'Youth & Children’s Sunday School Teachers',
      'Discipleship Mentoring',
      'New Believers / Foundations Classes',
      'Curriculum Development'
    ],
    color: '#8b5cf6', // Violet
    bgLight: 'bg-violet-50 text-violet-700',
    bgDark: 'dark:bg-violet-950/40 dark:text-violet-300',
    textColor: 'text-violet-600 dark:text-violet-400',
    borderColor: 'border-violet-200 dark:border-violet-800'
  },
  'Encouragement': {
    name: 'Encouragement',
    biblicalTitle: 'Exhortation / Encouragement',
    shortDescription: 'The ability and desire to encourage, motivate, and counsel others in the Christian life.',
    fullDescription: 'The spiritual gift of Encouragement (Exhortation) is the God-given enablement to stimulate faith in others, comfort the downhearted, and urge believers onward toward spiritual maturity and action with hope.',
    scriptureReferences: ['Romans 12:8', '1 Thessalonians 5:11', 'Hebrews 10:24-25'],
    recommendedServingAreas: [
      'Care & Follow-Up Ministry',
      'New Visitor Welcoming & Assimilation',
      'Prayer Team & Hospital Visitation',
      'Small Group Facilitator / Co-Leader',
      'Youth Mentorship'
    ],
    color: '#10b981', // Emerald
    bgLight: 'bg-emerald-50 text-emerald-700',
    bgDark: 'dark:bg-emerald-950/40 dark:text-emerald-300',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    borderColor: 'border-emerald-200 dark:border-emerald-800'
  },
  'Administration': {
    name: 'Administration',
    biblicalTitle: 'Ruling / Administration',
    shortDescription: 'The ability to lead, organize, plan, and administrate parts of God’s work.',
    fullDescription: 'The spiritual gift of Administration (Ruling) is the God-given capacity to organize people, clarify objectives, coordinate tasks, and lead teams effectively to accomplish the mission of Christ’s church with diligence.',
    scriptureReferences: ['Romans 12:8', '1 Corinthians 12:28', 'Titus 1:5'],
    recommendedServingAreas: [
      'Ministry Team Leadership & Coordination',
      'Church Event Planning & Logistics',
      'Volunteer Operations & Scheduling',
      'Special Projects & Outreach Campaigns',
      'Administrative Office Support'
    ],
    color: '#f59e0b', // Amber
    bgLight: 'bg-amber-50 text-amber-700',
    bgDark: 'dark:bg-amber-950/40 dark:text-amber-300',
    textColor: 'text-amber-600 dark:text-amber-400',
    borderColor: 'border-amber-200 dark:border-amber-800'
  },
  'Mercy': {
    name: 'Mercy',
    biblicalTitle: 'Showing Mercy',
    shortDescription: 'The ability to feel the pain of others and provide compassionate comfort and help.',
    fullDescription: 'The spiritual gift of Mercy is the God-given sensitivity to perceive hurt and distress in others, accompanied by an authentic compassion and cheerful readiness to come alongside and minister comfort.',
    scriptureReferences: ['Romans 12:8', 'Matthew 25:35-40', 'Luke 10:33-37'],
    recommendedServingAreas: [
      'Pastoral Care & Hospital Visits',
      'Grief Support & Counseling Aid',
      'Shut-in & Senior Care Ministry',
      'Community Outreach & Relief Efforts',
      'Crisis Response & Meals Ministry'
    ],
    color: '#ec4899', // Pink / Rose
    bgLight: 'bg-pink-50 text-pink-700',
    bgDark: 'dark:bg-pink-950/40 dark:text-pink-300',
    textColor: 'text-pink-600 dark:text-pink-400',
    borderColor: 'border-pink-200 dark:border-pink-800'
  },
  'Giving': {
    name: 'Giving',
    biblicalTitle: 'Giving',
    shortDescription: 'The ability and desire to give generously and cheerfully to God’s work and people.',
    fullDescription: 'The spiritual gift of Giving is the God-given motivation and capacity to contribute financial resources, possessions, and assets to the Lord’s work with joy, simplicity, and discernment without seeking personal acclaim.',
    scriptureReferences: ['Romans 12:8', '2 Corinthians 8:1-7', '2 Corinthians 9:6-8'],
    recommendedServingAreas: [
      'Missions Committee & Support',
      'Building & Stewardship Campaigns',
      'Benevolence & Emergency Assistance Funds',
      'Special Projects & Church Planting',
      'Financial Stewardship Mentoring'
    ],
    color: '#6366f1', // Indigo
    bgLight: 'bg-indigo-50 text-indigo-700',
    bgDark: 'dark:bg-indigo-950/40 dark:text-indigo-300',
    textColor: 'text-indigo-600 dark:text-indigo-400',
    borderColor: 'border-indigo-200 dark:border-indigo-800'
  }
};

/**
 * 42 Assessment Questions faithfully transcribed from the attached Spiritual Gifts Test PDF.
 * Each of the 6 gifts has exactly 7 questions, scoring 1-5 (max 35 per gift).
 */
export const SPIRITUAL_GIFTS_QUESTIONS: SpiritualGiftsTestQuestion[] = [
  // Question 1–6 (Row 1)
  { id: 1,  text: 'I am always looking for practical ways to help.', category: 'Helps' },
  { id: 2,  text: 'I enjoy public speaking and teaching.', category: 'Teaching' },
  { id: 3,  text: 'I find it easy to motivate people to do the right thing.', category: 'Encouragement' },
  { id: 4,  text: 'I am a “take charge” person who can usually bring order out of chaos.', category: 'Administration' },
  { id: 5,  text: 'I am very sensitive to the emotional state of others.', category: 'Mercy' },
  { id: 6,  text: 'I am able to discern wise investments so as to have more to give.', category: 'Giving' },

  // Question 7–12 (Row 2)
  { id: 7,  text: 'When people are in my home, I like to wait on them “hand and foot.”', category: 'Helps' },
  { id: 8,  text: 'People often tell me that I helped them understand things better.', category: 'Teaching' },
  { id: 9,  text: 'I am always uplifting those who are around me.', category: 'Encouragement' },
  { id: 10, text: 'I can organize people and delegate easily.', category: 'Administration' },
  { id: 11, text: 'I am an easy mark for stray animals, especially if they are hurt.', category: 'Mercy' },
  { id: 12, text: 'I have a desire to give quietly without public notice.', category: 'Giving' },

  // Question 13–18 (Row 3)
  { id: 13, text: 'I often stop to help motorists in trouble (if not dangerous).', category: 'Helps' },
  { id: 14, text: 'I prefer systematic Bible teaching as opposed to a series of unrelated topics.', category: 'Teaching' },
  { id: 15, text: 'When people ask my advice, I suggest a definite course of action.', category: 'Encouragement' },
  { id: 16, text: 'I enjoy a team effort more than doing the work myself.', category: 'Administration' },
  { id: 17, text: 'People in emotional distress often come to me for comfort.', category: 'Mercy' },
  { id: 18, text: 'I am motivated to give unto the Lord at His prompting, not man’s.', category: 'Giving' },

  // Question 19–24 (Row 4)
  { id: 19, text: 'I sometimes get irritated when others don’t jump in to help.', category: 'Helps' },
  { id: 20, text: 'I find it easy to illustrate spiritual truths and make them clear.', category: 'Teaching' },
  { id: 21, text: 'I tend to be optimistic—always giving hope.', category: 'Encouragement' },
  { id: 22, text: 'People who talk about problems, but never take action, irritate me.', category: 'Administration' },
  { id: 23, text: 'I am sometimes accused of being too soft on sin.', category: 'Mercy' },
  { id: 24, text: 'I have a desire to give gifts that are of high quality.', category: 'Giving' },

  // Question 25–30 (Row 5)
  { id: 25, text: 'I find it almost impossible to say no to others.', category: 'Helps' },
  { id: 26, text: 'Disorganized messages (with no outline) irritate me.', category: 'Teaching' },
  { id: 27, text: 'Even in failure, I see the potential in people.', category: 'Encouragement' },
  { id: 28, text: 'I am a goal-oriented person.', category: 'Administration' },
  { id: 29, text: 'I am reluctant to confront people; I don’t want to hurt them.', category: 'Mercy' },
  { id: 30, text: 'I have an ability to test faithfulness by how people handle funds.', category: 'Giving' },

  // Question 31–36 (Row 6)
  { id: 31, text: 'I prefer a “behind the scenes” role. I am not an “up front” person.', category: 'Helps' },
  { id: 32, text: 'I get upset with people who use verses out of context.', category: 'Teaching' },
  { id: 33, text: 'I am able to encourage others, even when I am suffering.', category: 'Encouragement' },
  { id: 34, text: 'I am “pushy” and demanding—driving people to the limit.', category: 'Administration' },
  { id: 35, text: 'I love ministering to the sick, to the poor, and to the handicapped.', category: 'Mercy' },
  { id: 36, text: 'It is important to be involved in meeting the church’s financial need.', category: 'Giving' },

  // Question 37–42 (Row 7)
  { id: 37, text: 'I find it difficult to delegate; it is usually easier to do the job myself.', category: 'Helps' },
  { id: 38, text: 'People tease me about being a “bookworm”.', category: 'Teaching' },
  { id: 39, text: 'People tease me about being a “cheerleader”.', category: 'Encouragement' },
  { id: 40, text: 'Some say projects are more important to me than people are.', category: 'Administration' },
  { id: 41, text: 'Others tell me that I am a good listener.', category: 'Mercy' },
  { id: 42, text: 'When giving to God’s work, it is important that I consult with my spouse.', category: 'Giving' }
];

export interface CalculatedGiftsResult {
  scores: {
    helps: number;
    teaching: number;
    encouragement: number;
    administration: number;
    mercy: number;
    giving: number;
  };
  primaryGift: SpiritualGiftType;
  secondaryGift: SpiritualGiftType;
  rankedGifts: {
    gift: SpiritualGiftType;
    score: number;
    percentage: number;
  }[];
}

/**
 * Calculates scores for all 6 spiritual gifts based on the 42 answers.
 * Returns scores out of 35 per gift, ranked gifts, primary gift, and secondary gift.
 */
export function calculateSpiritualGifts(answers: Record<number, number>): CalculatedGiftsResult {
  const scores = {
    helps: 0,
    teaching: 0,
    encouragement: 0,
    administration: 0,
    mercy: 0,
    giving: 0
  };

  SPIRITUAL_GIFTS_QUESTIONS.forEach(q => {
    const val = Number(answers[q.id]) || 0;
    switch (q.category) {
      case 'Helps':
        scores.helps += val;
        break;
      case 'Teaching':
        scores.teaching += val;
        break;
      case 'Encouragement':
        scores.encouragement += val;
        break;
      case 'Administration':
        scores.administration += val;
        break;
      case 'Mercy':
        scores.mercy += val;
        break;
      case 'Giving':
        scores.giving += val;
        break;
    }
  });

  const list: { gift: SpiritualGiftType; score: number; percentage: number }[] = [
    { gift: 'Helps', score: scores.helps, percentage: Math.round((scores.helps / 35) * 100) },
    { gift: 'Teaching', score: scores.teaching, percentage: Math.round((scores.teaching / 35) * 100) },
    { gift: 'Encouragement', score: scores.encouragement, percentage: Math.round((scores.encouragement / 35) * 100) },
    { gift: 'Administration', score: scores.administration, percentage: Math.round((scores.administration / 35) * 100) },
    { gift: 'Mercy', score: scores.mercy, percentage: Math.round((scores.mercy / 35) * 100) },
    { gift: 'Giving', score: scores.giving, percentage: Math.round((scores.giving / 35) * 100) },
  ];

  list.sort((a, b) => b.score - a.score);

  return {
    scores,
    primaryGift: list[0]?.gift || 'Helps',
    secondaryGift: list[1]?.gift || 'Encouragement',
    rankedGifts: list
  };
}

export const SPIRITUAL_GIFTS_SCRIPTURES = {
  firstPeter: {
    verse: '1 Peter 4:10',
    text: '“As every man hath received the gift, even so minister the same one to another, as good stewards of the manifold grace of God.”'
  },
  firstCorinthians: {
    verse: '1 Corinthians 12:18, 20–22',
    text: '“But now hath God set the members every one of them in the body, as it hath pleased him... And if they were all one member, where were the body? But now are they many members, yet but one body. And the eye cannot say unto the hand, I have no need of thee: nor again the head to the feet, I have no need of you. Nay, much more those members of the body, which seem to be more feeble, are necessary.”'
  },
  romans: {
    verse: 'Romans 12:6–8',
    text: '“Having then gifts differing according to the grace that is given to us, whether prophecy, let us prophesy according to the proportion of faith; Or ministry, let us wait on our ministering: or he that teacheth, on teaching; Or he that exhorteth, on exhortation: he that giveth, let him do it with simplicity; he that ruleth, with diligence; he that sheweth mercy, with cheerfulness.”'
  }
};
