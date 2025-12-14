import React, { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { ColorPicker } from './ColorPicker';
import type { LightZone } from '@shared/types';

interface ZoneFormData {
  name: string;
  device_id: string;
  start_led: number;
  end_led: number;
  muted_color: string;
  unmuted_color: string;
}

const DEFAULT_FORM_DATA: ZoneFormData = {
  name: '',
  device_id: '',
  start_led: 0,
  end_led: 0,
  muted_color: '#FF0000',
  unmuted_color: '#00FF00',
};

export function ZoneManager() {
  const { devices, zones, setZones } = useAppStore();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<LightZone | null>(null);
  const [formData, setFormData] = useState<ZoneFormData>(DEFAULT_FORM_DATA);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddNew = () => {
    if (devices.length === 0) {
      setError('Add a device first');
      return;
    }
    setEditingZone(null);
    setFormData({ ...DEFAULT_FORM_DATA, device_id: devices[0].id });
    setError(null);
    setIsFormOpen(true);
  };

  const handleEdit = (zone: LightZone) => {
    setEditingZone(zone);
    setFormData({
      name: zone.name,
      device_id: zone.device_id,
      start_led: zone.start_led,
      end_led: zone.end_led,
      muted_color: zone.muted_color,
      unmuted_color: zone.unmuted_color,
    });
    setError(null);
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!formData.device_id) {
      setError('Select a device');
      return;
    }
    if (formData.start_led < 0) {
      setError('Start LED must be 0 or greater');
      return;
    }
    if (formData.end_led < formData.start_led) {
      setError('End LED must be >= Start LED');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (editingZone) {
        const result = await window.electronAPI.updateZone(editingZone.id, formData);
        if (result.success && result.zone) {
          setZones(zones.map((z) => z.id === editingZone.id ? result.zone! : z));
          setIsFormOpen(false);
        } else {
          setError(result.error || 'Update failed');
        }
      } else {
        const result = await window.electronAPI.createZone(formData);
        if (result.success && result.zone) {
          setZones([...zones, result.zone]);
          setIsFormOpen(false);
        } else {
          setError(result.error || 'Create failed');
        }
      }
    } catch (error: any) {
      setError(error.message || 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (zone: LightZone) => {
    if (!confirm(`Delete "${zone.name}"?`)) return;

    try {
      const result = await window.electronAPI.deleteZone(zone.id);
      if (result.success) {
        setZones(zones.filter((z) => z.id !== zone.id));
      }
    } catch (error: any) {
      alert(error.message || 'Delete failed');
    }
  };

  const handleCancel = () => {
    setIsFormOpen(false);
    setEditingZone(null);
    setFormData(DEFAULT_FORM_DATA);
    setError(null);
  };

  const getDeviceName = (deviceId: string) => {
    const device = devices.find((d) => d.id === deviceId);
    return device ? device.name : 'Unknown';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Zones</h2>
          <p className="text-sm text-gray-500 mt-1">Control specific LED ranges</p>
        </div>
        {!isFormOpen && devices.length > 0 && (
          <button
            onClick={handleAddNew}
            className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Add Zone
          </button>
        )}
      </div>

      {/* No devices warning */}
      {devices.length === 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
          <p className="text-sm text-yellow-400">Add a device first before creating zones</p>
        </div>
      )}

      {/* Form */}
      {isFormOpen && (
        <div className="bg-[#151515] rounded-xl border border-gray-800/50 overflow-hidden">
          <div className="p-5 border-b border-gray-800/50">
            <h3 className="text-base font-medium text-white">
              {editingZone ? 'Edit Zone' : 'New Zone'}
            </h3>
          </div>

          <div className="p-5 space-y-5">
            {/* Name */}
            <div>
              <label className="block text-xs text-gray-400 mb-2">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Left Side"
                className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            {/* Device */}
            <div>
              <label className="block text-xs text-gray-400 mb-2">Device</label>
              <select
                value={formData.device_id}
                onChange={(e) => setFormData({ ...formData, device_id: e.target.value })}
                className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
              >
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name}
                  </option>
                ))}
              </select>
            </div>

            {/* LED Range */}
            <div>
              <label className="block text-xs text-gray-400 mb-2">LED Range</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="0"
                  value={formData.start_led}
                  onChange={(e) => setFormData({ ...formData, start_led: parseInt(e.target.value) || 0 })}
                  className="flex-1 bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-purple-500 transition-colors"
                  placeholder="Start"
                />
                <span className="text-gray-600">to</span>
                <input
                  type="number"
                  min="0"
                  value={formData.end_led}
                  onChange={(e) => setFormData({ ...formData, end_led: parseInt(e.target.value) || 0 })}
                  className="flex-1 bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-purple-500 transition-colors"
                  placeholder="End"
                />
              </div>
              <p className="text-[10px] text-gray-500 mt-2">
                {Math.max(0, formData.end_led - formData.start_led + 1)} LEDs selected
              </p>
            </div>

            {/* Colors */}
            <div className="grid grid-cols-2 gap-4">
              <ColorPicker
                label="Muted"
                color={formData.muted_color}
                onChange={(color) => setFormData({ ...formData, muted_color: color })}
              />
              <ColorPicker
                label="Unmuted"
                color={formData.unmuted_color}
                onChange={(color) => setFormData({ ...formData, unmuted_color: color })}
              />
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 rounded-lg text-xs bg-red-500/10 text-red-400 border border-red-500/20">
                {error}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="p-5 border-t border-gray-800/50 flex gap-3">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 py-2.5 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {isSaving ? 'Saving...' : editingZone ? 'Update' : 'Add Zone'}
            </button>
            <button
              onClick={handleCancel}
              disabled={isSaving}
              className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Zone List */}
      {!isFormOpen && zones.length > 0 && (
        <div className="space-y-3">
          {zones.map((zone) => (
            <div
              key={zone.id}
              className="bg-[#151515] rounded-xl p-4 border border-gray-800/50 hover:border-gray-700/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex gap-1">
                    <div
                      className="w-6 h-6 rounded"
                      style={{ backgroundColor: zone.unmuted_color }}
                    />
                    <div
                      className="w-6 h-6 rounded"
                      style={{ backgroundColor: zone.muted_color }}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{zone.name}</p>
                    <p className="text-xs text-gray-500">
                      {getDeviceName(zone.device_id)} · LEDs {zone.start_led}-{zone.end_led}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(zone)}
                    className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(zone)}
                    className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isFormOpen && zones.length === 0 && devices.length > 0 && (
        <div className="text-center py-12">
          <p className="text-gray-400">No zones yet</p>
          <p className="text-xs text-gray-600 mt-1">Zones let you control specific LED ranges</p>
        </div>
      )}
    </div>
  );
}
