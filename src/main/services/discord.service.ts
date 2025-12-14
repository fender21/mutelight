import { Client as DiscordRPCClient } from '@xhayper/discord-rpc';
import { OAuth2Scopes, Routes } from 'discord-api-types/v10';
import { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_RECONNECT_DELAY, DISCORD_MAX_RECONNECT_ATTEMPTS } from '@shared/constants';
import type { DiscordState, VoiceState } from '@shared/types';
import { calculateEffectiveState } from '@shared/defaults';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

// Redirect URI for OAuth - must be configured in Discord Developer Portal
const OAUTH_REDIRECT_URI = 'http://127.0.0.1';

class DiscordService extends EventEmitter {
  private client: DiscordRPCClient;
  private connected = false;
  private currentState: DiscordState = {
    connected: false,
    muted: false,
    deafened: false,
    speaking: false,
    streaming: false,
    inVoiceChannel: false,
    lastUpdate: Date.now(),
  };
  private lastEffectiveState: VoiceState = 'idle';
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private pollingInterval?: NodeJS.Timeout;
  private currentChannelId?: string;
  private speakingSubscribed = false;
  private speakingUnsubscribers: Array<{ unsubscribe: () => void }> = [];

  constructor() {
    super();
    // Initialize with clientSecret for OAuth if available
    this.client = new DiscordRPCClient({
      clientId: DISCORD_CLIENT_ID,
      clientSecret: DISCORD_CLIENT_SECRET || undefined,
    });
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('ready', async () => {
      logger.info('Discord RPC connected');
      this.connected = true;
      this.reconnectAttempts = 0;
      this.currentState.connected = true;
      this.emit('connected');

      // ALWAYS start polling as primary detection method
      // Polling is more reliable than event subscription
      this.startPolling();

      // Optionally try event subscriptions for lower latency (enhancement only)
      // Note: Discord RPC events can be unreliable and may never fire
      await this.subscribeToEvents();
    });

    this.client.on('disconnected', () => {
      logger.warn('Discord RPC disconnected');
      this.connected = false;
      this.currentState.connected = false;
      this.emit('disconnected');

      // Stop polling
      if (this.pollingInterval) {
        clearInterval(this.pollingInterval);
        this.pollingInterval = undefined;
      }

      // Attempt reconnection
      this.scheduleReconnect();
    });
  }

  /**
   * Subscribe to Discord RPC events for lower latency detection
   * These are optional enhancements - polling is the primary detection method
   */
  private async subscribeToEvents(): Promise<void> {
    // Subscribe to voice settings updates
    try {
      await this.client.subscribe('VOICE_SETTINGS_UPDATE', (data: any) => {
        logger.debug('Voice settings update received via event:', data);
        if (data) {
          this.handleVoiceStateUpdate({
            mute: data.mute || false,
            deaf: data.deaf || false,
            self_mute: data.mute || false,
            self_deaf: data.deaf || false,
          });
        }
      });
      logger.info('Subscribed to VOICE_SETTINGS_UPDATE events');
    } catch (error: any) {
      logger.warn('VOICE_SETTINGS_UPDATE subscription failed:', error.message);
    }

    // Subscribe to voice channel selection changes
    try {
      await this.client.subscribe('VOICE_CHANNEL_SELECT', (data: any) => {
        logger.debug('Voice channel select event:', data);
        const newChannelId = data?.channel_id;
        const inChannel = !!newChannelId;

        // Handle channel change for speaking subscriptions
        if (newChannelId !== this.currentChannelId) {
          this.handleChannelChange(newChannelId);
        }

        if (this.currentState.inVoiceChannel !== inChannel) {
          this.currentState.inVoiceChannel = inChannel;
          if (!inChannel) {
            // Reset states when leaving channel
            this.currentState.speaking = false;
            this.currentState.muted = false;
            this.currentState.deafened = false;
            this.currentState.streaming = false;
          }
          this.emitStateChanged();
        }
      });
      logger.info('Subscribed to VOICE_CHANNEL_SELECT events');
    } catch (error: any) {
      logger.warn('VOICE_CHANNEL_SELECT subscription failed:', error.message);
    }
  }

  /**
   * Handle voice channel change - subscribe/unsubscribe speaking events
   */
  private async handleChannelChange(newChannelId: string | undefined): Promise<void> {
    // Unsubscribe from old channel speaking events
    if (this.speakingUnsubscribers.length > 0) {
      try {
        for (const sub of this.speakingUnsubscribers) {
          sub.unsubscribe();
        }
        logger.info(`Unsubscribed from speaking events for channel ${this.currentChannelId}`);
      } catch (error: any) {
        logger.warn('Failed to unsubscribe speaking events:', error.message);
      }
      this.speakingUnsubscribers = [];
      this.speakingSubscribed = false;
    }

    this.currentChannelId = newChannelId;

    // Subscribe to new channel speaking events
    if (newChannelId) {
      await this.subscribeToSpeakingEvents(newChannelId);
    }
  }

  /**
   * Subscribe to speaking events for a specific channel
   * NOTE: Discord RPC SPEAKING_START/SPEAKING_STOP events only fire for OTHER users,
   * not for the local user. Self-speaking detection is not available via RPC.
   */
  private async subscribeToSpeakingEvents(channelId: string): Promise<void> {
    try {
      const startSub = await this.client.subscribe('SPEAKING_START', { channel_id: channelId });
      this.speakingUnsubscribers.push(startSub);

      // Listen for the event via the client's event emitter
      this.client.on('SPEAKING_START', (data: any) => {
        logger.debug('Speaking start event:', data);
        // Only track our own speaking state
        if (data?.user_id === this.client.user?.id) {
          this.handleSpeakingUpdate(true);
        }
      });
      logger.info(`Subscribed to SPEAKING_START for channel ${channelId}`);
    } catch (error: any) {
      logger.warn('SPEAKING_START subscription failed:', error.message);
    }

    try {
      const stopSub = await this.client.subscribe('SPEAKING_STOP', { channel_id: channelId });
      this.speakingUnsubscribers.push(stopSub);

      // Listen for the event via the client's event emitter
      this.client.on('SPEAKING_STOP', (data: any) => {
        logger.debug('Speaking stop event:', data);
        // Only track our own speaking state
        if (data?.user_id === this.client.user?.id) {
          this.handleSpeakingUpdate(false);
        }
      });
      logger.info(`Subscribed to SPEAKING_STOP for channel ${channelId}`);
      this.speakingSubscribed = true;
    } catch (error: any) {
      logger.warn('SPEAKING_STOP subscription failed:', error.message);
    }
  }

  /**
   * Polling approach to check voice state
   * Try multiple methods to get voice/mute state
   */
  private startPolling(interval = 500): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    this.pollingInterval = setInterval(async () => {
      if (!this.connected || !this.client.user) return;

      try {
        // Check if user is in a voice channel
        let inVoiceChannel = false;
        let isStreaming = false;
        let channelId: string | undefined;

        try {
          const voiceChannelResponse = await this.client.request('GET_SELECTED_VOICE_CHANNEL');
          if (voiceChannelResponse?.data?.id) {
            inVoiceChannel = true;
            channelId = voiceChannelResponse.data.id;
            // Check voice states for streaming status
            const voiceStates = voiceChannelResponse.data.voice_states || [];
            const userState = voiceStates.find((vs: any) => vs.user?.id === this.client.user?.id);
            if (userState) {
              // Log full user state once to understand available data
              if (!this.currentState.inVoiceChannel) {
                logger.debug('User voice state structure:', JSON.stringify(userState, null, 2));
              }
              // Check for streaming (self_stream in voice_state)
              isStreaming = userState.voice_state?.self_stream || false;
            }
          }
        } catch (e: any) {
          // Not in a voice channel
          inVoiceChannel = false;
        }

        // Update voice channel state and subscribe to speaking events if needed
        if (this.currentState.inVoiceChannel !== inVoiceChannel) {
          this.currentState.inVoiceChannel = inVoiceChannel;
          logger.info(`Voice channel state: ${inVoiceChannel ? 'IN CHANNEL' : 'NOT IN CHANNEL'}`);
        }

        // Subscribe to speaking events for the channel if we haven't already
        if (channelId && channelId !== this.currentChannelId) {
          await this.handleChannelChange(channelId);
        } else if (!channelId && this.currentChannelId) {
          await this.handleChannelChange(undefined);
        }

        // Update streaming state
        if (this.currentState.streaming !== isStreaming) {
          this.currentState.streaming = isStreaming;
          logger.info(`Streaming state: ${isStreaming ? 'STREAMING' : 'NOT STREAMING'}`);
        }

        // If not in voice channel, reset states
        if (!inVoiceChannel) {
          this.handleVoiceStateUpdate({
            mute: false,
            deaf: false,
            self_mute: false,
            self_deaf: false,
            inVoiceChannel: false,
          });
          return;
        }

        // Try GET_VOICE_SETTINGS RPC command directly
        const response = await this.client.request('GET_VOICE_SETTINGS');

        if (response?.data) {
          const data = response.data;
          logger.debug('Voice settings response:', JSON.stringify(data));
          this.handleVoiceStateUpdate({
            mute: data.mute || false,
            deaf: data.deaf || false,
            self_mute: data.mute || false,
            self_deaf: data.deaf || false,
            inVoiceChannel: true,
          });
        }
      } catch (error: any) {
        // Only log non-common errors
        const errorMsg = error.message || String(error);
        if (!errorMsg.includes('Not in a voice channel') &&
            !errorMsg.includes('Not authenticated') &&
            error.code !== 5000) {
          logger.debug('Error polling voice state:', errorMsg);
        }

        // Reset states if we can't read voice settings
        if (this.currentState.muted !== false || this.currentState.inVoiceChannel !== false) {
          this.currentState.muted = false;
          this.currentState.deafened = false;
          this.currentState.inVoiceChannel = false;
          this.currentState.speaking = false;
          this.currentState.streaming = false;
          this.currentState.lastUpdate = Date.now();
          this.emitStateChanged();
        }
      }
    }, interval);

    logger.info(`Started polling Discord voice state (${interval}ms interval)`);
  }

  /**
   * Handle voice state update
   */
  private handleVoiceStateUpdate(data: any): void {
    const wasMuted = this.currentState.muted;
    const wasInChannel = this.currentState.inVoiceChannel;

    // Check both self_mute/self_deaf (user controlled) and mute/deaf (server controlled)
    const isMuted = data.self_mute || data.mute || false;
    const isDeafened = data.self_deaf || data.deaf || false;
    const inVoiceChannel = data.inVoiceChannel ?? this.currentState.inVoiceChannel;

    this.currentState.muted = isMuted;
    this.currentState.deafened = isDeafened;
    this.currentState.inVoiceChannel = inVoiceChannel;
    this.currentState.lastUpdate = Date.now();

    logger.debug('Voice state updated', {
      muted: isMuted,
      deafened: isDeafened,
      inVoiceChannel,
      speaking: this.currentState.speaking,
      streaming: this.currentState.streaming,
    });

    // Emit legacy muteStateChanged for backward compatibility
    const newMuted = isMuted || isDeafened;
    if (wasMuted !== newMuted) {
      logger.info(`Mute state changed: ${newMuted ? 'MUTED' : 'UNMUTED'}`);
      this.emit('muteStateChanged', newMuted);
    }

    // Always emit state changed to update effective state
    this.emitStateChanged();
  }

  /**
   * Handle speaking state update
   */
  private handleSpeakingUpdate(speaking: boolean): void {
    if (this.currentState.speaking !== speaking) {
      this.currentState.speaking = speaking;
      this.currentState.lastUpdate = Date.now();
      logger.info(`Speaking state: ${speaking ? 'SPEAKING' : 'STOPPED'}`);
      this.emitStateChanged();
    }
  }

  /**
   * Emit the stateChanged event with effective state
   */
  private emitStateChanged(): void {
    const effectiveState = calculateEffectiveState(this.currentState);

    // Only emit if effective state actually changed
    if (effectiveState !== this.lastEffectiveState) {
      logger.info(`Effective state changed: ${this.lastEffectiveState} -> ${effectiveState}`);
      this.lastEffectiveState = effectiveState;
      this.emit('stateChanged', effectiveState, { ...this.currentState });
    }
  }

  /**
   * Get current effective voice state
   */
  getEffectiveState(): VoiceState {
    return calculateEffectiveState(this.currentState);
  }

  /**
   * Update polling interval (from settings)
   */
  updatePollingInterval(interval: number): void {
    if (this.pollingInterval) {
      this.startPolling(interval);
    }
  }

  /**
   * Connect to Discord
   */
  async connect(): Promise<boolean> {
    logger.info('Attempting to connect to Discord RPC...');
    try {
      // Check if we have a client secret for OAuth
      if (DISCORD_CLIENT_SECRET) {
        // Manual OAuth flow with redirect_uri
        logger.info('Using OAuth with rpc.voice.read scope...');

        // Step 1: Connect to IPC
        await this.client.connect();
        logger.info('Connected to Discord IPC');

        // Step 2: Send AUTHORIZE request (RPC flow - no redirect_uri here)
        // Note: redirect_uri is NOT sent in RPC AUTHORIZE, but IS needed for token exchange
        const scopes = [OAuth2Scopes.RPC, OAuth2Scopes.RPCVoiceRead];
        const authorizeResponse = await this.client.request('AUTHORIZE', {
          scopes,
          client_id: DISCORD_CLIENT_ID,
          prompt: 'consent',
        });

        const code = authorizeResponse?.data?.code;
        if (!code) {
          throw new Error('No authorization code received from Discord');
        }
        logger.info('Received authorization code');

        // Step 3: Exchange code for token (with redirect_uri)
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: DISCORD_CLIENT_ID,
            client_secret: DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: OAUTH_REDIRECT_URI,
          }),
        });

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          throw new Error(`Token exchange failed: ${tokenResponse.status} ${errorText}`);
        }

        const tokenData = await tokenResponse.json();
        logger.info('Token exchange successful');

        // Step 4: Authenticate with the access token
        await this.client.request('AUTHENTICATE', {
          access_token: tokenData.access_token,
        });

        logger.info('Discord RPC OAuth authentication completed');

        // Step 5: Manually trigger post-auth setup (since we bypassed login())
        this.connected = true;
        this.reconnectAttempts = 0;
        this.currentState.connected = true;
        this.emit('connected');

        // Start polling for voice state
        this.startPolling();

        // Try event subscriptions as enhancement
        await this.subscribeToEvents();
      } else {
        // Basic connection without OAuth (limited functionality)
        logger.warn('No client secret configured - voice settings access will be limited');
        logger.warn('Add DISCORD_CLIENT_SECRET to constants.ts for full functionality');
        await this.client.login();
        logger.info('Discord RPC basic login completed');
      }
      return true;
    } catch (error: any) {
      logger.error('Failed to connect to Discord RPC:', error.message);
      this.scheduleReconnect();
      return false;
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= DISCORD_MAX_RECONNECT_ATTEMPTS) {
      logger.error('Max reconnection attempts reached');
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = DISCORD_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    logger.info(`Scheduling Discord reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Get current Discord state
   */
  getState(): DiscordState {
    return { ...this.currentState };
  }

  /**
   * Check if currently muted
   */
  isMuted(): boolean {
    return this.currentState.muted;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    if (this.connected) {
      await this.client.destroy();
    }

    this.connected = false;
    this.currentState.connected = false;
  }
}

export const discordService = new DiscordService();
