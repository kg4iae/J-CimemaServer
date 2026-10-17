import React, { useState } from 'react';
import { Zap, Play, Plus, Trash2, Edit2, Check, RefreshCw, Lightbulb, ShieldCheck, HelpCircle } from 'lucide-react';
import { AutomationCue, TheaterSettings } from '../types/theater';
import { saveCue, deleteCue, triggerCue, testCuePayload, saveSettings } from '../services/api';

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
      {/* 1. HOME ASSISTANT CONNECTION PANEL */}
      <div className="bg-[#141824] border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">
              Home Assistant Lighting &amp; Theater Automation
            </h2>
          </div>
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> REST API Direct
          </span>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Connect your theater PC to Home Assistant running on your local network to trigger lighting dimming, curtain motors, and auditorium climate control smoothly as part of your playlist.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Home Assistant Base URL
            </label>
            <input
              type="text"
              value={haUrl}
              onChange={(e) => setHaUrl(e.target.value)}
              placeholder="http://homeassistant.local:8123 or http://192.168.1.50:8123"
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Long-Lived Access Token
            </label>
            <input
              type="password"
              value={haToken}
              onChange={(e) => setHaToken(e.target.value)}
              placeholder="Bearer Token from HA Profile -> Security"
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            onClick={handleSaveHaSettings}
            disabled={savingSettings}
            className="min-h-[44px] px-4 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-all"
          >
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{savingSettings ? 'Saving...' : 'Save HA Settings'}</span>
          </button>

          {testResult && (
            <span className="text-xs text-amber-300 font-medium animate-pulse">
              {testResult}
            </span>
          )}
        </div>
      </div>

      {/* 2. AUTOMATION CUES LIBRARY */}
      <div className="bg-[#141824] border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Automation Cue Library ({cues.length})
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Reusable theater cues you can drag into any playlist sequence.
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
            className="min-h-[44px] px-4 py-2 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Cue</span>
          </button>
        </div>

        {/* Cues List */}
        <div className="space-y-3">
          {cues.map((cue) => {
            const isTesting = testingId === cue.id;
            return (
              <div
                key={cue.id}
                className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-4 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-950/60 border border-blue-800/40 flex items-center justify-center text-blue-400 shrink-0">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">
                      {cue.name}
                    </h4>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">
                      {cue.cue_type === 'home_assistant'
                        ? `${cue.service} → ${cue.entity_id}`
                        : `Webhook (${cue.webhook_url})`}
                    </div>
                    {cue.description && (
                      <p className="text-[11px] text-slate-400 mt-1">
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
                    className="min-h-[38px] px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-amber-300 font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-all"
                  >
                    <Play className={`w-3.5 h-3.5 fill-current ${isTesting ? 'animate-spin' : ''}`} />
                    <span>{isTesting ? 'Testing...' : 'Test Cue Now'}</span>
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => setEditingCue(cue)}
                    className="min-h-[38px] min-w-[38px] p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center justify-center"
                    title="Edit cue"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDeleteCue(cue.id)}
                    className="min-h-[38px] min-w-[38px] p-2 bg-slate-800 hover:bg-red-950 text-slate-400 hover:text-red-400 rounded-lg flex items-center justify-center transition-colors"
                    title="Delete cue"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. EDIT CUE MODAL */}
      {editingCue && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141824] border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              {editingCue.id?.startsWith('new_') ? 'Create Automation Cue' : 'Edit Automation Cue'}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Cue Display Name
                </label>
                <input
                  type="text"
                  value={editingCue.name || ''}
                  onChange={(e) => setEditingCue({ ...editingCue, name: e.target.value })}
                  placeholder="e.g. Auditorium Lights: Dim to 20%"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Target Integration
                </label>
                <select
                  value={editingCue.cue_type || 'home_assistant'}
                  onChange={(e) => setEditingCue({ ...editingCue, cue_type: e.target.value as any })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="home_assistant">Home Assistant REST Service</option>
                  <option value="webhook">Generic Webhook (POST JSON)</option>
                </select>
              </div>

              {editingCue.cue_type === 'home_assistant' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        HA Service
                      </label>
                      <input
                        type="text"
                        value={editingCue.service || ''}
                        onChange={(e) => setEditingCue({ ...editingCue, service: e.target.value })}
                        placeholder="light.turn_on"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Target Entity ID
                      </label>
                      <input
                        type="text"
                        value={editingCue.entity_id || ''}
                        onChange={(e) => setEditingCue({ ...editingCue, entity_id: e.target.value })}
                        placeholder="light.auditorium"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Parameters JSON
                    </label>
                    <textarea
                      rows={2}
                      value={editingCue.parameters_json || ''}
                      onChange={(e) => setEditingCue({ ...editingCue, parameters_json: e.target.value })}
                      placeholder='{"brightness_pct": 20, "transition": 5}'
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Webhook URL
                  </label>
                  <input
                    type="text"
                    value={editingCue.webhook_url || ''}
                    onChange={(e) => setEditingCue({ ...editingCue, webhook_url: e.target.value })}
                    placeholder="https://maker.ifttt.com/trigger/theater_dim/with/key/..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Description / Operational Notes
                </label>
                <input
                  type="text"
                  value={editingCue.description || ''}
                  onChange={(e) => setEditingCue({ ...editingCue, description: e.target.value })}
                  placeholder="Dims house lights softly for walk-in audience"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingCue(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCueForm}
                className="px-4 py-2 bg-amber-500 text-slate-950 font-bold rounded-xl text-xs shadow-md"
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
