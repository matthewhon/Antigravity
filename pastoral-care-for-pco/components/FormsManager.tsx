import React, { useState, useEffect, useRef } from 'react';
import { db, storage } from '../services/firebase';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { firestore } from '../services/firestoreService';
import { pcoService } from '../services/pcoService';
import QRCode from 'qrcode';
import { 
  Plus, Trash2, Pencil, Copy, ExternalLink, Loader2, CheckCircle, 
  Settings, Eye, FormInput, Palette, ArrowLeft, Calendar, User, Check,
  Globe, FileText, QrCode, Download, MoveUp, MoveDown, Grab, 
  AlignLeft, CheckSquare, Square, FileUp, ChevronDown, Heading, 
  TextCursorInput, List, X
} from 'lucide-react';

interface FormsManagerProps {
  churchId: string;
  currentUser: any;
}

const PCO_FIELDS_DEFS: Record<string, { type: string; label: string; mapToPco: string; options?: string[] }> = {
  firstName: { type: 'text', label: 'First Name', mapToPco: 'firstName' },
  middleName: { type: 'text', label: 'Middle Name', mapToPco: 'middleName' },
  lastName: { type: 'text', label: 'Last Name', mapToPco: 'lastName' },
  nickname: { type: 'text', label: 'Nickname', mapToPco: 'nickname' },
  email: { type: 'text', label: 'Email', mapToPco: 'email' },
  phone: { type: 'text', label: 'Phone Number', mapToPco: 'phone' },
  street: { type: 'text', label: 'Street Address', mapToPco: 'street' },
  city: { type: 'text', label: 'City', mapToPco: 'city' },
  state: { type: 'text', label: 'State', mapToPco: 'state' },
  zip: { type: 'text', label: 'ZIP Code', mapToPco: 'zip' },
  birthday: { type: 'date', label: 'Birthday', mapToPco: 'birthday' },
  gender: { type: 'select', label: 'Gender', mapToPco: 'gender', options: ['Male', 'Female', 'Other'] },
  maritalStatus: { type: 'select', label: 'Marital Status', mapToPco: 'maritalStatus', options: ['Single', 'Married', 'Divorced', 'Widowed'] },
  anniversary: { type: 'date', label: 'Anniversary Date', mapToPco: 'anniversary' },
  grade: { type: 'select', label: 'School Grade', mapToPco: 'grade', options: ['Pre-K', 'Kindergarten', '1st Grade', '2nd Grade', '3rd Grade', '4th Grade', '5th Grade', '6th Grade', '7th Grade', '8th Grade', '9th Grade', '10th Grade', '11th Grade', '12th Grade'] },
  medicalNotes: { type: 'paragraph', label: 'Medical Notes & Allergies', mapToPco: 'medicalNotes' },
  notes: { type: 'paragraph', label: 'Comments / Prayer Requests', mapToPco: 'notes' }
};

export const FormsManager: React.FC<FormsManagerProps> = ({ churchId, currentUser }) => {
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeForm, setActiveForm] = useState<any | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmissionsView, setIsSubmissionsView] = useState(false);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [church, setChurch] = useState<any | null>(null);

  // Form Editor State
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'toolbox' | 'pco' | 'settings' | 'themes'>('toolbox');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
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
        let type: 'text' | 'paragraph' | 'checkboxes' | 'checkbox_single' | 'file' | 'date' | 'select' | 'section_heading' | 'text_block' = 'text';
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
  const [styles, setStyles] = useState({
    primaryColor: '#4F46E5',
    backgroundColor: '#FFFFFF',
    textColor: '#1F2937',
    buttonTextColor: '#FFFFFF',
    inputBgColor: '#F8FAFC'
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
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load forms on mount
  useEffect(() => {
    loadForms();
    loadPcoOptions();
    firestore.getChurch(churchId).then(setChurch).catch(console.error);
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
    
    const useNewFields = Array.isArray(activeForm.customFields) && activeForm.customFields.length > 0;
    
    let headers: string[] = [];
    let fieldKeysOrIds: string[] = [];
    
    if (useNewFields) {
      const inputFields = activeForm.customFields.filter((f: any) => f.type !== 'section_heading' && f.type !== 'text_block');
      headers = ['Submitted At', 'Status', ...inputFields.map((f: any) => f.label || f.id)];
      fieldKeysOrIds = inputFields.map((f: any) => f.id);
    } else {
      const formFields = activeForm.fields || {};
      const enabledFields = Object.entries(formFields)
        .filter(([_, f]: any) => f.enabled)
        .map(([key, _]) => key);
      headers = ['Submitted At', 'Status', ...enabledFields.map(key => {
        if (key === 'customQuestion1') return formFields.customQuestion1?.customLabel || 'Custom Question 1';
        if (key === 'customQuestion2') return formFields.customQuestion2?.customLabel || 'Custom Question 2';
        return formFields[key]?.label || key;
      })];
      fieldKeysOrIds = enabledFields;
    }

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

      const fieldValues = fieldKeysOrIds.map(key => {
        const value = data[key];
        if (Array.isArray(value)) {
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

  const syncQrCodeToLocalStorage = (formId: string, nameOfForm: string) => {
    try {
      const LOCAL_KEY = 'qr_generator_saved';
      const savedQrs: any[] = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
      const qrId = `form_qr_${formId}`;
      const publicLink = getPublicLink(formId);
      
      const newQr = {
        id: qrId,
        label: `${nameOfForm} (Form Link)`,
        type: 'url',
        value: publicLink,
        fgColor: '#1E293B',
        bgColor: '#FFFFFF',
        size: 300,
        createdAt: Date.now()
      };

      const existingIndex = savedQrs.findIndex(q => q.id === qrId);
      if (existingIndex >= 0) {
        savedQrs[existingIndex] = {
          ...newQr,
          fgColor: savedQrs[existingIndex].fgColor || newQr.fgColor,
          bgColor: savedQrs[existingIndex].bgColor || newQr.bgColor,
          size: savedQrs[existingIndex].size || newQr.size,
          label: `${nameOfForm} (Form Link)`
        };
      } else {
        savedQrs.unshift(newQr);
      }

      localStorage.setItem(LOCAL_KEY, JSON.stringify(savedQrs));
    } catch (err) {
      console.error('Failed to sync QR code to local storage:', err);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const path = `church_logos/${churchId}/${Date.now()}_${file.name}`;
      const sRef = storageRef(storage, path);
      const task = uploadBytesResumable(sRef, file);
      await new Promise<void>((resolve, reject) => {
        task.on('state_changed', null, reject, () => resolve());
      });
      const url = await getDownloadURL(sRef);
      setStyles(prev => ({ ...prev, logoUrl: url, showLogo: true }));
    } catch (err: any) {
      alert(`Logo upload failed: ${err.message}`);
    } finally {
      setUploadingLogo(false);
    }
  };

  useEffect(() => {
    if (activeForm && qrCanvasRef.current) {
      const link = getPublicLink(activeForm.id);
      QRCode.toCanvas(qrCanvasRef.current, link, {
        width: 140,
        margin: 2,
        color: {
          dark: '#1E293B',
          light: '#FFFFFF'
        }
      }).catch(err => {
        console.error('Failed to generate QR Code:', err);
      });
    }
  }, [activeForm, activeForm?.id, isEditing, activeTab]);

  const handleDownloadQr = () => {
    if (!activeForm || !qrCanvasRef.current) return;
    try {
      const url = qrCanvasRef.current.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeForm.name.toLowerCase().replace(/\s+/g, '_')}_qr.png`;
      a.click();
    } catch (err) {
      console.error('Download QR failed:', err);
    }
  };

  const handleEditClick = (form: any) => {
    setActiveForm(form);
    setFormName(form.name);
    setFormDesc(form.description || '');
    setFields(form.fields || fields);
    
    // Migrate legacy fields if customFields is empty or absent
    let initialCustomFields = form.customFields || [];
    if (initialCustomFields.length === 0 && form.fields) {
      initialCustomFields = migrateLegacyFields(form.fields);
    }
    setCustomFields(initialCustomFields);
    setSelectedFieldId(initialCustomFields.length > 0 ? initialCustomFields[0].id : null);
    setActiveTab('toolbox');

    setStyles(form.styles || styles);
    setActions(form.actions || actions);
    setIsActive(form.isActive !== false);
    setSyncToPco(form.settings?.syncToPco !== false);
    setIsEditing(true);
    setIsSubmissionsView(false);
    syncQrCodeToLocalStorage(form.id, form.name);
  };

  const handleCreateClick = () => {
    setActiveForm(null);
    setFormName('');
    setFormDesc('');
    setCustomFields([
      { id: 'firstName', type: 'text', label: 'First Name', required: true, mapToPco: 'firstName', placeholder: '' },
      { id: 'lastName', type: 'text', label: 'Last Name', required: true, mapToPco: 'lastName', placeholder: '' }
    ]);
    setSelectedFieldId('firstName');
    setActiveTab('toolbox');
    setStyles({
      primaryColor: '#4F46E5',
      backgroundColor: '#FFFFFF',
      textColor: '#1F2937',
      buttonTextColor: '#FFFFFF',
      inputBgColor: '#F8FAFC'
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
        fields, // Keep for backward compatibility
        customFields, // Store the new layout
        styles,
        actions,
        isActive,
        settings: {
          syncToPco
        },
        updatedAt: Date.now(),
        createdAt: activeForm?.createdAt || Date.now()
      };

      // Firestore rejects 'undefined' values anywhere in the document tree.
      // Stringifying and parsing is a quick and safe way to strip all 'undefined' properties from the POJO.
      const cleanPayload = JSON.parse(JSON.stringify(payload));

      await setDoc(docRef, cleanPayload, { merge: true });
      syncQrCodeToLocalStorage(formId, formName.trim());
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
    
    const LOCAL_KEY = 'qr_generator_saved';
    let deleteQr = false;
    try {
      const savedQrs: any[] = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
      const qrId = `form_qr_${formId}`;
      const hasQr = savedQrs.some(q => q.id === qrId);
      if (hasQr) {
        deleteQr = confirm('⚠️ Warning: A QR Code for this form is saved in your QR Codes area. Do you want to delete the QR Code as well?');
      }
    } catch (e) {
      console.error(e);
    }

    try {
      await deleteDoc(doc(db, 'pco_forms', formId));
      
      if (deleteQr) {
        try {
          const savedQrs: any[] = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
          const qrId = `form_qr_${formId}`;
          const next = savedQrs.filter(q => q.id !== qrId);
          localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
        } catch (err) {
          console.error(err);
        }
      }
      
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

  const [isDragOverCanvas, setIsDragOverCanvas] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleToolboxDragStart = (e: React.DragEvent, fieldType: string) => {
    e.dataTransfer.setData('text/plain', `toolbox:${fieldType}`);
  };

  const handleCanvasDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.setData('text/plain', `canvas:${index}`);
  };

  const handleCanvasDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
  };

  const getPcoFieldObject = (pcoKey: string) => {
    const def = PCO_FIELDS_DEFS[pcoKey];
    if (!def) return null;
    return {
      id: `field_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      type: def.type,
      label: def.label,
      required: false,
      mapToPco: def.mapToPco,
      placeholder: '',
      ...(def.options ? { options: [...def.options] } : {})
    };
  };

  const handleCanvasDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('text/plain');
    if (!data) return;

    const [source, val] = data.split(':');

    if (source === 'toolbox' || source === 'pcoField') {
      let newField: any;
      if (source === 'pcoField') {
        newField = getPcoFieldObject(val);
      } else {
        const type = val;
        newField = {
          id: `field_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          type,
          label: getFieldDefaultLabel(type),
          required: false,
          mapToPco: 'none',
          placeholder: ''
        };
        if (type === 'select' || type === 'checkboxes') {
          newField.options = ['Option 1', 'Option 2', 'Option 3'];
        }
      }
      if (newField) {
        const updated = [...customFields];
        updated.splice(index, 0, newField);
        setCustomFields(updated);
        setSelectedFieldId(newField.id);
        setActiveTab('settings');
      }
    } else if (source === 'canvas') {
      const fromIndex = parseInt(val, 10);
      if (isNaN(fromIndex) || fromIndex === index) return;
      const updated = [...customFields];
      const [movedItem] = updated.splice(fromIndex, 1);
      updated.splice(index, 0, movedItem);
      setCustomFields(updated);
    }
    setDraggedIndex(null);
  };

  const handleCanvasDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleEndDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('text/plain');
    if (!data) return;

    const [source, val] = data.split(':');

    if (source === 'toolbox' || source === 'pcoField') {
      let newField: any;
      if (source === 'pcoField') {
        newField = getPcoFieldObject(val);
      } else {
        const type = val;
        newField = {
          id: `field_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          type,
          label: getFieldDefaultLabel(type),
          required: false,
          mapToPco: 'none',
          placeholder: ''
        };
        if (type === 'select' || type === 'checkboxes') {
          newField.options = ['Option 1', 'Option 2', 'Option 3'];
        }
      }
      if (newField) {
        setCustomFields([...customFields, newField]);
        setSelectedFieldId(newField.id);
        setActiveTab('settings');
      }
    } else if (source === 'canvas') {
      const fromIndex = parseInt(val, 10);
      if (isNaN(fromIndex)) return;
      const updated = [...customFields];
      const [movedItem] = updated.splice(fromIndex, 1);
      updated.push(movedItem);
      setCustomFields(updated);
    }
    setDraggedIndex(null);
  };

  const getFieldDefaultLabel = (type: string) => {
    switch (type) {
      case 'text': return 'New Text Field';
      case 'paragraph': return 'New Paragraph Field';
      case 'checkboxes': return 'New Checkboxes Field';
      case 'checkbox_single': return 'I agree to the terms';
      case 'file': return 'Upload File';
      case 'date': return 'Select Date';
      case 'select': return 'Select Option';
      case 'section_heading': return 'Section Heading';
      case 'text_block': return 'Instructional text goes here.';
      default: return 'Custom Field';
    }
  };

  const getFieldIcon = (type: string) => {
    switch (type) {
      case 'text': return <TextCursorInput size={14} className="text-slate-500" />;
      case 'paragraph': return <AlignLeft size={14} className="text-slate-500" />;
      case 'checkboxes': return <CheckSquare size={14} className="text-slate-500" />;
      case 'checkbox_single': return <Square size={14} className="text-slate-500" />;
      case 'file': return <FileUp size={14} className="text-slate-500" />;
      case 'date': return <Calendar size={14} className="text-slate-500" />;
      case 'select': return <List size={14} className="text-slate-500" />;
      case 'section_heading': return <Heading size={14} className="text-slate-500" />;
      case 'text_block': return <FileText size={14} className="text-slate-500" />;
      default: return <FormInput size={14} className="text-slate-500" />;
    }
  };

  const handleAddOption = (fieldId: string) => {
    setCustomFields(prev => prev.map(f => {
      if (f.id === fieldId) {
        const currentOpts = f.options || [];
        return { ...f, options: [...currentOpts, `Option ${currentOpts.length + 1}`] };
      }
      return f;
    }));
  };

  const handleUpdateOption = (fieldId: string, optIndex: number, newValue: string) => {
    setCustomFields(prev => prev.map(f => {
      if (f.id === fieldId) {
        const currentOpts = [...(f.options || [])];
        currentOpts[optIndex] = newValue;
        return { ...f, options: currentOpts };
      }
      return f;
    }));
  };

  const handleRemoveOption = (fieldId: string, optIndex: number) => {
    setCustomFields(prev => prev.map(f => {
      if (f.id === fieldId) {
        const currentOpts = (f.options || []).filter((_, idx) => idx !== optIndex);
        return { ...f, options: currentOpts };
      }
      return f;
    }));
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= customFields.length) return;
    const updated = [...customFields];
    const [item] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, item);
    setCustomFields(updated);
  };

  const deleteField = (fieldId: string) => {
    const field = customFields.find(f => f.id === fieldId);
    if (field && (field.mapToPco === 'firstName' || field.mapToPco === 'lastName')) {
      alert("First Name and Last Name fields are required for PCO Sync and cannot be removed.");
      return;
    }
    const filtered = customFields.filter(f => f.id !== fieldId);
    setCustomFields(filtered);
    if (selectedFieldId === fieldId) {
      setSelectedFieldId(filtered.length > 0 ? filtered[0].id : null);
    }
  };

  const pcoFieldsList = [
    { value: 'none', label: 'None (Save to db only)' },
    { value: 'firstName', label: 'First Name' },
    { value: 'middleName', label: 'Middle Name' },
    { value: 'lastName', label: 'Last Name' },
    { value: 'nickname', label: 'Nickname' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'street', label: 'Street Address' },
    { value: 'city', label: 'City' },
    { value: 'state', label: 'State' },
    { value: 'zip', label: 'ZIP Code' },
    { value: 'birthday', label: 'Birthday' },
    { value: 'gender', label: 'Gender' },
    { value: 'maritalStatus', label: 'Marital Status' },
    { value: 'anniversary', label: 'Anniversary' },
    { value: 'grade', label: 'School Grade' },
    { value: 'medicalNotes', label: 'Medical Notes & Allergies' },
    { value: 'notes', label: 'Comments / Prayer Requests' }
  ];

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
        <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-md">
          {/* Editor Sub-Header */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
            <button type="button" onClick={() => { setIsEditing(false); setActiveForm(null); }} className="hover:text-slate-850 dark:hover:text-white transition flex items-center gap-1 text-slate-550 text-xs font-bold uppercase tracking-wider">
              <ArrowLeft size={16} /> Back to dashboard
            </button>
            <div className="flex items-center gap-3">
              <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full ${
                isActive 
                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 dark:bg-emerald-950/20' 
                  : 'bg-slate-100 text-slate-550 dark:bg-slate-800 dark:text-slate-400'
              }`}>
                {isActive ? 'Active' : 'Draft'}
              </span>
              <span className="text-xs text-slate-400 font-medium font-mono">
                {customFields.length} Fields
              </span>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-8 items-start">
            
            {/* LEFT CANVAS PANEL (Live Form Preview) */}
            <div className="flex-1 w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 min-h-[600px] flex flex-col transition-all">
              {styles.showLogo && (styles.logoUrl || church?.logoUrl) && (
                <div className="mb-4 flex justify-center">
                  <img src={styles.logoUrl || church?.logoUrl} alt="Church Logo" className="max-h-16 object-contain" />
                </div>
              )}
              <div className="mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
                <input
                  type="text"
                  required
                  placeholder="Form Name (e.g. Connection Card)"
                  className="w-full text-xl font-bold bg-transparent border-0 border-b border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-indigo-500 focus:ring-0 outline-none text-slate-900 dark:text-white pb-1 mb-2 transition"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                />
                <textarea
                  placeholder="Add a description or subtitle for this form..."
                  rows={2}
                  className="w-full text-xs bg-transparent border-0 border-b border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-indigo-500 focus:ring-0 outline-none text-slate-550 dark:text-slate-400 resize-none transition"
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                />
              </div>

              {/* DRAG ZONE */}
              <div 
                className={`flex-1 flex flex-col gap-4 rounded-xl p-2 transition-all min-h-[350px] ${
                  isDragOverCanvas ? 'bg-indigo-50/50 dark:bg-indigo-950/10 border-2 border-dashed border-indigo-400' : 'border-2 border-transparent'
                }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragOverCanvas(true); }}
                onDragLeave={() => setIsDragOverCanvas(false)}
                onDrop={handleEndDrop}
              >
                {customFields.map((field, index) => {
                  const isSelected = selectedFieldId === field.id;
                  const isRequired = field.required;

                  return (
                    <div
                      key={field.id}
                      draggable
                      onDragStart={(e) => handleCanvasDragStart(e, index)}
                      onDragOver={(e) => handleCanvasDragOver(e, index)}
                      onDrop={(e) => { e.stopPropagation(); setIsDragOverCanvas(false); handleCanvasDrop(e, index); }}
                      onDragEnd={handleCanvasDragEnd}
                      onClick={() => { setSelectedFieldId(field.id); setActiveTab('settings'); }}
                      className={`relative bg-white dark:bg-slate-900 border rounded-xl p-4 transition shadow-sm cursor-pointer select-none group ${
                        isSelected 
                          ? 'border-indigo-500 ring-2 ring-indigo-500/10' 
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      {/* Hover action bar */}
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-lg p-0.5 shadow-sm transition">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); moveField(index, 'up'); }}
                          disabled={index === 0}
                          className="p-1 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-850 rounded disabled:opacity-30"
                        >
                          <MoveUp size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); moveField(index, 'down'); }}
                          disabled={index === customFields.length - 1}
                          className="p-1 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-850 rounded disabled:opacity-30"
                        >
                          <MoveDown size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); deleteField(field.id); }}
                          className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>

                      {/* Field details */}
                      <div className="flex gap-2 items-start pr-16">
                        <Grab size={14} className="text-slate-400 mt-1 cursor-grab active:cursor-grabbing shrink-0" />
                        <div className="flex-1">
                          
                          {field.type === 'section_heading' ? (
                            <div className="border-b border-slate-150 dark:border-slate-800 pb-1.5 mb-1">
                              <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                {getFieldIcon(field.type)} {field.label || 'Section Heading'}
                              </h3>
                            </div>
                          ) : field.type === 'text_block' ? (
                            <p className="text-xs text-slate-550 dark:text-slate-400 whitespace-pre-line leading-relaxed italic flex items-start gap-1.5">
                              {getFieldIcon(field.type)} {field.label || 'Instructional text goes here.'}
                            </p>
                          ) : (
                            <div className="space-y-1.5 w-full">
                              <label className="text-[10px] font-bold text-slate-550 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                {field.label || 'Unnamed Field'} 
                                {isRequired && <span className="text-red-500 font-black">*</span>}
                                {field.mapToPco && field.mapToPco !== 'none' && (
                                  <span className="text-[8px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1 py-0.5 rounded font-normal lowercase font-sans ml-1.5">
                                    → PCO {field.mapToPco}
                                  </span>
                                )}
                              </label>

                              {/* Input Preview Mockups */}
                              {field.type === 'text' && (
                                <input
                                  type="text"
                                  disabled
                                  placeholder={field.placeholder || 'Enter text...'}
                                  className="w-full text-xs border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2"
                                  style={{ backgroundColor: styles.inputBgColor || '#F8FAFC', color: styles.textColor || 'inherit' }}
                                />
                              )}

                              {field.type === 'paragraph' && (
                                <textarea
                                  disabled
                                  rows={2}
                                  placeholder={field.placeholder || 'Enter notes or comments...'}
                                  className="w-full text-xs border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2"
                                  style={{ backgroundColor: styles.inputBgColor || '#F8FAFC', color: styles.textColor || 'inherit' }}
                                />
                              )}

                              {field.type === 'select' && (
                                <div className="relative">
                                  <select
                                    disabled
                                    className="w-full text-xs border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 appearance-none"
                                    style={{ backgroundColor: styles.inputBgColor || '#F8FAFC', color: styles.textColor || 'inherit' }}
                                  >
                                    <option>{field.placeholder || 'Select Option...'}</option>
                                    {(field.options || []).map((o: string, oi: number) => (
                                      <option key={oi}>{o}</option>
                                    ))}
                                  </select>
                                  <ChevronDown size={12} className="absolute right-3 top-2.5 opacity-50" style={{ color: styles.textColor || 'inherit' }} />
                                </div>
                              )}

                              {field.type === 'checkboxes' && (
                                <div className="flex flex-wrap gap-2.5 p-2 rounded-lg border border-slate-100 dark:border-slate-900" style={{ backgroundColor: styles.inputBgColor || '#F8FAFC' }}>
                                  {(field.options || []).map((o: string, oi: number) => (
                                    <div key={oi} className="flex items-center gap-1.5">
                                      <input type="checkbox" disabled className="w-3 h-3 rounded" style={{ accentColor: styles.primaryColor || '#4F46E5' }} />
                                      <span className="text-[11px] font-medium" style={{ color: styles.textColor || 'inherit' }}>{o}</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {field.type === 'checkbox_single' && (
                                <div className="flex items-center gap-2 pt-1">
                                  <input type="checkbox" disabled className="w-3.5 h-3.5 rounded" style={{ accentColor: styles.primaryColor || '#4F46E5' }} />
                                  <span className="text-[11px] font-semibold" style={{ color: styles.textColor || 'inherit' }}>{field.label || 'Check option'}</span>
                                </div>
                              )}

                              {field.type === 'date' && (
                                <input
                                  type="date"
                                  disabled
                                  className="w-full text-xs border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2"
                                  style={{ backgroundColor: styles.inputBgColor || '#F8FAFC', color: styles.textColor || 'inherit' }}
                                />
                              )}

                              {field.type === 'file' && (
                                <div className="w-full py-4 border border-dashed border-slate-250 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 rounded-xl text-center space-y-1">
                                  <FileUp size={16} className="mx-auto text-slate-400" />
                                  <p className="text-[10px] font-bold text-slate-500">Drag & Drop files or browse</p>
                                </div>
                              )}

                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT TOOLBOX & PROPERTIES PANEL */}
            <div className="w-full lg:w-96 shrink-0 space-y-6">
              
              {/* TAB SELECTION BAR */}
              <div className="flex bg-slate-100 dark:bg-slate-950 p-1.5 rounded-xl border border-slate-200 dark:border-slate-850">
                <button
                  type="button"
                  onClick={() => setActiveTab('toolbox')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                    activeTab === 'toolbox'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-sm border border-slate-200/50 dark:border-slate-800'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                  }`}
                >
                  Add Fields
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('pco')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                    activeTab === 'pco'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-sm border border-slate-200/50 dark:border-slate-800'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                  }`}
                >
                  PCO Fields
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('settings')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                    activeTab === 'settings'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-sm border border-slate-200/50 dark:border-slate-800'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                  }`}
                >
                  Field Settings
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('themes')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                    activeTab === 'themes'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-sm border border-slate-200/50 dark:border-slate-800'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                  }`}
                >
                  Form Settings
                </button>
              </div>

              {/* TAB 1: ADD FIELDS (TOOLBOX) */}
              {activeTab === 'toolbox' && (
                <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-5 border border-slate-200 dark:border-slate-850 space-y-4">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Toolbox</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">Drag fields to the canvas or click to insert at bottom.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    {[
                      { type: 'text', name: 'Text Box' },
                      { type: 'paragraph', name: 'Paragraph' },
                      { type: 'checkboxes', name: 'Checkboxes' },
                      { type: 'checkbox_single', name: 'Single Check' },
                      { type: 'file', name: 'File Upload' },
                      { type: 'date', name: 'Date Picker' },
                      { type: 'select', name: 'Dropdown' },
                      { type: 'section_heading', name: 'Heading' },
                      { type: 'text_block', name: 'Text Block' }
                    ].map((item) => (
                      <div
                        key={item.type}
                        draggable
                        onDragStart={(e) => handleToolboxDragStart(e, item.type)}
                        onClick={() => {
                          const newField: any = {
                            id: `field_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
                            type: item.type,
                            label: getFieldDefaultLabel(item.type),
                            required: false,
                            mapToPco: 'none',
                            placeholder: ''
                          };
                          if (item.type === 'select' || item.type === 'checkboxes') {
                            newField.options = ['Option 1', 'Option 2', 'Option 3'];
                          }
                          setCustomFields([...customFields, newField]);
                          setSelectedFieldId(newField.id);
                          setActiveTab('settings');
                        }}
                        className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs font-semibold text-slate-700 dark:text-slate-350 hover:border-indigo-400 hover:shadow-sm cursor-grab active:cursor-grabbing transition"
                      >
                        {getFieldIcon(item.type)}
                        <span>{item.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 1.5: PCO FIELDS */}
              {activeTab === 'pco' && (
                <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-5 border border-slate-200 dark:border-slate-850 space-y-4">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Planning Center Fields</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">Drag fields to the canvas or click to insert a pre-mapped field.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3.5 max-h-[450px] overflow-y-auto pr-1 bg-slate-50 dark:bg-slate-950 scrollbar-thin">
                    {Object.entries(PCO_FIELDS_DEFS).map(([key, item]) => (
                      <div
                        key={key}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', `pcoField:${key}`);
                        }}
                        onClick={() => {
                          const newField = getPcoFieldObject(key);
                          if (newField) {
                            setCustomFields([...customFields, newField]);
                            setSelectedFieldId(newField.id);
                            setActiveTab('settings');
                          }
                        }}
                        className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs font-semibold text-slate-700 dark:text-slate-350 hover:border-indigo-400 hover:shadow-sm cursor-grab active:cursor-grabbing transition"
                      >
                        {getFieldIcon(item.type)}
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 2: FIELD SETTINGS */}
              {activeTab === 'settings' && (
                <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-5 border border-slate-200 dark:border-slate-850 space-y-4">
                  {selectedFieldId && customFields.some(f => f.id === selectedFieldId) ? (
                    (() => {
                      const field = customFields.find(f => f.id === selectedFieldId)!;
                      const isName = field.mapToPco === 'firstName' || field.mapToPco === 'lastName';
                      return (
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Configure Field</h4>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{field.type} / #{field.id}</p>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-650 uppercase mb-1">Field Label / Text</label>
                            <input
                              type="text"
                              className="w-full text-xs border border-slate-250 dark:border-slate-800 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                              value={field.label || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCustomFields(prev => prev.map(f => f.id === field.id ? { ...f, label: val } : f));
                              }}
                            />
                          </div>

                          {field.type !== 'section_heading' && field.type !== 'text_block' && field.type !== 'checkboxes' && field.type !== 'checkbox_single' && field.type !== 'file' && (
                            <div>
                              <label className="block text-[10px] font-bold text-slate-650 uppercase mb-1">Placeholder Text</label>
                              <input
                                type="text"
                                className="w-full text-xs border border-slate-250 dark:border-slate-800 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                                placeholder="e.g. Enter value..."
                                value={field.placeholder || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCustomFields(prev => prev.map(f => f.id === field.id ? { ...f, placeholder: val } : f));
                                }}
                              />
                            </div>
                          )}

                          {field.type !== 'section_heading' && field.type !== 'text_block' && (
                            <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-3">
                              <label htmlFor="field-req" className="text-xs font-bold text-slate-600 cursor-pointer">Required input?</label>
                              <input
                                type="checkbox"
                                id="field-req"
                                disabled={isName}
                                className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                                checked={field.required}
                                onChange={(e) => {
                                  const val = e.target.checked;
                                  setCustomFields(prev => prev.map(f => f.id === field.id ? { ...f, required: val } : f));
                                }}
                              />
                            </div>
                          )}

                          {/* PCO Profile Attribute Mapping */}
                          {field.type !== 'section_heading' && field.type !== 'text_block' && (
                            <div className="space-y-1 pt-2 border-t border-slate-200 dark:border-slate-800">
                              <label className="block text-[10px] font-bold text-slate-650 uppercase">Map to Planning Center Field</label>
                              <select
                                disabled={isName}
                                className="w-full text-xs border border-slate-250 dark:border-slate-800 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                                value={field.mapToPco || 'none'}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCustomFields(prev => prev.map(f => f.id === field.id ? { ...f, mapToPco: val } : f));
                                }}
                              >
                                {pcoFieldsList.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* Options Builder (select, checkboxes) */}
                          {(field.type === 'select' || field.type === 'checkboxes') && (
                            <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold text-slate-650 uppercase">Options List</label>
                                <button
                                  type="button"
                                  onClick={() => handleAddOption(field.id)}
                                  className="text-[10px] font-black text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded transition"
                                >
                                  + Add Option
                                </button>
                              </div>
                              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                                {(field.options || []).map((opt: string, optIndex: number) => (
                                  <div key={optIndex} className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      value={opt}
                                      onChange={(e) => handleUpdateOption(field.id, optIndex, e.target.value)}
                                      className="flex-1 text-xs border border-slate-250 dark:border-slate-800 rounded px-2.5 py-1 bg-white dark:bg-slate-900"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveOption(field.id, optIndex)}
                                      className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                        </div>
                      );
                    })()
                  ) : (
                    <div className="text-center py-12 text-slate-400">
                      <FormInput size={32} className="mx-auto text-slate-300 mb-2" />
                      <p className="text-xs font-semibold">No field selected</p>
                      <p className="text-[10px] text-slate-400 mt-1">Select a field on the preview canvas to configure its settings.</p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: THEMES & AUTOMATIONS */}
              {activeTab === 'themes' && (
                <div className="space-y-6">
                  {/* Styling Colors & Logo */}
                  <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-5 border border-slate-200 dark:border-slate-850 space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 border-b border-slate-150 pb-1.5">Form Themes & Logo</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-650 uppercase mb-1">Accent Color</label>
                        <div className="flex items-center gap-1.5">
                          <input type="color" value={styles.primaryColor} onChange={e => setStyles({ ...styles, primaryColor: e.target.value })} className="w-7 h-7 rounded border-0 cursor-pointer p-0 bg-transparent" />
                          <input type="text" value={styles.primaryColor} onChange={e => setStyles({ ...styles, primaryColor: e.target.value })} className="text-[10px] font-mono w-16 border border-slate-250 dark:border-slate-800 rounded px-1.5 py-1.5 bg-white dark:bg-slate-900" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-650 uppercase mb-1">Background</label>
                        <div className="flex items-center gap-1.5">
                          <input type="color" value={styles.backgroundColor} onChange={e => setStyles({ ...styles, backgroundColor: e.target.value })} className="w-7 h-7 rounded border-0 cursor-pointer p-0 bg-transparent" />
                          <input type="text" value={styles.backgroundColor} onChange={e => setStyles({ ...styles, backgroundColor: e.target.value })} className="text-[10px] font-mono w-16 border border-slate-250 dark:border-slate-800 rounded px-1.5 py-1.5 bg-white dark:bg-slate-900" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-650 uppercase mb-1">Text Color</label>
                        <div className="flex items-center gap-1.5">
                          <input type="color" value={styles.textColor} onChange={e => setStyles({ ...styles, textColor: e.target.value })} className="w-7 h-7 rounded border-0 cursor-pointer p-0 bg-transparent" />
                          <input type="text" value={styles.textColor} onChange={e => setStyles({ ...styles, textColor: e.target.value })} className="text-[10px] font-mono w-16 border border-slate-250 dark:border-slate-800 rounded px-1.5 py-1.5 bg-white dark:bg-slate-900" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-650 uppercase mb-1">Btn Text</label>
                        <div className="flex items-center gap-1.5">
                          <input type="color" value={styles.buttonTextColor} onChange={e => setStyles({ ...styles, buttonTextColor: e.target.value })} className="w-7 h-7 rounded border-0 cursor-pointer p-0 bg-transparent" />
                          <input type="text" value={styles.buttonTextColor} onChange={e => setStyles({ ...styles, buttonTextColor: e.target.value })} className="text-[10px] font-mono w-16 border border-slate-250 dark:border-slate-800 rounded px-1.5 py-1.5 bg-white dark:bg-slate-900" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-650 uppercase mb-1">Text Box</label>
                        <div className="flex items-center gap-1.5">
                          <input type="color" value={styles.inputBgColor || '#F8FAFC'} onChange={e => setStyles({ ...styles, inputBgColor: e.target.value })} className="w-7 h-7 rounded border-0 cursor-pointer p-0 bg-transparent" />
                          <input type="text" value={styles.inputBgColor || '#F8FAFC'} onChange={e => setStyles({ ...styles, inputBgColor: e.target.value })} className="text-[10px] font-mono w-16 border border-slate-250 dark:border-slate-800 rounded px-1.5 py-1.5 bg-white dark:bg-slate-900" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between">
                        <label htmlFor="show-logo-checkbox" className="text-xs font-bold text-slate-650 uppercase cursor-pointer select-none">Show Church Logo?</label>
                        <input
                          type="checkbox"
                          id="show-logo-checkbox"
                          className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                          checked={!!styles.showLogo}
                          onChange={e => setStyles({ ...styles, showLogo: e.target.checked })}
                        />
                      </div>
                      
                      {styles.showLogo && (
                        <div className="space-y-2">
                          <label className="block text-[10px] font-bold text-slate-650 uppercase">Logo Image</label>
                          <div className="flex gap-2">
                            <input
                              type="file"
                              ref={logoInputRef}
                              accept="image/*"
                              className="hidden"
                              onChange={handleLogoUpload}
                            />
                            <button
                              type="button"
                              onClick={() => logoInputRef.current?.click()}
                              disabled={uploadingLogo}
                              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg py-2 hover:border-indigo-400 hover:text-indigo-600 text-slate-500 transition disabled:opacity-50"
                            >
                              {uploadingLogo ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                              {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                            </button>
                            {church?.logoUrl && styles.logoUrl !== church.logoUrl && (
                              <button
                                type="button"
                                onClick={() => setStyles({ ...styles, logoUrl: church.logoUrl, showLogo: true })}
                                className="px-3 py-2 text-xs font-semibold bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition"
                              >
                                Use Default
                              </button>
                            )}
                          </div>
                          {(styles.logoUrl || church?.logoUrl) && (
                            <div className="relative w-full h-16 bg-slate-100 dark:bg-slate-950 rounded-xl flex items-center justify-center border border-slate-200 dark:border-slate-800 p-2 overflow-hidden">
                              <img src={styles.logoUrl || church?.logoUrl} alt="Church Logo" className="max-h-full object-contain" />
                              {styles.logoUrl && (
                                <button
                                  type="button"
                                  onClick={() => setStyles({ ...styles, logoUrl: '' })}
                                  className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full hover:bg-black/75 transition"
                                  title="Remove logo override"
                                >
                                  <X size={10} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* General Configuration & Automations */}
                  <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-5 border border-slate-200 dark:border-slate-850 space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 border-b border-slate-150 pb-1.5">Settings & Actions</h4>
                    
                    <div className="flex items-center gap-2 pb-1.5">
                      <input
                        type="checkbox"
                        id="sync-pco-editor"
                        className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                        checked={syncToPco}
                        onChange={e => setSyncToPco(e.target.checked)}
                      />
                      <label htmlFor="sync-pco-editor" className="text-[11px] font-bold text-slate-650 uppercase cursor-pointer select-none">
                        Sync to Planning Center
                      </label>
                    </div>

                    <div className="flex items-center gap-2 pb-1.5 border-b border-slate-100 dark:border-slate-900">
                      <input
                        type="checkbox"
                        id="form-active-editor"
                        checked={isActive}
                        onChange={e => setIsActive(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                      />
                      <label htmlFor="form-active-editor" className="text-[11px] font-bold text-slate-650 uppercase cursor-pointer">
                        Form Active (Publicly accessible)
                      </label>
                    </div>

                    {syncToPco ? (
                      <div className="space-y-4 pt-1.5">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-550 uppercase mb-1">Auto-Add to PCO Group</label>
                          {loadingPcoData ? (
                            <div className="text-xs text-slate-400 flex items-center"><Loader2 size={12} className="animate-spin mr-1" /> Loading groups...</div>
                          ) : (
                            <select
                              className="w-full text-xs border border-slate-250 dark:border-slate-800 rounded-lg px-2.5 py-2 bg-white dark:bg-slate-900"
                              value={actions.addToGroupId}
                              onChange={e => setActions({ ...actions, addToGroupId: e.target.value })}
                            >
                              <option value="">— Optional PCO Group —</option>
                              {pcoGroups.map(g => (
                                <option key={g.id} value={g.id}>{g.attributes?.name}</option>
                              ))}
                            </select>
                          )}
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-550 uppercase mb-1">Auto-Enroll in Workflow</label>
                          {loadingPcoData ? (
                            <div className="text-xs text-slate-400 flex items-center"><Loader2 size={12} className="animate-spin mr-1" /> Loading workflows...</div>
                          ) : (
                            <select
                              className="w-full text-xs border border-slate-250 dark:border-slate-800 rounded-lg px-2.5 py-2 bg-white dark:bg-slate-900"
                              value={actions.enrollInWorkflowId}
                              onChange={e => setActions({ ...actions, enrollInWorkflowId: e.target.value })}
                            >
                              <option value="">— Optional PCO Workflow —</option>
                              {pcoWorkflows.map(w => (
                                <option key={w.id} value={w.id}>{w.attributes?.name}</option>
                              ))}
                            </select>
                          )}
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-550 uppercase mb-1">PCO Note Category</label>
                          {loadingPcoData ? (
                            <div className="text-xs text-slate-400 flex items-center"><Loader2 size={12} className="animate-spin mr-1" /> Loading categories...</div>
                          ) : (
                            <select
                              className="w-full text-xs border border-slate-250 dark:border-slate-800 rounded-lg px-2.5 py-2 bg-white dark:bg-slate-900"
                              value={actions.noteCategoryId || ''}
                              onChange={e => setActions({ ...actions, noteCategoryId: e.target.value })}
                            >
                              <option value="">— Optional Note Category —</option>
                              {pcoNoteCategories.map(nc => (
                                <option key={nc.id} value={nc.id}>{nc.attributes?.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center text-[10px] text-slate-500 leading-normal">
                        Database-only Mode. Submissions are saved locally and not synced to PCO.
                      </div>
                    )}
                  </div>

                  {/* Share & Embed Options */}
                  {activeForm && (
                    <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-5 border border-slate-200 dark:border-slate-850 space-y-4">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 border-b border-slate-150 pb-1.5 flex items-center gap-1">
                        <Globe size={14} className="text-indigo-500" /> Share & Embed
                      </h4>
                      
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Direct Link</label>
                          <div className="flex gap-1.5">
                            <input type="text" readOnly value={getPublicLink(activeForm.id)} className="flex-1 text-[10px] border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-900" />
                            <button type="button" onClick={() => handleCopy(getPublicLink(activeForm.id), 'url')} className="px-2.5 py-1.5 text-[10px] font-bold text-slate-700 bg-white border border-slate-200 rounded-lg">
                              {copiedId === `url-${getPublicLink(activeForm.id)}` ? 'Copied' : 'Copy'}
                            </button>
                            <a href={getPublicLink(activeForm.id)} target="_blank" rel="noreferrer" className="px-2 py-1.5 text-[10px] font-bold text-white bg-indigo-600 rounded-lg flex items-center gap-0.5">
                              <ExternalLink size={10} /> View
                            </a>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Embed Code (iframe)</label>
                          <textarea readOnly rows={2} value={getEmbedCode(activeForm.id)} className="w-full text-[10px] font-mono border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-900 outline-none" />
                          <button type="button" onClick={() => handleCopy(getEmbedCode(activeForm.id), 'embed')} className="w-full py-1 text-[10px] font-bold text-slate-700 bg-white border border-slate-200 rounded-lg mt-1">
                            {copiedId === `embed-${getEmbedCode(activeForm.id)}` ? 'Copied Embed Code!' : 'Copy Embed Code'}
                          </button>
                        </div>

                        {/* QR Code */}
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-col items-center">
                          <label className="text-[9px] font-bold text-slate-500 uppercase mb-2">QR Code</label>
                          <div className="bg-white p-1 rounded-lg border border-slate-100 mb-2">
                            <canvas ref={qrCanvasRef} className="w-24 h-24 block" />
                          </div>
                          <button type="button" onClick={handleDownloadQr} className="w-full py-1 text-[10px] font-bold text-white bg-indigo-650 hover:bg-indigo-700 rounded-lg transition flex items-center justify-center gap-1">
                            <Download size={10} /> Download QR PNG
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              )}

            </div>
          </div>

          {/* Action buttons at bottom */}
          <div className="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setActiveForm(null);
              }}
              className="px-5 py-2.5 text-sm font-bold text-slate-650 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-350 rounded-xl transition flex items-center gap-1.5 shadow-md shadow-indigo-600/10"
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
