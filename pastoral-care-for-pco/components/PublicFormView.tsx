import React, { useState, useEffect } from 'react';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface PublicFormViewProps {
  churchId: string;
  formId: string;
}

export const PublicFormView: React.FC<PublicFormViewProps> = ({ churchId, formId }) => {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form inputs state
  const [inputs, setInputs] = useState<any>({
    firstName: '',
    middleName: '',
    lastName: '',
    nickname: '',
    email: '',
    phone: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    birthday: '',
    gender: '',
    maritalStatus: '',
    anniversary: '',
    grade: '',
    medicalNotes: '',
    firstTimeVisitor: false,
    howHeard: '',
    interests: [],
    customQuestion1: '',
    customQuestion2: '',
    notes: ''
  });

  useEffect(() => {
    fetchConfig();
  }, [churchId, formId]);

  useEffect(() => {
    // Force allow scroll on document body when mounting standalone form
    const prevBodyOverflow = document.body.style.overflow;
    const prevBodyHeight = document.body.style.height;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevHtmlHeight = document.documentElement.style.height;

    document.body.style.overflow = 'auto';
    document.body.style.height = 'auto';
    document.documentElement.style.overflow = 'auto';
    document.documentElement.style.height = 'auto';

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.height = prevBodyHeight;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.documentElement.style.height = prevHtmlHeight;
    };
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch public configuration (no authentication required)
      const res = await fetch(`/api/public/form/${churchId}/${formId}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('This form is not active or could not be found.');
        }
        throw new Error(`Failed to load form (${res.status})`);
      }
      const data = await res.json();
      setConfig(data);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch form.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setInputs((prev: any) => ({ ...prev, [name]: checked }));
    } else {
      setInputs((prev: any) => ({ ...prev, [name]: value }));
    }
  };

  const handleInterestChange = (interest: string, checked: boolean) => {
    setInputs((prev: any) => {
      const current = prev.interests || [];
      const updated = checked 
        ? [...current, interest] 
        : current.filter((i: string) => i !== interest);
      return { ...prev, interests: updated };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate enabled & required fields
    const missing: string[] = [];
    if (config?.fields) {
      Object.entries(config.fields).forEach(([key, f]: any) => {
        if (f.enabled && f.required) {
          if (key === 'address') {
            if (!inputs.street || !inputs.city || !inputs.state || !inputs.zip) {
              missing.push('Full Address (Street, City, State, ZIP)');
            }
          } else if (!inputs[key]?.trim()) {
            missing.push(f.label);
          }
        }
      });
    }

    if (missing.length > 0) {
      setError(`Please fill out the following required fields: ${missing.join(', ')}`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/form/${churchId}/${formId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputs)
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Submission failed (${res.status})`);
      }

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center space-y-2">
          <Loader2 className="animate-spin mx-auto text-indigo-600 dark:text-indigo-400" size={32} />
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Loading connect form...</p>
        </div>
      </div>
    );
  }

  if (error && !config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 max-w-md w-full text-center shadow-lg">
          <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Form Unreachable</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 mb-6 leading-relaxed">{error}</p>
          <button
            onClick={fetchConfig}
            className="w-full py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-md shadow-indigo-600/15"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // Styles configuration
  const themeStyles = config?.styles || {
    primaryColor: '#4F46E5',
    backgroundColor: '#FFFFFF',
    textColor: '#1F2937',
    buttonTextColor: '#FFFFFF'
  };


  // Safe checks for field visibility
  const isEnabled = (fieldName: string) => !!config?.fields?.[fieldName]?.enabled;
  const isRequired = (fieldName: string) => !!config?.fields?.[fieldName]?.required;

  return (
    <div 
      className="min-h-screen w-full overflow-y-auto flex items-center justify-center py-12 px-6 transition-all duration-300"
      style={{ backgroundColor: themeStyles.backgroundColor + '1A', color: themeStyles.textColor }}
    >
      <div 
        className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-8 lg:p-10 shadow-xl relative overflow-hidden transition-colors"
        style={{ color: themeStyles.textColor }}
      >
        {/* Dynamic Theme Color Top Border Accent */}
        <div className="absolute top-0 left-0 right-0 h-1.5" style={{ backgroundColor: themeStyles.primaryColor }} />

        {submitted ? (
          /* SUCCESS VIEW */
          <div className="text-center py-10 space-y-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900">
              <CheckCircle size={32} className="text-emerald-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black tracking-wide uppercase">Thank you!</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                Your information has been successfully received and submitted to Planning Center Online. We appreciate your connection!
              </p>
            </div>
            <button
              onClick={() => {
                setInputs({
                  firstName: '',
                  middleName: '',
                  lastName: '',
                  nickname: '',
                  email: '',
                  phone: '',
                  street: '',
                  city: '',
                  state: '',
                  zip: '',
                  birthday: '',
                  gender: '',
                  maritalStatus: '',
                  anniversary: '',
                  grade: '',
                  medicalNotes: '',
                  firstTimeVisitor: false,
                  howHeard: '',
                  interests: [],
                  customQuestion1: '',
                  customQuestion2: '',
                  notes: ''
                });
                setSubmitted(false);
              }}
              style={{ backgroundColor: themeStyles.primaryColor, color: themeStyles.buttonTextColor }}
              className="px-6 py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition shadow-lg shadow-indigo-600/10"
            >
              Submit Another Response
            </button>
          </div>
        ) : (
          /* FORM SUBMISSION VIEW */
          <div>
            <div className="mb-8">
              <h1 className="text-2xl font-black uppercase tracking-wide mb-2" style={{ color: themeStyles.textColor }}>{config.name}</h1>
              {config.description && (
                <p className="text-sm text-slate-500 dark:text-slate-450 leading-relaxed">{config.description}</p>
              )}
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/25 border border-red-200/50 dark:border-red-900/30 rounded-2xl flex items-start gap-2.5">
                <AlertCircle size={18} className="text-red-550 shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-red-700 dark:text-red-400 leading-relaxed">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Names grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">First Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    name="firstName"
                    value={inputs.firstName}
                    onChange={handleChange}
                    className="w-full text-sm border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 bg-slate-50/50 dark:bg-slate-850 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-opacity-40 transition-all"
                    style={{ '--tw-ring-color': themeStyles.primaryColor } as any}
                  />
                </div>
                {isEnabled('middleName') && (
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Middle Name {isRequired('middleName') && <span className="text-red-500">*</span>}</label>
                    <input
                      type="text"
                      required={isRequired('middleName')}
                      name="middleName"
                      value={inputs.middleName}
                      onChange={handleChange}
                      className="w-full text-sm border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 bg-slate-50/50 dark:bg-slate-850 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-opacity-40 transition-all"
                      style={{ '--tw-ring-color': themeStyles.primaryColor } as any}
                    />
                  </div>
                )}
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Last Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    name="lastName"
                    value={inputs.lastName}
                    onChange={handleChange}
                    className="w-full text-sm border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 bg-slate-50/50 dark:bg-slate-850 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-opacity-40 transition-all"
                    style={{ '--tw-ring-color': themeStyles.primaryColor } as any}
                  />
                </div>
                {isEnabled('nickname') && (
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Nickname {isRequired('nickname') && <span className="text-red-500">*</span>}</label>
                    <input
                      type="text"
                      required={isRequired('nickname')}
                      name="nickname"
                      value={inputs.nickname}
                      onChange={handleChange}
                      className="w-full text-sm border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 bg-slate-50/50 dark:bg-slate-850 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-opacity-40 transition-all"
                      style={{ '--tw-ring-color': themeStyles.primaryColor } as any}
                    />
                  </div>
                )}
              </div>

              {/* Email & Phone */}
              {(isEnabled('email') || isEnabled('phone')) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {isEnabled('email') && (
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                        Email Address {isRequired('email') && <span className="text-red-500">*</span>}
                      </label>
                      <input
                        type="email"
                        required={isRequired('email')}
                        name="email"
                        value={inputs.email}
                        onChange={handleChange}
                        className="w-full text-sm border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 bg-slate-50/50 dark:bg-slate-850 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-opacity-40 transition-all"
                        style={{ '--tw-ring-color': themeStyles.primaryColor } as any}
                      />
                    </div>
                  )}
                  {isEnabled('phone') && (
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                        Phone Number {isRequired('phone') && <span className="text-red-500">*</span>}
                      </label>
                      <input
                        type="tel"
                        required={isRequired('phone')}
                        name="phone"
                        value={inputs.phone}
                        onChange={handleChange}
                        className="w-full text-sm border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 bg-slate-50/50 dark:bg-slate-850 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-opacity-40 transition-all"
                        style={{ '--tw-ring-color': themeStyles.primaryColor } as any}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Home Address fields group */}
              {isEnabled('address') && (
                <div className="space-y-4 pt-1.5">
                  <div className="border-b border-slate-100 dark:border-slate-850 pb-1">
                    <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Home Address</h3>
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Street Address {isRequired('address') && <span className="text-red-500">*</span>}</label>
                    <input
                      type="text"
                      required={isRequired('address')}
                      name="street"
                      value={inputs.street}
                      onChange={handleChange}
                      placeholder="123 Main St"
                      className="w-full text-sm border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 bg-slate-50/50 dark:bg-slate-850 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-opacity-40 transition-all"
                      style={{ '--tw-ring-color': themeStyles.primaryColor } as any}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-1">
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">City {isRequired('address') && <span className="text-red-500">*</span>}</label>
                      <input
                        type="text"
                        required={isRequired('address')}
                        name="city"
                        value={inputs.city}
                        onChange={handleChange}
                        className="w-full text-sm border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 bg-slate-50/50 dark:bg-slate-850 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-opacity-40 transition-all"
                        style={{ '--tw-ring-color': themeStyles.primaryColor } as any}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">State {isRequired('address') && <span className="text-red-500">*</span>}</label>
                      <input
                        type="text"
                        required={isRequired('address')}
                        name="state"
                        value={inputs.state}
                        onChange={handleChange}
                        placeholder="e.g. TX"
                        className="w-full text-sm border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 bg-slate-50/50 dark:bg-slate-850 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-opacity-40 transition-all"
                        style={{ '--tw-ring-color': themeStyles.primaryColor } as any}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">ZIP Code {isRequired('address') && <span className="text-red-500">*</span>}</label>
                      <input
                        type="text"
                        required={isRequired('address')}
                        name="zip"
                        value={inputs.zip}
                        onChange={handleChange}
                        className="w-full text-sm border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 bg-slate-50/50 dark:bg-slate-850 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-opacity-40 transition-all"
                        style={{ '--tw-ring-color': themeStyles.primaryColor } as any}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Birthday & Gender */}
              {(isEnabled('birthday') || isEnabled('gender')) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-1.5">
                  {isEnabled('birthday') && (
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                        Birthday {isRequired('birthday') && <span className="text-red-500">*</span>}
                      </label>
                      <input
                        type="date"
                        required={isRequired('birthday')}
                        name="birthday"
                        value={inputs.birthday}
                        onChange={handleChange}
                        className="w-full text-sm border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 bg-slate-50/50 dark:bg-slate-850 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-opacity-40 transition-all"
                        style={{ '--tw-ring-color': themeStyles.primaryColor } as any}
                      />
                    </div>
                  )}
                  {isEnabled('gender') && (
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                        Gender {isRequired('gender') && <span className="text-red-500">*</span>}
                      </label>
                      <select
                        required={isRequired('gender')}
                        name="gender"
                        value={inputs.gender}
                        onChange={handleChange}
                        className="w-full text-sm border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 bg-slate-50/50 dark:bg-slate-850 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-opacity-40 transition-all cursor-pointer"
                        style={{ '--tw-ring-color': themeStyles.primaryColor } as any}
                      >
                        <option value="">— Select Gender —</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Marital Status & Anniversary */}
              {(isEnabled('maritalStatus') || isEnabled('anniversary')) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-1.5">
                  {isEnabled('maritalStatus') && (
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                        Marital Status {isRequired('maritalStatus') && <span className="text-red-500">*</span>}
                      </label>
                      <select
                        required={isRequired('maritalStatus')}
                        name="maritalStatus"
                        value={inputs.maritalStatus}
                        onChange={handleChange}
                        className="w-full text-sm border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 bg-slate-50/50 dark:bg-slate-850 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-opacity-40 transition-all cursor-pointer"
                        style={{ '--tw-ring-color': themeStyles.primaryColor } as any}
                      >
                        <option value="">— Select Status —</option>
                        <option value="Single">Single</option>
                        <option value="Married">Married</option>
                        <option value="Divorced">Divorced</option>
                        <option value="Widowed">Widowed</option>
                        <option value="Separated">Separated</option>
                      </select>
                    </div>
                  )}
                  {isEnabled('anniversary') && (
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                        Anniversary {isRequired('anniversary') && <span className="text-red-500">*</span>}
                      </label>
                      <input
                        type="date"
                        required={isRequired('anniversary')}
                        name="anniversary"
                        value={inputs.anniversary}
                        onChange={handleChange}
                        className="w-full text-sm border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 bg-slate-50/50 dark:bg-slate-850 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-opacity-40 transition-all"
                        style={{ '--tw-ring-color': themeStyles.primaryColor } as any}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* School Grade & Medical Notes */}
              {(isEnabled('grade') || isEnabled('medicalNotes')) && (
                <div className="space-y-4 pt-1.5">
                  {isEnabled('grade') && (
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                        School Grade {isRequired('grade') && <span className="text-red-500">*</span>}
                      </label>
                      <select
                        required={isRequired('grade')}
                        name="grade"
                        value={inputs.grade}
                        onChange={handleChange}
                        className="w-full text-sm border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 bg-slate-50/50 dark:bg-slate-850 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-opacity-40 transition-all cursor-pointer"
                        style={{ '--tw-ring-color': themeStyles.primaryColor } as any}
                      >
                        <option value="">— Select Grade —</option>
                        <option value="0">Kindergarten</option>
                        <option value="1">1st Grade</option>
                        <option value="2">2nd Grade</option>
                        <option value="3">3rd Grade</option>
                        <option value="4">4th Grade</option>
                        <option value="5">5th Grade</option>
                        <option value="6">6th Grade</option>
                        <option value="7">7th Grade</option>
                        <option value="8">8th Grade</option>
                        <option value="9">9th Grade</option>
                        <option value="10">10th Grade</option>
                        <option value="11">11th Grade</option>
                        <option value="12">12th Grade</option>
                      </select>
                    </div>
                  )}
                  {isEnabled('medicalNotes') && (
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                        Medical Notes / Allergies / Special Instructions {isRequired('medicalNotes') && <span className="text-red-500">*</span>}
                      </label>
                      <textarea
                        required={isRequired('medicalNotes')}
                        name="medicalNotes"
                        value={inputs.medicalNotes}
                        onChange={handleChange as any}
                        placeholder="Please detail any allergies or medical notices here..."
                        rows={3}
                        className="w-full text-sm border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 bg-slate-50/50 dark:bg-slate-850 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-opacity-40 transition-all"
                        style={{ '--tw-ring-color': themeStyles.primaryColor } as any}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* First Time Visitor & Referral Source */}
              {(isEnabled('firstTimeVisitor') || isEnabled('howHeard')) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-1.5">
                  {isEnabled('firstTimeVisitor') && (
                    <div className="flex items-center gap-3 pt-4">
                      <input
                        type="checkbox"
                        id="firstTimeVisitor"
                        name="firstTimeVisitor"
                        checked={!!inputs.firstTimeVisitor}
                        onChange={handleChange as any}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        style={{ '--tw-ring-color': themeStyles.primaryColor } as any}
                      />
                      <label htmlFor="firstTimeVisitor" className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 cursor-pointer">
                        First Time Visitor?
                      </label>
                    </div>
                  )}
                  {isEnabled('howHeard') && (
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                        How did you hear about us? {isRequired('howHeard') && <span className="text-red-500">*</span>}
                      </label>
                      <input
                        type="text"
                        required={isRequired('howHeard')}
                        name="howHeard"
                        value={inputs.howHeard}
                        onChange={handleChange}
                        className="w-full text-sm border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 bg-slate-50/50 dark:bg-slate-850 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-opacity-40 transition-all"
                        style={{ '--tw-ring-color': themeStyles.primaryColor } as any}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Next Steps / Interests Checkboxes */}
              {isEnabled('interests') && (
                <div className="space-y-2.5 pt-1.5">
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Next Steps & Interests {isRequired('interests') && <span className="text-red-500">*</span>}
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50/50 dark:bg-slate-850 border border-slate-100 dark:border-slate-850 rounded-2xl p-4">
                    {['Connect Group', 'Serving / Volunteer', 'Baptism', 'Membership', 'Child Dedication', 'Other'].map(interest => {
                      const isChecked = inputs.interests?.includes(interest);
                      return (
                        <div key={interest} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`interest-${interest}`}
                            checked={!!isChecked}
                            onChange={e => handleInterestChange(interest, e.target.checked)}
                            className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            style={{ '--tw-ring-color': themeStyles.primaryColor } as any}
                          />
                          <label htmlFor={`interest-${interest}`} className="text-xs font-semibold text-slate-700 dark:text-slate-350 cursor-pointer select-none">
                            {interest}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Custom Questions 1 & 2 */}
              {isEnabled('customQuestion1') && (
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                    {config.fields.customQuestion1.customLabel || 'Custom Question 1'} {isRequired('customQuestion1') && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    required={isRequired('customQuestion1')}
                    name="customQuestion1"
                    value={inputs.customQuestion1}
                    onChange={handleChange}
                    className="w-full text-sm border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 bg-slate-50/50 dark:bg-slate-850 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-opacity-40 transition-all"
                    style={{ '--tw-ring-color': themeStyles.primaryColor } as any}
                  />
                </div>
              )}

              {isEnabled('customQuestion2') && (
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                    {config.fields.customQuestion2.customLabel || 'Custom Question 2'} {isRequired('customQuestion2') && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    required={isRequired('customQuestion2')}
                    name="customQuestion2"
                    value={inputs.customQuestion2}
                    onChange={handleChange}
                    className="w-full text-sm border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 bg-slate-50/50 dark:bg-slate-850 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-opacity-40 transition-all"
                    style={{ '--tw-ring-color': themeStyles.primaryColor } as any}
                  />
                </div>
              )}

              {/* Comments & Prayer Requests */}
              {isEnabled('notes') && (
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                    Comments / Prayer Requests {isRequired('notes') && <span className="text-red-500">*</span>}
                  </label>
                  <textarea
                    required={isRequired('notes')}
                    name="notes"
                    value={inputs.notes}
                    onChange={handleChange as any}
                    placeholder="How can we help or pray for you?"
                    rows={4}
                    className="w-full text-sm border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 bg-slate-50/50 dark:bg-slate-850 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-opacity-40 transition-all"
                    style={{ '--tw-ring-color': themeStyles.primaryColor } as any}
                  />
                </div>
              )}

              {/* Submit button */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ backgroundColor: themeStyles.primaryColor, color: themeStyles.buttonTextColor }}
                  className="w-full py-3 rounded-xl font-bold hover:opacity-90 disabled:opacity-50 transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/10"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      Submitting response…
                    </>
                  ) : (
                    'Submit Details'
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
