import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../services/api';

interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: 'admin' | 'host' | 'listener';
  avatar?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  login: async (email, password) => {
    try {
      set({ isLoading: true, error: null });
      const data = await apiClient.login(email, password);
      set({
        user: data.user,
        isAuthenticated: true,
        isLoading: false
      });
    } catch (error: any) {
      set({
        error: error.response?.data?.error || 'Login failed',
        isLoading: false
      });
      throw error;
    }
  },

  register: async (data) => {
    try {
      set({ isLoading: true, error: null });
      const response = await apiClient.register(data);
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false
      });
    } catch (error: any) {
      set({
        error: error.response?.data?.error || 'Registration failed',
        isLoading: false
      });
      throw error;
    }
  },

  logout: async () => {
    try {
      await apiClient.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      set({
        user: null,
        isAuthenticated: false,
        error: null
      });
    }
  },

  loadUser: async () => {
    try {
      set({ isLoading: true });
      const token = await AsyncStorage.getItem('accessToken');

      if (!token) {
        set({ isLoading: false, isAuthenticated: false });
        return;
      }

      const user = await apiClient.getMe();
      set({
        user,
        isAuthenticated: true,
        isLoading: false
      });
    } catch (error) {
      console.error('Load user error:', error);
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false
      });
    }
  },

  clearError: () => set({ error: null })
}));
