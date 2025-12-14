import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { useIPC } from '../hooks/useIPC';
import { DeviceManager } from '../components/DeviceManager';
import { ZoneManager } from '../components/ZoneManager';

type TabType = 'app' | 'devices' | 'zones';

export function SettingsPage() {
  const { settings, setSettings } = useAppStore();
  const { getSettings, updateSettings } = useIPC();

  const [activeTab, setActiveTab] = useState<TabType>('app');
  const [localSettings, setLocalSettings] = useState(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const data = await getSettings();
    setSettings(data);
    setLocalSettings(data);
  };

  const handleSave = async () => {
    if (!localSettings) return;

    setIsSaving(true);
    setSavedMessage(false);

    try {
      await updateSettings(localSettings);
      setSettings(localSettings);
      setSavedMessage(true);
      setTimeout(() => setSavedMessage(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  if (!localSettings) {
    return <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <p className="text-gray-400">Loading...</p>
    </div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] to-[#1a1a1a] p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-white">Settings</h1>
          <Link
            to="/dashboard"
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 bg-[#1a1a1a] border border-gray-800 rounded-lg p-2">
          <button
            onClick={() => setActiveTab('app')}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'app'
                ? 'bg-[#a855f7] text-white'
                : 'text-gray-400 hover:text-white hover:bg-[#2a2a2a]'
            }`}
          >
            App Settings
          </button>
          <button
            onClick={() => setActiveTab('devices')}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'devices'
                ? 'bg-[#a855f7] text-white'
                : 'text-gray-400 hover:text-white hover:bg-[#2a2a2a]'
            }`}
          >
            Devices
          </button>
          <button
            onClick={() => setActiveTab('zones')}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'zones'
                ? 'bg-[#a855f7] text-white'
                : 'text-gray-400 hover:text-white hover:bg-[#2a2a2a]'
            }`}
          >
            Zones
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'app' && (
          <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-6">
          <div className="space-y-6">
            {/* Auto Start */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold">Auto-start on system boot</h3>
                <p className="text-gray-400 text-sm">Launch MuteLight when your computer starts</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={localSettings.autoStart}
                  onChange={(e) => setLocalSettings({ ...localSettings, autoStart: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#22c55e]"></div>
              </label>
            </div>

            {/* Minimize to Tray */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold">Minimize to tray</h3>
                <p className="text-gray-400 text-sm">Hide to system tray instead of closing</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={localSettings.minimizeToTray}
                  onChange={(e) => setLocalSettings({ ...localSettings, minimizeToTray: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#22c55e]"></div>
              </label>
            </div>

            {/* Polling Interval */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-white font-semibold">Discord polling interval</h3>
                <span className="text-[#22c55e] font-mono">{localSettings.pollingInterval}ms</span>
              </div>
              <p className="text-gray-400 text-sm mb-3">How often to check Discord mute status (100ms - 5000ms)</p>
              <input
                type="range"
                min="100"
                max="5000"
                step="100"
                value={localSettings.pollingInterval}
                onChange={(e) => setLocalSettings({ ...localSettings, pollingInterval: parseInt(e.target.value) })}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#22c55e]"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>100ms (faster)</span>
                <span>5000ms (slower)</span>
              </div>
            </div>

            {/* Save Button */}
            <div className="pt-4 border-t border-gray-800">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full py-3 bg-[#22c55e] hover:bg-[#22c55e]/90 disabled:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
              >
                {isSaving ? 'Saving...' : 'Save Settings'}
              </button>

              {savedMessage && (
                <p className="text-[#22c55e] text-sm text-center mt-3">Settings saved successfully!</p>
              )}
            </div>
          </div>
          </div>
        )}

        {/* Devices Tab */}
        {activeTab === 'devices' && (
          <DeviceManager />
        )}

        {/* Zones Tab */}
        {activeTab === 'zones' && (
          <ZoneManager />
        )}

        {/* App Info */}
        <div className="mt-6 text-center text-gray-500 text-sm">
          <p>MuteLight v1.0.0</p>
          <p className="mt-1">Discord mute status LED controller</p>
        </div>
      </div>
    </div>
  );
}
