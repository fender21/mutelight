import React from 'react';
import type { WledDevice } from '@shared/types';

interface DeviceCardProps {
  device: WledDevice;
}

export function DeviceCard({ device }: DeviceCardProps) {
  // Get colors - prefer stateColors if available, fallback to legacy colors
  const mutedColor = device.stateColors?.muted?.color || device.muted_color;
  const unmutedColor = device.stateColors?.connected?.color || device.unmuted_color;

  return (
    <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-6 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">{device.name}</h3>
          <p className="text-gray-400 text-sm font-mono">{device.ip_address}</p>
        </div>

        <div className="w-3 h-3 rounded-full bg-[#22c55e] animate-pulse" title="Online" />
      </div>

      {/* Color Preview */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-gray-400 text-xs mb-1">Muted</p>
          <div
            className="h-10 rounded border border-gray-700"
            style={{ backgroundColor: mutedColor }}
          />
        </div>
        <div>
          <p className="text-gray-400 text-xs mb-1">Unmuted</p>
          <div
            className="h-10 rounded border border-gray-700"
            style={{ backgroundColor: unmutedColor }}
          />
        </div>
      </div>
    </div>
  );
}
