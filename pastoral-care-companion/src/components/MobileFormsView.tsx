import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { firestore } from '../services/firestoreService';
import { Loader2, ArrowLeft, Send, CheckCircle2, ClipboardList, AlertCircle } from 'lucide-react';

interface MobileFormsViewProps {
  churchId: string;
  currentUser: User;
}

export const MobileFormsView: React.FC<MobileFormsViewProps> = ({ churchId }) => {
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Selected Form States
  const [activeForm, setActiveForm] = useState<any | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Fetch active forms list
  useEffect(() => {
    const fetchForms = async () => {
      setLoading(true);
      try {
        const list = await firestore.getForms(churchId);
        setForms(list);
      } catch (e) {
        console.error("Failed to load forms:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchForms();
  }, [churchId]);

  const handleOpenForm = (form: any) => {
    setActiveForm(form);
    setFormValues({});
    setSubmitted(false);
    setErrorMessage('');
  };

  const handleFieldChange = (name: string, value: any) => {
    setFormValues(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeForm || submitting) return;

    setSubmitting(true);
    setErrorMessage('');

    try {
      const sysSettings = await firestore.getSystemSettings();
      const apiBaseUrl = sysSettings.apiBaseUrl || 'https://pastoralcare.barnabassoftware.com';
      
      // Clean up fields to match schema expectations
      const payload: Record<string, any> = {
        submittedAt: Date.now(),
        // Map standard fields expected by the intake processor
        firstName: formValues.firstName || '',
        lastName: formValues.lastName || '',
        email: formValues.email || '',
        phone: formValues.phone || '',
        gender: formValues.gender || '',
        birthdate: formValues.birthdate || '',
        addressStreet: formValues.addressStreet || '',
        addressCity: formValues.addressCity || '',
        addressState: formValues.addressState || '',
        addressZip: formValues.addressZip || '',
      };

      // Add custom questions if any
      if (activeForm.customFields) {
        activeForm.customFields.forEach((field: any) => {
          if (field.name && formValues[field.name] !== undefined) {
            payload[field.name] = formValues[field.name];
          }
        });
      }

      const res = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/api/public/form/${churchId}/${activeForm.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        const errorData = await res.json().catch(() => ({}));
        setErrorMessage(errorData.error || "Submission failed. Please try again.");
      }
    } catch (err) {
      console.error(err);
      setErrorMessage("Network error occurred. Please verify your connection.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-slate-50 dark:bg-zinc-950">
      {/* Forms Listing Header */}
      {!activeForm ? (
        <>
          <div className="p-4 bg-white dark:bg-zinc-900 border-b border-slate-200/80 dark:border-zinc-800 shrink-0">
            <h2 className="text-sm min-[375px]:text-base font-black tracking-tight flex items-center gap-2">
              <ClipboardList size={18} className="text-indigo-500" />
              Intake Forms
            </h2>
            <p className="text-[10px] text-slate-400 dark:text-zinc-500 font-bold uppercase mt-0.5 tracking-wider">Select form to enter new contact data</p>
          </div>

          {/* Forms List */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
                <p className="text-xs font-bold uppercase tracking-wider">Loading templates...</p>
              </div>
            ) : forms.length === 0 ? (
              <div className="text-center py-20 text-slate-400 text-sm font-medium">
                No active forms found for your church.
              </div>
            ) : (
              <div className="grid gap-3">
                {forms.map(form => (
                  <div
                    key={form.id}
                    onClick={() => handleOpenForm(form)}
                    className="bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-3xl p-5 shadow-sm hover:border-indigo-100 dark:hover:border-indigo-900 cursor-pointer transition active:scale-[0.99]"
                  >
                    <h3 className="text-sm font-black text-slate-900 dark:text-white leading-tight">{form.name}</h3>
                    {form.description && (
                      <p className="text-xs text-slate-400 dark:text-zinc-500 font-medium mt-1 leading-snug">
                        {form.description}
                      </p>
                    )}
                    <div className="mt-4">
                      <span className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-50 dark:bg-indigo-950/30 text-[10px] font-black tracking-widest text-indigo-600 dark:text-indigo-400 uppercase rounded-xl border border-indigo-100/10 transition shadow-sm">
                        Launch Form
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Form Renderer Drawer View */
        <div className="h-full w-full flex flex-col relative bg-slate-50 dark:bg-zinc-950">
          
          {/* Form Header */}
          <div className="p-4 bg-white dark:bg-zinc-900 border-b border-slate-200/80 dark:border-zinc-800 shrink-0 flex items-center gap-3">
            <button
              onClick={() => setActiveForm(null)}
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 flex items-center justify-center hover:bg-slate-200"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="min-w-0">
              <h2 className="text-sm min-[375px]:text-base font-black truncate">{activeForm.name}</h2>
              <p className="text-[10px] text-slate-400 dark:text-zinc-500 font-bold uppercase mt-0.5 tracking-wider truncate">Intake Process</p>
            </div>
          </div>

          {/* Form Fields / Submission Result */}
          <div className="flex-1 min-h-0 overflow-y-auto p-5">
            {submitted ? (
              /* Success screen */
              <div className="flex flex-col items-center justify-center py-16 text-center animate-in fade-in zoom-in duration-300">
                <CheckCircle2 className="w-16 h-16 text-emerald-500 mb-4" />
                <h3 className="text-lg font-black text-slate-900 dark:text-white">Form Submitted!</h3>
                <p className="text-xs font-medium text-slate-400 dark:text-zinc-500 mt-2 max-w-xs">
                  Intake details successfully logged. New profile records will be created or updated shortly.
                </p>
                <div className="mt-8 flex flex-col gap-2 w-full max-w-xs">
                  <button
                    onClick={() => handleOpenForm(activeForm)}
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-100 dark:shadow-none transition"
                  >
                    Submit Another Response
                  </button>
                  <button
                    onClick={() => setActiveForm(null)}
                    className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-black text-xs uppercase tracking-widest rounded-2xl transition"
                  >
                    Back to Form Directory
                  </button>
                </div>
              </div>
            ) : (
              /* Form Submission Inputs */
              <form onSubmit={handleSubmit} className="space-y-5">
                {errorMessage && (
                  <div className="p-4 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-xl flex items-center gap-3 border border-rose-100 dark:border-rose-900/30">
                    <AlertCircle size={16} className="shrink-0" />
                    {errorMessage}
                  </div>
                )}

                {/* Render Fields */}
                <div className="space-y-4">
                  {/* First Name & Last Name (Standard fields) */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-2">First Name *</label>
                      <input
                        type="text"
                        value={formValues.firstName || ''}
                        onChange={e => handleFieldChange('firstName', e.target.value)}
                        required
                        placeholder="John"
                        className="w-full p-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-2">Last Name *</label>
                      <input
                        type="text"
                        value={formValues.lastName || ''}
                        onChange={e => handleFieldChange('lastName', e.target.value)}
                        required
                        placeholder="Doe"
                        className="w-full p-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-xs"
                      />
                    </div>
                  </div>

                  {/* Phone & Email */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-2">Phone</label>
                    <input
                      type="tel"
                      value={formValues.phone || ''}
                      onChange={e => handleFieldChange('phone', e.target.value)}
                      placeholder="(555) 000-0000"
                      className="w-full p-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-2">Email</label>
                    <input
                      type="email"
                      value={formValues.email || ''}
                      onChange={e => handleFieldChange('email', e.target.value)}
                      placeholder="name@example.com"
                      className="w-full p-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-xs"
                    />
                  </div>

                  {/* Gender & Birthdate */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-2">Gender</label>
                      <select
                        value={formValues.gender || ''}
                        onChange={e => handleFieldChange('gender', e.target.value)}
                        className="w-full p-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-xs"
                      >
                        <option value="">(Select)</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-2">Birthdate</label>
                      <input
                        type="date"
                        value={formValues.birthdate || ''}
                        onChange={e => handleFieldChange('birthdate', e.target.value)}
                        className="w-full p-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-xs"
                      />
                    </div>
                  </div>

                  {/* Address Section */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-2">Street Address</label>
                    <input
                      type="text"
                      value={formValues.addressStreet || ''}
                      onChange={e => handleFieldChange('addressStreet', e.target.value)}
                      placeholder="123 Main St"
                      className="w-full p-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-2">City</label>
                      <input
                        type="text"
                        value={formValues.addressCity || ''}
                        onChange={e => handleFieldChange('addressCity', e.target.value)}
                        placeholder="Dallas"
                        className="w-full p-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-2">State</label>
                      <input
                        type="text"
                        value={formValues.addressState || ''}
                        onChange={e => handleFieldChange('addressState', e.target.value)}
                        placeholder="TX"
                        className="w-full p-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-xs"
                      />
                    </div>
                  </div>

                  {/* Render Custom Fields dynamically if form has any */}
                  {activeForm.customFields && activeForm.customFields.map((field: any, idx: number) => {
                    if (field.type === 'section_heading') {
                      return (
                        <h4 key={idx} className="text-xs font-black text-slate-400 uppercase tracking-widest mt-6 mb-2 border-b border-slate-100 dark:border-zinc-800 pb-1">
                          {field.label}
                        </h4>
                      );
                    }
                    if (field.type === 'text_block') {
                      return (
                        <p key={idx} className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed font-medium bg-slate-50 dark:bg-zinc-800/40 p-3 rounded-xl">
                          {field.label}
                        </p>
                      );
                    }

                    return (
                      <div key={idx}>
                        <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-2">
                          {field.label} {field.required ? '*' : ''}
                        </label>
                        
                        {field.type === 'textarea' ? (
                          <textarea
                            value={formValues[field.name] || ''}
                            onChange={e => handleFieldChange(field.name, e.target.value)}
                            required={field.required}
                            placeholder="Your answer here..."
                            rows={3}
                            className="w-full p-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-xs resize-none"
                          />
                        ) : field.type === 'select' ? (
                          <select
                            value={formValues[field.name] || ''}
                            onChange={e => handleFieldChange(field.name, e.target.value)}
                            required={field.required}
                            className="w-full p-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-xs"
                          >
                            <option value="">(Select)</option>
                            {field.options && field.options.map((opt: string) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : field.type === 'checkbox' ? (
                          <label className="flex items-center gap-2.5 p-3.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!formValues[field.name]}
                              onChange={e => handleFieldChange(field.name, e.target.checked)}
                              className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                            />
                            <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">{field.label}</span>
                          </label>
                        ) : (
                          <input
                            type={field.type || 'text'}
                            value={formValues[field.name] || ''}
                            onChange={e => handleFieldChange(field.name, e.target.value)}
                            required={field.required}
                            placeholder="Your answer here..."
                            className="w-full p-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-xs"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Action button */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-1.5 p-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-100 dark:shadow-none transition active:scale-[0.98] mt-6"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
                    </>
                  ) : (
                    <>
                      <Send size={14} /> Submit Details
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
