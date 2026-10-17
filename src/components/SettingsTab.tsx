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
      {/* 1. PROJECTOR LOGO UPLOADER (Bright White / Slate / Blue / Green) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-blue-600" />
              Projector Standby Logo (JPG / PNG)
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              This logo is projected in true fullscreen when no video or pre-show slideshow is playing.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center pt-1">
          {/* Logo Preview */}
          <div className="space-y-2">
            <span className="text-xs text-slate-600 font-bold uppercase tracking-wider">Current Standby Graphic</span>
            <div className="aspect-video bg-slate-900 rounded-xl overflow-hidden border border-slate-300 p-2 flex items-center justify-center relative shadow-inner">
              <img
                src={currentLogo}
                alt="Theater Logo Preview"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/assets/theater_logo.svg';
                }}
              />
              <span className="absolute bottom-2 right-2 text-[10px] bg-slate-950/80 text-white px-2 py-0.5 rounded font-mono">
                Projector Standby
              </span>
            </div>
          </div>

          {/* Upload Button & Guidance */}
          <div className="space-y-4">
            <div className="text-xs text-slate-600 leading-relaxed font-medium">
              Upload your high-resolution theater logo (.JPG recommended, 1920x1080 or 3840x2160 4K). The file will be stored directly in local PC storage.
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
              className="min-h-[44px] px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-sm shadow-blue-600/20 transition-all disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              <span>{isUploadingLogo ? 'Saving Logo...' : 'Upload New Theater Logo (JPG)'}</span>
            </button>

            <div className="text-[11px] text-slate-500 font-medium">
              Optimal format: 16:9 widescreen JPG image with clean contrast for projector visibility.
            </div>
          </div>
        </div>
      </div>

      {/* 2. THEATER DETAILS & GENERAL SETTINGS */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-sm space-y-4">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 pb-3 border-b border-slate-200">
          <Settings className="w-4 h-4 text-blue-600" />
          Theater Profile &amp; Auditorium Identity
        </h3>

        <div className="max-w-md space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Theater / Auditorium Name
            </label>
            <input
              type="text"
              value={theaterName}
              onChange={(e) => setTheaterName(e.target.value)}
              placeholder="e.g. The Majestic Cinema - Screen 1"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-bold shadow-2xs"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSaveGeneral}
              className="min-h-[44px] px-5 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm shadow-blue-600/20"
            >
              <Check className="w-4 h-4 text-emerald-300" />
              <span>Save Name</span>
            </button>

            {saveMessage && (
              <span className="text-xs text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl animate-fadeIn">
                {saveMessage}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 3. WINDOWS DUAL-MONITOR & PROJECTOR SETUP GUIDE */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Monitor className="w-4 h-4 text-emerald-600" />
            Windows PC &amp; Projector Setup Instructions
          </h3>
          <span className="text-xs text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
            Local Media Appliance
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/90 space-y-2">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-blue-600" />
              1. Windows Startup Batch Script
            </div>
            <p className="text-slate-600 leading-relaxed font-medium">
              Run <code>start-theater.bat</code> located in your application root folder. It starts the local server and opens the clean zero-bezel Projector Screen on your connected projector in kiosk mode.
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/90 space-y-2">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <Monitor className="w-3.5 h-3.5 text-emerald-600" />
              2. Dual-Monitor Display Setup
            </div>
            <p className="text-slate-600 leading-relaxed font-medium">
              Press <code>Win + P</code> on Windows and select <strong>Extend</strong>. Move the Projector window to the projector screen and press <strong>F11</strong> for a seamless theatrical presentation.
            </p>
          </div>
        </div>

        {/* Database Notice */}
        <div className="p-4 bg-blue-50/70 rounded-xl border border-blue-200/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-700">
            <Database className="w-4 h-4 text-blue-600 shrink-0" />
            <div>
              <span className="font-bold text-slate-900">Relational SQLite Database: </span>
              <span className="text-slate-600 font-medium">Backed by binary database file <code>./data/theater.db</code> (ACID relational persistence)</span>
            </div>
          </div>
          <span className="text-emerald-700 font-mono font-bold text-[11px] bg-white border border-emerald-200 px-2.5 py-0.5 rounded-lg shadow-2xs">
            SQL Active
          </span>
        </div>
      </div>
    </div>
  );
}
