import React from 'react';

interface MuteStateVisualProps {
  isMuted: boolean;
  isDeafened: boolean;
}

export function MuteStateVisual({ isMuted, isDeafened }: MuteStateVisualProps) {
  const getStatusText = () => {
    if (isDeafened) return 'Deafened';
    if (isMuted) return 'Muted';
    return 'Unmuted';
  };

  const getStatusColor = () => {
    if (isDeafened || isMuted) return '#ef4444'; // Red
    return '#22c55e'; // Green
  };

  return (
    <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-4">
      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ backgroundColor: getStatusColor() + '20', border: `2px solid ${getStatusColor()}` }}
        >
          <span className="text-2xl">
            {isDeafened ? '🔇' : isMuted ? '🔴' : '🟢'}
          </span>
        </div>
        <div>
          <p className="text-gray-400 text-sm">Status</p>
          <p className="text-white font-semibold text-lg">{getStatusText()}</p>
        </div>
      </div>
    </div>
  );
}
