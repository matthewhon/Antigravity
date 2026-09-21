import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
    PcoPerson, PeopleDashboardData, GivingAnalytics, GroupsDashboardData, 
    ServicesDashboardData, AttendanceData, CensusStats, DetailedDonation, 
    PcoFund, BudgetRecord, ServicesTeam, RiskChangeRecord, StatusChangeRecord,
    PastoralNote, PrayerRequest 
} from '../types';
import { askPastorAI } from '../services/geminiService';
import { 
    Sparkles, Copy, Check, MessageSquare, FileText, 
    TrendingUp, Award, ShieldAlert, Compass, Users, 
    Flame, RefreshCw, Send, CheckCircle2, ChevronRight
} from 'lucide-react';

interface PastorAIViewProps {
    peopleData: PeopleDashboardData | null;
    givingAnalytics: GivingAnalytics | null;
    groupsData: GroupsDashboardData | null;
    servicesData: ServicesDashboardData | null;
    attendanceData: AttendanceData[];
    censusData: CensusStats | null;
    churchName: string;
    donations?: DetailedDonation[];
    funds?: PcoFund[];
    budgets?: BudgetRecord[];
    teams?: ServicesTeam[];
    recentRiskChanges?: RiskChangeRecord[];
    recentStatusChanges?: StatusChangeRecord[];
    pastoralNotes?: PastoralNote[];
    prayerRequests?: PrayerRequest[];
}

interface Message {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    timestamp: Date;
}

type CoachingPersona = 'shepherd' | 'coach' | 'analyst' | 'strategist';

const COACHING_PERSONAS: { id: CoachingPersona; label: string; icon: string; desc: string; systemPromptNote: string }[] = [
    { 
        id: 'shepherd', 
        label: 'Shepherd / Pastor', 
        icon: '🕊️', 
        desc: 'Relational, encouraging, care & discipleship focused',
        systemPromptNote: 'Adopt the warm, empathetic tone of an experienced pastor and shepherd. Focus on spiritual health, congregational care, and relational encouragement.'
    },
    { 
        id: 'coach', 
        label: 'Executive Coach', 
        icon: '💼', 
        desc: 'Leadership benchmarks, operational next steps',
        systemPromptNote: 'Adopt the tone of a high-level church executive coach. Be direct, clear, action-oriented, and focused on staff alignment and operational momentum.'
    },
    { 
        id: 'analyst', 
        label: 'Data Analyst', 
        icon: '📊', 
        desc: 'Statistical rigor, YoY trends, anomaly alerts',
        systemPromptNote: 'Adopt the tone of a quantitative ministry data analyst. Focus on statistical significance, ratios, moving averages, and data-driven anomalies.'
    },
    { 
        id: 'strategist', 
        label: 'Church Strategist', 
        icon: '🎯', 
        desc: 'Growth bottlenecks, assimilation pipelines',
        systemPromptNote: 'Adopt the tone of a master church growth strategist. Focus on guest assimilation funnels, room capacity constraints, and long-term kingdom impact.'
    },
];

const SUGGESTED_PROMPTS = [
    "Draft our weekly staff meeting agenda with talking points.",
    "How is our attendance frequency trending (Core vs Casual)?",
    "Identify volunteers at risk of consecutive week burnout.",
    "Summarize giving health and recurring tithe resilience.",
    "What are our top 3 guest retention bottlenecks right now?",
    "Compare our members' group engagement with the full database."
];

export const PastorAIView: React.FC<PastorAIViewProps> = ({
    peopleData,
    givingAnalytics,
    groupsData,
    servicesData,
    attendanceData,
    censusData,
    churchName,
    donations,
    funds,
    budgets,
    teams,
    recentRiskChanges,
    recentStatusChanges,
    pastoralNotes,
    prayerRequests
}) => {
    const [viewMode, setViewMode] = useState<'chat' | 'briefing'>('chat');
    const [selectedPersona, setSelectedPersona] = useState<CoachingPersona>('coach');
    const [copied, setCopied] = useState(false);

    const [messages, setMessages] = useState<Message[]>([
        {
            id: 'welcome',
            role: 'assistant',
            text: `Hello! I'm **Pastor AI** (powered by the **Barnabas AI** Intelligence Engine). \n\nI have access to your live Planning Center data for **${churchName}** across attendance frequency, giving, small group attachment, visitor funnels, volunteer burnout, pastoral notes, and prayer requests. \n\nHow can I serve you today?`,
            timestamp: new Date()
        }
    ]);
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [briefingText, setBriefingText] = useState<string>('');
    const [isGeneratingBriefing, setIsGeneratingBriefing] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const activePersonaObj = useMemo(() => 
        COACHING_PERSONAS.find(p => p.id === selectedPersona) || COACHING_PERSONAS[0],
        [selectedPersona]
    );

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async (text: string = inputText) => {
        if (!text.trim() || isLoading) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            text: text,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMsg]);
        setInputText('');
        setIsLoading(true);

        try {
            const promptWithPersona = `[Persona Setting: ${activePersonaObj.systemPromptNote}]\n\nUser Question: ${text}`;
            
            const responseText = await askPastorAI(promptWithPersona, {
                people: peopleData,
                giving: givingAnalytics,
                groups: groupsData,
                services: servicesData,
                attendance: attendanceData,
                census: censusData,
                churchName,
                donations,
                funds,
                budgets,
                teams,
                recentRiskChanges,
                recentStatusChanges,
                pastoralNotes,
                prayerRequests
            });

            const aiMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                text: responseText,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, aiMsg]);
        } catch (e) {
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                text: "I apologize, but I encountered an error processing your request. Please try again.",
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
        }
    };

    // Generate Barnabas AI Weekly Staff Meeting Digest
    const generateWeeklyBriefing = async () => {
        setIsGeneratingBriefing(true);
        try {
            const prompt = `[Persona Setting: ${activePersonaObj.systemPromptNote}]
Please generate a comprehensive, executive-ready "Weekly Ministry Briefing & Staff Meeting Agenda" for ${churchName}.

Include the following sections with clear markdown headers and bullet points:
1. 🌟 **Weekly Wins & Celebrations** (Attendance momentum, baptism/salvation milestones, generous giving gifts)
2. ⚠️ **Critical Health & Retention Flags** (Stalled 1st-time guests, volunteer burnout warnings, room capacity bottlenecks)
3. 💬 **Staff Meeting Discussion Questions** (3 provocative, actionable questions for our ministry leads this Tuesday)
4. 📋 **High-Impact Next Steps (Next 7 Days)** (Specific pastoral touches and outreach assignments)`;

            const response = await askPastorAI(prompt, {
                people: peopleData,
                giving: givingAnalytics,
                groups: groupsData,
                services: servicesData,
                attendance: attendanceData,
                census: censusData,
                churchName,
                donations,
                funds,
                budgets,
                teams,
                recentRiskChanges,
                recentStatusChanges,
                pastoralNotes,
                prayerRequests
            });

            setBriefingText(response);
        } catch (e) {
            setBriefingText("Unable to generate briefing at this moment. Please verify your connection.");
        } finally {
            setIsGeneratingBriefing(false);
        }
    };

    // Auto-generate initial briefing on tab switch if empty
    useEffect(() => {
        if (viewMode === 'briefing' && !briefingText && !isGeneratingBriefing) {
            generateWeeklyBriefing();
        }
    }, [viewMode]);

    const handleCopyBriefing = () => {
        if (!briefingText) return;
        navigator.clipboard.writeText(briefingText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="h-[calc(100vh-130px)] flex flex-col bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden animate-in fade-in duration-300">
            
            {/* Header Toolbar */}
            <div className="bg-slate-50 dark:bg-slate-850 p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-3 shrink-0">
                {/* Top Row: Icon, Title & View Mode Toggle */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-lg text-white shadow-md shadow-indigo-500/20 shrink-0">
                            🤖
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-base font-black text-slate-900 dark:text-white leading-none">
                                    Pastor AI
                                </h2>
                                <span className="text-[9px] uppercase font-black px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                                    Barnabas AI
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1 truncate">
                                Executive ministry intelligence & briefing assistant
                            </p>
                        </div>
                    </div>

                    {/* View Mode Toggle */}
                    <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-xl shrink-0">
                        <button
                            onClick={() => setViewMode('chat')}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                viewMode === 'chat' 
                                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                        >
                            <MessageSquare size={13} />
                            <span>Chat</span>
                        </button>
                        <button
                            onClick={() => setViewMode('briefing')}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                viewMode === 'briefing' 
                                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                        >
                            <FileText size={13} />
                            <span>Staff Briefing</span>
                        </button>
                    </div>
                </div>

                {/* Bottom Row: Tone Selector */}
                <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider shrink-0">Tone:</span>
                    <select
                        value={selectedPersona}
                        onChange={(e) => setSelectedPersona(e.target.value as CoachingPersona)}
                        className="bg-transparent border-none text-xs font-bold text-slate-800 dark:text-white outline-none cursor-pointer flex-1 min-w-0"
                    >
                        {COACHING_PERSONAS.map(p => (
                            <option key={p.id} value={p.id} className="bg-white dark:bg-slate-800">
                                {p.icon} {p.label} ({p.desc})
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* TAB 1: Chat Assistant Mode */}
            {viewMode === 'chat' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Chat Messages */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50 dark:bg-slate-950/40">
                        {messages.map((msg) => (
                            <div 
                                key={msg.id} 
                                className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                            >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
                                    msg.role === 'user' 
                                        ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200' 
                                        : 'bg-indigo-600 text-white'
                                }`}>
                                    {msg.role === 'user' ? '👤' : activePersonaObj.icon}
                                </div>
                                <div 
                                    className={`max-w-[85%] sm:max-w-[80%] p-4 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-sm break-words ${
                                        msg.role === 'user' 
                                        ? 'bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-tr-none' 
                                        : 'bg-indigo-600 text-white rounded-tl-none shadow-indigo-600/10'
                                    }`}
                                >
                                    <div 
                                        className="markdown-content space-y-2 whitespace-pre-wrap break-words"
                                        dangerouslySetInnerHTML={{ 
                                            __html: msg.text.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') 
                                        }} 
                                    />
                                    <p className={`text-[10px] mt-2 font-bold uppercase tracking-wide ${
                                        msg.role === 'user' ? 'text-slate-400' : 'text-indigo-200'
                                    }`}>
                                        {msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </p>
                                </div>
                            </div>
                        ))}
                        
                        {isLoading && (
                            <div className="flex gap-3">
                                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm">{activePersonaObj.icon}</div>
                                <div className="bg-indigo-600 p-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                                    <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                                    <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                                    <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Suggestions & Input */}
                    <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 space-y-3">
                        {messages.length < 3 && (
                            <div className="flex flex-wrap gap-2">
                                {SUGGESTED_PROMPTS.map((prompt, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleSend(prompt)}
                                        className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 transition-colors"
                                    >
                                        {prompt}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="relative">
                            <textarea
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={handleKeyPress}
                                placeholder={`Ask Pastor AI (${activePersonaObj.label} tone)...`}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl pl-4 pr-12 py-3 text-xs sm:text-sm font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 resize-none h-[54px]"
                            />
                            <button
                                onClick={() => handleSend()}
                                disabled={!inputText.trim() || isLoading}
                                className="absolute right-2 top-2 bottom-2 w-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center hover:bg-indigo-500 transition-all disabled:opacity-40"
                            >
                                <Send size={15} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: Barnabas AI Executive Briefing & Staff Meeting Generator */}
            {viewMode === 'briefing' && (
                <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 bg-slate-50/50 dark:bg-slate-950/40">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-500">
                                Staff Meeting Agenda & Executive Briefing
                            </span>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                                Weekly Leadership Intelligence Digest
                            </h3>
                            <p className="text-xs text-slate-400">
                                Synthesized from weekly check-ins, giving velocities, visitor drop-offs, and volunteer rosters.
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={generateWeeklyBriefing}
                                disabled={isGeneratingBriefing}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors disabled:opacity-50"
                            >
                                <RefreshCw size={13} className={isGeneratingBriefing ? 'animate-spin' : ''} />
                                <span>Regenerate Digest</span>
                            </button>

                            <button
                                onClick={handleCopyBriefing}
                                disabled={!briefingText || isGeneratingBriefing}
                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50"
                            >
                                {copied ? <Check size={14} /> : <Copy size={14} />}
                                <span>{copied ? 'Copied to Clipboard!' : 'Copy for Staff Meeting'}</span>
                            </button>
                        </div>
                    </div>

                    {isGeneratingBriefing ? (
                        <div className="p-12 text-center space-y-3 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
                            <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                            <p className="font-bold text-slate-700 dark:text-slate-200 text-sm">
                                Compiling Weekly Executive Intelligence...
                            </p>
                            <p className="text-xs text-slate-400">
                                Analyzing attendance frequency, donor trends, guest drop-offs, and volunteer rosters.
                            </p>
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                            <div 
                                className="markdown-content text-xs sm:text-sm text-slate-800 dark:text-slate-200 space-y-4 leading-relaxed whitespace-pre-wrap"
                                dangerouslySetInnerHTML={{ 
                                    __html: briefingText.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') 
                                }}
                            />
                        </div>
                    )}
                </div>
            )}

        </div>
    );
};
