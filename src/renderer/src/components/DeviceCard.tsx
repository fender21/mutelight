import React from 'react';
import type { WledDevice, LightZone } from '@shared/types';

interface DeviceCardProps {
  device: WledDevice;
  zones: LightZone[];
}

export function DeviceCard({ device, zones }: DeviceCardProps) {
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
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <p className="text-gray-400 text-xs mb-1">Muted</p>
          <div
            className="h-10 rounded border border-gray-700"
            style={{ backgroundColor: device.muted_color }}
          />
        </div>
        <div>
          <p className="text-gray-400 text-xs mb-1">Unmuted</p>
          <div
            className="h-10 rounded border border-gray-700"
            style={{ backgroundColor: device.unmuted_color }}
          />
        </div>
      </div>

      {/* Zones */}
      {zones.length > 0 && (
        <div className="pt-4 border-t border-gray-800">
          <p className="text-gray-400 text-xs mb-2">{zones.length} Zone{zones.length !== 1 ? 's' : ''}</p>
          <div className="space-y-2">
            {zones.map((zone) => (
              <div key={zone.id} className="flex items-center gap-2 text-xs">
                <span className="text-gray-500">{zone.name}</span>
                <span className="text-gray-600">LEDs {zone.start_led}-{zone.end_led}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
