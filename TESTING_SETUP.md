# 🚀 Local Testing Setup Guide

This guide shows you how to run both the **Mock Backend Server** and **Web Frontend** locally without Docker.

## ⚡ Quick Start (2 minutes)

### Prerequisites
- Node.js 16+ installed
- npm or yarn

### 1. Install Backend Dependencies
```bash
cd /home/user/live
npm install express cors socket.io
```

### 2. Install Frontend Dependencies
```bash
cd frontend/web
npm install
```

### 3. Start Backend (Mock Server)
Open a terminal and run:
```bash
cd /home/user/live
node mock-server.js
```

You should see:
```
==============================================
🚀 Mock Backend Server Running
==============================================
HTTP Server: http://localhost:4000
WebSocket: ws://localhost:4000
Health Check: http://localhost:4000/health
...
```

### 4. Start Frontend (Web App)
Open another terminal and run:
```bash
cd frontend/web
npm run dev
```

You should see:
```
  VITE v5.0.7  ready in 123 ms

  ➜  Local:   http://localhost:5173/
```

### 5. Open in Browser
Go to: **http://localhost:5173**

---

## 📝 Test Credentials

```
Email: admin@liveaudiocast.com
Password: admin123
```

---

## ✨ What's Working

The mock server provides:

### Authentication
- ✅ Login with test credentials
- ✅ Register new users
- ✅ JWT token management
- ✅ Persistent token storage

### Broadcasts
- ✅ View all broadcasts
- ✅ Create new broadcasts
- ✅ Start/End broadcasts
- ✅ Listener counts

### Real-Time Features
- ✅ WebSocket connection
- ✅ Live chat messaging
- ✅ Reaction system
- ✅ Listener count updates

### API Endpoints
```
GET  /health                      - Server health check
POST /api/auth/login              - Login user
POST /api/auth/register           - Register new user
GET  /api/auth/me                 - Get current user
GET  /api/broadcasts              - List all broadcasts
GET  /api/broadcasts/:id          - Get broadcast details
POST /api/broadcasts              - Create broadcast
POST /api/broadcasts/:id/start    - Start broadcast
POST /api/broadcasts/:id/end      - End broadcast
POST /api/mediasoup/router-rtp-capabilities  - RTP capabilities
POST /api/mediasoup/webrtc-transport         - Create WebRTC transport
```

---

## 🔧 Troubleshooting

### ❌ "Cannot GET /" error
**Problem:** Frontend is showing 404
**Solution:** Make sure the frontend dev server is running on port 5173

### ❌ Backend connection refused
**Problem:** "Connection refused" when trying to access http://localhost:4000
**Solution:**
1. Check that mock-server.js is running
2. Run: `node /home/user/live/mock-server.js`

### ❌ Port already in use
**Problem:** "Error: listen EADDRINUSE :::4000" or ":::5173"
**Solution:**
```bash
# Kill the process using the port (macOS/Linux)
lsof -i :4000      # Find process
kill -9 <PID>      # Kill it

# Or change the port:
PORT=4001 node mock-server.js
```

### ❌ Dependencies not installed
**Problem:** "Cannot find module 'express'"
**Solution:**
```bash
cd /home/user/live
npm install
cd frontend/web
npm install
```

---

## 🚀 Advanced Options

### Option A: Using Real PostgreSQL & Redis (Full Stack)

If you want to use the **real backend** instead of the mock server:

```bash
# Install PostgreSQL & Redis locally
# macOS:
brew install postgresql redis

# Ubuntu:
sudo apt-get install postgresql postgresql-contrib redis-server

# Start services
pg_ctl -D /usr/local/var/postgres start
redis-server

# Setup backend
cd backend
npm install
cp .env.example .env

# Edit .env with your credentials
# Then run migrations:
npm run migrate
npm run dev
```

### Option B: Using Docker Compose (Easiest for Full Stack)

```bash
docker-compose up -d
```

This starts:
- PostgreSQL
- Redis
- Real backend API
- LocalStack (S3 emulation)

Then run the frontend:
```bash
cd frontend/web
npm run dev
```

---

## 📊 Architecture

```
┌─────────────────────────────────────┐
│  Frontend (React + Vite)            │
│  http://localhost:5173              │
└──────────────┬──────────────────────┘
               │
               ├─── HTTP Requests ──→ /api/*
               └─── WebSocket ──────→ ws://

┌─────────────────────────────────────┐
│  Mock Backend (Node.js Express)     │
│  http://localhost:4000              │
│  - No Database                      │
│  - No Redis                         │
│  - In-Memory Data                   │
└─────────────────────────────────────┘
```

---

## 🎯 Next Steps

After testing the mock server, you can:

1. **Develop Frontend Features**
   - Create broadcast details page
   - Implement WebRTC streaming UI
   - Add user profiles
   - Build settings page

2. **Connect to Real Backend**
   - Update API_URL in App.jsx
   - Run the real backend with Docker or locally
   - Test against PostgreSQL

3. **Add More Features**
   - Recording functionality
   - Notifications
   - Analytics
   - Social features (follow, etc.)

---

## 📞 Help

If you encounter any issues:

1. Check the browser console for errors (F12)
2. Check both server terminals for error messages
3. Verify both services are running:
   - Backend: http://localhost:4000/health
   - Frontend: http://localhost:5173

---

**Happy testing! 🎉**
