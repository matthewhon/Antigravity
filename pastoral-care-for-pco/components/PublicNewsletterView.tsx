import React, { useState, useEffect } from 'react';
import { Mail, CheckCircle, Loader2, AlertCircle, Sparkles, Check, Church } from 'lucide-react';

interface SenderOption {
  name: string;
  email: string;
  isDefault?: boolean;
}

interface NewsletterInfo {
  churchId: string;
  churchName: string;
  logoUrl?: string | null;
  website?: string | null;
  newsletterSettings?: {
    title?: string;
    description?: string;
    headerImageUrl?: string;
    successMessage?: string;
    redirectUrl?: string;
    requireName?: boolean;
    requirePhone?: boolean;
  };
  senders: SenderOption[];
}

interface PublicNewsletterViewProps {
  churchId: string;
  isEmbedded?: boolean;
}

export const PublicNewsletterView: React.FC<PublicNewsletterViewProps> = ({
  churchId,
  isEmbedded = false,
}) => {
  const [info, setInfo] = useState<NewsletterInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedSenders, setSelectedSenders] = useState<string[]>([]);
  const [honeypot, setHoneypot] = useState(''); // Anti-bot

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [subscribedChannels, setSubscribedChannels] = useState<string[]>([]);

  useEffect(() => {
    const fetchInfo = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/public/newsletter/${churchId}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to load newsletter information.');
        }
        const data: NewsletterInfo = await res.json();
        setInfo(data);
        // Default: select all senders
        if (data.senders && data.senders.length > 0) {
          setSelectedSenders(data.senders.map(s => s.email.toLowerCase()));
        }
      } catch (err: any) {
        console.error('[PublicNewsletterView] Load error:', err);
        setError(err.message || 'Unable to load newsletter signup.');
      } finally {
        setLoading(false);
      }
    };

    if (churchId) {
      fetchInfo();
    }
  }, [churchId]);

  const toggleSender = (senderEmail: string) => {
    const lower = senderEmail.toLowerCase();
    setSelectedSenders(prev =>
      prev.includes(lower) ? prev.filter(e => e !== lower) : [...prev, lower]
    );
  };

  const toggleSelectAll = () => {
    if (!info?.senders) return;
    if (selectedSenders.length === info.senders.length) {
      setSelectedSenders([]);
    } else {
      setSelectedSenders(info.senders.map(s => s.email.toLowerCase()));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) return; // Silent bot reject

    if (!email.trim() || !email.includes('@')) {
      setSubmitError('Please enter a valid email address.');
      return;
    }

    if (info?.senders && info.senders.length > 0 && selectedSenders.length === 0) {
      setSubmitError('Please select at least one newsletter topic or sender.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(`/api/public/newsletter/${churchId}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          senders: selectedSenders,
          source: isEmbedded ? 'widget' : 'landing_page',
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Failed to submit subscription.');
      }

      // Record subscribed list names for confirmation screen
      const matchedNames = (info?.senders || [])
        .filter(s => selectedSenders.includes(s.email.toLowerCase()))
        .map(s => s.name);

      setSubscribedChannels(matchedNames.length > 0 ? matchedNames : ['Church Updates']);
      setSubmitSuccess(true);
    } catch (err: any) {
      console.error('[PublicNewsletterView] Submit error:', err);
      setSubmitError(err.message || 'Failed to complete subscription. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setSubmitSuccess(false);
    setSubmitError(null);
    if (info?.senders) {
      setSelectedSenders(info.senders.map(s => s.email.toLowerCase()));
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center ${isEmbedded ? 'p-8 min-h-[300px]' : 'min-h-screen bg-slate-50 dark:bg-slate-950 p-4'}`}>
        <div className="flex flex-col items-center gap-3 text-slate-500 dark:text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
          <p className="text-sm font-medium">Loading newsletter...</p>
        </div>
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className={`flex items-center justify-center ${isEmbedded ? 'p-6' : 'min-h-screen bg-slate-50 dark:bg-slate-950 p-4'}`}>
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/50 rounded-2xl p-6 text-center shadow-sm">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Unavailable</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">{error || 'This newsletter page is not available.'}</p>
        </div>
      </div>
    );
  }

  const title = info.newsletterSettings?.title || `Join our Newsletter`;
  const description =
    info.newsletterSettings?.description ||
    `Subscribe to receive updates, devotionals, and announcements from ${info.churchName}.`;
  const successMsg =
    info.newsletterSettings?.successMessage ||
    `You're now on the list! You will receive future updates directly to your inbox.`;

  return (
    <div className={`w-full ${isEmbedded ? 'p-2' : 'min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 sm:p-6'}`}>
      <div className={`w-full ${isEmbedded ? 'max-w-full' : 'max-w-xl'} bg-white dark:bg-slate-900 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200/80 dark:border-slate-800 overflow-hidden transition-all`}>
        
        {/* Header Branding Banner */}
        <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-900 p-6 sm:p-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-8 -mr-8 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10 flex flex-col items-center text-center">
            {info.logoUrl ? (
              <img
                src={info.logoUrl}
                alt={info.churchName}
                className="max-h-16 max-w-[200px] object-contain mb-4 filter drop-shadow-sm rounded-lg"
              />
            ) : (
              <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-4 text-white shadow-inner">
                <Church className="w-7 h-7" />
              </div>
            )}
            <span className="text-xs font-semibold tracking-wider uppercase bg-white/15 px-3 py-1 rounded-full text-indigo-100 mb-2">
              {info.churchName}
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-2">
              {title}
            </h1>
            <p className="text-sm text-indigo-100/90 max-w-md font-normal leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8">
          {submitSuccess ? (
            /* ─── Immediate Interactive Success Screen ─── */
            <div className="text-center py-6 px-2 animate-in fade-in duration-300">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm ring-8 ring-emerald-50 dark:ring-emerald-950/20">
                <CheckCircle className="w-9 h-9" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                You're Subscribed!
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed mb-6">
                {successMsg}
              </p>

              {/* Subscribed Channels Breakdown */}
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-700/80 max-w-md mx-auto text-left mb-6">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-400 mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> Subscribed Channels
                </div>
                <div className="space-y-1.5">
                  {subscribedChannels.map((channel, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span className="font-medium">{channel}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  Subscribe another email
                </button>
                {info.website && (
                  <a
                    href={info.website}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition text-center inline-block"
                  >
                    Visit {info.churchName}
                  </a>
                )}
              </div>
            </div>
          ) : (
            /* ─── Subscription Form ─── */
            <form onSubmit={handleSubmit} className="space-y-5">
              {submitError && (
                <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 flex items-start gap-3 text-red-700 dark:text-red-400 text-sm">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>{submitError}</p>
                </div>
              )}

              {/* Honeypot field (hidden from users) */}
              <div className="hidden" aria-hidden="true">
                <input
                  type="text"
                  name="church_website_bot_trap"
                  tabIndex={-1}
                  value={honeypot}
                  onChange={e => setHoneypot(e.target.value)}
                  autoComplete="off"
                />
              </div>

              {/* Name Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    First Name
                  </label>
                  <input
                    type="text"
                    placeholder="Jane"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Last Name
                  </label>
                  <input
                    type="text"
                    placeholder="Doe"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  />
                </div>
              </div>

              {/* Email Field */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    placeholder="jane.doe@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  />
                </div>
              </div>

              {/* Sender / Newsletter Topics Selection */}
              {info.senders && info.senders.length > 0 && (
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Newsletter Channels
                    </label>
                    {info.senders.length > 1 && (
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        {selectedSenders.length === info.senders.length ? 'Deselect All' : 'Select All'}
                      </button>
                    )}
                  </div>

                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {info.senders.map(s => {
                      const lower = s.email.toLowerCase();
                      const isChecked = selectedSenders.includes(lower);
                      return (
                        <div
                          key={s.email}
                          onClick={() => toggleSender(s.email)}
                          className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer select-none transition ${
                            isChecked
                              ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/30'
                              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/40'
                          }`}
                        >
                          <div className="min-w-0 pr-3">
                            <div className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                              {s.name}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {s.email}
                            </div>
                          </div>
                          <div
                            className={`w-5 h-5 rounded-md flex items-center justify-center border transition shrink-0 ${
                              isChecked
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                            }`}
                          >
                            {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-xl shadow-md shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Subscribing...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4" />
                    Subscribe to Updates
                  </>
                )}
              </button>

              <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
                We respect your privacy. You can update your preferences or unsubscribe at any time.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
