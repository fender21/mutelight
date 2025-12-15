import React, { useState, useEffect } from 'react';
import type { EffectConfig, WledEffect } from '@shared/types';
import { DEFAULT_EFFECT_CONFIG } from '@shared/defaults';

interface EffectSelectorProps {
  deviceId: string;
  effectConfig: EffectConfig | undefined;
  onChange: (config: EffectConfig) => void;
  disabled?: boolean;
}

export function EffectSelector({
  deviceId,
  effectConfig,
  onChange,
  disabled = false,
}: EffectSelectorProps) {
  const [effects, setEffects] = useState<WledEffect[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = effectConfig ?? DEFAULT_EFFECT_CONFIG;

  useEffect(() => {
    if (!deviceId) return;

    const fetchEffects = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await window.electronAPI.getDeviceEffects(deviceId);
        if (result.success) {
          setEffects(result.effects);
        } else {
          setError(result.error || 'Failed to load effects');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load effects');
      } finally {
        setLoading(false);
      }
    };

    fetchEffects();
  }, [deviceId]);

  const handleEffectChange = (effectId: number) => {
    onChange({ ...config, effectId });
  };

  const handleSpeedChange = (speed: number) => {
    onChange({ ...config, speed });
  };

  const handleIntensityChange = (intensity: number) => {
    onChange({ ...config, intensity });
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <label className="block text-xs text-gray-400">Effect</label>
        <div className="flex items-center justify-center py-3 bg-[#151515] rounded-lg border border-gray-800">
          <span className="text-xs text-gray-500">Loading effects...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <label className="block text-xs text-gray-400">Effect</label>
        <div className="flex items-center justify-center py-3 bg-[#151515] rounded-lg border border-red-900/30">
          <span className="text-xs text-red-400">{error}</span>
        </div>
      </div>
    );
  }

  const selectedEffect = effects.find(e => e.id === config.effectId) || { id: 0, name: 'Solid' };

  return (
    <div className="space-y-3">
      {/* Effect Dropdown */}
      <div>
        <label className="block text-xs text-gray-400 mb-1.5">Effect</label>
        <select
          value={config.effectId}
          onChange={(e) => handleEffectChange(parseInt(e.target.value))}
          disabled={disabled || effects.length === 0}
          className="w-full bg-[#151515] border border-gray-800 rounded px-2 py-2 text-xs text-white focus:outline-none focus:border-purple-500 disabled:opacity-50"
        >
          {effects.length === 0 ? (
            <option value={0}>Solid</option>
          ) : (
            effects.map((effect) => (
              <option key={effect.id} value={effect.id}>
                {effect.name}
              </option>
            ))
          )}
        </select>
      </div>

      {/* Speed and Intensity - only show for non-Solid effects */}
      {config.effectId !== 0 && (
        <>
          {/* Speed */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-400">Speed</label>
              <span className="text-xs text-purple-400 font-mono">
                {Math.round((config.speed / 255) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="255"
              value={config.speed}
              onChange={(e) => handleSpeedChange(parseInt(e.target.value))}
              disabled={disabled}
              className="w-full h-1.5 bg-gray-800 rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-3
                [&::-webkit-slider-thumb]:h-3
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-purple-500
                [&::-webkit-slider-thumb]:cursor-pointer
                disabled:opacity-50"
            />
          </div>

          {/* Intensity */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-400">Intensity</label>
              <span className="text-xs text-purple-400 font-mono">
                {Math.round((config.intensity / 255) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="255"
              value={config.intensity}
              onChange={(e) => handleIntensityChange(parseInt(e.target.value))}
              disabled={disabled}
              className="w-full h-1.5 bg-gray-800 rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-3
                [&::-webkit-slider-thumb]:h-3
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-purple-500
                [&::-webkit-slider-thumb]:cursor-pointer
                disabled:opacity-50"
            />
          </div>
        </>
      )}
    </div>
  );
}
