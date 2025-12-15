import React, { useEffect, useState } from 'react';
import { useAppStore } from './store/appStore';
import { useIPC } from './hooks/useIPC';
import { DeviceManager } from './components/DeviceManager';
import { StatusIndicator } from './components/StatusIndicator';

type View = 'dashboard' | 'devices' | 'settings';

export function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [activeView, setActiveView] = useState<View>('dashboard');
  const {
    settings,
    devices,
    discordState,
    setSettings,
    setDevices,
    updateDiscordState,
  } = useAppStore();
  const { getSettings, getDevices, getDiscordStatus, updateSettings } = useIPC();

  const [localSettings, setLocalSettings] = useState(settings);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const [settingsData, devicesData, discordStatus] = await Promise.all([
          getSettings(),
          getDevices(),
          getDiscordStatus(),
        ]);
        setSettings(settingsData);
        setLocalSettings(settingsData);
        setDevices(devicesData);
        updateDiscordState(discordStatus);
      } catch (error) {
        console.error('Failed to initialize app:', error);
      } finally {
        setIsInitialized(true);
      }
    };
    init();
  }, []);

  const handleSaveSettings = async () => {
    if (!localSettings) return;
    setIsSaving(true);
    try {
      await updateSettings(localSettings);
      setSettings(localSettings);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isInitialized) {
    return (
      <div className="h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  const getVoiceStatus = () => {
    if (!discordState.connected) return { label: 'Disconnected', color: 'text-gray-500' };
    if (!discordState.inVoiceChannel) return { label: 'Not in voice', color: 'text-gray-400' };
    if (discordState.deafened) return { label: 'Deafened', color: 'text-orange-400' };
    if (discordState.muted) return { label: 'Muted', color: 'text-red-400' };
    if (discordState.streaming) return { label: 'Streaming', color: 'text-purple-400' };
    return { label: 'Connected', color: 'text-green-400' };
  };

  const voiceStatus = getVoiceStatus();

  return (
    <div className="h-screen bg-[#0d0d0d] flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-[#111111] border-r border-gray-800/50 flex flex-col">
        {/* Logo */}
        <div className="p-5 border-b border-gray-800/50">
          <h1 className="text-lg font-semibold text-white tracking-tight">MuteLight</h1>
          <p className="text-xs text-gray-500 mt-0.5">Discord LED Controller</p>
        </div>

        {/* Status */}
        <div className="p-4 border-b border-gray-800/50">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${discordState.connected ? 'bg-green-500' : 'bg-gray-600'}`} />
            <span className="text-xs text-gray-400">Discord</span>
          </div>
          <p className={`text-sm font-medium ${voiceStatus.color}`}>{voiceStatus.label}</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          <NavItem
            active={activeView === 'dashboard'}
            onClick={() => setActiveView('dashboard')}
            icon={<DashboardIcon />}
            label="Dashboard"
          />
          <NavItem
            active={activeView === 'devices'}
            onClick={() => setActiveView('devices')}
            icon={<DevicesIcon />}
            label="Devices"
            badge={devices.length > 0 ? devices.length : undefined}
          />
          <NavItem
            active={activeView === 'settings'}
            onClick={() => setActiveView('settings')}
            icon={<SettingsIcon />}
            label="Settings"
          />
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800/50">
          <p className="text-[10px] text-gray-600">v1.0.0</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-4xl mx-auto">
          {activeView === 'dashboard' && (
            <DashboardView
              discordState={discordState}
              devices={devices}
            />
          )}
          {activeView === 'devices' && <DeviceManager />}
          {activeView === 'settings' && (
            <SettingsView
              settings={localSettings}
              onChange={setLocalSettings}
              onSave={handleSaveSettings}
              isSaving={isSaving}
            />
          )}
        </div>
      </main>
    </div>
  );
}

// Navigation Item Component
function NavItem({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
        active
          ? 'bg-purple-500/10 text-purple-400'
          : 'text-gray-400 hover:text-white hover:bg-white/5'
      }`}
    >
      <span className="w-5 h-5">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {badge !== undefined && (
        <span className="px-1.5 py-0.5 text-[10px] bg-gray-800 rounded text-gray-400">
          {badge}
        </span>
      )}
    </button>
  );
}

// Dashboard View
function DashboardView({
  discordState,
  devices,
}: {
  discordState: any;
  devices: any[];
}) {
  const getStateColor = () => {
    if (!discordState.connected) return '#666666';
    if (!discordState.inVoiceChannel) return '#666666';
    if (discordState.streaming) return '#a855f7';
    if (discordState.deafened) return '#f97316';
    if (discordState.muted) return '#ef4444';
    return '#22c55e';
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Dashboard</h2>
        <p className="text-sm text-gray-500 mt-1">Monitor your Discord state and WLED devices</p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 gap-4">
        <StatusCard
          label="Discord Status"
          value={discordState.connected ? 'Connected' : 'Disconnected'}
          color={discordState.connected ? 'green' : 'gray'}
        />
        <StatusCard
          label="Active Devices"
          value={`${devices.length}`}
          color={devices.length > 0 ? 'purple' : 'gray'}
        />
      </div>

      {/* Current State */}
      <div className="bg-[#151515] rounded-xl p-6 border border-gray-800/50">
        <h3 className="text-sm font-medium text-gray-400 mb-4">Current State</h3>
        <div className="flex items-center gap-6">
          <div
            className="w-16 h-16 rounded-full transition-colors duration-300"
            style={{ backgroundColor: getStateColor() }}
          />
          <div>
            <p className="text-2xl font-semibold text-white">
              {!discordState.connected && 'Disconnected'}
              {discordState.connected && !discordState.inVoiceChannel && 'Idle'}
              {discordState.connected && discordState.inVoiceChannel && discordState.streaming && 'Streaming'}
              {discordState.connected && discordState.inVoiceChannel && !discordState.streaming && discordState.deafened && 'Deafened'}
              {discordState.connected && discordState.inVoiceChannel && !discordState.streaming && !discordState.deafened && discordState.muted && 'Muted'}
              {discordState.connected && discordState.inVoiceChannel && !discordState.streaming && !discordState.deafened && !discordState.muted && 'Connected'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {discordState.inVoiceChannel ? 'In voice channel' : 'Not in voice channel'}
            </p>
          </div>
        </div>
      </div>

      {/* Quick Info */}
      {devices.length === 0 && (
        <div className="bg-[#151515] rounded-xl p-6 border border-gray-800/50 text-center">
          <p className="text-gray-400">No devices configured</p>
          <p className="text-sm text-gray-600 mt-1">Add WLED devices to get started</p>
        </div>
      )}
    </div>
  );
}

// Status Card Component
function StatusCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: 'green' | 'purple' | 'gray';
}) {
  const colorClasses = {
    green: 'bg-green-500/10 text-green-400 border-green-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    gray: 'bg-gray-800/50 text-gray-400 border-gray-700/50',
  };

  return (
    <div className={`rounded-xl p-4 border ${colorClasses[color]}`}>
      <p className="text-xs opacity-70 mb-1">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

// Settings View
function SettingsView({
  settings,
  onChange,
  onSave,
  isSaving,
}: {
  settings: any;
  onChange: (settings: any) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  if (!settings) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Settings</h2>
        <p className="text-sm text-gray-500 mt-1">Configure application preferences</p>
      </div>

      <div className="bg-[#151515] rounded-xl border border-gray-800/50 divide-y divide-gray-800/50">
        {/* Auto Start */}
        <SettingRow
          title="Auto-start"
          description="Launch when your computer starts"
          control={
            <Toggle
              checked={settings.autoStart}
              onChange={(checked) => onChange({ ...settings, autoStart: checked })}
            />
          }
        />

        {/* Minimize to Tray */}
        <SettingRow
          title="Minimize to tray"
          description="Hide to system tray instead of closing"
          control={
            <Toggle
              checked={settings.minimizeToTray}
              onChange={(checked) => onChange({ ...settings, minimizeToTray: checked })}
            />
          }
        />

        {/* Polling Interval */}
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-white">Polling interval</p>
              <p className="text-xs text-gray-500 mt-0.5">How often to check Discord status</p>
            </div>
            <span className="text-sm font-mono text-purple-400">{settings.pollingInterval}ms</span>
          </div>
          <input
            type="range"
            min="100"
            max="5000"
            step="100"
            value={settings.pollingInterval}
            onChange={(e) => onChange({ ...settings, pollingInterval: parseInt(e.target.value) })}
            className="w-full h-1.5 bg-gray-800 rounded-full appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-4
              [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-purple-500
              [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:transition-transform
              [&::-webkit-slider-thumb]:hover:scale-110"
          />
          <div className="flex justify-between text-[10px] text-gray-600 mt-2">
            <span>100ms (faster)</span>
            <span>5000ms (slower)</span>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={onSave}
        disabled={isSaving}
        className="w-full py-3 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors"
      >
        {isSaving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  );
}

// Setting Row Component
function SettingRow({
  title,
  description,
  control,
}: {
  title: string;
  description: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between p-5">
      <div>
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      {control}
    </div>
  );
}

// Toggle Component
function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        checked ? 'bg-purple-500' : 'bg-gray-700'
      }`}
    >
      <div
        className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
          checked ? 'left-6' : 'left-1'
        }`}
      />
    </button>
  );
}

// Icons
function DashboardIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  );
}

function DevicesIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
    </svg>
  );
}
