import axios from 'axios';
import type { ApiResponse, AuthTokens, User } from '../../../shared/types';

// Relative by default so the Vite dev proxy handles it; set VITE_API_URL
// (e.g. http://localhost:3001/api) to talk to the backend directly.
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3002';

// Create axios instance
export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Token management
let accessToken: string | null = localStorage.getItem('accessToken');
let refreshToken: string | null = localStorage.getItem('refreshToken');

// Request interceptor to add auth header
api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Single-flight refresh: when the access token expires, a page load fires
// many parallel requests that ALL 401 at once. Each racing its own refresh
// is what used to log users out on reload (the losers' failures wiped the
// session). All 401 handlers now await one shared refresh promise.
let refreshInFlight: Promise<AuthTokens | null> | null = null;

function refreshSession(): Promise<AuthTokens | null> {
  if (!refreshInFlight) {
    // Bare axios (not `api`): no auth header, no interceptor recursion
    refreshInFlight = axios
      .post<ApiResponse<AuthTokens>>(`${API_BASE_URL}/auth/refresh`, { refreshToken })
      .then((response) =>
        response.data.success && response.data.data ? response.data.data : null
      )
      .catch((err) => {
        // Only a definitive rejection means the session is dead; a network
        // blip or server restart should NOT log the user out
        if (err.response?.status === 401 || err.response?.status === 403) {
          return null;
        }
        throw err;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

// Response interceptor for token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry && refreshToken) {
      originalRequest._retry = true;

      try {
        const tokens = await refreshSession();
        if (tokens) {
          setTokens(tokens);
          originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`;
          return api(originalRequest);
        }
        // Refresh definitively rejected: session is over
        clearTokens();
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      } catch (refreshError) {
        // Transient failure (network/restart): keep tokens, surface the
        // original error and let the caller/user retry
      }
    }

    return Promise.reject(error);
  }
);

// Token helpers
export function setTokens(tokens: AuthTokens) {
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  localStorage.setItem('accessToken', tokens.accessToken);
  localStorage.setItem('refreshToken', tokens.refreshToken);
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

export function getTokens() {
  return { accessToken, refreshToken };
}

// Auth API
export const authApi = {
  async register(email: string, password: string) {
    const response = await api.post<ApiResponse<{ user: User }>>('/auth/register', {
      email,
      password,
    });
    return response.data;
  },

  async login(email: string, password: string) {
    const response = await api.post<ApiResponse<AuthTokens>>('/auth/login', {
      email,
      password,
    });
    if (response.data.success && response.data.data) {
      setTokens(response.data.data);
    }
    return response.data;
  },

  async logout() {
    const tokens = getTokens();
    if (tokens.refreshToken) {
      await api.post('/auth/logout', { refreshToken: tokens.refreshToken });
    }
    clearTokens();
  },

  async getCurrentUser() {
    const response = await api.get<ApiResponse<{ user: User }>>('/auth/me');
    return response.data;
  },
};

// WebSocket client
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  private intentionalClose = false;

  connect() {
    if (
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    this.intentionalClose = false;

    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.authenticate();
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.emit(message.type, message.payload);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  private authenticate() {
    const { accessToken } = getTokens();
    if (accessToken && this.ws?.readyState === WebSocket.OPEN) {
      // The server expects the token at the top level: { type: 'auth', token }
      this.ws.send(JSON.stringify({ type: 'auth', token: accessToken }));
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => this.connect(), 5000);
  }

  send(type: string, payload: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function) {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: any) {
    this.listeners.get(event)?.forEach((callback) => callback(data));
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.ws?.close();
  }
}

export const wsClient = new WebSocketClient();