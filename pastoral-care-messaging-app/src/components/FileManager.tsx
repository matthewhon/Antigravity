import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Church, User, TenantFile } from '../types';
import { firestore } from '../services/firestoreService';
import { storage } from '../services/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { 
  FolderOpen, UploadCloud, Trash2, File as FileIcon, 
  Image as ImageIcon, Video, Music, FileText, Loader2, Copy,
  Folder, Plus, Edit2, Tag, X
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';

let API_BASE = Capacitor.isNativePlatform() 
  ? 'https://pastoralcare.barnabassoftware.com' 
  : '';

interface FileManagerProps {
  churchId: string;
  currentUser: User;
  church?: Church;
}

export const FileManager: React.FC<FileManagerProps> = ({ churchId, currentUser, church }) => {
  const [files, setFiles] = useState<TenantFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New states for folders and tags
  const [currentFolder, setCurrentFolder] = useState<string>('');
  const [editingFile, setEditingFile] = useState<TenantFile | null>(null);
  const [editFolder, setEditFolder] = useState('');
  const [editTags, setEditTags] = useState('');
  const [customFolders, setCustomFolders] = useState<string[]>([]);

  useEffect(() => {
    if (church?.folders) {
      setCustomFolders(church.folders);
    }
  }, [church?.folders]);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await firestore.getTenantFiles(churchId);
      setFiles(data);
    } catch (e) {
      console.error('Failed to load files', e);
      showToast('Failed to load files.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [churchId, showToast]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    firestore.getSystemSettings().then(s => {
      if (s.apiBaseUrl) {
        API_BASE = s.apiBaseUrl.replace(/\/$/, '');
      }
    }).catch(err => console.error('Failed to load system settings for API_BASE:', err));
  }, []);

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const gcsPath = `tenants/${churchId}/uploads/${fileId}_${file.name}`;
      const sRef = storageRef(storage, gcsPath);
      let uploadData: Blob | File = file;
      if (Capacitor.isNativePlatform()) {
        try {
          const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as ArrayBuffer);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
          });
          uploadData = new Blob([buffer], { type: file.type || 'application/octet-stream' });
        } catch (err) {
          console.error('[UploadHelper] Failed to convert file to Blob', err);
        }
      }

      const task = uploadBytesResumable(sRef, uploadData);

      await new Promise<void>((resolve, reject) => {
        task.on('state_changed', 
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(progress);
          }, 
          reject, 
          () => resolve()
        );
      });

      const publicUrl = await getDownloadURL(sRef);

      const isVideo = file.type?.startsWith('video/');
      const tenantFile: TenantFile = {
        id: fileId,
        churchId,
        uploaderUid: currentUser.id,
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        publicUrl,
        gcsPath,
        createdAt: Date.now(),
        folder: currentFolder || undefined,
        tags: [],
        processingStatus: isVideo ? 'processing' : undefined
      };

      await firestore.saveTenantFile(tenantFile);
      setFiles(prev => [tenantFile, ...prev]);

      if (isVideo) {
        try {
          await fetch(`${API_BASE}/api/files/process-video`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId, churchId, gcsPath })
          });
          showToast('Video uploaded and queued for compression.');
        } catch (err) {
          console.error('Failed to trigger video compression', err);
          showToast('File uploaded, but compression failed to start.', 'error');
        }
      } else {
        showToast('File uploaded successfully!');
      }

    } catch (e: any) {
      console.error('Upload failed', e);
      showToast(e.message || 'File upload failed.', 'error');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (file: TenantFile) => {
    if (!window.confirm(`Are you sure you want to delete "${file.originalName}"?`)) return;
    
    try {
      const sRef = storageRef(storage, file.gcsPath);
      try {
        await deleteObject(sRef);
      } catch (e: any) {
        if (e.code !== 'storage/object-not-found') throw e;
      }
      
      await firestore.deleteTenantFile(file.id);
      setFiles(prev => prev.filter(f => f.id !== file.id));
      showToast('File deleted successfully.');
    } catch (e: any) {
      console.error('Delete failed', e);
      showToast('Failed to delete file.', 'error');
    }
  };

  const saveEdit = async () => {
    if (!editingFile) return;
    const tagsArray = editTags.split(',').map(t => t.trim()).filter(Boolean);
    const updated: TenantFile = { 
      ...editingFile, 
      folder: editFolder.trim() || undefined, 
      tags: tagsArray 
    };
    
    try {
      await firestore.saveTenantFile(updated);
      setFiles(prev => prev.map(f => f.id === updated.id ? updated : f));
      setEditingFile(null);
      showToast('File details updated.');
    } catch (e) {
      console.error('Update failed', e);
      showToast('Failed to update file.', 'error');
    }
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      showToast('Link copied to clipboard!');
    }).catch(() => {
      showToast('Failed to copy link.', 'error');
    });
  };

  const formatSize = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType: string = '') => {
    const mt = mimeType || '';
    if (mt.startsWith('image/')) return <ImageIcon className="text-emerald-500" size={24} />;
    if (mt.startsWith('video/')) return <Video className="text-purple-500" size={24} />;
    if (mt.startsWith('audio/')) return <Music className="text-pink-500" size={24} />;
    if (mt.includes('pdf') || mt.includes('document') || mt.includes('text/')) return <FileText className="text-blue-500" size={24} />;
    return <FileIcon className="text-slate-400" size={24} />;
  };

  const derivedFolders = Array.from(new Set(files.map(f => f.folder).filter(Boolean))) as string[];
  const allFolders = Array.from(new Set([...derivedFolders, ...customFolders])) as string[];
  allFolders.sort();

  const filteredFiles = files.filter(f => currentFolder === '' || f.folder === currentFolder);

  const getFileUrl = (fileId: string) => {
    const base = (API_BASE && API_BASE.startsWith('http')) ? API_BASE : window.location.origin;
    return `${base}/f/${fileId}`;
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 p-6 relative">
      
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold text-white transition-all ${
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Edit Modal */}
      {editingFile && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">Edit File Details</h3>
              <button onClick={() => setEditingFile(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-2">
                  <Folder size={14} className="text-indigo-500" /> Folder Path
                </label>
                <input 
                  type="text" 
                  value={editFolder}
                  onChange={e => setEditFolder(e.target.value)}
                  placeholder="e.g. Marketing, Documents/Policies"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-2">
                  <Tag size={14} className="text-pink-500" /> Tags
                </label>
                <input 
                  type="text" 
                  value={editTags}
                  onChange={e => setEditTags(e.target.value)}
                  placeholder="Comma separated tags (e.g. logo, print, internal)"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
              <button 
                onClick={() => setEditingFile(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition"
              >
                Cancel
              </button>
              <button 
                onClick={saveEdit}
                className="px-4 py-2 text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl transition shadow-lg shadow-indigo-600/20"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <FolderOpen className="text-indigo-600 dark:text-indigo-400" /> 
            Tenant Files
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Upload and manage files. Organize with folders and tags.
          </p>
        </div>

        <div className="shrink-0">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileUpload(e.target.files[0]);
              }
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/30 transition disabled:opacity-50 w-full sm:w-auto justify-center"
          >
            {isUploading ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} />}
            {isUploading ? `Uploading... ${Math.round(uploadProgress)}%` : 'Upload File'}
          </button>
        </div>
      </div>

      {/* Folders Navigation */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
        <button 
          onClick={() => setCurrentFolder('')}
          className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition flex items-center gap-2 ${currentFolder === '' ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 shadow-md' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50'}`}
        >
          All Files
        </button>
        {allFolders.map(folder => (
          <button 
            key={folder}
            onClick={() => setCurrentFolder(folder)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition flex items-center gap-2 ${currentFolder === folder ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 shadow-md' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50'}`}
          >
            <Folder size={14} className={currentFolder === folder ? 'opacity-80' : 'text-indigo-500'} />
            {folder}
          </button>
        ))}
        <button
          onClick={async () => {
            const newFolder = window.prompt('Enter new folder name:');
            if (newFolder && newFolder.trim()) {
              const cleaned = newFolder.trim();
              if (allFolders.includes(cleaned)) {
                setCurrentFolder(cleaned);
                return;
              }
              const updated = Array.from(new Set([...customFolders, cleaned]));
              setCustomFolders(updated);
              setCurrentFolder(cleaned);
              try {
                await firestore.updateChurch(churchId, { folders: updated });
                showToast('Folder created successfully.');
              } catch (err) {
                console.error('Failed to save folders to Firestore:', err);
                showToast('Failed to save folder to server.', 'error');
              }
            }
          }}
          className="shrink-0 px-4 py-2 rounded-full text-sm font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20 transition flex items-center gap-1.5 border border-dashed border-indigo-300 dark:border-indigo-500/30"
        >
          <Plus size={14} /> New Folder
        </button>
      </div>

      {/* File List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex-1 flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <Loader2 size={32} className="animate-spin mb-4" />
            <p>Loading files...</p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
            <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center mb-4 border border-slate-100 dark:border-slate-800">
              <FolderOpen size={32} className="text-slate-300 dark:text-slate-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">
              {currentFolder ? 'Folder is empty' : 'No files uploaded yet'}
            </h3>
            <p className="text-sm max-w-sm">
              {currentFolder 
                ? `Upload a file into "${currentFolder}" to get started.` 
                : 'Click "Upload File" to add your first asset to the system.'}
            </p>
            {currentFolder && (
              <div className="flex items-center gap-4 mt-4 justify-center">
                <button 
                  onClick={() => setCurrentFolder('')}
                  className="text-sm text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                >
                  Back to All Files
                </button>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <button 
                  onClick={async () => {
                    if (window.confirm(`Are you sure you want to delete the folder "${currentFolder}"?`)) {
                      const updated = customFolders.filter(f => f !== currentFolder);
                      setCustomFolders(updated);
                      const folderToDelete = currentFolder;
                      setCurrentFolder('');
                      try {
                        await firestore.updateChurch(churchId, { folders: updated });
                        showToast(`Folder "${folderToDelete}" deleted successfully.`);
                      } catch (err) {
                        console.error('Failed to delete folder from Firestore:', err);
                        showToast('Failed to delete folder.', 'error');
                      }
                    }
                  }}
                  className="text-sm text-red-600 dark:text-red-400 font-semibold hover:underline"
                >
                  Delete Folder
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-auto flex-1 p-2">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">File Name</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Organization</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Size</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Uploaded</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map(file => (
                  <tr key={file.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition group">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                          {(file.mimeType || '').startsWith('image/') && file.publicUrl ? (
                            <img src={file.publicUrl} alt={file.originalName} className="w-full h-full object-cover rounded-lg" />
                          ) : (
                            getFileIcon(file.mimeType)
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <a 
                              href={getFileUrl(file.id)} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="font-bold text-sm text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 truncate block"
                            >
                              {file.originalName}
                            </a>
                            {file.processingStatus === 'processing' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 uppercase tracking-wider">
                                <Loader2 size={10} className="animate-spin" /> Processing
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 uppercase tracking-widest mt-0.5">
                            {file.mimeType}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1.5 items-start">
                        {file.folder ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            <Folder size={10} /> {file.folder}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 italic">No folder</span>
                        )}
                        {file.tags && file.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {file.tags.map(t => (
                              <span key={t} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20">
                                <Tag size={8} /> {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {formatSize(file.sizeBytes)}
                    </td>
                    <td className="px-4 py-4 text-sm font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {new Date(file.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditingFile(file);
                            setEditFolder(file.folder || '');
                            setEditTags((file.tags || []).join(', '));
                          }}
                          title="Edit Details"
                          className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => copyLink(getFileUrl(file.id))}
                          title="Copy Link"
                          className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                        >
                          <Copy size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(file)}
                          title="Delete File"
                          className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
