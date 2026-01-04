import { create } from 'zustand';
import { authApi } from '../lib/api';
import type { User } from '../../../shared/types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.login(email, password);
      if (response.success) {
        // Fetch user data after successful login
        const userResponse = await authApi.getCurrentUser();
        if (userResponse.success && userResponse.data) {
          set({
            user: userResponse.data.user,
            isAuthenticated: true,
            isLoading: false,
          });
        }
      } else {
        set({ error: response.error || 'Login failed', isLoading: false });
      }
    } catch (error: any) {
      set({
        error: error.response?.data?.error || 'An error occurred',
        isLoading: false,
      });
    }
  },

  register: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.register(email, password);
      if (response.success) {
        // Auto-login after registration
        await authApi.login(email, password);
        const userResponse = await authApi.getCurrentUser();
        if (userResponse.success && userResponse.data) {
          set({
            user: userResponse.data.user,
            isAuthenticated: true,
            isLoading: false,
          });
        }
      } else {
        set({ error: response.error || 'Registration failed', isLoading: false });
      }
    } catch (error: any) {
      set({
        error: error.response?.data?.error || 'An error occurred',
        isLoading: false,
      });
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await authApi.logout();
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('Logout error:', error);
      // Even if logout fails, clear local state
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  checkAuth: async () => {
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
      set({ isAuthenticated: false, isLoading: false });
      return;
    }

    set({ isLoading: true });
    try {
      const response = await authApi.getCurrentUser();
      if (response.success && response.data) {
        set({
          user: response.data.user,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        set({ isAuthenticated: false, isLoading: false });
      }
    } catch (error) {
      set({ isAuthenticated: false, isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));