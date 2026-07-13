import React, { useState, useEffect } from 'react';
import { X, Loader2, Image as ImageIcon } from 'lucide-react';

interface CanvaDesign {
  id: string;
  title: string;
  url: string; // View URL or thumbnail
  thumbnail?: { url: string };
}

interface CanvaPickerModalProps {
  churchId: string;
  onClose: () => void;
  onSelectImage: (imageUrl: string) => void;
}

export const CanvaPickerModal: React.FC<CanvaPickerModalProps> = ({ churchId, onClose, onSelectImage }) => {
  const [designs, setDesigns] = useState<CanvaDesign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [authNeeded, setAuthNeeded] = useState(false);

  useEffect(() => {
    fetchDesigns();
  }, [churchId]);

  const fetchDesigns = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/canva/designs?churchId=${churchId}`);
      if (res.status === 401) {
        setAuthNeeded(true);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        throw new Error('Failed to fetch designs');
      }
      const data = await res.json();
      // Canva API returns items array. We extract id, title, and a thumbnail URL.
      const fetchedDesigns: CanvaDesign[] = data.items?.map((item: any) => ({
        id: item.id,
        title: item.title || 'Untitled Design',
        thumbnail: item.thumbnail
      })) || [];
      
      setDesigns(fetchedDesigns);
    } catch (err: any) {
      setError(err.message || 'An error occurred loading designs');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectCanva = () => {
    // Open OAuth window
    const clientId = import.meta.env.VITE_CANVA_CLIENT_ID || 'OC-AZ9dHwB8GH1_'; 
    const redirectUri = encodeURIComponent(`${window.location.origin}/api/canva/oauth/callback`);
    const state = encodeURIComponent(churchId);
    const scopes = encodeURIComponent('design:content:read design:meta:read');
    
    const oauthUrl = `https://www.canva.com/api/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scopes}&state=${state}`;
    
    // Open in popup
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.innerWidth - width) / 2;
    const top = window.screenY + (window.innerHeight - height) / 2;
    
    const authWindow = window.open(oauthUrl, 'CanvaAuth', `width=${width},height=${height},left=${left},top=${top}`);
    
    // Check periodically if window closed to refresh
    const checkInterval = setInterval(() => {
      if (authWindow?.closed) {
        clearInterval(checkInterval);
        setAuthNeeded(false);
        fetchDesigns();
      }
    }, 1000);
  };

  const handleSelectDesign = async (designId: string) => {
    try {
      setExportingId(designId);
      
      // 1. Trigger Export
      const exportRes = await fetch(`/api/canva/exports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ churchId, designId })
      });
      
      if (!exportRes.ok) throw new Error('Failed to start export');
      const { jobId } = await exportRes.json();
      
      // 2. Poll for success
      let exportSuccess = false;
      let finalUrl = '';
      
      while (!exportSuccess) {
        await new Promise(r => setTimeout(r, 2000));
        
        const pollRes = await fetch(`/api/canva/exports/${jobId}?churchId=${churchId}`);
        if (!pollRes.ok) throw new Error('Failed to poll export status');
        
        const pollData = await pollRes.json();
        if (pollData.status === 'success') {
          exportSuccess = true;
          finalUrl = pollData.url;
        } else if (pollData.status === 'failed') {
          throw new Error('Export failed on Canva side');
        }
      }
      
      // 3. Pass back the final Firebase Storage URL
      onSelectImage(finalUrl);
      onClose();
    } catch (err: any) {
      setError(err.message || 'An error occurred exporting the design');
      setExportingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-[800px] max-w-[90vw] max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-[#00c4cc]" /> 
            Import from Canva
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto bg-gray-100">
          {authNeeded ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="bg-white p-4 rounded-full shadow-sm mb-4">
                 <img src="https://upload.wikimedia.org/wikipedia/commons/0/08/Canva_icon_2021.svg" alt="Canva" className="w-12 h-12" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Connect your Canva Account</h3>
              <p className="text-gray-500 mb-6 max-w-md">Authorize our app to access your Canva designs so you can easily import them into your emails and bulletins.</p>
              <button 
                onClick={handleConnectCanva}
                className="bg-[#00c4cc] hover:bg-[#00b3ba] text-white px-6 py-2.5 rounded-md font-medium transition-colors shadow-md"
              >
                Connect Canva
              </button>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center h-64">
              <Loader2 className="w-8 h-8 text-[#00c4cc] animate-spin mb-4" />
              <p className="text-gray-500">Loading your designs...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 text-red-700 p-4 rounded-md">
              <p>{error}</p>
              <button onClick={fetchDesigns} className="mt-2 text-sm underline font-medium">Try again</button>
            </div>
          ) : designs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <ImageIcon className="w-12 h-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">No designs found</h3>
              <p className="text-gray-500">You don't have any designs in your Canva account yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {designs.map(design => (
                <div 
                  key={design.id}
                  className={`bg-white border rounded-lg overflow-hidden cursor-pointer hover:shadow-md transition-shadow relative group ${exportingId === design.id ? 'ring-2 ring-[#00c4cc] opacity-75' : 'hover:border-[#00c4cc]'}`}
                  onClick={() => !exportingId && handleSelectDesign(design.id)}
                >
                  <div className="aspect-[4/3] bg-gray-100 flex items-center justify-center relative">
                    {design.thumbnail?.url ? (
                      <img src={design.thumbnail.url} alt={design.title} className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-gray-300" />
                    )}
                    
                    {exportingId === design.id && (
                      <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-[#00c4cc] animate-spin" />
                      </div>
                    )}
                    
                    {!exportingId && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-white font-medium">Select</span>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium text-gray-800 truncate" title={design.title}>{design.title}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
