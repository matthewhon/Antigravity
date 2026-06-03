
import React, { useEffect, useState } from 'react';
import type { AttendanceRecord, WeatherRecord, AttendancePrediction } from '../../types';
import { predictAttendance, getWeatherSeverity } from '../../services/attendancePredictionService';
import { firestore } from '../../services/firestoreService';

interface AttendancePredictionWidgetProps {
    churchId: string;
    attendance: AttendanceRecord[];
}

/** Map Visual Crossing icon keys to weather emojis. */
function getWeatherEmoji(icon?: string, conditions?: string): string {
    if (!icon && !conditions) return '🌤️';
    const key = icon?.toLowerCase() || conditions?.toLowerCase() || '';
    if (key.includes('clear-day') || key.includes('clear-night')) return '☀️';
    if (key.includes('partly-cloudy')) return '⛅';
    if (key.includes('cloudy')) return '☁️';
    if (key.includes('thunder') || key.includes('lightning')) return '🌩️';
    if (key.includes('rain') || key.includes('showers')) return '🌧️';
    if (key.includes('snow') || key.includes('sleet') || key.includes('ice')) return '❄️';
    if (key.includes('wind')) return '💨';
    if (key.includes('fog') || key.includes('mist') || key.includes('haze')) return '🌫️';
    return '🌤️';
}

/** Get a CSS class for the severity-based glow effect. */
function severityColor(severity: 'good' | 'moderate' | 'severe'): string {
    switch (severity) {
        case 'good':     return 'text-emerald-400';
        case 'moderate': return 'text-amber-400';
        case 'severe':   return 'text-rose-400';
    }
}

function factorBadgeStyle(factor: string): string {
    const lower = factor.toLowerCase();
    if (lower.includes('rain') || lower.includes('snow') || lower.includes('wind') || lower.includes('extreme') || lower.includes('ice'))
        return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
    if (lower.includes('down') || lower.includes('-'))
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    if (lower.includes('up') || lower.includes('+'))
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
}

export const AttendancePredictionWidget: React.FC<AttendancePredictionWidgetProps> = ({ churchId, attendance }) => {
    const [predictions, setPredictions] = useState<AttendancePrediction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [hasWeatherData, setHasWeatherData] = useState(true);

    useEffect(() => {
        let cancelled = false;

        async function loadPredictions() {
            setIsLoading(true);
            try {
                const allWeather = await firestore.getWeather(churchId);

                if (!allWeather || allWeather.length === 0) {
                    setHasWeatherData(false);
                    setIsLoading(false);
                    return;
                }

                setHasWeatherData(true);

                // Split into historical and forecast
                const todayStr = new Date().toISOString().split('T')[0];
                const historicalWeather = allWeather.filter(w => w.date <= todayStr);
                const forecastWeather = allWeather.filter(w => w.date > todayStr);

                // Normalize: ServicesView passes checkInTrends which uses `total` instead of `count`
                const normalizedAttendance = attendance.map(a => ({
                    ...a,
                    count: a.count ?? (a as any).total ?? 0,
                }));

                const results = predictAttendance(normalizedAttendance, historicalWeather, forecastWeather);
                if (!cancelled) {
                    setPredictions(results);
                }
            } catch (e) {
                console.error('Failed to load attendance predictions:', e);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        if (churchId && attendance.length > 0) {
            loadPredictions();
        } else {
            setIsLoading(false);
        }

        return () => { cancelled = true; };
    }, [churchId, attendance]);

    // ── Loading state ──────────────────────────────────────────────────
    if (isLoading) {
        return (
            <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 rounded-2xl border border-indigo-500/20 p-8 animate-pulse">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 rounded-lg bg-white/10" />
                    <div className="h-5 w-48 bg-white/10 rounded-lg" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-40 bg-white/5 rounded-xl" />
                    ))}
                </div>
            </div>
        );
    }

    // ── No weather data ────────────────────────────────────────────────
    if (!hasWeatherData) {
        return (
            <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 rounded-2xl border border-indigo-500/20 p-8">
                <div className="flex items-center gap-3 mb-4">
                    <span className="text-2xl">☁️</span>
                    <h3 className="text-sm font-black text-white tracking-tight">Attendance Forecast</h3>
                </div>
                <div className="flex flex-col items-center justify-center py-10 text-center">
                    <span className="text-3xl mb-3 opacity-40 grayscale">🌡️</span>
                    <p className="text-xs font-bold text-slate-400 mb-1">Weather data not yet synced</p>
                    <p className="text-[10px] text-slate-500 max-w-[280px] leading-relaxed">
                        Predictions will appear after the next sync. Configure your Visual Crossing API key in System Settings to enable weather-based forecasting.
                    </p>
                </div>
            </div>
        );
    }

    // ── No predictions (insufficient attendance data) ──────────────────
    if (predictions.length === 0) {
        return (
            <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 rounded-2xl border border-indigo-500/20 p-8">
                <div className="flex items-center gap-3 mb-4">
                    <span className="text-2xl">☁️</span>
                    <h3 className="text-sm font-black text-white tracking-tight">Attendance Forecast</h3>
                </div>
                <div className="flex flex-col items-center justify-center py-10 text-center">
                    <span className="text-3xl mb-3 opacity-40">📊</span>
                    <p className="text-xs font-bold text-slate-400 mb-1">More data needed</p>
                    <p className="text-[10px] text-slate-500 max-w-[280px] leading-relaxed">
                        At least 4 attendance records are required to generate predictions. Keep syncing check-in data!
                    </p>
                </div>
            </div>
        );
    }

    // ── Main render ────────────────────────────────────────────────────
    return (
        <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 rounded-2xl border border-indigo-500/20 shadow-xl shadow-indigo-950/30 overflow-hidden">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className="text-2xl drop-shadow-lg">☁️</span>
                    <div>
                        <h3 className="text-sm font-black text-white tracking-tight">Attendance Forecast</h3>
                        <p className="text-[9px] text-indigo-300/60 font-medium uppercase tracking-widest mt-0.5">Powered by weather data</p>
                    </div>
                </div>
                <span className="text-[9px] font-bold text-indigo-400/50 uppercase tracking-widest">Next {predictions.length} Services</span>
            </div>

            {/* Prediction Grid */}
            <div className="px-6 pb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {predictions.map((pred, idx) => {
                        const date = new Date(pred.date + 'T12:00:00');
                        const weather = pred.weatherForecast;
                        const severity = weather ? getWeatherSeverity(weather) : 'good';
                        const emoji = weather ? getWeatherEmoji(weather.icon, weather.conditions) : '🌤️';

                        return (
                            <div
                                key={pred.date}
                                className="relative bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-5 hover:bg-white/[0.08] hover:border-indigo-400/30 transition-all duration-300 group"
                                style={{ animationDelay: `${idx * 100}ms` }}
                            >
                                {/* Date header */}
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <p className="text-[10px] font-black text-indigo-300/80 uppercase tracking-widest">
                                            {date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                        </p>
                                    </div>
                                    <span className="text-2xl transform group-hover:scale-110 transition-transform duration-300 drop-shadow-md" title={weather?.conditions || 'Unknown'}>
                                        {emoji}
                                    </span>
                                </div>

                                {/* Predicted attendance number with glow */}
                                <div className="mb-3">
                                    <p className={`text-4xl font-black tracking-tighter leading-none ${severityColor(severity)} drop-shadow-lg`}
                                       style={{ textShadow: severity === 'good' ? '0 0 20px rgba(52, 211, 153, 0.3)' : severity === 'moderate' ? '0 0 20px rgba(251, 191, 36, 0.3)' : '0 0 20px rgba(251, 113, 133, 0.3)' }}>
                                        {pred.predictedAttendance}
                                    </p>
                                    <p className="text-[10px] text-white/30 font-bold mt-1">
                                        {pred.confidenceRange.low} – {pred.confidenceRange.high} range
                                    </p>
                                </div>

                                {/* Temperature */}
                                {weather && (
                                    <div className="flex items-center gap-2 mb-3 text-[10px]">
                                        <span className="text-orange-300/80 font-bold">{Math.round(weather.tempHigh)}°F</span>
                                        <span className="text-white/20">/</span>
                                        <span className="text-blue-300/80 font-bold">{Math.round(weather.tempLow)}°F</span>
                                        {weather.precipProb > 20 && (
                                            <span className="text-sky-300/60 font-medium ml-auto">
                                                💧 {Math.round(weather.precipProb)}%
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* Factor pills */}
                                {pred.factors.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {pred.factors.slice(0, 3).map((factor, fIdx) => (
                                            <span
                                                key={fIdx}
                                                className={`text-[8px] font-bold px-2 py-0.5 rounded-full border ${factorBadgeStyle(factor)} truncate max-w-full`}
                                                title={factor}
                                            >
                                                {factor.length > 35 ? factor.slice(0, 32) + '…' : factor}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default AttendancePredictionWidget;
