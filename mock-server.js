/**
 * Lightweight Mock Backend Server
 * For testing the web frontend without Docker
 * No database or Redis required
 */

const express = require('express');
const http = require('http');
const cors = require('cors');
const socketIo = require('socket.io');

const PORT = process.env.PORT || 4000;
const app = express();
const server = http.createServer(app);

// Mock data storage
const mockData = {
  users: [
    {
      id: '1',
      username: 'admin',
      email: 'admin@liveaudiocast.com',
      displayName: 'Administrator',
      role: 'admin'
    }
  ],
  broadcasts: [
    {
      id: '1',
      title: 'Live Test Broadcast',
      description: 'This is a test broadcast',
      hostId: '1',
      hostName: 'Administrator',
      status: 'active',
      startedAt: new Date(),
      listeners: 5,
      recordingEnabled: false
    }
  ],
  authTokens: {}
};

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// =====================
// Auth Routes
// =====================
app.post('/api/auth/register', (req, res) => {
  const { email, username, password, displayName } = req.body;

  const newUser = {
    id: Math.random().toString(36).substr(2, 9),
    username,
    email,
    displayName: displayName || username,
    role: 'user'
  };

  mockData.users.push(newUser);

  res.json({
    message: 'User registered successfully',
    user: newUser,
    token: generateMockToken(newUser.id)
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  const user = mockData.users.find(u => u.email === email);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = generateMockToken(user.id);

  res.json({
    message: 'Logged in successfully',
    user,
    token
  });
});

app.get('/api/auth/me', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const userId = mockData.authTokens[token];
  const user = mockData.users.find(u => u.id === userId);

  if (!user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  res.json({ user });
});

// =====================
// Broadcast Routes
// =====================
app.get('/api/broadcasts', (req, res) => {
  res.json({
    broadcasts: mockData.broadcasts,
    total: mockData.broadcasts.length
  });
});

app.get('/api/broadcasts/:id', (req, res) => {
  const broadcast = mockData.broadcasts.find(b => b.id === req.params.id);

  if (!broadcast) {
    return res.status(404).json({ error: 'Broadcast not found' });
  }

  res.json(broadcast);
});

app.post('/api/broadcasts', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const userId = mockData.authTokens[token];

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { title, description } = req.body;

  const newBroadcast = {
    id: Math.random().toString(36).substr(2, 9),
    title,
    description,
    hostId: userId,
    hostName: mockData.users.find(u => u.id === userId)?.displayName || 'Unknown',
    status: 'scheduled',
    startedAt: null,
    listeners: 0,
    recordingEnabled: false
  };

  mockData.broadcasts.push(newBroadcast);

  res.json({
    message: 'Broadcast created',
    broadcast: newBroadcast
  });
});

app.post('/api/broadcasts/:id/start', (req, res) => {
  const broadcast = mockData.broadcasts.find(b => b.id === req.params.id);

  if (!broadcast) {
    return res.status(404).json({ error: 'Broadcast not found' });
  }

  broadcast.status = 'active';
  broadcast.startedAt = new Date();

  res.json({
    message: 'Broadcast started',
    broadcast
  });
});

app.post('/api/broadcasts/:id/end', (req, res) => {
  const broadcast = mockData.broadcasts.find(b => b.id === req.params.id);

  if (!broadcast) {
    return res.status(404).json({ error: 'Broadcast not found' });
  }

  broadcast.status = 'ended';

  res.json({
    message: 'Broadcast ended',
    broadcast
  });
});

// =====================
// Mediasoup Mock Routes
// =====================
app.post('/api/mediasoup/router-rtp-capabilities', (req, res) => {
  // Mock RTP capabilities response
  res.json({
    codecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2
      }
    ],
    headerExtensions: [
      {
        uri: 'urn:ietf:params:rtp-hdrext:sdes:mid',
        id: 1
      }
    ]
  });
});

app.post('/api/mediasoup/webrtc-transport', (req, res) => {
  res.json({
    id: Math.random().toString(36).substr(2, 9),
    iceParameters: {
      usernameFragment: 'test',
      password: 'testp'
    },
    iceCandidates: [
      {
        foundation: '1',
        priority: 1,
        ip: '127.0.0.1',
        protocol: 'udp',
        port: 40000,
        type: 'host'
      }
    ],
    dtlsParameters: {
      role: 'auto',
      fingerprints: [
        {
          algorithm: 'sha-256',
          value: 'mock-fingerprint'
        }
      ]
    }
  });
});

// =====================
// WebSocket (Socket.IO)
// =====================
const io = socketIo(server, {
  cors: { origin: '*' }
});

io.on('connection', (socket) => {
  console.log(`[WebSocket] Client connected: ${socket.id}`);

  socket.emit('connected', {
    message: 'Connected to broadcast server',
    socketId: socket.id
  });

  // Chat
  socket.on('chat:send', (data) => {
    io.emit('chat:receive', {
      userId: 'mock-user',
      username: 'Test User',
      message: data.message,
      timestamp: new Date()
    });
  });

  // Reactions
  socket.on('reaction:send', (data) => {
    io.emit('reaction:receive', {
      userId: 'mock-user',
      type: data.type,
      timestamp: new Date()
    });
  });

  // Listener count updates
  socket.on('listener:join', () => {
    io.emit('listeners:update', {
      count: 5 + Math.floor(Math.random() * 10)
    });
  });

  socket.on('disconnect', () => {
    console.log(`[WebSocket] Client disconnected: ${socket.id}`);
  });
});

// =====================
// Start Server
// =====================
server.listen(PORT, () => {
  console.log('');
  console.log('==============================================');
  console.log('🚀 Mock Backend Server Running');
  console.log('==============================================');
  console.log(`HTTP Server: http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}`);
  console.log(`Health Check: http://localhost:${PORT}/health`);
  console.log('');
  console.log('📝 Default Admin Credentials:');
  console.log(`Email: admin@liveaudiocast.com`);
  console.log(`Password: admin123`);
  console.log('==============================================');
  console.log('');
});

// Helper function
function generateMockToken(userId) {
  const token = 'mock-token-' + Math.random().toString(36).substr(2);
  mockData.authTokens[token] = userId;
  return token;
}

module.exports = { app, server };
