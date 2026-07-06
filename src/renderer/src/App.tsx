import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_STATE_COLORS } from '@shared/defaults';
import type { AppSettings, BeaconState } from '@shared/types';
import type { BridgeStatus } from '../../main/preload';

const api = window.electronAPI;

function stateColor(state: BeaconState): string {
  return (DEFAULT_STATE_COLORS as Record<string, { color: string }>)[state]?.color ?? '#666666';
}

function stateLabel(state: BeaconState): string {
  return state
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function App() {
  const [bridge, setBridge] = useState<BridgeStatus | null>(null);
  const [discordConnected, setDiscordConnected] = useState(false);
  const [beaconState, setBeaconState] = useState<BeaconState>('idle');
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const refresh = useCallback(async () => {
    const [bridgeStatus, discordStatus, beacon, appSettings] = await Promise.all([
      api.getBridgeStatus(),
      api.getDiscordStatus(),
      api.getBeaconState(),
      api.getSettings(),
    ]);
    setBridge(bridgeStatus);
    setDiscordConnected(discordStatus.connected);
    setBeaconState(beacon.state);
    setSettings(appSettings);
  }, []);

  useEffect(() => {
    void refresh();
    const unsubs = [
      api.onBridgeConnectionChange(() => void refresh()),
      api.onBridgePairingCode(code =>
        setBridge(b => (b ? { ...b, pairingCode: code } : b))
      ),
      api.onBridgePaired(() => void refresh()),
      api.onBeaconStateChange(state => setBeaconState(state)),
      api.onDiscordConnectionChange(setDiscordConnected),
    ];
    return () => unsubs.forEach(un => un());
  }, [refresh]);

  const toggleSetting = async (key: 'autoStart' | 'minimizeToTray') => {
    if (!settings) return;
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    await api.updateSettings({ [key]: next[key] });
  };

  const openDashboard = () => {
    if (settings) window.open(settings.bridge.dashboardUrl);
  };

  return (
    <div className="h-screen bg-[#0d0d0d] flex flex-col overflow-hidden select-none">
      {/* Header */}
      <header className="px-5 py-4 border-b border-gray-800/50 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white tracking-tight">MuteBeacon</h1>
          <p className="text-[11px] text-gray-500">Gateway</p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-3.5 h-3.5 rounded-full transition-colors duration-300"
            style={{ backgroundColor: stateColor(beaconState) }}
            title={stateLabel(beaconState)}
          />
          <span className="text-sm text-gray-300">{stateLabel(beaconState)}</span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Cloud connection / pairing */}
        {bridge && !bridge.paired && (
          <section className="bg-[#151515] rounded-xl border border-purple-500/30 p-5 text-center">
            <h2 className="text-sm font-medium text-white">Link this computer</h2>
            {bridge.pairingCode ? (
              <>
                <p className="text-xs text-gray-500 mt-1">
                  Enter this code in your MuteBeacon dashboard
                </p>
                <div className="my-4 text-3xl font-mono font-bold tracking-[0.3em] text-purple-400">
                  {bridge.pairingCode}
                </div>
                <button
                  onClick={openDashboard}
                  className="px-4 py-2 text-sm bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors"
                >
                  Open Dashboard
                </button>
                <p className="text-[11px] text-gray-600 mt-3">
                  Waiting for you to enter the code…
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-gray-500 mt-1 mb-3">
                  Can't reach the MuteBeacon server. It will keep retrying.
                </p>
                <button
                  onClick={() => api.startPairing()}
                  className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg transition-colors"
                >
                  Retry now
                </button>
              </>
            )}
          </section>
        )}

        {bridge && bridge.paired && (
          <section className="bg-[#151515] rounded-xl border border-gray-800/50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-2 h-2 rounded-full ${
                    bridge.connected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'
                  }`}
                />
                <div>
                  <p className="text-sm text-white">MuteBeacon Cloud</p>
                  <p className="text-[11px] text-gray-500">
                    {bridge.connected ? 'Connected' : 'Reconnecting…'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={openDashboard}
                  className="px-3 py-1.5 text-xs bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors"
                >
                  Open Dashboard
                </button>
                <button
                  onClick={() => api.unpair()}
                  className="px-2 py-1.5 text-xs text-gray-500 hover:text-red-400 transition-colors"
                  title="Unlink this computer"
                >
                  Unlink
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Discord status */}
        <section className="bg-[#151515] rounded-xl border border-gray-800/50 p-4">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-2 h-2 rounded-full ${discordConnected ? 'bg-green-500' : 'bg-gray-600'}`}
            />
            <div>
              <p className="text-sm text-white">Discord</p>
              <p className="text-[11px] text-gray-500">
                {discordConnected
                  ? 'Connected — voice state drives your lights'
                  : 'Not detected — lights still work via cloud triggers and the tray menu'}
              </p>
            </div>
          </div>
        </section>

        {/* Local settings */}
        {settings && (
          <section className="bg-[#151515] rounded-xl border border-gray-800/50 divide-y divide-gray-800/50">
            <SettingToggle
              title="Start with computer"
              checked={settings.autoStart}
              onChange={() => toggleSetting('autoStart')}
            />
            <SettingToggle
              title="Minimize to tray on close"
              checked={settings.minimizeToTray}
              onChange={() => toggleSetting('minimizeToTray')}
            />
          </section>
        )}

        <p className="text-[11px] text-gray-600 text-center">
          Devices, colors, and integrations are managed in the dashboard.
        </p>
      </main>
    </div>
  );
}

function SettingToggle({
  title,
  checked,
  onChange,
}: {
  title: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <p className="text-sm text-gray-200">{title}</p>
      <button
        onClick={onChange}
        className={`relative w-10 h-5.5 h-6 rounded-full transition-colors ${
          checked ? 'bg-purple-500' : 'bg-gray-700'
        }`}
      >
        <div
          className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
            checked ? 'left-5' : 'left-1'
          }`}
        />
      </button>
    </div>
  );
}
