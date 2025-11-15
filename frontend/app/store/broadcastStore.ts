import { create } from 'zustand';
import apiClient from '../services/api';

interface Broadcast {
  id: string;
  title: string;
  description?: string;
  hostId: string;
  host: {
    id: string;
    username: string;
    displayName: string;
    avatar?: string;
  };
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  scheduledStartTime?: string;
  actualStartTime?: string;
  endTime?: string;
  currentListenerCount: number;
  peakListenerCount: number;
  coverImage?: string;
  chatEnabled: boolean;
  reactionsEnabled: boolean;
  raiseHandEnabled: boolean;
}

interface BroadcastState {
  liveBroadcasts: Broadcast[];
  upcomingBroadcasts: Broadcast[];
  pastBroadcasts: Broadcast[];
  currentBroadcast: Broadcast | null;
  isLoading: boolean;
  error: string | null;

  fetchLiveBroadcasts: () => Promise<void>;
  fetchUpcomingBroadcasts: () => Promise<void>;
  fetchPastBroadcasts: () => Promise<void>;
  fetchBroadcast: (id: string) => Promise<void>;
  createBroadcast: (data: any) => Promise<Broadcast>;
  updateBroadcast: (id: string, data: any) => Promise<void>;
  startBroadcast: (id: string) => Promise<void>;
  endBroadcast: (id: string) => Promise<void>;
  setCurrentBroadcast: (broadcast: Broadcast | null) => void;
  clearError: () => void;
}

export const useBroadcastStore = create<BroadcastState>((set, get) => ({
  liveBroadcasts: [],
  upcomingBroadcasts: [],
  pastBroadcasts: [],
  currentBroadcast: null,
  isLoading: false,
  error: null,

  fetchLiveBroadcasts: async () => {
    try {
      set({ isLoading: true, error: null });
      const broadcasts = await apiClient.getLiveBroadcasts();
      set({ liveBroadcasts: broadcasts, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.error || 'Failed to fetch live broadcasts',
        isLoading: false
      });
    }
  },

  fetchUpcomingBroadcasts: async () => {
    try {
      set({ isLoading: true, error: null });
      const broadcasts = await apiClient.getUpcomingBroadcasts();
      set({ upcomingBroadcasts: broadcasts, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.error || 'Failed to fetch upcoming broadcasts',
        isLoading: false
      });
    }
  },

  fetchPastBroadcasts: async () => {
    try {
      set({ isLoading: true, error: null });
      const { broadcasts } = await apiClient.getPastBroadcasts();
      set({ pastBroadcasts: broadcasts, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.error || 'Failed to fetch past broadcasts',
        isLoading: false
      });
    }
  },

  fetchBroadcast: async (id: string) => {
    try {
      set({ isLoading: true, error: null });
      const broadcast = await apiClient.getBroadcast(id);
      set({ currentBroadcast: broadcast, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.error || 'Failed to fetch broadcast',
        isLoading: false
      });
    }
  },

  createBroadcast: async (data: any) => {
    try {
      set({ isLoading: true, error: null });
      const broadcast = await apiClient.createBroadcast(data);
      set({ isLoading: false });
      return broadcast;
    } catch (error: any) {
      set({
        error: error.response?.data?.error || 'Failed to create broadcast',
        isLoading: false
      });
      throw error;
    }
  },

  updateBroadcast: async (id: string, data: any) => {
    try {
      set({ isLoading: true, error: null });
      const broadcast = await apiClient.updateBroadcast(id, data);
      if (get().currentBroadcast?.id === id) {
        set({ currentBroadcast: broadcast });
      }
      set({ isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.error || 'Failed to update broadcast',
        isLoading: false
      });
      throw error;
    }
  },

  startBroadcast: async (id: string) => {
    try {
      set({ isLoading: true, error: null });
      const broadcast = await apiClient.startBroadcast(id);
      set({ currentBroadcast: broadcast, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.error || 'Failed to start broadcast',
        isLoading: false
      });
      throw error;
    }
  },

  endBroadcast: async (id: string) => {
    try {
      set({ isLoading: true, error: null });
      const broadcast = await apiClient.endBroadcast(id);
      set({ currentBroadcast: broadcast, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.error || 'Failed to end broadcast',
        isLoading: false
      });
      throw error;
    }
  },

  setCurrentBroadcast: (broadcast: Broadcast | null) => {
    set({ currentBroadcast: broadcast });
  },

  clearError: () => set({ error: null })
}));
