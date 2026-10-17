import React, { useState, useRef } from 'react';
import { Settings, Upload, Image as ImageIcon, Check, Monitor, Database, Terminal, Shield, Copy, DownloadCloud, Palette, Sparkles } from 'lucide-react';
import { TheaterSettings, SystemStatus } from '../types/theater';
import { saveSettings, uploadLogo } from '../services/api';

const PATTERN_OPTIONS: Array<{
  id: 'projector' | 'blueprint' | 'waves' | 'geometric';
  title: string;
  desc: string;
  badge: string;
}> = [
  {
    id: 'projector',
    title: 'Projector Optics',
    desc: 'Subtle cinema light beam with micro film perforation grid',
    badge: 'Cinema Default',
  },
  {
    id: 'blueprint',
    title: 'Booth Blueprint',
    desc: 'Precision architectural blueprint grid with emerald glow',
    badge: 'Technical',
  },
  {
    id: 'waves',
    title: 'Modern Waves',
    desc: 'Acoustic audio wave dynamics and clean light refraction',
    badge: 'Acoustic',
  },
  {
    id: 'geometric',
    title: 'Geometric Hex',
    desc: 'Faceted diamond & geometric cinema theater lattice',
    badge: 'Modern',
  },
];

interface SettingsTabProps {
  settings: TheaterSettings;
  status: SystemStatus | null;
  themePattern?: 'projector' | 'blueprint' | 'waves' | 'geometric';
  onCyclePattern?: () => void;
  onSelectPattern?: (pattern: 'projector' | 'blueprint' | 'waves' | 'geometric') => void;
  onRefreshSettings: () => void;
}

export default function SettingsTab({
  settings,
  status,
  themePattern = 'projector',
  onCyclePattern,
  onSelectPattern,
  onRefreshSettings,
}: SettingsTabProps) {
  const [theaterName, setTheaterName] = useState(settings.theater_name || 'Grand Majestic Cinema');
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);

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
      {/* 0. BACKGROUND CHANGER BADGE & THEME PATTERN CARD (Setup Screen) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Palette className="w-5 h-5 text-blue-600" />
              Interface Atmosphere &amp; Background Pattern
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Choose the backdrop visual pattern for your projection booth operator console.
            </p>
          </div>

          {/* Background Changer Badge "Pattern" */}
          <button
            type="button"
            onClick={onCyclePattern}
            className="min-h-[42px] px-4 py-2 bg-blue-50/90 hover:bg-blue-100/90 active:scale-95 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-2xs cursor-pointer"
            title={`Active Pattern: ${themePattern}. Click to cycle background pattern!`}
          >
            <Palette className="w-4 h-4 text-blue-600" />
            <span className="capitalize font-extrabold text-sm">Pattern: {themePattern}</span>
            <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full ml-1 font-mono uppercase">
              Cycle
            </span>
          </button>
        </div>

        {/* Interactive Pattern Selection Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {PATTERN_OPTIONS.map((opt) => {
            const isSelected = themePattern === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onSelectPattern?.(opt.id)}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative ${
                  isSelected
                    ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-500/30 text-blue-950 shadow-sm'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-xs flex items-center gap-1.5">
                    <Sparkles className={`w-3.5 h-3.5 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                    {opt.title}
                  </span>
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                  {opt.desc}
                </p>
                <div className="mt-2.5 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">
                    {opt.badge}
                  </span>
                  {isSelected && (
                    <span className="text-[10px] font-bold text-blue-700 bg-white border border-blue-200 px-2 py-0.5 rounded-md">
                      Active
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

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

        {/* 3. POWERSHELL DOWNLOAD & INSTALLATION FROM GITHUB */}
        <div className="p-4 bg-slate-900 text-slate-100 rounded-xl space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold flex items-center gap-1.5 text-blue-400">
              <DownloadCloud className="w-4 h-4 text-emerald-400" />
              Automated PowerShell Installer (From Your GitHub)
            </span>
            <button
              onClick={() => {
                const cmd = `irm "https://raw.githubusercontent.com/<YOUR_USER>/<YOUR_REPO>/main/install-cinemabooth.ps1" | iex`;
                navigator.clipboard.writeText(cmd);
                setCopiedScript(true);
                setTimeout(() => setCopiedScript(false), 2500);
              }}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-mono text-[11px] flex items-center gap-1.5 transition-colors border border-slate-700"
            >
              {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
              <span>{copiedScript ? 'Copied Command!' : 'Copy Command'}</span>
            </button>
          </div>
          <p className="text-slate-400 text-[11px] font-medium leading-relaxed">
            Run this in Windows PowerShell on your media PC. It automatically clones the repository, installs Node.js, runs npm install, checks for FFmpeg/yt-dlp, and places a launcher shortcut on your Desktop.
          </p>
          <div className="p-2.5 bg-black/60 rounded-lg font-mono text-[11px] text-emerald-400 select-all overflow-x-auto border border-slate-800">
            git clone &lt;YOUR_GITHUB_REPO_URL&gt; CinemaBooth ; cd CinemaBooth ; .\install-cinemabooth.ps1
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
