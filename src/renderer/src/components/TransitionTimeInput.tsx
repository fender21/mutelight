import React from 'react';

interface TransitionTimeInputProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
}

const PRESETS = [
  { label: 'Instant', value: 0 },
  { label: '250ms', value: 250 },
  { label: '500ms', value: 500 },
  { label: '1s', value: 1000 },
];

export function TransitionTimeInput({
  value,
  onChange,
  label = 'Transition Time',
}: TransitionTimeInputProps) {
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numValue = parseInt(e.target.value, 10);
    if (!isNaN(numValue) && numValue >= 0) {
      onChange(numValue);
    }
  };

  return (
    <div>
      {label && (
        <label className="block text-xs text-gray-400 mb-2">{label}</label>
      )}

      <div className="relative">
        <input
          type="number"
          min="0"
          max="10000"
          step="100"
          value={value}
          onChange={handleInputChange}
          className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-2.5 pr-12 text-sm text-white font-mono focus:outline-none focus:border-purple-500 transition-colors"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
          ms
        </span>
      </div>

      <div className="flex gap-2 mt-2">
        {PRESETS.map((preset) => (
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
    </div>
  );
}
