const { Server } = require('socket.io');
const authService = require('../auth/authService');
const { Session, Broadcast, ChatMessage, Reaction, User } = require('../models');
const broadcastService = require('../broadcasts/broadcastService');
const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined
});

class SocketGateway {
  constructor() {
    this.io = null;
    this.activeSessions = new Map(); // socketId -> session info
  }

  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST']
      },
      transports: ['websocket', 'polling']
    });

    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.query.token;

        if (!token) {
          return next(new Error('Authentication required'));
        }

        const user = await authService.getUserFromToken(token);
        socket.user = user;
        next();
      } catch (error) {
        next(new Error('Invalid token'));
      }
    });

    this.io.on('connection', (socket) => {
      console.log(`User connected: ${socket.user.username} (${socket.id})`);

      this.handleConnection(socket);
      this.setupEventHandlers(socket);
    });

    console.log('Socket.IO gateway initialized');
  }

  handleConnection(socket) {
    socket.on('disconnect', () => {
      this.handleDisconnect(socket);
    });
  }

  setupEventHandlers(socket) {
    // Broadcast session management
    socket.on('join', (data) => this.handleJoin(socket, data));
    socket.on('leave', (data) => this.handleLeave(socket, data));

    // WebRTC signaling
    socket.on('publishOffer', (data) => this.handlePublishOffer(socket, data));
    socket.on('publishAnswer', (data) => this.handlePublishAnswer(socket, data));
    socket.on('subscribeRequest', (data) => this.handleSubscribeRequest(socket, data));
    socket.on('iceCandidate', (data) => this.handleIceCandidate(socket, data));

    // Chat and reactions
    socket.on('chatMessage', (data) => this.handleChatMessage(socket, data));
    socket.on('reaction', (data) => this.handleReaction(socket, data));

    // Moderation
    socket.on('raiseHand', (data) => this.handleRaiseHand(socket, data));
    socket.on('lowerHand', (data) => this.handleLowerHand(socket, data));
    socket.on('muteUser', (data) => this.handleMuteUser(socket, data));
    socket.on('removeUser', (data) => this.handleRemoveUser(socket, data));

    // Presence
    socket.on('typing', (data) => this.handleTyping(socket, data));
  }

  async handleJoin(socket, data) {
    try {
      const { broadcastId } = data;

      // Get broadcast
      const broadcast = await Broadcast.findByPk(broadcastId);

      if (!broadcast) {
        socket.emit('error', { message: 'Broadcast not found' });
        return;
      }

      // Check if broadcast is live or scheduled
      if (broadcast.status === 'ended') {
        socket.emit('error', { message: 'Broadcast has ended' });
        return;
      }

      // Check if user is the host
      const isHost = broadcast.hostId === socket.user.id;
      const role = isHost ? 'host' : 'listener';

      // Create session
      const session = await Session.create({
        broadcastId,
        userId: socket.user.id,
        role,
        socketId: socket.id,
        status: 'connected',
        ipAddress: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent']
      });

      this.activeSessions.set(socket.id, {
        sessionId: session.id,
        broadcastId,
        userId: socket.user.id,
        role
      });

      // Join socket room
      socket.join(`broadcast:${broadcastId}`);

      // Update listener count
      const sessionCount = await Session.count({
        where: { broadcastId, status: 'connected' }
      });

      await broadcastService.updateListenerCount(broadcastId, sessionCount);

      // Store in Redis for presence
      await redis.sadd(`broadcast:${broadcastId}:users`, socket.user.id);
      await redis.set(`user:${socket.user.id}:socket`, socket.id, 'EX', 3600);

      // Notify others in the room
      socket.to(`broadcast:${broadcastId}`).emit('userJoined', {
        userId: socket.user.id,
        username: socket.user.username,
        displayName: socket.user.displayName,
        role,
        listenerCount: sessionCount
      });

      // Send confirmation to user
      socket.emit('joined', {
        sessionId: session.id,
        broadcastId,
        role,
        listenerCount: sessionCount,
        broadcast: {
          id: broadcast.id,
          title: broadcast.title,
          status: broadcast.status,
          chatEnabled: broadcast.chatEnabled,
          reactionsEnabled: broadcast.reactionsEnabled,
          raiseHandEnabled: broadcast.raiseHandEnabled
        }
      });

      console.log(`User ${socket.user.username} joined broadcast ${broadcastId} as ${role}`);
    } catch (error) {
      console.error('Error handling join:', error);
      socket.emit('error', { message: error.message });
    }
  }

  async handleLeave(socket, data) {
    try {
      const sessionInfo = this.activeSessions.get(socket.id);

      if (!sessionInfo) {
        return;
      }

      const { sessionId, broadcastId, userId } = sessionInfo;

      // Update session
      await Session.update(
        { status: 'disconnected', leftAt: new Date() },
        { where: { id: sessionId } }
      );

      // Remove from Redis
      await redis.srem(`broadcast:${broadcastId}:users`, userId);
      await redis.del(`user:${userId}:socket`);

      // Leave socket room
      socket.leave(`broadcast:${broadcastId}`);

      // Update listener count
      const sessionCount = await Session.count({
        where: { broadcastId, status: 'connected' }
      });

      await broadcastService.updateListenerCount(broadcastId, sessionCount);

      // Notify others
      socket.to(`broadcast:${broadcastId}`).emit('userLeft', {
        userId,
        listenerCount: sessionCount
      });

      this.activeSessions.delete(socket.id);

      console.log(`User ${socket.user.username} left broadcast ${broadcastId}`);
    } catch (error) {
      console.error('Error handling leave:', error);
    }
  }

  async handleDisconnect(socket) {
    console.log(`User disconnected: ${socket.user.username} (${socket.id})`);
    await this.handleLeave(socket, {});
  }

  async handlePublishOffer(socket, data) {
    try {
      const { broadcastId, sdp } = data;
      const sessionInfo = this.activeSessions.get(socket.id);

      if (!sessionInfo || sessionInfo.role !== 'host') {
        socket.emit('error', { message: 'Only host can publish' });
        return;
      }

      // Forward to mediasoup handler or save for WebRTC negotiation
      socket.emit('publishAccepted', { sdp });

      console.log(`Host publish offer for broadcast ${broadcastId}`);
    } catch (error) {
      console.error('Error handling publish offer:', error);
      socket.emit('error', { message: error.message });
    }
  }

  async handlePublishAnswer(socket, data) {
    try {
      const { sdp } = data;
      socket.emit('publishComplete', { sdp });
    } catch (error) {
      console.error('Error handling publish answer:', error);
    }
  }

  async handleSubscribeRequest(socket, data) {
    try {
      const { broadcastId } = data;
      const sessionInfo = this.activeSessions.get(socket.id);

      if (!sessionInfo) {
        socket.emit('error', { message: 'Not in broadcast' });
        return;
      }

      // Forward to mediasoup handler or generate subscribe offer
      socket.emit('subscribeOffer', { broadcastId });

      console.log(`Subscribe request for broadcast ${broadcastId}`);
    } catch (error) {
      console.error('Error handling subscribe request:', error);
      socket.emit('error', { message: error.message });
    }
  }

  async handleIceCandidate(socket, data) {
    try {
      const { candidate, broadcastId } = data;
      // Handle ICE candidate exchange
      socket.emit('iceCandidate', { candidate });
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  }

  async handleChatMessage(socket, data) {
    try {
      const { broadcastId, message, replyToId } = data;
      const sessionInfo = this.activeSessions.get(socket.id);

      if (!sessionInfo) {
        socket.emit('error', { message: 'Not in broadcast' });
        return;
      }

      // Check if chat is enabled
      const broadcast = await Broadcast.findByPk(broadcastId);

      if (!broadcast.chatEnabled) {
        socket.emit('error', { message: 'Chat is disabled' });
        return;
      }

      // Create chat message
      const chatMessage = await ChatMessage.create({
        broadcastId,
        userId: socket.user.id,
        message,
        replyToId
      });

      // Broadcast to all users in the room
      this.io.to(`broadcast:${broadcastId}`).emit('chatMessage', {
        id: chatMessage.id,
        userId: socket.user.id,
        username: socket.user.username,
        displayName: socket.user.displayName,
        avatar: socket.user.avatar,
        message,
        replyToId,
        createdAt: chatMessage.createdAt
      });

      console.log(`Chat message in broadcast ${broadcastId} from ${socket.user.username}`);
    } catch (error) {
      console.error('Error handling chat message:', error);
      socket.emit('error', { message: error.message });
    }
  }

  async handleReaction(socket, data) {
    try {
      const { broadcastId, emoji } = data;
      const sessionInfo = this.activeSessions.get(socket.id);

      if (!sessionInfo) {
        socket.emit('error', { message: 'Not in broadcast' });
        return;
      }

      // Check if reactions are enabled
      const broadcast = await Broadcast.findByPk(broadcastId);

      if (!broadcast.reactionsEnabled) {
        socket.emit('error', { message: 'Reactions are disabled' });
        return;
      }

      // Create reaction
      await Reaction.create({
        broadcastId,
        userId: socket.user.id,
        emoji
      });

      // Broadcast to all users in the room
      this.io.to(`broadcast:${broadcastId}`).emit('reaction', {
        userId: socket.user.id,
        username: socket.user.username,
        emoji,
        timestamp: new Date()
      });

      console.log(`Reaction ${emoji} in broadcast ${broadcastId} from ${socket.user.username}`);
    } catch (error) {
      console.error('Error handling reaction:', error);
      socket.emit('error', { message: error.message });
    }
  }

  async handleRaiseHand(socket, data) {
    try {
      const { broadcastId } = data;
      const sessionInfo = this.activeSessions.get(socket.id);

      if (!sessionInfo) {
        socket.emit('error', { message: 'Not in broadcast' });
        return;
      }

      // Update session
      await Session.update(
        { isHandRaised: true, handRaisedAt: new Date() },
        { where: { id: sessionInfo.sessionId } }
      );

      // Notify host
      this.io.to(`broadcast:${broadcastId}`).emit('handRaised', {
        userId: socket.user.id,
        username: socket.user.username,
        displayName: socket.user.displayName,
        timestamp: new Date()
      });

      socket.emit('handRaised', { status: 'raised' });

      console.log(`Hand raised in broadcast ${broadcastId} by ${socket.user.username}`);
    } catch (error) {
      console.error('Error handling raise hand:', error);
      socket.emit('error', { message: error.message });
    }
  }

  async handleLowerHand(socket, data) {
    try {
      const { broadcastId } = data;
      const sessionInfo = this.activeSessions.get(socket.id);

      if (!sessionInfo) {
        return;
      }

      // Update session
      await Session.update(
        { isHandRaised: false, handRaisedAt: null },
        { where: { id: sessionInfo.sessionId } }
      );

      // Notify host
      this.io.to(`broadcast:${broadcastId}`).emit('handLowered', {
        userId: socket.user.id
      });

      socket.emit('handLowered', { status: 'lowered' });

      console.log(`Hand lowered in broadcast ${broadcastId} by ${socket.user.username}`);
    } catch (error) {
      console.error('Error handling lower hand:', error);
    }
  }

  async handleMuteUser(socket, data) {
    try {
      const { broadcastId, userId } = data;
      const sessionInfo = this.activeSessions.get(socket.id);

      if (!sessionInfo || sessionInfo.role !== 'host') {
        socket.emit('error', { message: 'Only host can mute users' });
        return;
      }

      // Find target user's socket
      const targetSocketId = await redis.get(`user:${userId}:socket`);

      if (targetSocketId) {
        this.io.to(targetSocketId).emit('muted', {
          broadcastId,
          reason: 'Muted by host'
        });
      }

      // Update session
      await Session.update(
        { isMuted: true },
        { where: { broadcastId, userId } }
      );

      console.log(`User ${userId} muted in broadcast ${broadcastId}`);
    } catch (error) {
      console.error('Error handling mute user:', error);
      socket.emit('error', { message: error.message });
    }
  }

  async handleRemoveUser(socket, data) {
    try {
      const { broadcastId, userId } = data;
      const sessionInfo = this.activeSessions.get(socket.id);

      if (!sessionInfo || sessionInfo.role !== 'host') {
        socket.emit('error', { message: 'Only host can remove users' });
        return;
      }

      // Find target user's socket
      const targetSocketId = await redis.get(`user:${userId}:socket`);

      if (targetSocketId) {
        this.io.to(targetSocketId).emit('removed', {
          broadcastId,
          reason: 'Removed by host'
        });

        // Disconnect the user
        const targetSocket = this.io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
          targetSocket.disconnect(true);
        }
      }

      console.log(`User ${userId} removed from broadcast ${broadcastId}`);
    } catch (error) {
      console.error('Error handling remove user:', error);
      socket.emit('error', { message: error.message });
    }
  }

  async handleTyping(socket, data) {
    try {
      const { broadcastId, isTyping } = data;
      const sessionInfo = this.activeSessions.get(socket.id);

      if (!sessionInfo) {
        return;
      }

      socket.to(`broadcast:${broadcastId}`).emit('userTyping', {
        userId: socket.user.id,
        username: socket.user.username,
        isTyping
      });
    } catch (error) {
      console.error('Error handling typing:', error);
    }
  }

  // Helper methods
  async getActiveListeners(broadcastId) {
    const userIds = await redis.smembers(`broadcast:${broadcastId}:users`);
    return userIds.length;
  }

  async broadcastToBroadcast(broadcastId, event, data) {
    this.io.to(`broadcast:${broadcastId}`).emit(event, data);
  }

  async sendToUser(userId, event, data) {
    const socketId = await redis.get(`user:${userId}:socket`);
    if (socketId) {
      this.io.to(socketId).emit(event, data);
    }
  }
}

module.exports = new SocketGateway();
