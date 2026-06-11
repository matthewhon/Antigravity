import React, { useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { pcoService } from '../services/pcoService';
import { 
  Plus, Trash2, Pencil, Copy, ExternalLink, Loader2, CheckCircle, 
  Settings, Eye, FormInput, Palette, ArrowLeft, Calendar, User, Check,
  Globe, FileText
} from 'lucide-react';

interface FormsManagerProps {
  churchId: string;
  currentUser: any;
}

export const FormsManager: React.FC<FormsManagerProps> = ({ churchId, currentUser }) => {
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeForm, setActiveForm] = useState<any | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmissionsView, setIsSubmissionsView] = useState(false);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);

  // Form Editor State
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [fields, setFields] = useState<any>({
    firstName: { label: 'First Name', required: true, enabled: true },
    middleName: { label: 'Middle Name', required: false, enabled: false },
    lastName: { label: 'Last Name', required: true, enabled: true },
    nickname: { label: 'Nickname', required: false, enabled: false },
    email: { label: 'Email Address', required: false, enabled: true },
    phone: { label: 'Phone Number', required: false, enabled: true },
    address: { label: 'Address', required: false, enabled: false },
    birthday: { label: 'Birthday', required: false, enabled: false },
    gender: { label: 'Gender', required: false, enabled: false },
    maritalStatus: { label: 'Marital Status', required: false, enabled: false },
    anniversary: { label: 'Anniversary', required: false, enabled: false },
    grade: { label: 'School Grade', required: false, enabled: false },
    medicalNotes: { label: 'Medical Notes & Allergies', required: false, enabled: false },
    firstTimeVisitor: { label: 'First Time Visitor?', required: false, enabled: false },
    howHeard: { label: 'How did you hear about us?', required: false, enabled: false },
    interests: { label: 'Next Steps Interests (Serving, Groups, etc.)', required: false, enabled: false },
    customQuestion1: { label: 'Custom Field 1 (Saves to note)', required: false, enabled: false, customLabel: 'Custom Question 1' },
    customQuestion2: { label: 'Custom Field 2 (Saves to note)', required: false, enabled: false, customLabel: 'Custom Question 2' },
    notes: { label: 'Comments & Prayer Requests (Saves as profile note)', required: false, enabled: false }
  });
  const [styles, setStyles] = useState({
    primaryColor: '#4F46E5',
    backgroundColor: '#FFFFFF',
    textColor: '#1F2937',
    buttonTextColor: '#FFFFFF'
  });
  const [actions, setActions] = useState({
    addToGroupId: '',
    enrollInWorkflowId: '',
    noteCategoryId: ''
  });
  const [isActive, setIsActive] = useState(true);
  const [syncToPco, setSyncToPco] = useState(true);

  // PCO integration options
  const [pcoGroups, setPcoGroups] = useState<any[]>([]);
  const [pcoWorkflows, setPcoWorkflows] = useState<any[]>([]);
  const [pcoNoteCategories, setPcoNoteCategories] = useState<any[]>([]);
  const [loadingPcoData, setLoadingPcoData] = useState(false);

  // UI state helpers
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load forms on mount
  useEffect(() => {
    loadForms();
    loadPcoOptions();
  }, [churchId]);

  const loadForms = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'pco_forms'), where('churchId', '==', churchId));
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setForms(list);
    } catch (e) {
      console.error('Failed to load forms:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadPcoOptions = async () => {
    setLoadingPcoData(true);
    try {
      const [groups, workflows, noteCategories] = await Promise.all([
        pcoService.getGroups(churchId).catch(() => []),
        (pcoService as any).getWorkflows(churchId).catch(() => []),
        (pcoService as any).getNoteCategories(churchId).catch(() => [])
      ]);
      setPcoGroups(groups);
      setPcoWorkflows(workflows);
      setPcoNoteCategories(noteCategories);
    } catch (e) {
      console.error('Failed to load PCO choices:', e);
    } finally {
      setLoadingPcoData(false);
    }
  };

  const loadSubmissions = async (formId: string) => {
    setLoadingSubmissions(true);
    try {
      const q = query(
        collection(db, 'pco_form_submissions'),
        where('formId', '==', formId),
        where('churchId', '==', churchId)
      );
      const snap = await getDocs(q);
      const list = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => b.submittedAt - a.submittedAt);
      setSubmissions(list);
    } catch (e) {
      console.error('Failed to load submissions:', e);
    } finally {
      setLoadingSubmissions(false);
    }
  };

  const handleDownloadCsv = () => {
    if (!activeForm || submissions.length === 0) return;
    
    const formFields = activeForm.fields || {};
    const enabledFields = Object.entries(formFields)
      .filter(([_, f]: any) => f.enabled)
      .map(([key, _]) => key);

    const headers = ['Submitted At', 'Status', ...enabledFields.map(key => {
      if (key === 'customQuestion1') return formFields.customQuestion1?.customLabel || 'Custom Question 1';
      if (key === 'customQuestion2') return formFields.customQuestion2?.customLabel || 'Custom Question 2';
      return formFields[key]?.label || key;
    })];

    const escapeCsvCell = (val: any) => {
      if (val === null || val === undefined) return '';
      let str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      str = str.replace(/"/g, '""');
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str}"`;
      }
      return str;
    };

    const rows = submissions.map((sub: any) => {
      const submittedAt = new Date(sub.submittedAt).toISOString();
      const status = sub.status || 'success';
      const data = sub.data || {};

      const fieldValues = enabledFields.map(key => {
        const value = data[key];
        if (key === 'interests' && Array.isArray(value)) {
          return value.join(', ');
        }
        if (typeof value === 'boolean') {
          return value ? 'Yes' : 'No';
        }
        return value;
      });

      return [submittedAt, status, ...fieldValues].map(escapeCsvCell).join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${activeForm.name.toLowerCase().replace(/\s+/g, '_')}_submissions.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleEditClick = (form: any) => {
    setActiveForm(form);
    setFormName(form.name);
    setFormDesc(form.description || '');
    setFields(form.fields || fields);
    setStyles(form.styles || styles);
    setActions(form.actions || actions);
    setIsActive(form.isActive !== false);
    setSyncToPco(form.settings?.syncToPco !== false);
    setIsEditing(true);
    setIsSubmissionsView(false);
  };

  const handleCreateClick = () => {
    setActiveForm(null);
    setFormName('');
    setFormDesc('');
    setFields({
      firstName: { label: 'First Name', required: true, enabled: true },
      middleName: { label: 'Middle Name', required: false, enabled: false },
      lastName: { label: 'Last Name', required: true, enabled: true },
      nickname: { label: 'Nickname', required: false, enabled: false },
      email: { label: 'Email Address', required: false, enabled: true },
      phone: { label: 'Phone Number', required: false, enabled: true },
      address: { label: 'Address', required: false, enabled: false },
      birthday: { label: 'Birthday', required: false, enabled: false },
      gender: { label: 'Gender', required: false, enabled: false },
      maritalStatus: { label: 'Marital Status', required: false, enabled: false },
      anniversary: { label: 'Anniversary', required: false, enabled: false },
      grade: { label: 'School Grade', required: false, enabled: false },
      medicalNotes: { label: 'Medical Notes & Allergies', required: false, enabled: false },
      firstTimeVisitor: { label: 'First Time Visitor?', required: false, enabled: false },
      howHeard: { label: 'How did you hear about us?', required: false, enabled: false },
      interests: { label: 'Next Steps Interests (Serving, Groups, etc.)', required: false, enabled: false },
      customQuestion1: { label: 'Custom Field 1 (Saves to note)', required: false, enabled: false, customLabel: 'Custom Question 1' },
      customQuestion2: { label: 'Custom Field 2 (Saves to note)', required: false, enabled: false, customLabel: 'Custom Question 2' },
      notes: { label: 'Comments & Prayer Requests (Saves as profile note)', required: false, enabled: false }
    });
    setStyles({
      primaryColor: '#4F46E5',
      backgroundColor: '#FFFFFF',
      textColor: '#1F2937',
      buttonTextColor: '#FFFFFF'
    });
    setActions({
      addToGroupId: '',
      enrollInWorkflowId: '',
      noteCategoryId: ''
    });
    setIsActive(true);
    setSyncToPco(true);
    setIsEditing(true);
    setIsSubmissionsView(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return alert('Form Name is required.');

    setSaving(true);
    try {
      const formId = activeForm?.id || `form_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const docRef = doc(db, 'pco_forms', formId);
      
      const payload = {
        id: formId,
        churchId,
        name: formName.trim(),
        description: formDesc.trim(),
        fields,
        styles,
        actions,
        isActive,
        settings: {
          syncToPco
        },
        updatedAt: Date.now(),
        createdAt: activeForm?.createdAt || Date.now()
      };

      await setDoc(docRef, payload, { merge: true });
      await loadForms();
      setIsEditing(false);
      setActiveForm(null);
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (formId: string) => {
    if (!confirm('Are you sure you want to delete this form? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'pco_forms', formId));
      await loadForms();
    } catch (e: any) {
      alert(`Delete failed: ${e.message}`);
    }
  };

  const handleCopy = (text: string, type: 'url' | 'embed') => {
    navigator.clipboard.writeText(text);
    setCopiedId(`${type}-${text}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleFieldEnabled = (key: string) => {
    // Keep first and last name always enabled
    if (key === 'firstName' || key === 'lastName') return;
    setFields((prev: any) => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key].enabled }
    }));
  };

  const toggleFieldRequired = (key: string) => {
    // Keep first and last name always required
    if (key === 'firstName' || key === 'lastName') return;
    setFields((prev: any) => ({
      ...prev,
      [key]: { ...prev[key], required: !prev[key].required }
    }));
  };

  const getPublicLink = (formId: string) => {
    return `${window.location.origin}/form/${churchId}/${formId}`;
  };

  const getEmbedCode = (formId: string) => {
    return `<iframe src="${getPublicLink(formId)}" style="width:100%; min-height:650px; border:none; border-radius:12px; overflow:hidden;" allow="clipboard-write"></iframe>`;
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        <Loader2 className="animate-spin mr-2" /> Loading forms manager...
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* HEADER SECTION */}
      {!isEditing && !isSubmissionsView && (
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2 uppercase tracking-wide">
              <FormInput className="text-indigo-600 dark:text-indigo-400" /> Planning Center Web Forms
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Create visitor cards and connect forms that directly create or overwrite member profiles in PCO.
            </p>
          </div>
          <button
            onClick={handleCreateClick}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl transition text-sm shadow-md shadow-indigo-600/20"
          >
            <Plus size={16} /> Create New Form
          </button>
        </div>
      )}

      {/* DASHBOARD LIST VIEW */}
      {!isEditing && !isSubmissionsView && (
        forms.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl">
            <FormInput size={48} className="mx-auto text-slate-350 dark:text-slate-700 mb-4" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">No forms created yet</h3>
            <p className="text-sm text-slate-450 dark:text-slate-500 mt-1 mb-6">Create custom contact cards for check-ins, visitor collections, and database cleanups.</p>
            <button
              onClick={handleCreateClick}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition text-sm"
            >
              Get Started
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {forms.map(form => {
              const link = getPublicLink(form.id);
              const embed = getEmbedCode(form.id);
              return (
                <div key={form.id} className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-bold text-slate-900 dark:text-white text-base truncate">{form.name}</h3>
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full ${
                        form.isActive !== false 
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 dark:bg-emerald-950/20' 
                          : 'bg-slate-100 text-slate-550 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {form.isActive !== false ? 'Active' : 'Draft'}
                      </span>
                    </div>
                    {form.description && (
                      <p className="text-xs text-slate-555 dark:text-slate-400 line-clamp-2 mb-4 leading-relaxed">{form.description}</p>
                    )}
                    
                    {/* Styling Tags Preview */}
                    <div className="flex flex-wrap gap-1.5 mb-5 mt-2">
                      <span className="text-[10px] bg-slate-50 dark:bg-slate-800 text-slate-650 dark:text-slate-400 font-semibold px-2 py-1 rounded-lg flex items-center gap-1.5 border border-slate-100 dark:border-slate-800">
                        <span className="w-2.5 h-2.5 rounded-full border border-slate-300" style={{ backgroundColor: form.styles?.primaryColor }} />
                        Theme Color
                      </span>
                      {form.actions?.addToGroupId && (
                        <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 font-bold px-2 py-1 rounded-lg">
                          Auto Group
                        </span>
                      )}
                      {form.actions?.enrollInWorkflowId && (
                        <span className="text-[10px] bg-violet-50 dark:bg-violet-950/20 text-violet-600 dark:text-violet-400 font-bold px-2 py-1 rounded-lg">
                          Workflow Action
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCopy(link, 'url')}
                        className="flex-1 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 rounded-lg transition border border-slate-200 dark:border-slate-700"
                      >
                        {copiedId === `url-${link}` ? 'Copied!' : 'Copy Link'}
                      </button>
                      <button
                        onClick={() => handleCopy(embed, 'embed')}
                        className="flex-1 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 rounded-lg transition border border-slate-200 dark:border-slate-700"
                      >
                        {copiedId === `embed-${embed}` ? 'Copied!' : 'Embed Code'}
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-1 pt-1.5">
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleEditClick(form)}
                          title="Edit form config"
                          className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                        >
                          <Pencil size={14} />
                        </button>
                        <a
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          title="Open Form in new tab"
                          className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                        >
                          <ExternalLink size={14} />
                        </a>
                        <button
                          onClick={() => {
                            setActiveForm(form);
                            setIsSubmissionsView(true);
                            loadSubmissions(form.id);
                          }}
                          title="View submissions"
                          className="p-1.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 rounded-lg transition border border-transparent hover:border-indigo-100 dark:hover:border-indigo-900/20"
                        >
                          <Eye size={14} />
                        </button>
                      </div>
                      
                      <button
                        onClick={() => handleDelete(form.id)}
                        title="Delete Form"
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* FORM CONFIGURATION / EDITOR STATE */}
      {isEditing && (
        <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-md">
          <div className="flex items-center gap-2 mb-6 text-slate-550 dark:text-slate-450 text-sm">
            <button type="button" onClick={() => setIsEditing(false)} className="hover:text-slate-850 dark:hover:text-white transition flex items-center gap-1">
              <ArrowLeft size={16} /> Back to dashboard
            </button>
          </div>
          
          <div className="flex flex-col lg:flex-row gap-10">
            {/* Form settings panel */}
            <div className="flex-1 space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                  {activeForm ? 'Edit Form Properties' : 'Create Form Properties'}
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 uppercase tracking-widest mb-1.5">Form Name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sunday Connect Card"
                      className="w-full text-sm border border-slate-250 dark:border-slate-700 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition"
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 uppercase tracking-widest mb-1.5">Description / Subtitle</label>
                    <textarea
                      placeholder="e.g. Welcome! Please fill out the form below to connect with us."
                      rows={3}
                      className="w-full text-sm border border-slate-250 dark:border-slate-700 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition"
                      value={formDesc}
                      onChange={e => setFormDesc(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    <input
                      type="checkbox"
                      id="sync-pco"
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      checked={syncToPco}
                      onChange={e => setSyncToPco(e.target.checked)}
                    />
                    <label htmlFor="sync-pco" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-350 cursor-pointer select-none">
                      Sync submissions to Planning Center Online (PCO)
                    </label>
                  </div>
                </div>
              </div>

              {/* FIELDS MANAGER */}
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2 mb-3">Enabled Fields</h3>
                <div className="space-y-2.5">
                  {Object.entries(fields).map(([key, f]: any) => {
                    const isName = key === 'firstName' || key === 'lastName';
                    const isCustomQ = key === 'customQuestion1' || key === 'customQuestion2';
                    return (
                      <div key={key} className="p-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              disabled={isName}
                              checked={f.enabled}
                              onChange={() => toggleFieldEnabled(key)}
                              id={`enabled-${key}`}
                              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                            />
                            <label htmlFor={`enabled-${key}`} className={`text-sm font-semibold cursor-pointer ${f.enabled ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 dark:text-slate-650'}`}>
                              {isCustomQ && f.enabled && f.customLabel ? f.customLabel : f.label} {isName && <span className="text-xs text-slate-400 font-normal">(required)</span>}
                            </label>
                          </div>
                          
                          {!isName && f.enabled && (
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={f.required}
                                onChange={() => toggleFieldRequired(key)}
                                id={`req-${key}`}
                                className="w-3.5 h-3.5 rounded text-amber-500 focus:ring-amber-500"
                              />
                              <label htmlFor={`req-${key}`} className="text-xs font-semibold text-slate-550 dark:text-slate-450 cursor-pointer">
                                Required
                              </label>
                            </div>
                          )}
                        </div>

                        {f.enabled && isCustomQ && (
                          <div className="pl-7 pt-1">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Question/Label Text</label>
                            <input
                              type="text"
                              className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                              placeholder="e.g. Favorite Coffee Drink?"
                              value={f.customLabel || ''}
                              onChange={e => {
                                const val = e.target.value;
                                setFields((prev: any) => ({
                                  ...prev,
                                  [key]: { ...prev[key], customLabel: val }
                                }));
                              }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* STYLING & AUTOMATIONS PANEL */}
            <div className="flex-1 space-y-6">
              {/* STYLING */}
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2 mb-4 flex items-center gap-1.5">
                  <Palette size={16} /> Color Customization
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">Primary / Accent Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        className="w-8 h-8 rounded-lg border-0 cursor-pointer p-0 bg-transparent"
                        value={styles.primaryColor}
                        onChange={e => setStyles({ ...styles, primaryColor: e.target.value })}
                      />
                      <input
                        type="text"
                        className="text-xs font-mono w-24 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-slate-50 dark:bg-slate-800 dark:text-white"
                        value={styles.primaryColor}
                        onChange={e => setStyles({ ...styles, primaryColor: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">Background Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        className="w-8 h-8 rounded-lg border-0 cursor-pointer p-0 bg-transparent"
                        value={styles.backgroundColor}
                        onChange={e => setStyles({ ...styles, backgroundColor: e.target.value })}
                      />
                      <input
                        type="text"
                        className="text-xs font-mono w-24 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-slate-50 dark:bg-slate-800 dark:text-white"
                        value={styles.backgroundColor}
                        onChange={e => setStyles({ ...styles, backgroundColor: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">Text Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        className="w-8 h-8 rounded-lg border-0 cursor-pointer p-0 bg-transparent"
                        value={styles.textColor}
                        onChange={e => setStyles({ ...styles, textColor: e.target.value })}
                      />
                      <input
                        type="text"
                        className="text-xs font-mono w-24 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-slate-50 dark:bg-slate-800 dark:text-white"
                        value={styles.textColor}
                        onChange={e => setStyles({ ...styles, textColor: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">Button Text Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        className="w-8 h-8 rounded-lg border-0 cursor-pointer p-0 bg-transparent"
                        value={styles.buttonTextColor}
                        onChange={e => setStyles({ ...styles, buttonTextColor: e.target.value })}
                      />
                      <input
                        type="text"
                        className="text-xs font-mono w-24 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-slate-50 dark:bg-slate-800 dark:text-white"
                        value={styles.buttonTextColor}
                        onChange={e => setStyles({ ...styles, buttonTextColor: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* AUTOMATIONS */}
              {syncToPco ? (
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2 mb-4 flex items-center gap-1.5">
                    <Settings size={16} /> Planning Center Automations
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-750 dark:text-slate-350 uppercase tracking-wide mb-1.5">Auto-Add to Group</label>
                      {loadingPcoData ? (
                        <div className="text-xs text-slate-400 py-2 flex items-center"><Loader2 size={12} className="animate-spin mr-1" /> Loading groups...</div>
                      ) : (
                        <select
                          className="w-full text-sm border border-slate-250 dark:border-slate-700 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                          value={actions.addToGroupId}
                          onChange={e => setActions({ ...actions, addToGroupId: e.target.value })}
                        >
                          <option value="">— Choose a Group (Optional) —</option>
                          {pcoGroups.map(g => (
                            <option key={g.id} value={g.id}>{g.attributes?.name}</option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-750 dark:text-slate-350 uppercase tracking-wide mb-1.5">Auto-Enroll in Workflow</label>
                      {loadingPcoData ? (
                        <div className="text-xs text-slate-400 py-2 flex items-center"><Loader2 size={12} className="animate-spin mr-1" /> Loading workflows...</div>
                      ) : (
                        <select
                          className="w-full text-sm border border-slate-250 dark:border-slate-700 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                          value={actions.enrollInWorkflowId}
                          onChange={e => setActions({ ...actions, enrollInWorkflowId: e.target.value })}
                        >
                          <option value="">— Choose a Workflow (Optional) —</option>
                          {pcoWorkflows.map(w => (
                            <option key={w.id} value={w.id}>{w.attributes?.name}</option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-750 dark:text-slate-350 uppercase tracking-wide mb-1.5">PCO Note Category</label>
                      {loadingPcoData ? (
                        <div className="text-xs text-slate-400 py-2 flex items-center"><Loader2 size={12} className="animate-spin mr-1" /> Loading categories...</div>
                      ) : (
                        <select
                          className="w-full text-sm border border-slate-250 dark:border-slate-700 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                          value={actions.noteCategoryId || ''}
                          onChange={e => setActions({ ...actions, noteCategoryId: e.target.value })}
                        >
                          <option value="">— Choose a Category (Optional) —</option>
                          {pcoNoteCategories.map(nc => (
                            <option key={nc.id} value={nc.id}>{nc.attributes?.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 dark:bg-slate-850/50 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 text-center space-y-2">
                  <Settings size={24} className="mx-auto text-indigo-500/80" />
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">Local Database Mode</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
                    This form is stored strictly in your local database. Submissions will not be sent to Planning Center Online.
                  </p>
                </div>
              )}

              {/* Status Toggle & Share/Embed Section */}
              <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="form-active"
                    checked={isActive}
                    onChange={e => setIsActive(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <label htmlFor="form-active" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-350 cursor-pointer">
                    Is Form Active? (Allow public submissions)
                  </label>
                </div>

                {activeForm && (
                  <div className="bg-slate-50 dark:bg-slate-850/50 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 space-y-4">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Globe size={14} className="text-indigo-500" /> Direct Link & Website Embed
                    </h4>
                    
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Direct Public Link</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={getPublicLink(activeForm.id)}
                          className="flex-1 text-xs border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleCopy(getPublicLink(activeForm.id), 'url')}
                          className="px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl transition"
                        >
                          {copiedId === `url-${getPublicLink(activeForm.id)}` ? 'Copied!' : 'Copy'}
                        </button>
                        <a
                          href={getPublicLink(activeForm.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition flex items-center gap-1"
                        >
                          <ExternalLink size={12} /> Preview
                        </a>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Website Embed Code (iframe)</label>
                      <div className="space-y-2">
                        <textarea
                          readOnly
                          rows={3}
                          value={getEmbedCode(activeForm.id)}
                          className="w-full text-[11px] font-mono border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleCopy(getEmbedCode(activeForm.id), 'embed')}
                          className="w-full py-2 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl transition"
                        >
                          {copiedId === `embed-${getEmbedCode(activeForm.id)}` ? 'Copied Embed Code!' : 'Copy Embed Code'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setActiveForm(null);
              }}
              className="px-5 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-450 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 rounded-xl transition flex items-center gap-1.5"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save Form Properties
            </button>
          </div>
        </form>
      )}

      {/* SUBMISSIONS LIST VIEWER */}
      {isSubmissionsView && activeForm && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6 border-b border-slate-100 dark:border-slate-850 pb-4">
            <div>
              <button onClick={() => setIsSubmissionsView(false)} className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center gap-1 mb-2">
                <ArrowLeft size={14} /> Back to dashboard
              </button>
              <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                Submissions: <span className="font-medium text-slate-600 dark:text-slate-400">{activeForm.name}</span>
              </h2>
            </div>
            <div className="flex items-center gap-3">
              {submissions.length > 0 && (
                <button
                  onClick={handleDownloadCsv}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-105 dark:bg-indigo-950/20 dark:hover:bg-indigo-900/35 border border-indigo-150 dark:border-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-xs font-bold rounded-xl transition"
                >
                  <FileText size={14} /> Download CSV
                </button>
              )}
              <span className="text-sm font-bold text-slate-500 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-100 dark:border-slate-800">
                {submissions.length} Total Submissions
              </span>
            </div>
          </div>

          {loadingSubmissions ? (
            <div className="flex h-40 items-center justify-center text-slate-450">
              <Loader2 className="animate-spin mr-2" /> Fetching form submissions...
            </div>
          ) : submissions.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Eye size={36} className="mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-sm">No submissions recorded yet.</p>
              <p className="text-xs text-slate-400 mt-1">Once visitors fill out this form, their details will display here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850/50">
                    <th className="px-4 py-3 text-left font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">Submitted</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">Name</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">Contact</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">PCO Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {submissions.map((sub: any) => (
                    <tr key={sub.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/25 transition">
                      <td className="px-4 py-3.5 text-slate-550 dark:text-slate-400 font-mono text-xs">
                        {new Date(sub.submittedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3.5 font-bold text-slate-800 dark:text-slate-200">
                        {sub.data?.firstName} {sub.data?.lastName}
                      </td>
                      <td className="px-4 py-3.5 space-y-1">
                        {sub.data?.email && (
                          <div className="text-xs font-medium text-slate-700 dark:text-slate-300">{sub.data.email}</div>
                        )}
                        {sub.data?.phone && (
                          <div className="text-[11px] text-slate-450 dark:text-slate-450 font-mono">{sub.data.phone}</div>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {sub.status === 'success' ? (
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                            sub.isNewPerson 
                              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 border border-emerald-100' 
                              : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/20 border border-indigo-100'
                          }`}>
                            <CheckCircle size={12} />
                            {sub.isNewPerson ? 'PCO Created' : 'PCO Updated'}
                            {sub.matchedPersonId && (
                              <span className="text-[10px] font-mono opacity-80">(#{sub.matchedPersonId})</span>
                            )}
                          </span>
                        ) : sub.status === 'failed' ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-red-650 border border-red-100 dark:bg-red-950/20">
                              Failed
                            </span>
                            {sub.errorDetails && (
                              <p className="text-[10px] text-red-500 line-clamp-1 max-w-[200px]" title={sub.errorDetails}>
                                {sub.errorDetails}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-600 border border-amber-100 dark:bg-amber-950/20 animate-pulse">
                            Processing
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
