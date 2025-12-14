import React, { useState, useRef, useEffect } from 'react';
import { HexColorPicker } from 'react-colorful';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  label?: string;
}

export function ColorPicker({ color, onChange, label }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localColor, setLocalColor] = useState(color);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalColor(color);
  }, [color]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleColorChange = (newColor: string) => {
    setLocalColor(newColor);
    onChange(newColor);
  };

  const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^#?[0-9A-Fa-f]{0,6}$/.test(value)) {
      const hexValue = value.startsWith('#') ? value : `#${value}`;
      setLocalColor(hexValue);
      if (/^#[0-9A-Fa-f]{6}$/.test(hexValue)) {
        onChange(hexValue);
      }
    }
  };

  const PRESETS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6',
    '#8b5cf6', '#ec4899', '#ffffff', '#94a3b8', '#1e293b', '#000000',
  ];

  return (
    <div className="relative">
      {label && (
        <label className="block text-xs text-gray-400 mb-2">{label}</label>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-10 h-10 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors cursor-pointer"
          style={{ backgroundColor: localColor }}
        />
        <input
          type="text"
          value={localColor.toUpperCase()}
          onChange={handleHexInputChange}
          className="flex-1 bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-purple-500 transition-colors"
          maxLength={7}
        />
      </div>

      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute z-50 mt-2 p-4 bg-[#151515] border border-gray-800 rounded-xl shadow-2xl"
        >
          <HexColorPicker color={localColor} onChange={handleColorChange} />

          <div className="mt-4 pt-4 border-t border-gray-800">
            <div className="grid grid-cols-6 gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleColorChange(preset)}
                  className={`w-7 h-7 rounded-md transition-transform hover:scale-110 ${
                    localColor.toLowerCase() === preset.toLowerCase()
                      ? 'ring-2 ring-purple-500 ring-offset-1 ring-offset-[#151515]'
                      : ''
                  }`}
                  style={{ backgroundColor: preset }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
