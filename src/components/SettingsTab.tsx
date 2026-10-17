import React, { useState, useRef } from 'react';
import { Settings, Upload, Image as ImageIcon, Check, Monitor, Database, Terminal, Shield } from 'lucide-react';
import { TheaterSettings, SystemStatus } from '../types/theater';
import { saveSettings, uploadLogo } from '../services/api';

interface SettingsTabProps {
  settings: TheaterSettings;
  status: SystemStatus | null;
  onRefreshSettings: () => void;
}

export default function SettingsTab({
  settings,
  status,
  onRefreshSettings,
}: SettingsTabProps) {
  const [theaterName, setTheaterName] = useState(settings.theater_name || 'Grand Majestic Cinema');
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleSaveGeneral = async () => {
    try {
      await saveSettings({ theater_name: theaterName });
      setSaveMessage('Settings saved successfully.');
      setTimeout(() => setSaveMessage(null), 3000);
      onRefreshSettings();
    } catch (e: any) {
      alert(`Failed to save settings: ${e.message}`);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingLogo(true);
    try {
      const res = await uploadLogo(file);
      if (res.success) {
        setSaveMessage('Theater logo updated! It will display automatically on the projector when idle.');
        setTimeout(() => setSaveMessage(null), 4000);
        onRefreshSettings();
      }
    } catch (err: any) {
      alert(`Logo upload failed: ${err.message}`);
    } finally {
      setIsUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const currentLogo = settings.logo_url || '/assets/theater_logo.svg';

  return (
    <div className="space-y-6">
      {/* 1. PROJECTOR LOGO UPLOADER (When not playing, show my logo which is a JPG file) */}
      <div className="bg-[#141824] border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-amber-400" />
              Projector Standby Logo (JPG / PNG)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              This logo is projected in true fullscreen when no video is playing, during audience walk-in, and between playlist items.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          {/* Logo Preview */}
          <div className="space-y-2">
            <span className="text-xs text-slate-400 font-medium">Current Projector Screen Display</span>
            <div className="aspect-video bg-black rounded-xl overflow-hidden border border-slate-800 p-2 flex items-center justify-center relative shadow-inner">
              <img
                src={currentLogo}
                alt="Theater Logo Preview"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/assets/theater_logo.svg';
                }}
              />
              <span className="absolute bottom-2 right-2 text-[10px] bg-black/70 text-slate-400 px-2 py-0.5 rounded font-mono">
                Projector Standby
              </span>
            </div>
          </div>

          {/* Upload Button */}
          <div className="space-y-4">
            <div className="text-xs text-slate-300 leading-relaxed">
              Upload your theater logo (.JPG recommended, 1920x1080 or high-res square). The file will be saved locally on your media PC.
            </div>

            <input
              type="file"
              ref={logoInputRef}
              onChange={handleLogoUpload}
              accept="image/jpeg,image/png,image/svg+xml"
              className="hidden"
            />

            <button
              onClick={() => logoInputRef.current?.click()}
              disabled={isUploadingLogo}
              className="min-h-[44px] px-5 py-2.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-2 shadow-md shadow-amber-500/10 transition-all disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              <span>{isUploadingLogo ? 'Saving Logo...' : 'Upload New Theater Logo (JPG)'}</span>
            </button>

            <div className="text-[11px] text-slate-500">
              Optimal resolution: 1920×1080 (16:9) or 3840×2160 (4K).
            </div>
          </div>
        </div>
      </div>

      {/* 2. THEATER DETAILS & GENERAL SETTINGS */}
      <div className="bg-[#141824] border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <Settings className="w-4 h-4 text-amber-400" />
          Theater Profile
        </h3>

        <div className="max-w-md space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Theater / Auditorium Name
            </label>
            <input
              type="text"
              value={theaterName}
              onChange={(e) => setTheaterName(e.target.value)}
              placeholder="e.g. The Majestic Cinema - Screen 1"
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSaveGeneral}
              className="min-h-[44px] px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Check className="w-4 h-4 text-emerald-400" />
              <span>Save Name</span>
            </button>

            {saveMessage && (
              <span className="text-xs text-emerald-400 font-medium">
                {saveMessage}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 3. WINDOWS DUAL-MONITOR & PROJECTOR SETUP GUIDE */}
      <div className="bg-[#141824] border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Monitor className="w-4 h-4 text-amber-400" />
            Windows PC &amp; Projector Setup Instructions
          </h3>
          <span className="text-xs text-slate-400">Media Computer Appliance</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300">
          <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
            <div className="font-semibold text-white flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-amber-400" />
              1. Windows Startup Batch File
            </div>
            <p className="text-slate-400 leading-relaxed">
              Use <code>start-theater.bat</code> located in your application root folder. Double-click it to start the server and automatically launch the Projector View on your connected screen in kiosk mode.
            </p>
          </div>

          <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
            <div className="font-semibold text-white flex items-center gap-1.5">
              <Monitor className="w-3.5 h-3.5 text-blue-400" />
              2. Dual-Monitor Window Position
            </div>
            <p className="text-slate-400 leading-relaxed">
              Press <code>Win + P</code> on Windows and select <strong>Extend</strong>. Move the Projector window to the projector screen and press <strong>F11</strong> for zero-bezel cinema projection.
            </p>
          </div>
        </div>

        {/* Database Notice */}
        <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <Database className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <span className="font-semibold text-white">Persistent SQLite Storage: </span>
              <span className="text-slate-400">Database file <code>./data/theater.db</code> (ACID relational database)</span>
            </div>
          </div>
          <span className="text-emerald-400 font-mono text-[11px] bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded">
            SQL Active
          </span>
        </div>
      </div>
    </div>
  );
}
