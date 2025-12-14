import { useEffect, useCallback } from 'react';
import { useAppStore } from '../store/appStore';

export function useIPC() {
  const updateDiscordState = useAppStore((state) => state.updateDiscordState);

  // Setup IPC listeners
  useEffect(() => {
    // Full Discord state changes (includes inVoiceChannel, muted, deafened, etc.)
    const unsubStateChange = window.electronAPI.onDiscordStateChange((effectiveState, fullState) => {
      console.log('Discord state changed:', effectiveState, fullState);
      updateDiscordState(fullState);
    });

    // Legacy: Discord mute state changes (for backwards compatibility)
    const unsubMute = window.electronAPI.onMuteStateChange((isMuted) => {
      updateDiscordState({ muted: isMuted });
    });

    // Discord connection changes
    const unsubConnection = window.electronAPI.onDiscordConnectionChange((connected) => {
      updateDiscordState({ connected });
    });

    // Device status changes
    const unsubDevice = window.electronAPI.onDeviceStatusChange((status) => {
      console.log('Device status changed:', status);
    });

    return () => {
      unsubStateChange();
      unsubMute();
      unsubConnection();
      unsubDevice();
    };
  }, [updateDiscordState]);

  // IPC action helpers
  const getDevices = useCallback(async () => {
    return window.electronAPI.getDevices();
  }, []);

  const getZones = useCallback(async () => {
    return window.electronAPI.getZones();
  }, []);

  const getSettings = useCallback(async () => {
    return window.electronAPI.getSettings();
  }, []);

  const updateSettings = useCallback(async (settings: any) => {
    return window.electronAPI.updateSettings(settings);
  }, []);

  const getDiscordStatus = useCallback(async () => {
    return window.electronAPI.getDiscordStatus();
  }, []);

  return {
    getDevices,
    getZones,
    getSettings,
    updateSettings,
    getDiscordStatus,
  };
}
