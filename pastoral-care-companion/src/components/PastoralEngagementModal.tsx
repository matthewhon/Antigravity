import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, MessageSquare, Sparkles, Heart, Shield, CheckCircle2, 
  AlertCircle, Compass, Brain, Copy, Check, Send, Phone, 
  Mail, ExternalLink, BookOpen, Target, Users, Zap, 
  Flame, Award, Layers, HelpCircle, ChevronRight, User
} from 'lucide-react';
import { GiftsTestResponse, MbtiTestResponse, DiscTestResponse, SpiritualGiftType } from '../types';
import { SPIRITUAL_GIFTS_DEFINITIONS } from '../constants/spiritualGiftsTestData';
import { DISC_PROFILES } from '../constants/discTestData';
import { MBTI_TYPE_PROFILES } from '../constants/mbtiTestData';

export interface PastoralEngagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  personName: string;
  email?: string | null;
  phone?: string | null;
  personId?: string | null;
  churchId: string;
  giftsResponse?: GiftsTestResponse | null;
  mbtiResponse?: MbtiTestResponse | null;
  discResponse?: DiscTestResponse | null;
  onOpenPersonProfile?: (personId: string) => void;
}

// Shepherding insights for each Spiritual Gift
const GIFT_SHEPHERDING_INSIGHTS: Record<SpiritualGiftType, {
  communicationAdvice: string[];
  whatToAvoid: string[];
  coreMotivations: string[];
  burnoutWarnings: string[];
  shepherdingApproach: string;
  idealMinistryRoles: string[];
  scriptureAnchor: { verse: string; text: string };
}> = {
  'Helps': {
    communicationAdvice: [
      'Express genuine, specific gratitude for unseen, behind-the-scenes tasks.',
      'Give clear, concrete details when asking for practical assistance.',
      'Check in on their personal well-being, not just their service availability.'
    ],
    whatToAvoid: [
      'Avoid taking their willingness to serve for granted.',
      'Avoid vague or abstract requests without clear logistical parameters.',
      'Avoid public pressure—they prefer quiet recognition over flashy spotlight.'
    ],
    coreMotivations: [
      'Relieving others of burdens so ministry can thrive.',
      'Seeing tangible, practical needs met in the church family.',
      'Serving Jesus quietly and faithfully as a faithful steward.'
    ],
    burnoutWarnings: [
      'Difficulty saying "no" to ministry needs leading to exhaustion.',
      'Feeling unappreciated or treated as merely "labor" rather than family.',
      'Quiet withdrawal after prolonged overload.'
    ],
    shepherdingApproach: 'Actively protect their schedule. Regularly ask "What can we take off your plate?" and affirm their vital role in the Body of Christ.',
    idealMinistryRoles: [
      'Hospitality & Facilities Team',
      'Event Setup & Food Pantry Distribution',
      'Production, Tech & Audio/Visual Logistics',
      'Children\'s Check-in & Classroom Preparation'
    ],
    scriptureAnchor: {
      verse: '1 Corinthians 12:28 (KJV)',
      text: 'And God hath set some in the church, first apostles, secondarily prophets, thirdly teachers, after that miracles, then gifts of healings, helps, governments, diversities of tongues.'
    }
  },
  'Teaching': {
    communicationAdvice: [
      'Engage them with biblical depth, theological clarity, and sound doctrine.',
      'Give them adequate preparation time; do not ask for on-the-spot formal lessons.',
      'Provide opportunities for thoughtful Q&A and doctrinal discussion.'
    ],
    whatToAvoid: [
      'Avoid superficial answers or brushing off theological questions.',
      'Avoid last-minute curriculum changes without sufficient runway.',
      'Avoid assuming they enjoy administration just because they are organized.'
    ],
    coreMotivations: [
      'Helping believers understand and rightly divide God’s Word.',
      'Systematic spiritual growth and doctrinal accuracy in the church.',
      'Digging into scripture commentaries, original context, and life application.'
    ],
    burnoutWarnings: [
      'Frustration when church programs lack biblical depth or substance.',
      'Intellectual exhaustion from excessive teaching without time for personal study.',
      'Becoming hyper-critical of other speakers or materials.'
    ],
    shepherdingApproach: 'Feed them spiritually with deep fellowship and theological resources. Connect them with teaching avenues that match their preparation style.',
    idealMinistryRoles: [
      'Adult Bible Fellowships & Small Group Teaching',
      'New Believers & Doctrinal Foundations Classes',
      'Curriculum Development & Research',
      'Youth & Children’s Biblical Education'
    ],
    scriptureAnchor: {
      verse: '2 Timothy 2:2 (KJV)',
      text: 'And the things that thou heard of me among many witnesses, the same commit thou to faithful men, who shall be able to teach others also.'
    }
  },
  'Encouragement': {
    communicationAdvice: [
      'Use warm, personal, and uplifting language.',
      'Invite their input on relational atmosphere and member morale.',
      'Keep regular check-ins where you speak words of affirmation into their life.'
    ],
    whatToAvoid: [
      'Avoid an overly cold, transactional, or purely bureaucratic tone.',
      'Avoid ignoring the relational or emotional pulse of a meeting.',
      'Avoid failing to encourage them—the encourager often needs encouragement most!'
    ],
    coreMotivations: [
      'Seeing wounded or discouraged believers restored to hope and action.',
      'Spurring others on toward spiritual maturity and victory in Christ.',
      'Creating an atmosphere of warmth, faith, and mutual love.'
    ],
    burnoutWarnings: [
      'Emotional drainage from carrying too many people\'s spiritual burdens.',
      'Disillusionment when their encouragement is met with hardened negativity.',
      'Neglecting their own rest while ministering to everyone else.'
    ],
    shepherdingApproach: 'Make sure you are pouring into their cup. Ask them "Who is encouraging you right now?" and celebrate their relational impact.',
    idealMinistryRoles: [
      'New Visitor Assimilation & Welcome Team',
      'Pastoral Follow-Up & Member Care Ministry',
      'Small Group Facilitator / Discipleship Mentor',
      'Hospital & Shut-in Visitation'
    ],
    scriptureAnchor: {
      verse: 'Hebrews 10:24-25 (KJV)',
      text: 'And let us consider one another to provoke unto love and to good works: Not forsaking the assembling of ourselves together... but exhorting one another.'
    }
  },
  'Administration': {
    communicationAdvice: [
      'Be structured, clear about objectives, and communicate timelines in advance.',
      'Provide agendas before meetings and follow up with written summaries.',
      'Give them ownership of processes, systems, and logistical frameworks.'
    ],
    whatToAvoid: [
      'Avoid disorganization, constant last-minute shifts, or unclear goals.',
      'Avoid micromanaging once you have delegated a project to them.',
      'Avoid disregarding their logistical advice or timeline warnings.'
    ],
    coreMotivations: [
      'Bringing divine order, efficiency, and excellence to God’s house.',
      'Empowering ministry teams to run smoothly without chaos.',
      'Seeing church vision translated into executed plans.'
    ],
    burnoutWarnings: [
      'Overwhelming stress when leadership lacks clear direction or vision.',
      'Becoming cynical when people don\'t follow agreed procedures.',
      'Attempting to fix every logistical issue single-handedly.'
    ],
    shepherdingApproach: 'Align them with clear pastoral vision. Give them authority commensurate with their responsibility, and back them up in standardizing workflows.',
    idealMinistryRoles: [
      'Volunteer Operations & Scheduling Coordinator',
      'Major Church Event Planning & Logistics',
      'Ministry Team Leader / Project Coordinator',
      'Facilities & Ministry Resource Management'
    ],
    scriptureAnchor: {
      verse: '1 Corinthians 14:40 (KJV)',
      text: 'Let all things be done decently and in order.'
    }
  },
  'Mercy': {
    communicationAdvice: [
      'Speak with gentle empathy, kindness, and unhurried attentiveness.',
      'Validate their heart for the hurting and vulnerable.',
      'Protect an environment where authenticity and vulnerability are safe.'
    ],
    whatToAvoid: [
      'Avoid harsh, blunt, or dismissive remarks about people\'s struggles.',
      'Avoid pressuring them into aggressive confrontation or punitive roles.',
      'Avoid prioritizing programs over the hurting individuals in front of you.'
    ],
    coreMotivations: [
      'Comforting those in pain, grief, sickness, or loneliness.',
      'Reflecting the compassionate heart of Christ to the brokenhearted.',
      'Creating a safe, non-judgmental harbor for struggling believers.'
    ],
    burnoutWarnings: [
      'Secondary trauma and severe emotional fatigue from absorbing others\' pain.',
      'Difficulty maintaining healthy personal boundaries with needy individuals.',
      'Feeling isolated or misunderstood in task-driven environments.'
    ],
    shepherdingApproach: 'Check in regularly on their heart and boundaries. Remind them that Christ is the Savior, and encourage Sabbath rest to restore their emotional reserves.',
    idealMinistryRoles: [
      'Hospital, Bereavement & Shut-In Ministry',
      'Benevolence & Community Care Team',
      'Crisis Support & Counseling Follow-Up',
      'Prayer Team & Recovery Ministry Support'
    ],
    scriptureAnchor: {
      verse: 'Colossians 3:12 (KJV)',
      text: 'Put on therefore, as the elect of God, holy and beloved, bowels of mercies, kindness, humbleness of mind, meekness, longsuffering.'
    }
  },
  'Giving': {
    communicationAdvice: [
      'Share transparent kingdom vision and the tangible spiritual fruit of projects.',
      'Maintain strict confidentiality and respect regarding their stewardship.',
      'Invite their insight on kingdom resource allocation and impact.'
    ],
    whatToAvoid: [
      'Avoid treating them merely as a financial source or making them feel targeted.',
      'Avoid lack of financial transparency or vague accountability.',
      'Avoid making public spectacles of their generosity without permission.'
    ],
    coreMotivations: [
      'Investing resources strategically to advance the Gospel and bless others.',
      'Seeing God multiply sacrificial generosity for His glory.',
      'Meeting urgent needs that unleash new ministry breakthroughs.'
    ],
    burnoutWarnings: [
      'Frustration when church funds or resources are mismanaged.',
      'Feeling commodified rather than loved as a disciple of Christ.',
      'Guilt over not being able to fund every request that comes their way.'
    ],
    shepherdingApproach: 'Pastor their heart, not their wallet. Disciple them in finding joy in cheerful giving with simplicity (Romans 12:8), and share confidential kingdom updates with them.',
    idealMinistryRoles: [
      'Missions & Outreach Committee',
      'Stewardship & Benevolence Advisory',
      'Special Projects & Building Campaign Support',
      'Church Planter & Missionary Sponsorship'
    ],
    scriptureAnchor: {
      verse: '2 Corinthians 9:7 (KJV)',
      text: 'Every man according as he purposeth in his heart, so let him give; not grudgingly, or of necessity: for God loveth a cheerful giver.'
    }
  }
};

export const PastoralEngagementModal: React.FC<PastoralEngagementModalProps> = ({
  isOpen,
  onClose,
  personName,
  email,
  phone,
  personId,
  churchId,
  giftsResponse,
  mbtiResponse,
  discResponse,
  onOpenPersonProfile
}) => {
  const [activeTab, setActiveTab] = useState<'communication' | 'shepherding' | 'ministry' | 'scripts'>('communication');
  const [copiedScriptIndex, setCopiedScriptIndex] = useState<number | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);

  // Derived profiles
  const discProfile = useMemo(() => {
    if (!discResponse) return null;
    return DISC_PROFILES[discResponse.styleCode] || DISC_PROFILES[discResponse.primaryDimension] || DISC_PROFILES['D'];
  }, [discResponse]);

  const mbtiProfile = useMemo(() => {
    if (!mbtiResponse) return null;
    return MBTI_TYPE_PROFILES[mbtiResponse.mbtiType] || MBTI_TYPE_PROFILES['ENFJ'];
  }, [mbtiResponse]);

  const giftsProfile = useMemo(() => {
    if (!giftsResponse?.primaryGift) return null;
    return {
      def: SPIRITUAL_GIFTS_DEFINITIONS[giftsResponse.primaryGift],
      insights: GIFT_SHEPHERDING_INSIGHTS[giftsResponse.primaryGift],
      secDef: giftsResponse.secondaryGift ? SPIRITUAL_GIFTS_DEFINITIONS[giftsResponse.secondaryGift] : null
    };
  }, [giftsResponse]);

  if (!isOpen) return null;

  const firstName = personName.split(' ')[0] || 'Friend';

  // Safe scripture anchor
  const scriptureAnchorObj = giftsProfile?.insights?.scriptureAnchor || discProfile?.themeVerseKjv || {
    verse: 'Matthew 5:16 (KJV)',
    text: 'Let your light so shine before men, that they may see your good works, and glorify your Father which is in heaven.'
  };

  // Dynamic outreach scripts tailored to their profiles
  const outreachScripts = [
    {
      title: 'Pastoral Check-In & Encouragement',
      description: 'A warm personal note honoring their unique God-given wiring.',
      text: `Hi ${firstName}, Pastor here! I was just praying for you and thinking about how God has uniquely gifted you with such a wonderful heart for ${giftsProfile?.def?.name || 'ministry'}. Thank you for being such a blessing to our church family. How can I be praying for you this week?`
    },
    {
      title: 'Serving Opportunity Invitation',
      description: 'An invitation to a ministry role aligned with their strengths.',
      text: `Hi ${firstName}! We are looking at our ministry teams and immediately thought of you for our ${giftsProfile?.def?.recommendedServingAreas?.[0] || discProfile?.workStyleTendencies?.[0] || 'Care Team'}. With your gifts and temperament, you would flourish here. Would you be open to chatting for 5 minutes after service this Sunday?`
    },
    {
      title: 'One-on-One Pastoral Coffee / Check-In',
      description: 'An unhurried invitation for discipling and relationship building.',
      text: `Hi ${firstName}, hope you're having a blessed week! I'd love to grab a coffee or tea with you sometime next week just to catch up, hear how things are going in your walk with the Lord, and see how we can best support you. Let me know what day might work best for you!`
    },
    {
      title: 'Scripture Blessing for Their Journey',
      description: 'A tailored KJV Bible verse to anchor their faith.',
      text: `Hi ${firstName}! I wanted to share this verse with you today from God's Word: "${scriptureAnchorObj.text}" (${scriptureAnchorObj.verse}). Praying this strengthens you today!`
    }
  ];

  const handleCopyScript = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedScriptIndex(index);
    setTimeout(() => setCopiedScriptIndex(null), 2500);
  };

  const handleCopySummary = () => {
    const howToSpeakLines = [
      ...(discProfile?.communicationPreferences?.howToSpeakToYou ? [discProfile.communicationPreferences.howToSpeakToYou] : []),
      ...(giftsProfile?.insights?.communicationAdvice || [])
    ];
    if (howToSpeakLines.length === 0) howToSpeakLines.push('Be authentic, warm, and clear.');

    const avoidLines = giftsProfile?.insights?.whatToAvoid || [
      'Avoid vague instructions or shifting expectations without warning.',
      'Avoid public criticism or dismissing their concerns abruptly.',
      'Avoid demanding instant answers if they need reflection time.'
    ];

    const servingRoles = [
      ...(giftsProfile?.def?.recommendedServingAreas || []),
      ...(discProfile?.idealServingRoles || []),
      ...(mbtiProfile?.idealServingRoles || [])
    ];

    const summaryLines = [
      `=== PASTORAL ENGAGEMENT SUMMARY: ${personName} ===`,
      giftsResponse ? `• Spiritual Gifts: Primary: ${giftsResponse.primaryGift}${giftsResponse.secondaryGift ? `, Secondary: ${giftsResponse.secondaryGift}` : ''}` : '',
      discResponse ? `• Faith-Based DISC Style: ${discResponse.styleCode} (${discProfile?.name})` : '',
      mbtiResponse ? `• MBTI Personality: ${mbtiResponse.mbtiType} (${mbtiProfile?.name})` : '',
      '',
      '--- HOW TO COMMUNICATE WITH THEM ---',
      ...howToSpeakLines.map(s => `• ${s}`),
      '',
      '--- WHAT TO AVOID ---',
      ...avoidLines.map(s => `• ${s}`),
      '',
      '--- RECOMMENDED MINISTRY ROLES ---',
      ...servingRoles.map(r => `• ${r}`)
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(summaryLines);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-4xl max-h-[94vh] flex flex-col border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/30 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-base sm:text-lg shadow-md shrink-0">
              {personName.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
                  {personName}
                </h3>
                <span className="text-[9px] sm:text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
                  Pastoral Strategy
                </span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex-wrap truncate">
                {email && <span className="flex items-center gap-1 truncate"><Mail className="w-3 h-3 text-slate-400 shrink-0" /> {email}</span>}
                {phone && <span className="flex items-center gap-1 shrink-0"><Phone className="w-3 h-3 text-slate-400 shrink-0" /> {phone}</span>}
                {personId && onOpenPersonProfile && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenPersonProfile(personId);
                    }}
                    className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <span>View Profile</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopySummary}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition cursor-pointer"
              title="Copy executive summary to clipboard"
            >
              {copiedSummary ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSummary ? 'Copied!' : 'Copy Summary'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-white flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Assessment Badges Ribbon */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-100/70 dark:bg-slate-800/60 border-b border-slate-200/60 dark:border-slate-800 flex items-center gap-2 overflow-x-auto shrink-0 text-xs scrollbar-none">
          <span className="font-bold text-slate-400 text-[10px] sm:text-[11px] uppercase tracking-wider shrink-0">
            Assessments:
          </span>

          {giftsResponse && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xs shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span className="font-bold text-slate-700 dark:text-slate-200 text-[11px] sm:text-xs">
                Gifts: <strong>{giftsResponse.primaryGift}</strong>
              </span>
              {giftsResponse.secondaryGift && (
                <span className="text-slate-400 text-[10px]">
                  (+ {giftsResponse.secondaryGift})
                </span>
              )}
            </div>
          )}

          {discResponse && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xs shrink-0">
              <Compass className="w-3.5 h-3.5 text-emerald-600" />
              <span className="font-bold text-slate-700 dark:text-slate-200 text-[11px] sm:text-xs">
                DISC: <strong>{discResponse.styleCode}</strong>
              </span>
            </div>
          )}

          {mbtiResponse && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xs shrink-0">
              <Brain className="w-3.5 h-3.5 text-violet-600" />
              <span className="font-bold text-slate-700 dark:text-slate-200 text-[11px] sm:text-xs">
                MBTI: <strong>{mbtiResponse.mbtiType}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="px-3 sm:px-6 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1 sm:gap-2 overflow-x-auto shrink-0 bg-white dark:bg-slate-900 scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('communication')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'communication'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Communication</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('shepherding')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'shepherding'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Heart className="w-3.5 h-3.5" />
            <span>Shepherding</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ministry')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'ministry'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            <span>Ministry Fit</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('scripts')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'scripts'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Outreach Scripts</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6">
          {/* TAB 1: COMMUNICATION PLAYBOOK */}
          {activeTab === 'communication' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* How to Speak With Them */}
              <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <h4 className="text-xs sm:text-sm font-black text-emerald-950 dark:text-emerald-200 uppercase tracking-wider">
                    How to Speak & Engage With {firstName}
                  </h4>
                </div>

                {discProfile?.communicationPreferences?.howToSpeakToYou && (
                  <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-emerald-200/60 dark:border-emerald-800/60 text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
                    <span className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-400 block mb-1">
                      DISC Behavioral Communication Rule
                    </span>
                    {discProfile.communicationPreferences.howToSpeakToYou}
                  </div>
                )}

                <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                  {(giftsProfile?.insights?.communicationAdvice || [
                    'Be clear, warm, and direct about ministry goals.',
                    'Listen attentively to their feedback and acknowledge their perspective.',
                    'Follow up conversations with clear, actionable next steps.'
                  ]).map((tip, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-emerald-600 font-bold">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                  {mbtiProfile?.communicationStyle && (
                    <li className="flex items-start gap-2 pt-1 border-t border-emerald-200/50 dark:border-emerald-800/50 font-medium">
                      <span className="text-emerald-600 font-bold">MBTI Tone:</span>
                      <span>{mbtiProfile.communicationStyle}</span>
                    </li>
                  )}
                </ul>
              </div>

              {/* What to Avoid */}
              <div className="bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/80 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-rose-600 dark:text-rose-400 shrink-0" />
                  <h4 className="text-xs sm:text-sm font-black text-rose-950 dark:text-rose-200 uppercase tracking-wider">
                    What to Avoid / Communication Pitfalls
                  </h4>
                </div>
                <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                  {(giftsProfile?.insights?.whatToAvoid || [
                    'Avoid overly vague or ambiguous instructions.',
                    'Avoid public criticism or dismissing their concerns abruptly.',
                    'Avoid demanding instant answers if they need reflection time.'
                  ]).map((avoid, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-rose-600 font-bold">✕</span>
                      <span>{avoid}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* How They Naturally Speak */}
              {discProfile?.communicationPreferences?.howYouSpeak && (
                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 sm:p-5 space-y-2">
                  <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <User className="w-4 h-4 text-indigo-600" />
                    <span>How {firstName} Naturally Communicates</span>
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {discProfile.communicationPreferences.howYouSpeak}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SHEPHERDING & MOTIVATIONS */}
          {activeTab === 'shepherding' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* Motivations & Stressors Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Core Motivations */}
                <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 space-y-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <h4 className="text-xs font-black text-amber-950 dark:text-amber-200 uppercase tracking-wider">
                      Core Motivators
                    </h4>
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                    {(discProfile?.motivations || giftsProfile?.insights?.coreMotivations || [
                      'Seeing meaningful impact in the church',
                      'Relational trust and sincere encouragement',
                      'Clarity in goals and responsibilities'
                    ]).map((m, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-amber-600 font-bold">★</span>
                        <span>{m}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Stressors & Burnout Warnings */}
                <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-rose-500" />
                    <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                      Stressors & Burnout Warnings
                    </h4>
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                    {(discProfile?.stressors || giftsProfile?.insights?.burnoutWarnings || [
                      'Overload without clear support',
                      'Unresolved relational friction',
                      'Lack of appreciation or feedback'
                    ]).map((s, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-rose-500 font-bold">⚠</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Pastoral Shepherding & Discipleship Approach */}
              <div className="p-4 sm:p-5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/80 space-y-2">
                <h4 className="text-xs font-black text-indigo-950 dark:text-indigo-200 uppercase tracking-wider flex items-center gap-2">
                  <Shield className="w-4 h-4 text-indigo-600" />
                  <span>Pastoral Shepherding & Mentorship Strategy</span>
                </h4>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  {giftsProfile?.insights?.shepherdingApproach || 
                   'Focus on personal discipleship, regular affirmation of their strengths, and clear guardrails to prevent ministry fatigue.'}
                </p>
              </div>

              {/* Scripture Anchor */}
              {(giftsProfile?.insights?.scriptureAnchor || discProfile?.themeVerseKjv) && (
                <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/30 border-l-4 border-emerald-600 space-y-1.5">
                  <p className="text-xs italic text-emerald-950 dark:text-emerald-200 font-serif leading-relaxed">
                    “{giftsProfile?.insights?.scriptureAnchor?.text || discProfile?.themeVerseKjv?.text}”
                  </p>
                  <p className="text-[11px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider text-right">
                    — {giftsProfile?.insights?.scriptureAnchor?.verse || discProfile?.themeVerseKjv?.verse}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MINISTRY FIT & PLACEMENT */}
          {activeTab === 'ministry' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* Ideal Serving Environments */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <Target className="w-4 h-4 text-indigo-600" />
                    <span>Recommended Ministry Teams for {firstName}</span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Roles and service opportunities where their God-given gifts and behavioral tendencies will flourish.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {(giftsProfile?.def?.recommendedServingAreas || discProfile?.idealServingRoles || mbtiProfile?.idealServingRoles || [
                    'Guest Services & Welcome Team',
                    'Care & Follow-Up Team',
                    'Small Group Leadership',
                    'Discipleship Mentoring'
                  ]).map((role, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0">
                        {idx + 1}
                      </div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Work Style Tendencies & Ministry Strengths / Blind Spots */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Ministry Strengths / Tendencies */}
                {(discProfile?.baptistMinistryStrengths || discProfile?.workStyleTendencies) && (
                  <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
                    <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                      Ministry Strengths & Work Tendencies
                    </h4>
                    <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                      {(discProfile.baptistMinistryStrengths || discProfile.workStyleTendencies || []).map((tend, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-indigo-600 font-bold">✓</span>
                          <span>{tend}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Discipleship & Growth Areas */}
                {(discProfile?.spiritualGrowthAreas || mbtiProfile?.growthAreas) && (
                  <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
                    <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                      Spiritual Growth & Blind Spots
                    </h4>
                    <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                      {(discProfile?.spiritualGrowthAreas || mbtiProfile?.growthAreas || []).map((growth, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-amber-500 font-bold">•</span>
                          <span>{growth}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: OUTREACH SCRIPTS */}
          {activeTab === 'scripts' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div>
                <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                  Personalized Outreach Templates
                </h4>
                <p className="text-xs text-slate-400">
                  Ready-to-use SMS / Email scripts formatted specifically for {firstName}.
                </p>
              </div>

              <div className="space-y-3">
                {outreachScripts.map((script, idx) => (
                  <div key={idx} className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <h5 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                          {script.title}
                        </h5>
                        <p className="text-[11px] text-slate-400">
                          {script.description}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {phone && (
                          <a
                            href={`sms:${phone}?body=${encodeURIComponent(script.text)}`}
                            className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 transition"
                          >
                            <Phone className="w-3 h-3" />
                            <span>Text</span>
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCopyScript(script.text, idx)}
                          className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition cursor-pointer shrink-0"
                        >
                          {copiedScriptIndex === idx ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="text-emerald-600">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-mono select-all">
                      {script.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between gap-4 shrink-0">
          <div className="text-[10px] sm:text-[11px] text-slate-400 hidden sm:block">
            Pastoral intelligence synthesized across Church Assessments.
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-bold transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
