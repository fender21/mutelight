import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { useIPC } from '../hooks/useIPC';
import { DeviceCard } from '../components/DeviceCard';
import { StatusIndicator } from '../components/StatusIndicator';
import { MuteStateVisual } from '../components/MuteStateVisual';

export function DashboardPage() {
  const {
    devices,
    discordState,
    setDevices,
    updateDiscordState,
  } = useAppStore();

  const { getDevices, getDiscordStatus } = useIPC();

  // Load initial data
  useEffect(() => {
    loadData();
    // Get initial Discord status and update store
    getDiscordStatus().then(status => {
      updateDiscordState(status);
    });
  }, []);

  const loadData = async () => {
    const devicesData = await getDevices();
    setDevices(devicesData);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] to-[#1a1a1a] p-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">MuteLight Dashboard</h1>
            <p className="text-gray-400">
              Discord-integrated WLED lighting control
            </p>
          </div>

          <Link
            to="/settings"
            className="px-4 py-2 bg-[#a855f7] hover:bg-[#9333ea] text-white font-semibold rounded-lg transition-colors"
          >
            Settings
          </Link>
        </div>

        {/* Status Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <StatusIndicator
            label="Discord"
            connected={discordState.connected}
            status={discordState.connected ? 'Connected' : 'Disconnected'}
          />

          <StatusIndicator
            label="WLED Devices"
            connected={devices.length > 0}
            status={`${devices.length} device${devices.length !== 1 ? 's' : ''}`}
          />

          <MuteStateVisual
            isMuted={discordState.muted}
            isDeafened={discordState.deafened}
          />
        </div>

        {/* Devices Grid */}
        <div>
          <h2 className="text-xl font-semibold text-white mb-4">WLED Devices</h2>

          {devices.length === 0 ? (
            <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-8 text-center">
              <p className="text-gray-400">No devices configured</p>
              <p className="text-gray-500 text-sm mt-2">
                Add WLED devices in Settings to get started
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {devices.map((device) => (
                <DeviceCard
                  key={device.id}
                  device={device}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
