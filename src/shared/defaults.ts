import type { VoiceState, StateColors, StateLightConfig, WledDevice, EffectConfig } from './types';

// Default state light configurations
export const DEFAULT_STATE_COLORS: StateColors = {
  idle: {
    color: '#333333',  // Dim gray - not in voice channel
    brightness: 50,
    enabled: false,    // Off by default when idle
  },
  connected: {
    color: '#22c55e',  // Green - in voice channel, unmuted
    brightness: 200,
    enabled: true,
  },
  speaking: {
    color: '#06b6d4',  // Cyan - actively talking
    brightness: 255,
    enabled: true,
  },
  muted: {
    color: '#ef4444',  // Red - muted
    brightness: 200,
    enabled: true,
  },
  deafened: {
    color: '#f97316',  // Orange - deafened (more severe)
    brightness: 200,
    enabled: true,
  },
  streaming: {
    color: '#a855f7',  // Purple - screen sharing
    brightness: 255,
    enabled: true,
  },
};

// Default brightness and transition values
export const DEFAULT_BRIGHTNESS = 255;
export const DEFAULT_TRANSITION_TIME = 0; // milliseconds

// Default effect configuration (Solid color, no animation)
export const DEFAULT_EFFECT_CONFIG: EffectConfig = {
  effectId: 0,    // 0 = Solid
  speed: 128,     // Medium speed (0-255)
  intensity: 128, // Medium intensity (0-255)
};

/**
 * Calculate the effective voice state based on Discord state
 * Priority order (highest to lowest):
 * streaming > deafened > muted > speaking > connected > idle
 */
export function calculateEffectiveState(discordState: {
  inVoiceChannel: boolean;
  streaming: boolean;
  deafened: boolean;
  muted: boolean;
  speaking: boolean;
}): VoiceState {
  if (!discordState.inVoiceChannel) return 'idle';
  if (discordState.streaming) return 'streaming';
  if (discordState.deafened) return 'deafened';
  if (discordState.muted) return 'muted';
  if (discordState.speaking) return 'speaking';
  return 'connected';
}

/**
 * Get the light configuration for a specific state
 * Resolution order: device config > legacy colors > defaults
 */
export function getStateLightConfig(
  state: VoiceState,
  device: WledDevice
): StateLightConfig {
  // Check device-level state colors
  if (device.stateColors?.[state]) {
    return device.stateColors[state];
  }

  // Fallback to legacy colors for muted/unmuted states
  if (state === 'muted' || state === 'deafened') {
    return {
      color: device.muted_color,
      brightness: device.defaultBrightness ?? DEFAULT_BRIGHTNESS,
      enabled: true,
    };
  }

  if (state === 'connected' || state === 'speaking') {
    return {
      color: device.unmuted_color,
      brightness: device.defaultBrightness ?? DEFAULT_BRIGHTNESS,
      enabled: true,
    };
  }

  // Use defaults for other states
  return {
    ...DEFAULT_STATE_COLORS[state],
    brightness: device.defaultBrightness ?? DEFAULT_STATE_COLORS[state].brightness,
  };
}

/**
 * Get brightness value with fallbacks
 */
export function getBrightness(device?: WledDevice): number {
  return device?.defaultBrightness ?? DEFAULT_BRIGHTNESS;
}

/**
 * Get transition time with fallbacks
 */
export function getTransitionTime(device?: WledDevice): number {
  return device?.transitionTime ?? DEFAULT_TRANSITION_TIME;
}

/**
 * Create initial state colors from legacy muted/unmuted colors
 */
export function migrateFromLegacyColors(mutedColor: string, unmutedColor: string): StateColors {
  return {
    idle: { ...DEFAULT_STATE_COLORS.idle },
    connected: {
      color: unmutedColor,
      brightness: DEFAULT_BRIGHTNESS,
      enabled: true,
    },
    speaking: {
      color: unmutedColor,
      brightness: DEFAULT_BRIGHTNESS,
      enabled: true,
    },
    muted: {
      color: mutedColor,
      brightness: DEFAULT_BRIGHTNESS,
      enabled: true,
    },
    deafened: {
      color: mutedColor,
      brightness: DEFAULT_BRIGHTNESS,
      enabled: true,
    },
    streaming: { ...DEFAULT_STATE_COLORS.streaming },
  };
}

/**
 * Check if device has multi-state configuration
 */
export function hasStateColors(device: WledDevice): boolean {
  return !!device.stateColors;
}
