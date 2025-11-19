require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const db = require('./models');
const socketGateway = require('./signaling/socketGateway');
const mediasoupHandler = require('./signaling/mediasoupHandler');
const notificationService = require('./notifications/notificationService');
const recordingService = require('./recording/recordingService');

// Import routes
const authRoutes = require('./auth/authRoutes');
const broadcastRoutes = require('./broadcasts/broadcastRoutes');
const mediasoupRoutes = require('./signaling/mediasoupRoutes');
const recordingRoutes = require('./recording/recordingRoutes');

const PORT = process.env.PORT || 4000;

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mediasoup: mediasoupHandler.getStats()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/broadcasts', broadcastRoutes);
app.use('/api/mediasoup', mediasoupRoutes);
app.use('/api/recordings', recordingRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Initialize services
async function initialize() {
  try {
    console.log('Initializing LiveAudioCast backend...');

    // Initialize database
    console.log('Connecting to database...');
    await db.sequelize.authenticate();
    console.log('Database connected');

    // Sync models (use migrations in production)
    if (process.env.NODE_ENV === 'development') {
      await db.sequelize.sync({ alter: true });
      console.log('Database models synced');
    }

    // Initialize mediasoup
    console.log('Initializing mediasoup...');
    await mediasoupHandler.initialize();
    console.log('Mediasoup initialized');

    // Initialize Socket.IO
    console.log('Initializing WebSocket gateway...');
    socketGateway.initialize(server);
    console.log('WebSocket gateway initialized');

    // Start notification worker
    console.log('Starting notification worker...');
    notificationService.startWorker();
    console.log('Notification worker started');

    // Create admin user if not exists
    await createAdminUser();

    // Start server
    server.listen(PORT, () => {
      console.log('');
      console.log('==============================================');
      console.log(`🚀 LiveAudioCast Backend Server Running`);
      console.log('==============================================');
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`HTTP Server: http://localhost:${PORT}`);
      console.log(`WebSocket: ws://localhost:${PORT}`);
      console.log(`Mediasoup Workers: ${mediasoupHandler.workers.length}`);
      console.log('==============================================');
      console.log('');
    });
  } catch (error) {
    console.error('Failed to initialize:', error);
    process.exit(1);
  }
}

async function createAdminUser() {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@liveaudiocast.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    const existingAdmin = await db.User.findOne({ where: { email: adminEmail } });

    if (!existingAdmin) {
      await db.User.create({
        email: adminEmail,
        username: 'admin',
        password: adminPassword,
        role: 'admin',
        displayName: 'Administrator',
        emailVerified: true
      });

      console.log('Admin user created');
      console.log(`Email: ${adminEmail}`);
      console.log(`Password: ${adminPassword}`);
      console.log('⚠️  CHANGE THE DEFAULT PASSWORD IN PRODUCTION!');
    }
  } catch (error) {
    console.error('Error creating admin user:', error);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');

  try {
    // Stop notification worker
    notificationService.stopWorker();

    // Clean up recordings
    await recordingService.cleanup();

    // Close database connection
    await db.sequelize.close();

    // Close server
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');

  try {
    // Stop notification worker
    notificationService.stopWorker();

    // Clean up recordings
    await recordingService.cleanup();

    // Close database connection
    await db.sequelize.close();

    // Close server
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Initialize and start
initialize();

module.exports = { app, server };
