import React from 'react';

interface StatusIndicatorProps {
  label: string;
  connected: boolean;
  status: string;
}

export function StatusIndicator({ label, connected, status }: StatusIndicatorProps) {
  return (
    <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-4">
      <div className="flex items-center gap-3">
        <div
          className={`w-3 h-3 rounded-full ${
            connected ? 'bg-[#22c55e] animate-pulse' : 'bg-gray-600'
          }`}
        />
        <div>
          <p className="text-gray-400 text-sm">{label}</p>
          <p className="text-white font-semibold">{status}</p>
        </div>
      </div>
    </div>
  );
}
