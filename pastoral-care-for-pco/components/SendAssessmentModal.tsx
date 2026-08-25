import { 
  Send, Mail, Phone, MessageSquare, Users, User, Search, 
  Check, X, Copy, QrCode, Download, Loader2, Sparkles, 
  Brain, Compass, AlertCircle, CheckCircle2, ListFilter, ExternalLink
} from 'lucide-react';
import QRCode from 'qrcode';
import { pcoService } from '../services/pcoService';
import { Church, User as UserType, PcoPerson } from '../types';

interface SendAssessmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessmentType: 'gifts' | 'mbti' | 'disc';
  church: Church;
  user: UserType;
  allPeople: PcoPerson[];
  initialPersonId?: string;
}

export const SendAssessmentModal: React.FC<SendAssessmentModalProps> = ({
  isOpen,
  onClose,
  assessmentType,
  church,
  user,
  allPeople,
  initialPersonId
}) => {
  const [channel, setChannel] = useState<'sms' | 'email'>('sms');
  const [recipientMode, setRecipientMode] = useState<'individual' | 'pco_list'>('individual');

  // Search in Directory state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<PcoPerson | null>(null);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);

  // Manual fallback inputs
  const [manualPhone, setManualPhone] = useState('');
  const [manualEmail, setManualEmail] = useState('');

  // PCO Lists state
  const [pcoLists, setPcoLists] = useState<any[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [selectedListId, setSelectedListId] = useState('');
  const [listMembers, setListMembers] = useState<any[]>([]);
  const [loadingListMembers, setLoadingListMembers] = useState(false);

  // Message content
  const [smsBody, setSmsBody] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  // Sending status
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendError, setSendError] = useState('');
  const [successCount, setSuccessCount] = useState<number | null>(null);

  // Share link & QR code
  const [copiedLink, setCopiedLink] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');

  const isGifts = assessmentType === 'gifts';
  const isMbti = assessmentType === 'mbti';
  const isDisc = assessmentType === 'disc';

  const assessmentName = isGifts 
    ? 'Spiritual Gifts Test' 
    : isMbti 
    ? 'Myers-Briggs Personality Assessment' 
    : 'Faith-Based DISC Assessment';

  const basePath = isGifts 
    ? '/gifts-test' 
    : isMbti 
    ? '/mbti-test' 
    : '/disc-test';

  const basePublicUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}${basePath}/${church.id}`;
  }, [basePath, church.id]);

  // Target assessment link (with personalized params if person selected)
  const targetUrl = useMemo(() => {
    if (recipientMode === 'individual' && selectedPerson) {
      const params = new URLSearchParams({
        personId: selectedPerson.id,
        name: selectedPerson.name,
      });
      if (selectedPerson.email) params.set('email', selectedPerson.email);
      if (selectedPerson.phone) params.set('phone', selectedPerson.phone);
      return `${basePublicUrl}?${params.toString()}`;
    }
    return basePublicUrl;
  }, [basePublicUrl, recipientMode, selectedPerson]);

  // Set initial person if provided
  useEffect(() => {
    if (initialPersonId && allPeople?.length) {
      const found = allPeople.find(p => p.id === initialPersonId);
      if (found) {
        setSelectedPerson(found);
        setManualPhone(found.phone || '');
        setManualEmail(found.email || '');
      }
    }
  }, [initialPersonId, allPeople]);

  // Load PCO Lists when switching to list mode
  useEffect(() => {
    if (recipientMode === 'pco_list' && pcoLists.length === 0) {
      let isMounted = true;
      async function load() {
        try {
          setLoadingLists(true);
          const lists = await pcoService.getPeopleLists(church.id);
          if (isMounted) {
            setPcoLists(lists || []);
            if (lists?.length > 0 && !selectedListId) {
              setSelectedListId(lists[0].id);
            }
          }
        } catch (e) {
          console.warn('Error loading PCO lists:', e);
        } finally {
          if (isMounted) setLoadingLists(false);
        }
      }
      load();
      return () => { isMounted = false; };
    }
  }, [recipientMode, church.id, pcoLists.length, selectedListId]);

  // Load List Members when list selection changes
  useEffect(() => {
    if (recipientMode === 'pco_list' && selectedListId) {
      let isMounted = true;
      async function loadMembers() {
        try {
          setLoadingListMembers(true);
          const members = await pcoService.getListMembersDetails(church.id, selectedListId);
          if (isMounted) {
            setListMembers(members || []);
          }
        } catch (e) {
          console.warn('Error loading list members:', e);
        } finally {
          if (isMounted) setLoadingListMembers(false);
        }
      }
      loadMembers();
      return () => { isMounted = false; };
    }
  }, [recipientMode, selectedListId, church.id]);

  // Generate QR Code
  useEffect(() => {
    if (targetUrl) {
      QRCode.toDataURL(targetUrl, { width: 350, margin: 2 })
        .then(url => setQrCodeDataUrl(url))
        .catch(err => console.error('Error generating QR code:', err));
    }
  }, [targetUrl]);

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update default message drafts whenever person, assessment, or channel changes
  useEffect(() => {
    const churchName = church.name || 'our church';
    const recipientFirstName = selectedPerson?.name?.split(' ')[0] || (recipientMode === 'pco_list' ? 'friend' : 'there');

    if (isGifts) {
      setSmsBody(`Hi ${recipientFirstName}! Please take ${churchName}'s Spiritual Gifts Test to discover how God has uniquely gifted you for service: ${targetUrl}`);
      setEmailSubject(`Discover Your Spiritual Gifts at ${churchName}`);
      setEmailBody(`Hi ${recipientFirstName},\n\nWe invite you to take our church Spiritual Gifts Assessment. God has given each of us unique gifts to encourage one another and build up the body of Christ (1 Peter 4:10).\n\nPlease click the link below to take the 5-minute assessment online:\n${targetUrl}\n\nBlessings,\n${churchName}`);
    } else if (isMbti) {
      setSmsBody(`Hi ${recipientFirstName}! Please take ${churchName}'s Myers-Briggs (MBTI) Personality Assessment to discover your 16 personality profile: ${targetUrl}`);
      setEmailSubject(`Discover Your Personality Profile – ${churchName}`);
      setEmailBody(`Hi ${recipientFirstName},\n\nWe invite you to take our Myers-Briggs Personality Assessment. Understanding how God has wired your personality, communication style, and strengths helps us grow and serve together in unity.\n\nPlease click the link below to take the 5-minute assessment online:\n${targetUrl}\n\nBlessings,\n${churchName}`);
    } else {
      setSmsBody(`Hi ${recipientFirstName}! Please take ${churchName}'s Faith-Based DISC Personality Assessment (KJV) to discover your biblical leadership & ministry style: ${targetUrl}`);
      setEmailSubject(`Discover Your Biblical DISC Ministry Style – ${churchName}`);
      setEmailBody(`Hi ${recipientFirstName},\n\nWe invite you to take our church Faith-Based DISC Personality Assessment. Grounded in Scripture (King James Version) and Christian fellowship, this tool helps us understand how God has uniquely equipped you with leadership, relational, service, and administrative strengths for the body of Christ (1 Corinthians 12:4–7).\n\nPlease click the link below to take the 5-minute assessment online:\n${targetUrl}\n\nBlessings,\n${churchName}`);
    }
  }, [isGifts, isMbti, isDisc, church.name, selectedPerson, recipientMode, targetUrl]);

  // Filtered search people
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return allPeople.slice(0, 8);
    const q = searchQuery.toLowerCase().trim();
    return allPeople.filter(p => 
      p.name?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q) ||
      p.phone?.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [allPeople, searchQuery]);

  const handleSelectPerson = (p: PcoPerson) => {
    setSelectedPerson(p);
    setManualPhone(p.phone || '');
    setManualEmail(p.email || '');
    setIsSearchOpen(false);
    setSearchQuery('');
  };

  const handleClearPerson = () => {
    setSelectedPerson(null);
    setManualPhone('');
    setManualEmail('');
  };

  // Recipient metrics for PCO List
  const listRecipientEmails = useMemo(() => {
    return listMembers.map(m => m.emails?.[0]).filter(Boolean);
  }, [listMembers]);

  const listRecipientPhones = useMemo(() => {
    return listMembers.map(m => m.phones?.[0]).filter(Boolean);
  }, [listMembers]);

  // Send action
  const handleSend = async () => {
    setSending(true);
    setSendError('');
    setSendSuccess(false);
    setSuccessCount(null);

    try {
      if (channel === 'sms') {
        if (recipientMode === 'individual') {
          const phoneToSend = selectedPerson?.phone || manualPhone.trim();
          if (!phoneToSend) {
            throw new Error('Please select a person with a mobile phone or enter a valid mobile number.');
          }

          const res = await fetch('/api/messaging/send-individual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              churchId: church.id,
              toPhone: phoneToSend,
              body: smsBody,
              sentBy: user.id,
              sentByName: user.name || user.email,
              personId: selectedPerson?.id || null,
              personName: selectedPerson?.name || null
            })
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to send SMS message.');
          }

          setSendSuccess(true);
          setSuccessCount(1);
        } else {
          // Send to PCO List via SMS
          if (!selectedListId) throw new Error('Please select a Planning Center list.');
          const currentList = pcoLists.find(l => l.id === selectedListId);

          const res = await fetch('/api/messaging/send-to-list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              churchId: church.id,
              pcoListId: selectedListId,
              listName: currentList?.attributes?.name || 'PCO List',
              body: smsBody,
              sentBy: user.id,
              sentByName: user.name || user.email
            })
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to send SMS to PCO list.');
          }

          const data = await res.json();
          setSendSuccess(true);
          setSuccessCount(data.totalSent || listRecipientPhones.length || 1);
        }
      } else {
        // Email Channel
        if (recipientMode === 'individual') {
          const emailToSend = selectedPerson?.email || manualEmail.trim();
          if (!emailToSend) {
            throw new Error('Please select a person with an email address or enter a valid email.');
          }

          // Build nice HTML template
          const formattedHtml = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; line-height: 1.6;">
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px;">
                <h2 style="color: #0f172a; margin-top: 0; font-size: 20px; font-weight: 800;">${emailSubject}</h2>
                <div style="white-space: pre-wrap; font-size: 14px; color: #334155; margin-bottom: 24px;">${emailBody}</div>
                <div style="text-align: center; margin: 28px 0;">
                  <a href="${targetUrl}" style="background-color: #6366f1; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 14px; display: inline-block;">
                    Take the ${assessmentName} →
                  </a>
                </div>
                <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 24px;">
                  Sent from ${church.name || 'Pastoral Care'}
                </p>
              </div>
            </div>
          `;

          const res = await fetch('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              churchId: church.id,
              toAddresses: [emailToSend],
              subject: emailSubject,
              htmlContent: formattedHtml,
              sentBy: user.id
            })
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to send email.');
          }

          setSendSuccess(true);
          setSuccessCount(1);
        } else {
          // Send to PCO List via Email
          if (!listRecipientEmails.length) {
            throw new Error('No valid email addresses found for the members of this list.');
          }

          const formattedHtml = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; line-height: 1.6;">
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px;">
                <h2 style="color: #0f172a; margin-top: 0; font-size: 20px; font-weight: 800;">${emailSubject}</h2>
                <div style="white-space: pre-wrap; font-size: 14px; color: #334155; margin-bottom: 24px;">${emailBody}</div>
                <div style="text-align: center; margin: 28px 0;">
                  <a href="${basePublicUrl}" style="background-color: #6366f1; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 14px; display: inline-block;">
                    Take the ${assessmentName} →
                  </a>
                </div>
                <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 24px;">
                  Sent from ${church.name || 'Pastoral Care'}
                </p>
              </div>
            </div>
          `;

          const res = await fetch('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              churchId: church.id,
              toAddresses: listRecipientEmails,
              subject: emailSubject,
              htmlContent: formattedHtml,
              sentBy: user.id
            })
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to send bulk email to PCO list.');
          }

          setSendSuccess(true);
          setSuccessCount(listRecipientEmails.length);
        }
      }

      setTimeout(() => {
        setSendSuccess(false);
      }, 5000);
    } catch (err: any) {
      setSendError(err.message || 'An error occurred while dispatching the test link.');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-md ${
              isGifts ? 'bg-indigo-600' : isMbti ? 'bg-violet-600' : 'bg-emerald-600'
            }`}>
              {isGifts ? <Sparkles className="w-5 h-5" /> : isMbti ? <Brain className="w-5 h-5" /> : <Compass className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                Send {assessmentName} Link
              </h3>
              <p className="text-xs text-slate-400">
                Reach individuals or entire PCO lists via SMS or Email with personalized test links.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Channel Selector: SMS vs Email */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
            <button
              type="button"
              onClick={() => setChannel('sms')}
              className={`py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                channel === 'sms'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Phone className="w-4 h-4 text-emerald-500" />
              <span>Send via SMS Text</span>
            </button>

            <button
              type="button"
              onClick={() => setChannel('email')}
              className={`py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                channel === 'email'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Mail className="w-4 h-4 text-indigo-500" />
              <span>Send via Email</span>
            </button>
          </div>

          {/* Recipient Mode: Individual vs PCO List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Recipient Target
              </label>
              <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setRecipientMode('individual')}
                  className={`px-3 py-1 rounded-md transition ${
                    recipientMode === 'individual'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Individual Person
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientMode('pco_list')}
                  className={`px-3 py-1 rounded-md transition ${
                    recipientMode === 'pco_list'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  PCO List
                </button>
              </div>
            </div>

            {/* Individual Mode: Directory Search */}
            {recipientMode === 'individual' ? (
              <div className="space-y-2">
                {selectedPerson ? (
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-black text-sm flex items-center justify-center overflow-hidden shrink-0">
                        {selectedPerson.avatar ? (
                          <img src={selectedPerson.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          selectedPerson.name.charAt(0)
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-2">
                          <span>{selectedPerson.name}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                            Directory Match
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {selectedPerson.email || 'No email'} {selectedPerson.phone ? `• ${selectedPerson.phone}` : '• No phone'}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleClearPerson}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div ref={searchContainerRef} className="relative">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search congregation directory by name, email, or phone..."
                        value={searchQuery}
                        onFocus={() => setIsSearchOpen(true)}
                        onChange={e => {
                          setSearchQuery(e.target.value);
                          setIsSearchOpen(true);
                        }}
                        className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    {/* Typeahead Dropdown */}
                    {isSearchOpen && (
                      <div className="absolute top-full left-0 right-0 mt-1.5 max-h-60 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-20 divide-y divide-slate-100 dark:divide-slate-800/60">
                        {searchResults.length === 0 ? (
                          <div className="p-3.5 text-center text-xs text-slate-400 italic">
                            No matching people found in directory.
                          </div>
                        ) : (
                          searchResults.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => handleSelectPerson(p)}
                              className="w-full p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/70 flex items-center justify-between text-left transition cursor-pointer"
                            >
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-600 dark:text-slate-300 shrink-0 overflow-hidden">
                                  {p.avatar ? <img src={p.avatar} alt="" className="w-full h-full object-cover" /> : p.name.charAt(0)}
                                </div>
                                <div>
                                  <div className="text-xs font-bold text-slate-900 dark:text-white">{p.name}</div>
                                  <div className="text-[10px] text-slate-400 truncate max-w-[280px]">
                                    {p.email || 'No email'} {p.phone ? `• ${p.phone}` : ''}
                                  </div>
                                </div>
                              </div>
                              <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">Select</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Manual Contact Details Input if not selected or to override */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {channel === 'sms' ? (
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        Recipient Mobile Phone Number *
                      </label>
                      <input
                        type="tel"
                        placeholder="(555) 000-0000"
                        value={manualPhone}
                        onChange={e => setManualPhone(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none"
                      />
                    </div>
                  ) : (
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        Recipient Email Address *
                      </label>
                      <input
                        type="email"
                        placeholder="john.doe@example.com"
                        value={manualEmail}
                        onChange={e => setManualEmail(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* PCO List Mode */
              <div className="space-y-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                    <span>Select Planning Center List:</span>
                    {loadingLists && <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />}
                  </label>
                  <select
                    value={selectedListId}
                    onChange={e => setSelectedListId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-bold focus:outline-none"
                  >
                    {pcoLists.length === 0 ? (
                      <option value="">{loadingLists ? 'Loading PCO Lists...' : 'No PCO lists found'}</option>
                    ) : (
                      pcoLists.map(l => (
                        <option key={l.id} value={l.id}>
                          {l.attributes?.name || l.name} {l.attributes?.total_people !== undefined ? `(${l.attributes.total_people} members)` : ''}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* List stats preview */}
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
                  <span>List Recipients:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {loadingListMembers ? 'Resolving members...' : (
                      channel === 'sms'
                        ? `${listRecipientPhones.length} valid phone numbers found`
                        : `${listRecipientEmails.length} valid email addresses found`
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Message Content Editor */}
          {channel === 'sms' ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  SMS Message Text
                </label>
                <span className="text-[10px] text-slate-400 font-mono">
                  {smsBody.length} characters
                </span>
              </div>
              <textarea
                rows={3}
                value={smsBody}
                onChange={e => setSmsBody(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white leading-relaxed focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Email Subject
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={e => setEmailSubject(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Email Message Body
                </label>
                <textarea
                  rows={4}
                  value={emailBody}
                  onChange={e => setEmailBody(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white leading-relaxed focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Quick Copy Link & QR Preview */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                Direct Assessment URL
              </span>
              <p className="text-xs text-slate-600 dark:text-slate-300 font-mono truncate select-all">
                {targetUrl}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(targetUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2500);
                }}
                className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 hover:bg-slate-100 transition cursor-pointer"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Copied' : 'Copy URL'}</span>
              </button>

              {qrCodeDataUrl && (
                <a
                  href={qrCodeDataUrl}
                  download={`${assessmentType}-qr-${church.id}.png`}
                  className="p-1.5 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition"
                  title="Download QR Code"
                >
                  <QrCode className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>

          {/* Feedback banners */}
          {sendError && (
            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-600 dark:text-rose-400 font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{sendError}</span>
            </div>
          )}

          {sendSuccess && (
            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                {channel === 'sms' ? 'SMS' : 'Email'} invitation successfully sent
                {successCount !== null ? ` to ${successCount} recipient${successCount > 1 ? 's' : ''}` : ''}!
              </span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
          >
            Close
          </button>

          <button
            type="button"
            disabled={sending}
            onClick={handleSend}
            className={`px-6 py-2.5 rounded-xl text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md transition cursor-pointer disabled:opacity-50 ${
              isGifts 
                ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20' 
                : isMbti 
                ? 'bg-violet-600 hover:bg-violet-700 shadow-violet-600/20' 
                : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
            }`}
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Send {channel === 'sms' ? 'SMS' : 'Email'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
