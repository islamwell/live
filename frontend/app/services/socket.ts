import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SOCKET_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

class SocketService {
  private socket: Socket | null = null;
  private eventHandlers: Map<string, Function[]> = new Map();

  async connect() {
    const token = await AsyncStorage.getItem('accessToken');

    if (!token) {
      throw new Error('No access token found');
    }

    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    this.setupEventHandlers();

    return new Promise((resolve, reject) => {
      this.socket!.on('connect', () => {
        console.log('Socket connected');
        resolve(this.socket);
      });

      this.socket!.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        reject(error);
      });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  private setupEventHandlers() {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      this.emit('connection', { status: 'connected' });
    });

    this.socket.on('disconnect', () => {
      this.emit('connection', { status: 'disconnected' });
    });

    this.socket.on('reconnect', () => {
      this.emit('connection', { status: 'reconnected' });
    });

    // Broadcast events
    this.socket.on('joined', (data) => {
      this.emit('joined', data);
    });

    this.socket.on('userJoined', (data) => {
      this.emit('userJoined', data);
    });

    this.socket.on('userLeft', (data) => {
      this.emit('userLeft', data);
    });

    // Chat and reactions
    this.socket.on('chatMessage', (data) => {
      this.emit('chatMessage', data);
    });

    this.socket.on('reaction', (data) => {
      this.emit('reaction', data);
    });

    // Moderation
    this.socket.on('handRaised', (data) => {
      this.emit('handRaised', data);
    });

    this.socket.on('handLowered', (data) => {
      this.emit('handLowered', data);
    });

    this.socket.on('muted', (data) => {
      this.emit('muted', data);
    });

    this.socket.on('removed', (data) => {
      this.emit('removed', data);
    });

    // Typing indicator
    this.socket.on('userTyping', (data) => {
      this.emit('userTyping', data);
    });

    // Errors
    this.socket.on('error', (error) => {
      this.emit('error', error);
    });
  }

  // Join a broadcast
  joinBroadcast(broadcastId: string) {
    if (!this.socket) {
      throw new Error('Socket not connected');
    }
    this.socket.emit('join', { broadcastId });
  }

  // Leave a broadcast
  leaveBroadcast(broadcastId: string) {
    if (!this.socket) return;
    this.socket.emit('leave', { broadcastId });
  }

  // Send chat message
  sendChatMessage(broadcastId: string, message: string, replyToId?: string) {
    if (!this.socket) {
      throw new Error('Socket not connected');
    }
    this.socket.emit('chatMessage', { broadcastId, message, replyToId });
  }

  // Send reaction
  sendReaction(broadcastId: string, emoji: string) {
    if (!this.socket) {
      throw new Error('Socket not connected');
    }
    this.socket.emit('reaction', { broadcastId, emoji });
  }

  // Raise hand
  raiseHand(broadcastId: string) {
    if (!this.socket) {
      throw new Error('Socket not connected');
    }
    this.socket.emit('raiseHand', { broadcastId });
  }

  // Lower hand
  lowerHand(broadcastId: string) {
    if (!this.socket) {
      throw new Error('Socket not connected');
    }
    this.socket.emit('lowerHand', { broadcastId });
  }

  // Typing indicator
  setTyping(broadcastId: string, isTyping: boolean) {
    if (!this.socket) return;
    this.socket.emit('typing', { broadcastId, isTyping });
  }

  // Event emitter
  on(event: string, callback: Function) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(callback);
  }

  off(event: string, callback: Function) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(callback);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  isConnected() {
    return this.socket?.connected || false;
  }
}

export default new SocketService();
