import React, { useState } from 'react';
import { Zap, Play, Plus, Trash2, Edit2, Check, Lightbulb, ShieldCheck } from 'lucide-react';
import { AutomationCue, TheaterSettings } from '../types/theater';
import { saveCue, deleteCue, triggerCue, saveSettings } from '../services/api';

interface AutomationTabProps {
  cues: AutomationCue[];
  settings: TheaterSettings;
  activeCue: string | null;
  onRefresh: () => void;
}

export default function AutomationTab({
  cues,
  settings,
  activeCue,
  onRefresh,
}: AutomationTabProps) {
  const [haUrl, setHaUrl] = useState(settings.ha_url || 'http://homeassistant.local:8123');
  const [haToken, setHaToken] = useState(settings.ha_token || '');
  const [savingSettings, setSavingSettings] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const [editingCue, setEditingCue] = useState<Partial<AutomationCue> | null>(null);

  const handleSaveHaSettings = async () => {
    setSavingSettings(true);
    try {
      await saveSettings({ ha_url: haUrl, ha_token: haToken });
      setTestResult('Home Assistant configuration saved.');
      setTimeout(() => setTestResult(null), 4000);
    } catch (e: any) {
      setTestResult(`Error: ${e.message}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTestCue = async (cue: AutomationCue) => {
    setTestingId(cue.id);
    try {
      const res = await triggerCue(cue.id);
      setTestResult(`Cue triggered: ${res.message}`);
      setTimeout(() => setTestResult(null), 5000);
    } catch (err: any) {
      setTestResult(`Failed to trigger cue: ${err.message}`);
    } finally {
      setTestingId(null);
    }
  };

  const handleSaveCueForm = async () => {
    if (!editingCue || !editingCue.name) return;
    try {
      await saveCue(editingCue);
      setEditingCue(null);
      onRefresh();
    } catch (err: any) {
      alert(`Failed to save cue: ${err.message}`);
    }
  };

  const handleDeleteCue = async (id: string) => {
    if (confirm('Delete this automation cue?')) {
      await deleteCue(id);
      onRefresh();
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. HOME ASSISTANT CONNECTION PANEL (Bright White / Slate / Green / Blue) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-sm space-y-4 relative overflow-hidden">
        {/* Subtle decorative emerald/blue gradient glow in top corner */}
        <div className="absolute top-0 right-0 w-64 h-32 bg-gradient-to-bl from-emerald-500/10 via-blue-500/5 to-transparent pointer-events-none" />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
              <Lightbulb className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Home Assistant Lighting &amp; Theater Automation
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Trigger lighting dimming, motorized masking curtains, projector relays, and sound cues seamlessly inside your playlists.
              </p>
            </div>
          </div>
          <span className="text-xs text-emerald-800 font-bold bg-emerald-50 border border-emerald-200/90 px-3 py-1 rounded-xl flex items-center gap-1.5 shadow-2xs">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> REST API Direct
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Home Assistant Base URL
            </label>
            <input
              type="text"
              value={haUrl}
              onChange={(e) => setHaUrl(e.target.value)}
              placeholder="http://homeassistant.local:8123 or http://192.168.1.50:8123"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-mono shadow-2xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Long-Lived Access Token
            </label>
            <input
              type="password"
              value={haToken}
              onChange={(e) => setHaToken(e.target.value)}
              placeholder="Bearer Token from HA Profile -> Security"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-mono shadow-2xs"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            onClick={handleSaveHaSettings}
            disabled={savingSettings}
            className="min-h-[44px] px-5 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm shadow-blue-600/20 transition-all disabled:opacity-50"
          >
            <Check className="w-4 h-4 text-emerald-300" />
            <span>{savingSettings ? 'Saving...' : 'Save HA Settings'}</span>
          </button>

          {testResult && (
            <div className="px-3.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-2 animate-fadeIn">
              <Zap className="w-3.5 h-3.5 text-emerald-600" />
              <span>{testResult}</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. AUTOMATION CUES LIBRARY */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-200">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-600" />
              Automation Cue Library ({cues.length} available)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              Reusable theater cues you can embed in any playlist to trigger right before or during features.
            </p>
          </div>

          <button
            onClick={() =>
              setEditingCue({
                id: `new_${Date.now()}`,
                name: 'New Lighting Cue',
                cue_type: 'home_assistant',
                service: 'light.turn_on',
                entity_id: 'light.auditorium_lights',
                parameters_json: '{"brightness_pct": 20, "transition": 4}',
                description: '',
              })
            }
            className="min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm shadow-emerald-600/20 transition-all shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Cue</span>
          </button>
        </div>

        {/* Cues List */}
        <div className="space-y-3">
          {cues.map((cue) => {
            const isTesting = testingId === cue.id;
            const isFired = activeCue === cue.name;
            return (
              <div
                key={cue.id}
                className={`p-4 rounded-xl flex flex-wrap items-center justify-between gap-4 transition-all border ${
                  isFired
                    ? 'bg-emerald-50/90 border-emerald-400 shadow-xs'
                    : 'bg-slate-50/70 hover:bg-white border-slate-200/90 hover:border-blue-300 shadow-2xs'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isFired
                        ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-500/20'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    <Zap className="w-5 h-5 text-emerald-700" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900">
                        {cue.name}
                      </h4>
                      {isFired && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold bg-emerald-600 text-white animate-pulse">
                          Active Cue
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">
                      {cue.cue_type === 'home_assistant'
                        ? `${cue.service} → ${cue.entity_id}`
                        : `Webhook (${cue.webhook_url})`}
                    </div>
                    {cue.description && (
                      <p className="text-[11px] text-slate-500 mt-1 font-medium">
                        {cue.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Test Cue Button */}
                  <button
                    onClick={() => handleTestCue(cue)}
                    disabled={isTesting}
                    className="min-h-[40px] px-3.5 py-1.5 bg-white hover:bg-emerald-50 active:scale-95 text-emerald-800 font-bold text-xs rounded-xl border border-emerald-200 flex items-center gap-1.5 transition-all shadow-2xs"
                  >
                    <Play className={`w-3.5 h-3.5 fill-current text-emerald-600 ${isTesting ? 'animate-spin' : ''}`} />
                    <span>{isTesting ? 'Firing...' : 'Test Cue'}</span>
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => setEditingCue(cue)}
                    className="min-h-[40px] min-w-[40px] p-2 bg-white hover:bg-slate-100 text-slate-600 hover:text-blue-600 border border-slate-200 rounded-xl flex items-center justify-center transition-colors shadow-2xs"
                    title="Edit cue"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDeleteCue(cue.id)}
                    className="min-h-[40px] min-w-[40px] p-2 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 rounded-xl flex items-center justify-center transition-colors shadow-2xs"
                    title="Delete cue"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. EDIT CUE MODAL (Bright White / Slate / Blue) */}
      {editingCue && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2 pb-2 border-b border-slate-200">
              <Zap className="w-5 h-5 text-emerald-600" />
              {editingCue.id?.startsWith('new_') ? 'Create Automation Cue' : 'Edit Automation Cue'}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Cue Display Name
                </label>
                <input
                  type="text"
                  value={editingCue.name || ''}
                  onChange={(e) => setEditingCue({ ...editingCue, name: e.target.value })}
                  placeholder="e.g. Auditorium Lights: Dim to 20%"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Integration
                </label>
                <select
                  value={editingCue.cue_type || 'home_assistant'}
                  onChange={(e) => setEditingCue({ ...editingCue, cue_type: e.target.value as any })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-semibold"
                >
                  <option value="home_assistant">Home Assistant REST Service</option>
                  <option value="webhook">Generic Webhook (POST JSON)</option>
                </select>
              </div>

              {editingCue.cue_type === 'home_assistant' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        HA Service
                      </label>
                      <input
                        type="text"
                        value={editingCue.service || ''}
                        onChange={(e) => setEditingCue({ ...editingCue, service: e.target.value })}
                        placeholder="light.turn_on"
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Target Entity ID
                      </label>
                      <input
                        type="text"
                        value={editingCue.entity_id || ''}
                        onChange={(e) => setEditingCue({ ...editingCue, entity_id: e.target.value })}
                        placeholder="light.auditorium"
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Parameters JSON
                    </label>
                    <textarea
                      rows={2}
                      value={editingCue.parameters_json || ''}
                      onChange={(e) => setEditingCue({ ...editingCue, parameters_json: e.target.value })}
                      placeholder='{"brightness_pct": 20, "transition": 5}'
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Webhook URL
                  </label>
                  <input
                    type="text"
                    value={editingCue.webhook_url || ''}
                    onChange={(e) => setEditingCue({ ...editingCue, webhook_url: e.target.value })}
                    placeholder="https://maker.ifttt.com/trigger/theater_dim/with/key/..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description / Operational Notes
                </label>
                <input
                  type="text"
                  value={editingCue.description || ''}
                  onChange={(e) => setEditingCue({ ...editingCue, description: e.target.value })}
                  placeholder="Dims house lights softly for walk-in audience"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-700"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                onClick={() => setEditingCue(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCueForm}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-sm shadow-emerald-600/20 transition-all"
              >
                Save Cue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
