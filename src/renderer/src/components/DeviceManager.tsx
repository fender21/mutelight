import React, { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { ColorPicker } from './ColorPicker';
import { BrightnessSlider } from './BrightnessSlider';
import { TransitionTimeInput } from './TransitionTimeInput';
import { StateColorEditor } from './StateColorEditor';
import type { WledDevice, MdnsDevice, StateColors, VoiceState, StateLightConfig } from '@shared/types';
import { DEFAULT_STATE_COLORS, DEFAULT_BRIGHTNESS, DEFAULT_TRANSITION_TIME } from '@shared/defaults';

interface DeviceFormData {
  name: string;
  ip_address: string;
  muted_color: string;
  unmuted_color: string;
  stateColors?: StateColors;
  defaultBrightness: number;
  transitionTime: number;
}

const DEFAULT_FORM_DATA: DeviceFormData = {
  name: '',
  ip_address: '',
  muted_color: '#FF0000',
  unmuted_color: '#00FF00',
  stateColors: undefined,
  defaultBrightness: DEFAULT_BRIGHTNESS,
  transitionTime: DEFAULT_TRANSITION_TIME,
};

export function DeviceManager() {
  const { devices, setDevices } = useAppStore();
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<MdnsDevice[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<WledDevice | null>(null);
  const [formData, setFormData] = useState<DeviceFormData>(DEFAULT_FORM_DATA);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [advancedMode, setAdvancedMode] = useState(false);

  const handleDiscover = async () => {
    setIsDiscovering(true);
    setDiscoveredDevices([]);
    setConnectionStatus(null);

    try {
      const result = await window.electronAPI.discoverDevices();
      if (result.success) {
        setDiscoveredDevices(result.devices);
        if (result.devices.length === 0) {
          setConnectionStatus({ success: false, message: 'No WLED devices found' });
        }
      } else {
        setConnectionStatus({ success: false, message: result.error || 'Discovery failed' });
      }
    } catch (error: any) {
      setConnectionStatus({ success: false, message: error.message || 'Discovery failed' });
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleTestConnection = async () => {
    if (!formData.ip_address) {
      setConnectionStatus({ success: false, message: 'Enter an IP address first' });
      return;
    }

    setTestingConnection(true);
    setConnectionStatus(null);

    try {
      const result = await window.electronAPI.testConnection(formData.ip_address);
      if (result.success) {
        setConnectionStatus({
          success: result.online,
          message: result.online ? 'Connected!' : 'Device offline',
        });
      } else {
        setConnectionStatus({ success: false, message: result.error || 'Test failed' });
      }
    } catch (error: any) {
      setConnectionStatus({ success: false, message: error.message || 'Test failed' });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleAddNew = () => {
    setEditingDevice(null);
    setFormData(DEFAULT_FORM_DATA);
    setConnectionStatus(null);
    setAdvancedMode(false);
    setIsFormOpen(true);
  };

  const handleAddDiscovered = (discovered: MdnsDevice) => {
    setEditingDevice(null);
    setFormData({
      ...DEFAULT_FORM_DATA,
      name: discovered.name,
      ip_address: discovered.ip,
    });
    setConnectionStatus(null);
    setAdvancedMode(false);
    setIsFormOpen(true);
  };

  const handleEdit = (device: WledDevice) => {
    setEditingDevice(device);
    setFormData({
      name: device.name,
      ip_address: device.ip_address,
      muted_color: device.muted_color,
      unmuted_color: device.unmuted_color,
      stateColors: device.stateColors,
      defaultBrightness: device.defaultBrightness ?? DEFAULT_BRIGHTNESS,
      transitionTime: device.transitionTime ?? DEFAULT_TRANSITION_TIME,
    });
    setAdvancedMode(!!device.stateColors);
    setConnectionStatus(null);
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setConnectionStatus({ success: false, message: 'Name is required' });
      return;
    }
    if (!formData.ip_address.trim()) {
      setConnectionStatus({ success: false, message: 'IP address is required' });
      return;
    }

    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(formData.ip_address)) {
      setConnectionStatus({ success: false, message: 'Invalid IP format' });
      return;
    }

    setIsSaving(true);
    setConnectionStatus(null);

    const saveData = {
      name: formData.name,
      ip_address: formData.ip_address,
      muted_color: formData.muted_color,
      unmuted_color: formData.unmuted_color,
      ...(advancedMode && {
        stateColors: formData.stateColors,
        defaultBrightness: formData.defaultBrightness,
        transitionTime: formData.transitionTime,
      }),
    };

    try {
      if (editingDevice) {
        const result = await window.electronAPI.updateDevice(editingDevice.id, saveData);
        if (result.success && result.device) {
          setDevices(devices.map((d) => d.id === editingDevice.id ? result.device! : d));
          setIsFormOpen(false);
        } else {
          setConnectionStatus({ success: false, message: result.error || 'Update failed' });
        }
      } else {
        const result = await window.electronAPI.createDevice(saveData);
        if (result.success && result.device) {
          setDevices([...devices, result.device]);
          setIsFormOpen(false);
        } else {
          setConnectionStatus({ success: false, message: result.error || 'Create failed' });
        }
      }
    } catch (error: any) {
      setConnectionStatus({ success: false, message: error.message || 'Save failed' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (device: WledDevice) => {
    if (!confirm(`Delete "${device.name}"?`)) return;

    try {
      const result = await window.electronAPI.deleteDevice(device.id);
      if (result.success) {
        setDevices(devices.filter((d) => d.id !== device.id));
      }
    } catch (error: any) {
      alert(error.message || 'Delete failed');
    }
  };

  const handleCancel = () => {
    setIsFormOpen(false);
    setEditingDevice(null);
    setFormData(DEFAULT_FORM_DATA);
    setConnectionStatus(null);
    setAdvancedMode(false);
  };

  const handlePreviewColor = async (state: VoiceState, config: StateLightConfig) => {
    if (editingDevice) {
      await window.electronAPI.previewDeviceColor(editingDevice.id, config.color, config.brightness);
    }
  };

  const handleRestoreState = async () => {
    if (editingDevice) {
      await window.electronAPI.restoreDeviceState(editingDevice.id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Devices</h2>
          <p className="text-sm text-gray-500 mt-1">Manage your WLED devices</p>
        </div>
        {!isFormOpen && (
          <button
            onClick={handleAddNew}
            className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Add Device
          </button>
        )}
      </div>

      {/* Discovery */}
      {!isFormOpen && (
        <div className="bg-[#151515] rounded-xl p-5 border border-gray-800/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Network Discovery</p>
              <p className="text-xs text-gray-500 mt-0.5">Find WLED devices automatically</p>
            </div>
            <button
              onClick={handleDiscover}
              disabled={isDiscovering}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
            >
              {isDiscovering ? 'Scanning...' : 'Scan Network'}
            </button>
          </div>

          {discoveredDevices.length > 0 && (
            <div className="mt-4 space-y-2">
              {discoveredDevices.map((device, i) => (
                <div key={i} className="flex items-center justify-between bg-[#1a1a1a] rounded-lg p-3">
                  <div>
                    <p className="text-sm text-white">{device.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{device.ip}</p>
                  </div>
                  <button
                    onClick={() => handleAddDiscovered(device)}
                    className="px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 text-xs font-medium rounded-lg transition-colors"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}

          {connectionStatus && !isFormOpen && (
            <p className={`mt-3 text-xs ${connectionStatus.success ? 'text-green-400' : 'text-red-400'}`}>
              {connectionStatus.message}
            </p>
          )}
        </div>
      )}

      {/* Form */}
      {isFormOpen && (
        <div className="bg-[#151515] rounded-xl border border-gray-800/50 overflow-hidden">
          <div className="p-5 border-b border-gray-800/50">
            <h3 className="text-base font-medium text-white">
              {editingDevice ? 'Edit Device' : 'New Device'}
            </h3>
          </div>

          <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
            {/* Name */}
            <div>
              <label className="block text-xs text-gray-400 mb-2">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Desk Light"
                className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            {/* IP Address */}
            <div>
              <label className="block text-xs text-gray-400 mb-2">IP Address</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.ip_address}
                  onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                  placeholder="192.168.1.100"
                  className="flex-1 bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
                />
                <button
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
                >
                  {testingConnection ? '...' : 'Test'}
                </button>
              </div>
            </div>

            {/* Status */}
            {connectionStatus && (
              <div className={`p-3 rounded-lg text-xs ${
                connectionStatus.success
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
                {connectionStatus.message}
              </div>
            )}

            {/* Mode Toggle */}
            <div className="flex items-center justify-between py-3 border-t border-gray-800/50">
              <div>
                <p className="text-sm text-white">Advanced Mode</p>
                <p className="text-xs text-gray-500">Per-state colors and brightness</p>
              </div>
              <button
                onClick={() => {
                  const newMode = !advancedMode;
                  setAdvancedMode(newMode);
                  if (newMode && !formData.stateColors) {
                    setFormData({ ...formData, stateColors: { ...DEFAULT_STATE_COLORS } });
                  }
                }}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  advancedMode ? 'bg-purple-500' : 'bg-gray-700'
                }`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  advancedMode ? 'left-6' : 'left-1'
                }`} />
              </button>
            </div>

            {/* Simple Colors */}
            {!advancedMode && (
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
            )}

            {/* Advanced Settings */}
            {advancedMode && (
              <div className="space-y-5">
                <BrightnessSlider
                  label="Default Brightness"
                  value={formData.defaultBrightness}
                  onChange={(brightness) => setFormData({ ...formData, defaultBrightness: brightness })}
                  showPresets={false}
                />

                <TransitionTimeInput
                  label="Transition Time"
                  value={formData.transitionTime}
                  onChange={(time) => setFormData({ ...formData, transitionTime: time })}
                />

                <StateColorEditor
                  stateColors={formData.stateColors}
                  onChange={(stateColors) => setFormData({ ...formData, stateColors })}
                  onPreview={editingDevice ? handlePreviewColor : undefined}
                  onRestore={editingDevice ? handleRestoreState : undefined}
                  legacyMutedColor={formData.muted_color}
                  legacyUnmutedColor={formData.unmuted_color}
                />
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
              {isSaving ? 'Saving...' : editingDevice ? 'Update' : 'Add Device'}
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

      {/* Device List */}
      {!isFormOpen && devices.length > 0 && (
        <div className="space-y-3">
          {devices.map((device) => (
            <div
              key={device.id}
              className="bg-[#151515] rounded-xl p-4 border border-gray-800/50 hover:border-gray-700/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex gap-1">
                    <div
                      className="w-6 h-6 rounded"
                      style={{ backgroundColor: device.unmuted_color }}
                      title="Unmuted"
                    />
                    <div
                      className="w-6 h-6 rounded"
                      style={{ backgroundColor: device.muted_color }}
                      title="Muted"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{device.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{device.ip_address}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(device)}
                    className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(device)}
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
      {!isFormOpen && devices.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-400">No devices yet</p>
          <p className="text-xs text-gray-600 mt-1">Add a device to get started</p>
        </div>
      )}
    </div>
  );
}
