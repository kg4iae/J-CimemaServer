import React, { useState, useRef, useEffect } from 'react';
import {
  Settings,
  Upload,
  Image as ImageIcon,
  Check,
  Monitor,
  Database,
  Terminal,
  Copy,
  DownloadCloud,
  Palette,
  Sparkles,
  Volume2,
  Cpu,
  RefreshCw,
  MicOff,
  Mic,
  ExternalLink,
  Speaker,
} from 'lucide-react';
import { TheaterSettings, SystemStatus, ApplianceStatus } from '../types/theater';
import { saveSettings, uploadLogo, sendApplianceCommand } from '../services/api';

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

const AUDIO_PROFILES: Array<{
  id: 'optical-51-ac3' | 'hdmi-51-pcm' | 'stereo-20';
  title: string;
  subtitle: string;
  desc: string;
}> = [
  {
    id: 'optical-51-ac3',
    title: 'Optical TOSLINK 5.1 Surround (Dolby Digital AC-3)',
    subtitle: '640 kbps Real-Time AC-3 Bitstream (ALSA a52)',
    desc: 'Encodes 6-channel audio in real time into a Dolby Digital 5.1 bitstream over a single Optical S/PDIF cable while seamlessly supporting 2.0 Spotify and Karaoke.',
  },
  {
    id: 'hdmi-51-pcm',
    title: 'HDMI 5.1 Surround (Uncompressed 6-Channel LPCM)',
    subtitle: 'Direct HDMI to 5.1 AVR or Dual-HDMI Mini PC',
    desc: 'Outputs discrete 6-channel uncompressed PCM over HDMI (ideal when running HDMI 1 to the Projector and HDMI 2 to your 5.1 Surround Receiver).',
  },
  {
    id: 'stereo-20',
    title: 'Standard 2.0 Stereo Output',
    subtitle: '2-Channel PCM (HDMI / 3.5mm Analog / Optical Stereo)',
    desc: 'Standard 2-channel stereo mixdown for 2.0 soundbars, projector speakers, or analog stereo amplifiers.',
  },
];

interface SettingsTabProps {
  settings: TheaterSettings;
  status: SystemStatus | null;
  applianceStatus?: ApplianceStatus;
  themePattern?: 'projector' | 'blueprint' | 'waves' | 'geometric';
  onCyclePattern?: () => void;
  onSelectPattern?: (pattern: 'projector' | 'blueprint' | 'waves' | 'geometric') => void;
  onRefreshSettings: () => void;
}

export default function SettingsTab({
  settings,
  status,
  applianceStatus,
  themePattern = 'projector',
  onCyclePattern,
  onSelectPattern,
  onRefreshSettings,
}: SettingsTabProps) {
  const defaultServerUrl =
    settings.appliance_server_url ||
    'http://192.168.1.130:31047';

  const [theaterName, setTheaterName] = useState(settings.theater_name || 'Grand Majestic Cinema');
  const [serverUrl, setServerUrl] = useState(defaultServerUrl);
  const [audioProfile, setAudioProfile] = useState<'optical-51-ac3' | 'hdmi-51-pcm' | 'stereo-20'>(
    (settings.appliance_audio_output as any) || 'optical-51-ac3'
  );
  const [activeAudioDevice, setActiveAudioDevice] = useState<string>(
    applianceStatus?.activeAudioDevice || settings.appliance_audio_device || 'hdmi-auto'
  );
  const [switchingAudio, setSwitchingAudio] = useState<boolean>(false);
  const [spdifCard, setSpdifCard] = useState(settings.appliance_spdif_card || '0');
  const [resolution, setResolution] = useState(settings.appliance_resolution || 'auto');

  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [applianceMessage, setApplianceMessage] = useState<string | null>(null);
  const [copiedAptCmd, setCopiedAptCmd] = useState(false);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings.theater_name) setTheaterName(settings.theater_name);
    if (settings.appliance_server_url) setServerUrl(settings.appliance_server_url);
    if (settings.appliance_audio_output) setAudioProfile(settings.appliance_audio_output as any);
    if (settings.appliance_audio_device) setActiveAudioDevice(settings.appliance_audio_device);
    if (settings.appliance_spdif_card) setSpdifCard(settings.appliance_spdif_card);
    if (settings.appliance_resolution) setResolution(settings.appliance_resolution);
  }, [
    settings.theater_name,
    settings.appliance_server_url,
    settings.appliance_audio_output,
    settings.appliance_audio_device,
    settings.appliance_spdif_card,
    settings.appliance_resolution,
  ]);

  useEffect(() => {
    if (applianceStatus?.activeAudioDevice) {
      setActiveAudioDevice(applianceStatus.activeAudioDevice);
    }
  }, [applianceStatus?.activeAudioDevice]);

  const handleSwitchAudioOutputOnTheFly = async (deviceId: string, label: string) => {
    setActiveAudioDevice(deviceId);
    setSwitchingAudio(true);
    try {
      await sendApplianceCommand('set_audio_output', undefined, undefined, deviceId);
      setApplianceMessage(
        `Switched Projector Audio Output to "${label}" (${deviceId}) on the fly! Updating ALSA /etc/asound.conf & restarting kiosk audio...`
      );
      setTimeout(() => setApplianceMessage(null), 5000);
      onRefreshSettings();
    } catch (e: any) {
      setApplianceMessage(`Failed to switch audio output: ${e.message}`);
    } finally {
      setSwitchingAudio(false);
    }
  };

  const handleSaveGeneral = async () => {
    try {
      await saveSettings({ theater_name: theaterName });
      setSaveMessage('Theater profile saved to SQLite database.');
      setTimeout(() => setSaveMessage(null), 3000);
      onRefreshSettings();
    } catch (e: any) {
      setSaveMessage(`Failed to save settings: ${e.message}`);
    }
  };

  const handleSaveApplianceConfig = async () => {
    try {
      await saveSettings({
        appliance_server_url: serverUrl.trim(),
        appliance_audio_output: audioProfile,
        appliance_spdif_card: spdifCard.trim() || '0',
        appliance_resolution: resolution,
      });
      setApplianceMessage('Appliance & 5.1 Surround configuration saved to SQLite.');
      setTimeout(() => setApplianceMessage(null), 3500);
      onRefreshSettings();
    } catch (e: any) {
      setApplianceMessage(`Failed to save appliance config: ${e.message}`);
    }
  };

  const handleTriggerSpeakerTest = async (channel: 'all' | 'fl' | 'c' | 'fr' | 'sl' | 'sr' | 'lfe') => {
    setTestingChannel(channel);
    try {
      await sendApplianceCommand('speaker_test_51', channel);
      setApplianceMessage(
        channel === 'all'
          ? 'Playing 6-channel 5.1 surround sweep on active Projector Screens...'
          : `Testing discrete speaker channel (${channel.toUpperCase()}) on Projector Screen...`
      );
    } catch (e: any) {
      setApplianceMessage(`Speaker test error: ${e.message}`);
    } finally {
      setTimeout(() => {
        setTestingChannel(null);
      }, channel === 'all' ? 7500 : 1400);
      setTimeout(() => setApplianceMessage(null), 5000);
    }
  };

  const handleRemoteServiceAction = async (
    action: 'restart_kiosk' | 'restart_spotify' | 'mute_mic' | 'unmute_mic',
    label: string
  ) => {
    try {
      await sendApplianceCommand(action);
      setApplianceMessage(`Sent "${label}" command to Projector Appliance.`);
      setTimeout(() => setApplianceMessage(null), 3500);
    } catch (e: any) {
      setApplianceMessage(`Command failed: ${e.message}`);
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
      setSaveMessage(`Logo upload failed: ${err.message}`);
    } finally {
      setIsUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const currentLogo = settings.logo_url || '/assets/theater_logo.svg';
  const cleanServerUrl = (serverUrl || defaultServerUrl).replace(/\/+$/, '');
  const debDownloadUrl = `/api/appliance/deb?server=${encodeURIComponent(cleanServerUrl)}&audio=${encodeURIComponent(
    audioProfile
  )}&card=${encodeURIComponent(spdifCard || '0')}&resolution=${encodeURIComponent(resolution)}`;

  const sshInstallCommand = `curl -fsSL "${cleanServerUrl}/api/appliance/deb?server=${encodeURIComponent(
    cleanServerUrl
  )}&audio=${audioProfile}&card=${spdifCard || '0'}" -o cinemabooth-projector.deb && sudo apt update && sudo apt install -y ./cinemabooth-projector.deb`;

  const webScreensCount = applianceStatus?.webScreensConnected ?? 0;
  const isNativeConnected = Boolean(applianceStatus?.connected);

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
                </div>
                <p className="text-[11px] text-slate-500 font-medium leading-relaxed">{opt.desc}</p>
                <div className="mt-2.5 flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>{opt.badge}</span>
                  {isSelected && <span className="font-bold text-blue-700">Active</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 1. DUAL-MODE PROJECTOR ARCHITECTURE: WEB TESTING + NATIVE LINUX MINI PC (.deb & 5.1 SURROUND) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-sm space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-blue-600" />
              Projector Output Targets: Web Browser Testing &amp; Native Linux Mini PC Appliance
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Use the Web Page Projector Screen in any browser for testing, and install the Debian (<code>.deb</code>) package on your x86_64 Mini PC for production 5.1 surround projection.
            </p>
          </div>

          <a
            href="/?mode=screen"
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[42px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-colors shadow-2xs whitespace-nowrap shrink-0"
          >
            <Monitor className="w-4 h-4 text-emerald-400" />
            <span>Open Web Projector (Testing)</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </a>
        </div>

        {/* Dual-Mode Live Connection Status Strip */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Mode A: Web Browser Testing Status */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <Monitor className="w-4 h-4 text-blue-600" />
                Web Browser Projector (Testing Mode)
              </span>
              <span className="text-xs font-mono tabular-nums font-semibold text-slate-700">
                {webScreensCount > 0 ? `${webScreensCount} Screen(s) Open` : 'Standby (Click Above to Test)'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Runs in any desktop/laptop browser via <code>/?mode=screen</code>. Includes video, pre-show slides, Karaoke web view, browser Spotify Web Playback SDK, and stereo/5.1 speaker test tones.
            </p>
          </div>

          {/* Mode B: Native Linux Mini PC Appliance Status */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-600" />
                Native Linux Mini PC Appliance (Production)
              </span>
              <span
                className={`text-xs font-mono tabular-nums font-semibold ${
                  isNativeConnected ? 'text-emerald-700' : 'text-slate-500'
                }`}
              >
                {isNativeConnected
                  ? `Connected · ${applianceStatus?.hostname} (${applianceStatus?.ip})`
                  : 'Awaiting .deb Installation'}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2 font-mono tabular-nums">
              <span>Wayland Cage: {applianceStatus?.kioskRunning ? 'Active' : 'Standby'}</span>
              <span>·</span>
              <span>Active Audio: {activeAudioDevice}</span>
              <span>·</span>
              <span>Hardware Mic: {applianceStatus?.micMuted !== false ? 'Muted' : 'Live (Karaoke)'}</span>
            </div>
          </div>
        </div>

        {/* LIVE ON-THE-FLY HARDWARE AUDIO OUTPUT SWITCHER */}
        <div className="p-5 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-emerald-600" />
                Live Hardware Audio Output Switcher (Change On The Fly)
              </h4>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Click any output below to immediately switch <code>/etc/asound.conf</code> on your Mini PC and route projector audio without touching the command line.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-mono text-[11px] font-bold">
              Active: {activeAudioDevice}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {(applianceStatus?.audioDevices && applianceStatus.audioDevices.length > 0
              ? applianceStatus.audioDevices
              : [
                  { id: 'hdmi-auto', label: 'HDMI (Auto-Detect Active Projector)' },
                  { id: 'hw:0,3', label: 'HDMI 0 Output (hw:0,3)' },
                  { id: 'hw:0,7', label: 'HDMI 1 Output (hw:0,7)' },
                  { id: 'hw:0,8', label: 'HDMI 2 Output (hw:0,8)' },
                  { id: 'analog', label: '3.5mm Analog / Line Out (hw:0,0)' },
                  { id: 'dual', label: 'Dual Output (HDMI + 3.5mm Analog)' },
                ]
            ).map((dev) => {
              const isSelected =
                activeAudioDevice === dev.id ||
                (activeAudioDevice === 'analog' && dev.id === 'hw:0,0') ||
                (activeAudioDevice === 'hw:0,0' && dev.id === 'analog');
              return (
                <button
                  key={dev.id}
                  type="button"
                  disabled={switchingAudio}
                  onClick={() => handleSwitchAudioOutputOnTheFly(dev.id, dev.label)}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm ring-2 ring-emerald-500/30'
                      : 'bg-white hover:bg-emerald-50/80 text-slate-800 border-slate-200'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate">{dev.label}</div>
                    <div
                      className={`text-[10px] font-mono mt-0.5 ${
                        isSelected ? 'text-emerald-100' : 'text-slate-400'
                      }`}
                    >
                      ALSA Target: {dev.id}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold shrink-0 ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {isSelected ? 'ACTIVE' : 'Switch'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 5.1 Surround Audio Output Profile Selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Speaker className="w-4 h-4 text-blue-600" />
              1. Select Surround Sound &amp; Audio Output Profile (Baked into .deb Installer)
            </label>
            <span className="text-[11px] text-slate-500 font-mono">
              Configures /etc/asound.conf &amp; Chromium 5.1 Pipeline
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {AUDIO_PROFILES.map((prof) => {
              const selected = audioProfile === prof.id;
              return (
                <button
                  key={prof.id}
                  type="button"
                  onClick={() => setAudioProfile(prof.id)}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    selected
                      ? 'bg-blue-50/90 border-blue-600 ring-2 ring-blue-500/20 text-slate-900'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="text-xs font-bold text-slate-900">{prof.title}</div>
                    <div className="text-[11px] font-mono text-blue-700 font-semibold">{prof.subtitle}</div>
                    <p className="text-[11px] text-slate-500 leading-relaxed pt-1">{prof.desc}</p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-slate-200/70 flex items-center justify-between text-[11px] font-mono">
                    <span className="text-slate-500">{prof.id}</span>
                    <span className={selected ? 'font-bold text-blue-700' : 'text-slate-400'}>
                      {selected ? 'Selected Profile' : 'Select'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Appliance Connection Parameters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              CinemaBooth Docker Server URL (LAN IP)
            </label>
            <input
              type="url"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="http://192.168.1.50:3000"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ALSA Optical / HDMI Sound Card Index
            </label>
            <input
              type="text"
              value={spdifCard}
              onChange={(e) => setSpdifCard(e.target.value)}
              placeholder="0 (Default Card 0)"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Projector Display Resolution
            </label>
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-semibold focus:outline-none focus:border-blue-600"
            >
              <option value="auto">Auto-Negotiate EDID (Recommended)</option>
              <option value="1920x1080@60">1080p Full HD (1920x1080 @ 60Hz)</option>
              <option value="3840x2160@60">4K UHD (3840x2160 @ 60Hz)</option>
            </select>
          </div>
        </div>

        {/* Save Config & Download .deb Package Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSaveApplianceConfig}
              className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4 text-emerald-600" />
              <span>Save Appliance Defaults</span>
            </button>

            <a
              href={debDownloadUrl}
              download="cinemabooth-projector_1.0.0_amd64.deb"
              className="min-h-[44px] px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm shadow-blue-600/20"
            >
              <DownloadCloud className="w-4 h-4" />
              <span>Download Debian Package (cinemabooth-projector_1.0.0_amd64.deb)</span>
            </a>
          </div>

          {/* Remote Service Controls for Connected Mini PC */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleRemoteServiceAction('restart_kiosk', 'Restart Wayland Kiosk')}
              className="min-h-[38px] px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
              <span>Restart Kiosk</span>
            </button>
            <button
              type="button"
              onClick={() => handleRemoteServiceAction('restart_spotify', 'Restart Librespot')}
              className="min-h-[38px] px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
              <span>Restart Librespot</span>
            </button>
            <button
              type="button"
              onClick={() =>
                handleRemoteServiceAction(
                  applianceStatus?.micMuted === false ? 'mute_mic' : 'unmute_mic',
                  applianceStatus?.micMuted === false ? 'Mute Hardware Mic' : 'Unmute Hardware Mic'
                )
              }
              className="min-h-[38px] px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer"
            >
              {applianceStatus?.micMuted === false ? (
                <>
                  <MicOff className="w-3.5 h-3.5 text-rose-600" />
                  <span>Mute Mic</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5 text-slate-500" />
                  <span>Test Unmute Mic</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* One-Line SSH Install Command for Minimal Debian 12 / Ubuntu Server on Intel NUC / Beelink */}
        <div className="p-4 bg-slate-900 text-slate-100 rounded-xl space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-blue-300 flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-emerald-400" />
              One-Command SSH Installer for Minimal Debian 12 / Ubuntu Server (x86_64 Mini PC)
            </span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(sshInstallCommand);
                setCopiedAptCmd(true);
                setTimeout(() => setCopiedAptCmd(false), 2500);
              }}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-mono text-[11px] flex items-center gap-1.5 transition-colors border border-slate-700 cursor-pointer shrink-0"
            >
              {copiedAptCmd ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
              <span>{copiedAptCmd ? 'Copied Command' : 'Copy SSH Command'}</span>
            </button>
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            Run this on a fresh Debian 12 netinst Mini PC. It downloads your pre-configured <code>.deb</code> package, installs Wayland <code>cage</code>, Intel VA-API drivers, <code>librespot</code>, and ALSA 5.1 AC-3 optical encoding (<code>libasound2-plugins</code>), and starts the projector kiosk automatically.
          </p>
          <div className="p-2.5 bg-black/60 rounded-lg font-mono text-[11px] text-emerald-400 select-all overflow-x-auto border border-slate-800">
            {sshInstallCommand}
          </div>
        </div>

        {/* Interactive 5.1 Surround Sound Speaker Channel Tester */}
        <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-emerald-600" />
                2. Interactive 5.1 Surround Sound Speaker Calibration Test
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Plays discrete 6-channel test tones on both the Web Browser Projector Screen (for testing) and your 5.1 Surround System (Optical AC-3 / HDMI 5.1).
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleTriggerSpeakerTest('all')}
              disabled={testingChannel !== null}
              className="min-h-[40px] px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-2xs"
            >
              <Volume2 className="w-4 h-4" />
              <span>{testingChannel === 'all' ? 'Sweeping All 6 Channels...' : 'Sweep All 5.1 Channels'}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {[
              { id: 'fl', label: 'Front Left', ch: 'Ch 1 · FL' },
              { id: 'c', label: 'Center Dialog', ch: 'Ch 3 · C' },
              { id: 'fr', label: 'Front Right', ch: 'Ch 2 · FR' },
              { id: 'sl', label: 'Surround Left', ch: 'Ch 5 · SL' },
              { id: 'sr', label: 'Surround Right', ch: 'Ch 6 · SR' },
              { id: 'lfe', label: 'Subwoofer LFE', ch: 'Ch 4 · 55Hz' },
            ].map((spk) => {
              const active = testingChannel === spk.id;
              return (
                <button
                  key={spk.id}
                  type="button"
                  onClick={() => handleTriggerSpeakerTest(spk.id as any)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    active
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-200'
                  }`}
                >
                  <div className="text-xs font-bold">{spk.label}</div>
                  <div className={`text-[10px] font-mono mt-0.5 ${active ? 'text-emerald-100' : 'text-slate-400'}`}>
                    {spk.ch}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {applianceMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-900">
            {applianceMessage}
          </div>
        )}
      </div>

      {/* 2. PROJECTOR LOGO UPLOADER */}
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
            <span className="text-xs text-slate-600 font-bold">Current Standby Graphic</span>
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
              Upload your high-resolution theater logo (.JPG recommended, 1920x1080 or 3840x2160 4K). The file is persisted on the server and synchronized to all Projector Screens.
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
              className="min-h-[44px] px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-sm shadow-blue-600/20 transition-all disabled:opacity-50 cursor-pointer"
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

      {/* 3. THEATER DETAILS & GENERAL SETTINGS */}
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
              className="min-h-[44px] px-5 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm shadow-blue-600/20 cursor-pointer"
            >
              <Check className="w-4 h-4 text-emerald-300" />
              <span>Save Name</span>
            </button>

            {saveMessage && (
              <span className="text-xs text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl">
                {saveMessage}
              </span>
            )}
          </div>
        </div>

        {/* Database Notice */}
        <div className="p-4 bg-blue-50/70 rounded-xl border border-blue-200/80 flex items-center justify-between text-xs mt-4">
          <div className="flex items-center gap-2 text-slate-700">
            <Database className="w-4 h-4 text-blue-600 shrink-0" />
            <div>
              <span className="font-bold text-slate-900">Relational SQLite Database: </span>
              <span className="text-slate-600 font-medium">
                Backed by binary database file <code>./data/theater.db</code> (ACID relational persistence)
              </span>
            </div>
          </div>
          <span className="text-emerald-700 font-mono font-bold text-[11px]">SQL Active</span>
        </div>
      </div>
    </div>
  );
}
