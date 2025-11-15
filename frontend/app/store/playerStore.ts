import { create } from 'zustand';

interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatar?: string;
  message: string;
  replyToId?: string;
  createdAt: string;
}

interface Reaction {
  userId: string;
  username: string;
  emoji: string;
  timestamp: string;
}

interface PlayerState {
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  isHandRaised: boolean;
  isHost: boolean;
  isRecording: boolean;
  listenerCount: number;
  chatMessages: ChatMessage[];
  reactions: Reaction[];
  audioTrack: MediaStreamTrack | null;

  setPlaying: (playing: boolean) => void;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
  setHandRaised: (raised: boolean) => void;
  setHost: (isHost: boolean) => void;
  setRecording: (recording: boolean) => void;
  setListenerCount: (count: number) => void;
  addChatMessage: (message: ChatMessage) => void;
  addReaction: (reaction: Reaction) => void;
  setAudioTrack: (track: MediaStreamTrack | null) => void;
  clearReactions: () => void;
  reset: () => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  isPlaying: false,
  isMuted: false,
  volume: 1.0,
  isHandRaised: false,
  isHost: false,
  isRecording: false,
  listenerCount: 0,
  chatMessages: [],
  reactions: [],
  audioTrack: null,

  setPlaying: (playing) => set({ isPlaying: playing }),
  setMuted: (muted) => set({ isMuted: muted }),
  setVolume: (volume) => set({ volume }),
  setHandRaised: (raised) => set({ isHandRaised: raised }),
  setHost: (isHost) => set({ isHost }),
  setRecording: (recording) => set({ isRecording: recording }),
  setListenerCount: (count) => set({ listenerCount: count }),

  addChatMessage: (message) =>
    set((state) => ({
      chatMessages: [...state.chatMessages, message]
    })),

  addReaction: (reaction) =>
    set((state) => ({
      reactions: [...state.reactions, reaction]
    })),

  setAudioTrack: (track) => set({ audioTrack: track }),

  clearReactions: () => set({ reactions: [] }),

  reset: () =>
    set({
      isPlaying: false,
      isMuted: false,
      volume: 1.0,
      isHandRaised: false,
      isHost: false,
      isRecording: false,
      listenerCount: 0,
      chatMessages: [],
      reactions: [],
      audioTrack: null
    })
}));
