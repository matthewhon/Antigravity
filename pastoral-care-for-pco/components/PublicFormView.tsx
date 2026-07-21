import React, { useState, useEffect } from 'react';
import { Loader2, CheckCircle, AlertCircle, FileUp, ChevronDown } from 'lucide-react';
import { storage } from '../services/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

interface PublicFormViewProps {
  churchId: string;
  formId: string;
  isEmbedded?: boolean;
}

export const PublicFormView: React.FC<PublicFormViewProps> = ({ churchId, formId, isEmbedded }) => {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form inputs state
  const [inputs, setInputs] = useState<any>({});
  const [uploadingFields, setUploadingFields] = useState<Record<string, boolean>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

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

  const migrateLegacyFields = (fieldsObj: any): any[] => {
    const result: any[] = [];
    const order = [
      'firstName', 'middleName', 'lastName', 'nickname',
      'email', 'phone', 'address', 'birthday', 'gender',
      'maritalStatus', 'anniversary', 'grade', 'medicalNotes',
      'firstTimeVisitor', 'howHeard', 'interests',
      'customQuestion1', 'customQuestion2', 'notes'
    ];

    order.forEach(key => {
      const f = fieldsObj[key];
      if (f && f.enabled) {
        let type: any = 'text';
        let options: string[] | undefined = undefined;
        
        if (key === 'interests') {
          type = 'checkboxes';
          options = ['Connect Group', 'Serving / Volunteer', 'Baptism', 'Membership', 'Child Dedication', 'Other'];
        } else if (key === 'firstTimeVisitor') {
          type = 'checkbox_single';
        } else if (key === 'medicalNotes' || key === 'notes') {
          type = 'paragraph';
        } else if (key === 'birthday' || key === 'anniversary') {
          type = 'date';
        } else if (key === 'gender') {
          type = 'select';
          options = ['Male', 'Female'];
        } else if (key === 'maritalStatus') {
          type = 'select';
          options = ['Single', 'Married', 'Divorced', 'Widowed', 'Separated'];
        } else if (key === 'grade') {
          type = 'select';
          options = ['Kindergarten', '1st Grade', '2nd Grade', '3rd Grade', '4th Grade', '5th Grade', '6th Grade', '7th Grade', '8th Grade', '9th Grade', '10th Grade', '11th Grade', '12th Grade'];
        }

        if (key === 'address') {
          result.push({
            id: 'heading_address',
            type: 'section_heading',
            label: 'Home Address',
            required: false,
            mapToPco: 'none'
          });
          result.push({
            id: 'street',
            type: 'text',
            label: 'Street Address',
            placeholder: '123 Main St',
            required: !!f.required,
            mapToPco: 'street'
          });
          result.push({
            id: 'city',
            type: 'text',
            label: 'City',
            required: !!f.required,
            mapToPco: 'city'
          });
          result.push({
            id: 'state',
            type: 'text',
            label: 'State',
            placeholder: 'TX',
            required: !!f.required,
            mapToPco: 'state'
          });
          result.push({
            id: 'zip',
            type: 'text',
            label: 'ZIP Code',
            required: !!f.required,
            mapToPco: 'zip'
          });
        } else {
          result.push({
            id: key,
            type,
            label: f.customLabel || f.label || key,
            placeholder: '',
            required: !!f.required,
            options,
            mapToPco: key
          });
        }
      }
    });

    const hasFirstName = result.some(r => r.mapToPco === 'firstName');
    if (!hasFirstName) {
      result.unshift({
        id: 'firstName',
        type: 'text',
        label: 'First Name',
        required: true,
        mapToPco: 'firstName',
        placeholder: ''
      });
    }
    const hasLastName = result.some(r => r.mapToPco === 'lastName');
    if (!hasLastName) {
      const fnIndex = result.findIndex(r => r.mapToPco === 'firstName');
      result.splice(fnIndex + 1, 0, {
        id: 'lastName',
        type: 'text',
        label: 'Last Name',
        required: true,
        mapToPco: 'lastName',
        placeholder: ''
      });
    }

    return result;
  };

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/form/${churchId}/${formId}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('This form is not active or could not be found.');
        }
        throw new Error(`Failed to load form (${res.status})`);
      }
      const data = await res.json();
      
      let fieldsToProcess = data.customFields || [];
      if (fieldsToProcess.length === 0 && data.fields) {
        fieldsToProcess = migrateLegacyFields(data.fields);
        data.customFields = fieldsToProcess;
      }
      
      setConfig(data);
      if (data.name) {
        document.title = data.name;
      }
      
      const initialInputs: any = {};
      fieldsToProcess.forEach((f: any) => {
        if (f.type === 'section_heading' || f.type === 'text_block') return;
        if (f.type === 'checkboxes') {
          initialInputs[f.id] = [];
        } else if (f.type === 'checkbox_single') {
          initialInputs[f.id] = false;
        } else {
          initialInputs[f.id] = '';
        }
      });
      setInputs(initialInputs);
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

  const handleFileUpload = async (fieldId: string, file: File) => {
    if (!file) return;
    setUploadingFields(prev => ({ ...prev, [fieldId]: true }));
    setUploadProgress(prev => ({ ...prev, [fieldId]: 0 }));
    
    try {
      const path = `form_uploads/${churchId}/${formId}/${Date.now()}_${file.name}`;
      const sRef = storageRef(storage, path);
      const uploadTask = uploadBytesResumable(sRef, file);
      
      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(prev => ({ ...prev, [fieldId]: Math.round(progress) }));
        }, 
        (error) => {
          console.error("File upload failed:", error);
          setError(`File upload failed: ${error.message}`);
          setUploadingFields(prev => ({ ...prev, [fieldId]: false }));
        }, 
        async () => {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          setInputs(prev => ({ ...prev, [fieldId]: downloadUrl }));
          setUploadingFields(prev => ({ ...prev, [fieldId]: false }));
        }
      );
    } catch (e: any) {
      console.error(e);
      setError(`File upload error: ${e.message}`);
      setUploadingFields(prev => ({ ...prev, [fieldId]: false }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const missing: string[] = [];
    const fieldsToValidate = config?.customFields || [];
    
    fieldsToValidate.forEach((f: any) => {
      if (f.type === 'section_heading' || f.type === 'text_block') return;
      if (f.required) {
        const val = inputs[f.id];
        if (f.type === 'checkboxes') {
          if (!val || val.length === 0) {
            missing.push(f.label);
          }
        } else if (f.type === 'checkbox_single') {
          if (!val) {
            missing.push(f.label);
          }
        } else {
          if (typeof val === 'string' && !val.trim()) {
            missing.push(f.label);
          } else if (val === undefined || val === null) {
            missing.push(f.label);
          }
        }
      }
    });

    const uploadsInProgress = Object.values(uploadingFields).some(Boolean);
    if (uploadsInProgress) {
      setError("Please wait for all file uploads to complete before submitting.");
      return;
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
          <p className="text-sm font-semibold text-slate-550 dark:text-slate-400">Loading connect form...</p>
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

  const themeStyles = config?.styles || {
    primaryColor: '#4F46E5',
    backgroundColor: '#FFFFFF',
    textColor: '#1F2937',
    buttonTextColor: '#FFFFFF'
  };

  return (
    <div 
      className={isEmbedded ? "w-full transition-all duration-300" : "min-h-screen w-full overflow-y-auto flex items-center justify-center py-12 px-6 transition-all duration-300"}
      style={{ backgroundColor: isEmbedded ? 'transparent' : themeStyles.backgroundColor + '1A', color: themeStyles.textColor }}
    >
      <div 
        className={isEmbedded ? "w-full relative overflow-hidden transition-colors" : "w-full max-w-2xl border border-slate-200/80 dark:border-slate-800 rounded-3xl p-8 lg:p-10 shadow-xl relative overflow-hidden transition-colors"}
        style={{ backgroundColor: isEmbedded ? 'transparent' : themeStyles.backgroundColor, color: themeStyles.textColor }}
      >
        {!isEmbedded && <div className="absolute top-0 left-0 right-0 h-1.5" style={{ backgroundColor: themeStyles.primaryColor }} />}

        {themeStyles.showLogo && (themeStyles.logoUrl || config?.churchLogoUrl) && (
          <div className="flex justify-center mt-4 mb-6">
            <img 
              src={themeStyles.logoUrl || config?.churchLogoUrl} 
              alt="Logo" 
              className="max-h-16 object-contain" 
            />
          </div>
        )}

        {submitted ? (
          <div className="text-center py-10 space-y-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900">
              <CheckCircle size={32} className="text-emerald-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-wide uppercase">Thank you!</h2>
              <p className="text-sm text-slate-500 dark:text-slate-450 max-w-md mx-auto leading-relaxed">
                Your information has been successfully received. We appreciate your connection!
              </p>
            </div>
            <button
              onClick={() => {
                const cleared: any = {};
                (config.customFields || []).forEach((f: any) => {
                  if (f.type === 'section_heading' || f.type === 'text_block') return;
                  if (f.type === 'checkboxes') cleared[f.id] = [];
                  else if (f.type === 'checkbox_single') cleared[f.id] = false;
                  else cleared[f.id] = '';
                });
                setInputs(cleared);
                setSubmitted(false);
              }}
              style={{ backgroundColor: themeStyles.primaryColor, color: themeStyles.buttonTextColor }}
              className="px-6 py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition shadow-lg"
            >
              Submit Another Response
            </button>
          </div>
        ) : (
          <div>
            <div className="mb-8">
              <h1 className="text-2xl font-bold uppercase tracking-wide mb-2" style={{ color: themeStyles.textColor }}>{config.name}</h1>
              {config.description && (
                <p className="text-sm text-slate-550 dark:text-slate-450 leading-relaxed">{config.description}</p>
              )}
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/25 border border-red-200/50 dark:border-red-900/30 rounded-2xl flex items-start gap-2.5">
                <AlertCircle size={18} className="text-red-550 shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-red-700 dark:text-red-400 leading-relaxed">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {(config.customFields || []).map((field: any) => {
                const isRequired = field.required;
                const value = inputs[field.id];

                if (field.type === 'section_heading') {
                  return (
                    <div key={field.id} className="border-b border-slate-200 dark:border-slate-800 pb-2 pt-4">
                      <h2 className="text-base font-bold uppercase tracking-wider">{field.label}</h2>
                    </div>
                  );
                }

                if (field.type === 'text_block') {
                  return (
                    <div key={field.id} className="py-2">
                      <p className="text-sm text-slate-500 dark:text-slate-400 whitespace-pre-line leading-relaxed">{field.label}</p>
                    </div>
                  );
                }

                return (
                  <div key={field.id} className="space-y-1.5">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {field.label} {isRequired && <span className="text-red-500">*</span>}
                    </label>

                    {field.type === 'text' && (
                      <input
                        type="text"
                        required={isRequired}
                        placeholder={field.placeholder || ''}
                        name={field.id}
                        value={value || ''}
                        onChange={handleChange}
                        className="w-full text-sm border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-opacity-40 transition-all"
                        style={{ '--tw-ring-color': themeStyles.primaryColor, backgroundColor: themeStyles.inputBgColor || '#F8FAFC', color: themeStyles.textColor || 'inherit' } as any}
                      />
                    )}

                    {field.type === 'paragraph' && (
                      <textarea
                        required={isRequired}
                        placeholder={field.placeholder || ''}
                        name={field.id}
                        value={value || ''}
                        onChange={handleChange}
                        rows={4}
                        className="w-full text-sm border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-opacity-40 transition-all"
                        style={{ '--tw-ring-color': themeStyles.primaryColor, backgroundColor: themeStyles.inputBgColor || '#F8FAFC', color: themeStyles.textColor || 'inherit' } as any}
                      />
                    )}

                    {field.type === 'select' && (
                      <div className="relative">
                        <select
                          required={isRequired}
                          name={field.id}
                          value={value || ''}
                          onChange={handleChange}
                          className="w-full text-sm border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-opacity-40 transition-all cursor-pointer appearance-none"
                          style={{ '--tw-ring-color': themeStyles.primaryColor, backgroundColor: themeStyles.inputBgColor || '#F8FAFC', color: themeStyles.textColor || 'inherit' } as any}
                        >
                          <option value="">{field.placeholder || '— Select Option —'}</option>
                          {(field.options || []).map((o: string, oi: number) => (
                            <option key={oi} value={o}>{o}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-4 top-3.5 opacity-50 pointer-events-none" style={{ color: themeStyles.textColor || 'inherit' }} />
                      </div>
                    )}

                    {field.type === 'checkboxes' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border border-slate-100 dark:border-slate-850 rounded-2xl p-4" style={{ backgroundColor: themeStyles.inputBgColor || '#F8FAFC' }}>
                        {(field.options || []).map((opt: string, oi: number) => {
                          const isChecked = Array.isArray(value) && value.includes(opt);
                          return (
                            <div key={oi} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id={`${field.id}-${opt}`}
                                checked={!!isChecked}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setInputs((prev: any) => {
                                    const current = prev[field.id] || [];
                                    const updated = checked
                                      ? [...current, opt]
                                      : current.filter((i: string) => i !== opt);
                                    return { ...prev, [field.id]: updated };
                                  });
                                }}
                                className="w-3.5 h-3.5 rounded cursor-pointer"
                                style={{ '--tw-ring-color': themeStyles.primaryColor, accentColor: themeStyles.primaryColor } as any}
                              />
                              <label htmlFor={`${field.id}-${opt}`} className="text-xs font-semibold cursor-pointer select-none" style={{ color: themeStyles.textColor || 'inherit' }}>
                                {opt}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {field.type === 'checkbox_single' && (
                      <div className="flex items-center gap-3 pt-2">
                        <input
                          type="checkbox"
                          id={field.id}
                          name={field.id}
                          checked={!!value}
                          onChange={handleChange}
                          className="w-4 h-4 rounded cursor-pointer"
                          style={{ '--tw-ring-color': themeStyles.primaryColor, accentColor: themeStyles.primaryColor } as any}
                        />
                        <label htmlFor={field.id} className="text-xs font-semibold cursor-pointer select-none" style={{ color: themeStyles.textColor || 'inherit' }}>
                          {field.label}
                        </label>
                      </div>
                    )}

                    {field.type === 'date' && (
                      <input
                        type="date"
                        required={isRequired}
                        name={field.id}
                        value={value || ''}
                        onChange={handleChange}
                        className="w-full text-sm border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-opacity-40 transition-all"
                        style={{ '--tw-ring-color': themeStyles.primaryColor, backgroundColor: themeStyles.inputBgColor || '#F8FAFC', color: themeStyles.textColor || 'inherit' } as any}
                      />
                    )}

                    {field.type === 'file' && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <input
                            type="file"
                            id={field.id}
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(field.id, file);
                            }}
                          />
                          <label
                            htmlFor={field.id}
                            style={{ borderColor: themeStyles.primaryColor }}
                            className="px-4 py-2 border border-dashed rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition flex items-center gap-1.5"
                          >
                            <FileUp size={14} style={{ color: themeStyles.primaryColor }} /> Choose File
                          </label>
                          <span className="text-xs text-slate-400 truncate max-w-xs">
                            {value ? "✓ Uploaded" : "No file selected"}
                          </span>
                        </div>
                        {uploadingFields[field.id] && (
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <Loader2 className="animate-spin text-indigo-500" size={12} />
                            Uploading... {uploadProgress[field.id]}%
                          </div>
                        )}
                        {value && (
                          <div className="text-xs">
                            <a href={value} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline flex items-center gap-1 font-semibold">
                              View Uploaded File
                            </a>
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                );
              })}

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ backgroundColor: themeStyles.primaryColor, color: themeStyles.buttonTextColor }}
                  className="w-full py-3 rounded-xl font-bold hover:opacity-90 disabled:opacity-50 transition flex items-center justify-center gap-2 shadow-lg"
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
