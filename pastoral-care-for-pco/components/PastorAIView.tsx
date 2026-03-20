
import React, { useState, useRef, useEffect } from 'react';
import { PcoPerson, PeopleDashboardData, GivingAnalytics, GroupsDashboardData, ServicesDashboardData, AttendanceData, CensusStats } from '../types';
import { askPastorAI } from '../services/geminiService';

interface PastorAIViewProps {
    peopleData: PeopleDashboardData | null;
    givingAnalytics: GivingAnalytics | null;
    groupsData: GroupsDashboardData | null;
    servicesData: ServicesDashboardData | null;
    attendanceData: AttendanceData[];
    censusData: CensusStats | null;
    churchName: string;
}

interface Message {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    timestamp: Date;
}

const SUGGESTED_PROMPTS = [
    "How is our attendance trending over the last month?",
    "Summarize our financial health based on recent giving.",
    "Draft a welcome email for new visitors.",
    "What percentage of our members are in small groups?",
    "Identify 3 areas where we need more volunteers.",
    "Compare our demographics to the local census data."
];

export const PastorAIView: React.FC<PastorAIViewProps> = ({
    peopleData,
    givingAnalytics,
    groupsData,
    servicesData,
    attendanceData,
    censusData,
    churchName
}) => {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: 'welcome',
            role: 'assistant',
            text: `Hello! I'm Pastor AI. I have access to your dashboard metrics for **${churchName}**. \n\nI can analyze attendance, giving trends, group participation, and demographics to help you make informed decisions. What would you like to know?`,
            timestamp: new Date()
        }
    ]);
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

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
            const responseText = await askPastorAI(text, {
                people: peopleData,
                giving: givingAnalytics,
                groups: groupsData,
                services: servicesData,
                attendance: attendanceData,
                census: censusData,
                churchName
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

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="h-[calc(100vh-140px)] flex flex-col bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            {/* Header */}
            <div className="bg-slate-50/80 backdrop-blur-sm p-6 border-b border-slate-100 flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-2xl text-white shadow-lg shadow-indigo-200">
                    🤖
                </div>
                <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Pastor AI</h2>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Virtual Administrator</p>
                </div>
                <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-slate-100">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Online & Context Aware</span>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/30">
                {messages.map((msg) => (
                    <div 
                        key={msg.id} 
                        className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                    >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${msg.role === 'user' ? 'bg-slate-200 text-slate-500' : 'bg-indigo-100 text-indigo-600'}`}>
                            {msg.role === 'user' ? '👤' : '🤖'}
                        </div>
                        <div 
                            className={`max-w-[80%] p-5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                                msg.role === 'user' 
                                ? 'bg-white border border-slate-100 text-slate-700 rounded-tr-none' 
                                : 'bg-indigo-600 text-white rounded-tl-none shadow-indigo-200'
                            }`}
                        >
                            <div 
                                className="markdown-content"
                                dangerouslySetInnerHTML={{ 
                                    __html: msg.text.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') 
                                }} 
                            />
                            <p className={`text-[9px] mt-2 font-bold uppercase tracking-widest ${msg.role === 'user' ? 'text-slate-300' : 'text-indigo-300'}`}>
                                {msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </p>
                        </div>
                    </div>
                ))}
                
                {isLoading && (
                    <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-sm">🤖</div>
                        <div className="bg-indigo-600 p-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                            <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                            <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                            <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Suggestions & Input */}
            <div className="p-6 bg-white border-t border-slate-100">
                {messages.length < 3 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                        {SUGGESTED_PROMPTS.map((prompt, i) => (
                            <button
                                key={i}
                                onClick={() => handleSend(prompt)}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-[10px] font-bold text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-100 transition-colors"
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
                        placeholder="Ask anything about your church data..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-5 pr-14 py-4 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 resize-none h-[60px] shadow-inner"
                    />
                    <button
                        onClick={() => handleSend()}
                        disabled={!inputText.trim() || isLoading}
                        className="absolute right-2 top-2 bottom-2 w-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:hover:bg-indigo-600 shadow-md shadow-indigo-200"
                    >
                        <span className="text-lg">↑</span>
                    </button>
                </div>
                <p className="text-[9px] text-center text-slate-300 font-bold uppercase tracking-widest mt-3">
                    AI generated responses may vary. Always verify key metrics in the dashboard.
                </p>
            </div>
        </div>
    );
};
