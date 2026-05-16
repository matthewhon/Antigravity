import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Church, User, TenantFile } from '../types';
import { firestore } from '../services/firestoreService';
import { storage } from '../services/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { 
  FolderOpen, UploadCloud, Trash2, Link as LinkIcon, File as FileIcon, 
  Image as ImageIcon, Video, Music, FileText, CheckCircle, Loader2, Copy 
} from 'lucide-react';

interface FileManagerProps {
  churchId: string;
  currentUser: User;
  church?: Church;
}

export const FileManager: React.FC<FileManagerProps> = ({ churchId, currentUser }) => {
  const [files, setFiles] = useState<TenantFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const gcsPath = `tenants/${churchId}/uploads/${fileId}_${file.name}`;
      const sRef = storageRef(storage, gcsPath);

      const task = uploadBytesResumable(sRef, file);

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

      const tenantFile: TenantFile = {
        id: fileId,
        churchId,
        uploaderUid: currentUser.id,
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        publicUrl,
        gcsPath,
        createdAt: Date.now()
      };

      await firestore.saveTenantFile(tenantFile);
      setFiles(prev => [tenantFile, ...prev]);
      showToast('File uploaded successfully!');
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
      // Delete from Firebase Storage
      const sRef = storageRef(storage, file.gcsPath);
      try {
        await deleteObject(sRef);
      } catch (e: any) {
        if (e.code !== 'storage/object-not-found') throw e;
      }
      
      // Delete from Firestore
      await firestore.deleteTenantFile(file.id);
      setFiles(prev => prev.filter(f => f.id !== file.id));
      showToast('File deleted successfully.');
    } catch (e: any) {
      console.error('Delete failed', e);
      showToast('Failed to delete file.', 'error');
    }
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      showToast('Link copied to clipboard!');
    }).catch(() => {
      showToast('Failed to copy link.', 'error');
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <ImageIcon className="text-emerald-500" size={24} />;
    if (mimeType.startsWith('video/')) return <Video className="text-purple-500" size={24} />;
    if (mimeType.startsWith('audio/')) return <Music className="text-pink-500" size={24} />;
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text/')) return <FileText className="text-blue-500" size={24} />;
    return <FileIcon className="text-slate-400" size={24} />;
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 p-6">
      
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold text-white transition-all ${
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <FolderOpen className="text-indigo-600 dark:text-indigo-400" /> 
            Tenant Files
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Upload and manage files. Send these links via SMS broadcasts or emails.
          </p>
        </div>

        <div>
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
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/30 transition disabled:opacity-50"
          >
            {isUploading ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} />}
            {isUploading ? `Uploading... ${Math.round(uploadProgress)}%` : 'Upload File'}
          </button>
        </div>
      </div>

      {/* File List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex-1 flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <Loader2 size={32} className="animate-spin mb-4" />
            <p>Loading files...</p>
          </div>
        ) : files.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
            <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
              <UploadCloud size={32} className="text-slate-300 dark:text-slate-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">No files uploaded yet</h3>
            <p className="text-sm">Click "Upload File" to add your first asset.</p>
          </div>
        ) : (
          <div className="overflow-auto flex-1 p-2">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">File Name</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Size</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Uploaded</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map(file => (
                  <tr key={file.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition group">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3 min-w-[250px]">
                        <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                          {file.mimeType.startsWith('image/') && file.publicUrl ? (
                            <img src={file.publicUrl} alt={file.originalName} className="w-full h-full object-cover rounded-lg" />
                          ) : (
                            getFileIcon(file.mimeType)
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <a 
                            href={`/f/${file.id}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="font-bold text-sm text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 truncate block"
                          >
                            {file.originalName}
                          </a>
                          <div className="text-[11px] text-slate-400 uppercase tracking-widest mt-0.5">
                            {file.mimeType}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {formatSize(file.sizeBytes)}
                    </td>
                    <td className="px-4 py-4 text-sm font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {new Date(file.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => copyLink(`${window.location.origin}/f/${file.id}`)}
                          title="Copy Link"
                          className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                          <Copy size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(file)}
                          title="Delete File"
                          className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition opacity-0 group-hover:opacity-100 focus:opacity-100"
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
