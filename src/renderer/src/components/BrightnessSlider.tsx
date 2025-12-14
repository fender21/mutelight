import React from 'react';

interface BrightnessSliderProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  showPresets?: boolean;
}

export function BrightnessSlider({
  value,
  onChange,
  label = 'Brightness',
  showPresets = true,
}: BrightnessSliderProps) {
  const percentage = Math.round((value / 255) * 100);

  const presets = [
    { label: '25%', value: 64 },
    { label: '50%', value: 128 },
    { label: '75%', value: 191 },
    { label: '100%', value: 255 },
  ];

  return (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-gray-400">{label}</label>
          <span className="text-xs text-purple-400 font-mono">{percentage}%</span>
        </div>
      )}

      <input
        type="range"
        min="0"
        max="255"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full h-1.5 bg-gray-800 rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-4
          [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-purple-500
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:transition-transform
          [&::-webkit-slider-thumb]:hover:scale-110
          [&::-moz-range-thumb]:w-4
          [&::-moz-range-thumb]:h-4
          [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-purple-500
          [&::-moz-range-thumb]:border-none"
      />

      {showPresets && (
        <div className="flex gap-2 mt-2">
          {presets.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => onChange(preset.value)}
              className={`px-2.5 py-1 text-[10px] rounded-md transition-colors ${
                value === preset.value
                  ? 'bg-purple-500 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
