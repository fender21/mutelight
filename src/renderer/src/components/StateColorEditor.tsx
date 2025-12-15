import React, { useState } from 'react';
import { ColorPicker } from './ColorPicker';
import { BrightnessSlider } from './BrightnessSlider';
import { EffectSelector } from './EffectSelector';
import type { StateColors, StateLightConfig, VoiceState, EffectConfig } from '@shared/types';
import { DEFAULT_STATE_COLORS } from '@shared/defaults';

interface StateColorEditorProps {
  stateColors: StateColors | undefined;
  onChange: (stateColors: StateColors) => void;
  onPreview?: (state: VoiceState, config: StateLightConfig) => void;
  onRestore?: () => void;
  deviceId?: string;
  legacyMutedColor?: string;
  legacyUnmutedColor?: string;
}

const STATE_INFO: Record<VoiceState, { label: string; icon: string; unavailable?: boolean }> = {
  idle: { label: 'Idle', icon: '💤' },
  connected: { label: 'Connected', icon: '🎧' },
  speaking: { label: 'Speaking', icon: '🗣️' },
  muted: { label: 'Muted', icon: '🔇' },
  deafened: { label: 'Deafened', icon: '🔕' },
  streaming: { label: 'Streaming', icon: '📺' },
  unmuted: { label: 'Unmuted', icon: '🎤' },
};

const EDITABLE_STATES: VoiceState[] = ['idle', 'connected', 'speaking', 'muted', 'deafened', 'streaming'];

export function StateColorEditor({
  stateColors,
  onChange,
  onPreview,
  onRestore,
  deviceId,
  legacyMutedColor,
  legacyUnmutedColor,
}: StateColorEditorProps) {
  const [expandedState, setExpandedState] = useState<VoiceState | null>(null);

  const getEffectiveColors = (): StateColors => {
    if (stateColors) return stateColors;
    return {
      idle: { ...DEFAULT_STATE_COLORS.idle },
      connected: {
        color: legacyUnmutedColor || DEFAULT_STATE_COLORS.connected.color,
        brightness: DEFAULT_STATE_COLORS.connected.brightness,
        enabled: true,
      },
      speaking: {
        color: legacyUnmutedColor || DEFAULT_STATE_COLORS.speaking.color,
        brightness: DEFAULT_STATE_COLORS.speaking.brightness,
        enabled: false,
      },
      muted: {
        color: legacyMutedColor || DEFAULT_STATE_COLORS.muted.color,
        brightness: DEFAULT_STATE_COLORS.muted.brightness,
        enabled: true,
      },
      deafened: {
        color: legacyMutedColor || DEFAULT_STATE_COLORS.deafened.color,
        brightness: DEFAULT_STATE_COLORS.deafened.brightness,
        enabled: true,
      },
      streaming: { ...DEFAULT_STATE_COLORS.streaming },
    };
  };

  const colors = getEffectiveColors();

  const handleStateChange = (state: VoiceState, updates: Partial<StateLightConfig>) => {
    onChange({
      ...colors,
      [state]: { ...colors[state], ...updates },
    });
  };

  const handleResetToDefaults = () => {
    onChange({ ...DEFAULT_STATE_COLORS });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">State Colors</p>
        <button
          type="button"
          onClick={handleResetToDefaults}
          className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          Reset
        </button>
      </div>

      <div className="space-y-2">
        {EDITABLE_STATES.map((state) => {
          const info = STATE_INFO[state];
          const config = colors[state];
          const isExpanded = expandedState === state;

          return (
            <div
              key={state}
              className={`bg-[#1a1a1a] rounded-lg overflow-hidden border transition-colors ${
                isExpanded ? 'border-purple-500/30' : 'border-gray-800/50'
              }`}
            >
              {/* Header */}
              <button
                type="button"
                onClick={() => !info.unavailable && setExpandedState(isExpanded ? null : state)}
                disabled={info.unavailable}
                className={`w-full flex items-center justify-between px-3 py-2.5 transition-colors ${
                  info.unavailable ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#222222]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-sm">{info.icon}</span>
                  <span className={`text-sm ${info.unavailable ? 'text-gray-500' : 'text-white'}`}>
                    {info.label}
                  </span>
                  {info.unavailable && (
                    <span className="text-[9px] text-yellow-600 bg-yellow-900/20 px-1.5 py-0.5 rounded">
                      N/A
                    </span>
                  )}
                  {!info.unavailable && !config.enabled && (
                    <span className="text-[9px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
                      Off
                    </span>
                  )}
                </div>

                {!info.unavailable && (
                  <div className="flex items-center gap-2">
                    <div
                      className="w-5 h-5 rounded"
                      style={{
                        backgroundColor: config.color,
                        opacity: config.enabled ? 1 : 0.3,
                      }}
                    />
                    <svg
                      className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                )}
              </button>

              {/* Expanded Content */}
              {isExpanded && !info.unavailable && (
                <div className="px-3 pb-3 pt-1 space-y-3 border-t border-gray-800/50">
                  {/* Enable Toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Enabled</span>
                    <button
                      onClick={() => handleStateChange(state, { enabled: !config.enabled })}
                      className={`relative w-9 h-5 rounded-full transition-colors ${
                        config.enabled ? 'bg-purple-500' : 'bg-gray-700'
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                          config.enabled ? 'left-[18px]' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </div>

                  {config.enabled && (
                    <>
                      {/* Color */}
                      <div>
                        <label className="block text-xs text-gray-400 mb-1.5">Color</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={config.color}
                            onChange={(e) => handleStateChange(state, { color: e.target.value })}
                            className="w-8 h-8 rounded cursor-pointer bg-transparent"
                          />
                          <input
                            type="text"
                            value={config.color}
                            onChange={(e) => handleStateChange(state, { color: e.target.value })}
                            className="flex-1 bg-[#151515] border border-gray-800 rounded px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-purple-500"
                          />
                        </div>
                      </div>

                      {/* Brightness */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs text-gray-400">Brightness</label>
                          <span className="text-xs text-purple-400 font-mono">
                            {Math.round((config.brightness / 255) * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="255"
                          value={config.brightness}
                          onChange={(e) => handleStateChange(state, { brightness: parseInt(e.target.value) })}
                          className="w-full h-1.5 bg-gray-800 rounded-full appearance-none cursor-pointer
                            [&::-webkit-slider-thumb]:appearance-none
                            [&::-webkit-slider-thumb]:w-3
                            [&::-webkit-slider-thumb]:h-3
                            [&::-webkit-slider-thumb]:rounded-full
                            [&::-webkit-slider-thumb]:bg-purple-500
                            [&::-webkit-slider-thumb]:cursor-pointer"
                        />
                      </div>

                      {/* Effect Selector - only show when deviceId is provided (editing existing device) */}
                      {deviceId && (
                        <div className="pt-2 border-t border-gray-800/50">
                          <EffectSelector
                            deviceId={deviceId}
                            effectConfig={config.effect}
                            onChange={(effect: EffectConfig) => handleStateChange(state, { effect })}
                          />
                        </div>
                      )}

                      {/* Preview Button */}
                      {onPreview && (
                        <button
                          onClick={() => onPreview(state, config)}
                          className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-white text-xs rounded-lg transition-colors"
                        >
                          Preview
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Restore Button */}
      {onRestore && (
        <button
          onClick={onRestore}
          className="w-full py-2 bg-gray-800/50 hover:bg-gray-800 text-gray-400 text-xs rounded-lg transition-colors"
        >
          Restore Current State
        </button>
      )}
    </div>
  );
}
