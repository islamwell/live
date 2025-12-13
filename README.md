# LiveAudioCast

A cross-platform live audio broadcasting application supporting 50+ concurrent listeners with seamless scaling to thousands. Built with React Native (iOS/Android) and React Web, featuring low-latency WebRTC audio streaming, scheduled broadcasts with reminders, and comprehensive admin controls.

## Features

### Core Capabilities
- **Live Audio Streaming**: WebRTC-based one-to-many audio using mediasoup SFU
- **Multi-Platform**: iOS, Android, and Web from single codebase
- **Scalability**: Supports 50+ concurrent listeners by default, scales to 1000+ via CDN/HLS fallback
- **Authentication**: JWT-based with role-based access control (admin, host, listener)
- **Scheduling**: Create and schedule broadcasts with recurring events support
- **Reminders**: Push notifications, email, and in-app reminders for upcoming broadcasts
- **Recording**: Server-side recording with S3 storage and playback
- **Real-time Features**: Chat, emoji reactions, raise hand, and live listener count

### Admin Features
- Create and manage broadcasts
- Schedule one-time and recurring broadcasts
- Manage user roles and permissions
- View live analytics and listener stats
- Mute/remove listeners
- Download and manage recordings
- Real-time listener count and session metrics

### Listener Features
- Join live broadcasts
- Text chat with emoji reactions
- Raise hand to request to speak
- Follow hosts for notifications
- Calendar integration
- Listen via WebRTC or HLS fallback for lower bandwidth

## Architecture

### Stack
- **Frontend**: React Native (Expo), React Web
- **Backend**: Node.js + Express + Socket.IO
- **Media Server**: mediasoup (WebRTC SFU)
- **Database**: PostgreSQL
- **Cache/Presence**: Redis
- **Storage**: S3-compatible storage
- **Notifications**: Firebase (FCM/APNS), Email (SMTP)
- **Deployment**: Docker, Kubernetes
- **CDN**: CloudFront / Fastly (for HLS fallback)

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Applications                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │   iOS    │  │ Android  │  │   Web    │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   API Gateway / Load Balancer                │
└──────────────────────┬──────────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
    ┌─────────┐  ┌─────────┐  ┌─────────┐
    │ Backend │  │ Backend │  │ Backend │
    │Instance1│  │Instance2│  │Instance3│
    └────┬────┘  └────┬────┘  └────┬────┘
         │            │            │
         └────────────┼────────────┘
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
    ┌─────────┐  ┌─────────┐  ┌─────────┐
    │MediaSoup│  │  Redis  │  │Postgres │
    │   SFU   │  │ Cluster │  │   DB    │
    └─────────┘  └─────────┘  └─────────┘
         │
         ▼
    ┌─────────┐
    │  CDN +  │
    │   HLS   │
    └─────────┘
```

## Quick Start

### Prerequisites
- Node.js 18+ and npm
- Docker and Docker Compose
- PostgreSQL 15+
- Redis 7+

### Local Development with Docker Compose

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/liveaudiocast.git
   cd liveaudiocast
   ```

2. **Start all services**
   ```bash
   docker-compose up -d
   ```

   This starts:
   - PostgreSQL on port 5432
   - Redis on port 6379
   - Backend API on port 4000
   - LocalStack (S3 emulation) on port 4566

3. **Check service health**
   ```bash
   curl http://localhost:4000/health
   ```

4. **Access the API**
   - API Base URL: `http://localhost:4000/api`
   - WebSocket: `ws://localhost:4000`
   - Admin Login: `admin@liveaudiocast.com` / `admin123`

### Manual Setup (Without Docker)

Follow these steps on Windows 11 using PowerShell (works similarly on macOS/Linux) to run everything without Docker:

1. **Install prerequisites**
   - Node.js 18+ (https://nodejs.org/en/download)
   - PostgreSQL 15+ (create a database named `liveaudiocast`)
   - Redis 7+ (enable it as a Windows service or run via WSL)
   - Optional but recommended: turn off VPNs that block UDP so WebRTC can bind locally.

2. **Configure the backend**
   ```powershell
   cd backend
   npm install
   Copy-Item .env.example .env
   # Update .env to point at your local Postgres/Redis hosts
   # For NAT: set MEDIASOUP_ANNOUNCED_IP to your LAN IP (Get-NetIPAddress)
   ```

3. **Start databases**
   ```powershell
   # PostgreSQL
   pg_ctl start

   # Redis (if using WSL, run within the distro)
   redis-server --bind 0.0.0.0
   ```

4. **Migrate and seed**
   ```powershell
   npm run migrate
   npm run seed
   ```

5. **Launch the backend (no Docker required)**
   ```powershell
   npm run dev
   ```

6. **Launch the web listener UI**
   ```powershell
   cd ..\frontend
   npm install
   npm run dev
   ```

The backend now serves WebRTC audio for browsers and mobile clients directly. Automatic connection quality monitoring throttles bitrate when packet loss or latency spikes so live lectures do not stutter on slower networks.

## API Documentation

### Authentication

**Register**
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "username": "username",
  "password": "password123",
  "displayName": "User Name"
}
```

**Login**
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}

Response:
{
  "user": { ... },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

**Refresh Token**
```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJ..."
}
```

### Broadcasts

**List Broadcasts**
```http
GET /api/broadcasts?status=live&limit=20
Authorization: Bearer {accessToken}
```

**Create Broadcast**
```http
POST /api/broadcasts
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "title": "My First Broadcast",
  "description": "Welcome to my broadcast",
  "scheduledStartTime": "2025-11-16T20:00:00Z",
  "timezone": "America/New_York",
  "reminderOffsets": [1440, 60, 15]
}
```

**Start Broadcast**
```http
POST /api/broadcasts/{id}/start
Authorization: Bearer {accessToken}
```

**End Broadcast**
```http
POST /api/broadcasts/{id}/end
Authorization: Bearer {accessToken}
```

### WebSocket Events

**Connect**
```javascript
const socket = io('ws://localhost:4000', {
  auth: { token: accessToken }
});
```

**Join Broadcast**
```javascript
socket.emit('join', { broadcastId: '...' });

socket.on('joined', (data) => {
  console.log('Joined broadcast', data);
});
```

**Send Chat Message**
```javascript
socket.emit('chatMessage', {
  broadcastId: '...',
  message: 'Hello everyone!'
});
```

**Receive Events**
```javascript
socket.on('chatMessage', (data) => {
  console.log('New message:', data);
});

socket.on('reaction', (data) => {
  console.log('Reaction:', data.emoji);
});

socket.on('userJoined', (data) => {
  console.log('User joined:', data.username);
});
```

## Scaling Guide

### From 50 to 100 Listeners

**Current Setup**: Single mediasoup instance

**Action**: Add horizontal pod autoscaling (HPA) in Kubernetes

```yaml
kubectl apply -f infrastructure/k8s/backend-deployment.yaml
```

The HPA will automatically scale from 3 to 20 pods based on CPU/memory usage.

### From 100 to 500 Listeners

**Add Relay Nodes**

The ScalingOrchestrator automatically adds relay nodes when listener count exceeds 200:

```javascript
// Configuration in backend
RELAY_ACTIVATION_THRESHOLD=200
```

Relay nodes distribute load across multiple mediasoup instances.

### From 500 to 1000+ Listeners

**Activate CDN with HLS Fallback**

When listener count exceeds threshold (default 100), the system automatically:
1. Transcodes WebRTC stream to HLS
2. Publishes HLS segments to CDN (CloudFront/Fastly)
3. Redirects listeners to HLS playback
4. Maintains WebRTC for interactive listeners (hosts, speakers)

```javascript
// Configuration
CDN_SWITCH_THRESHOLD=100
HLS_ENABLED=true
CDN_URL=https://cdn.liveaudiocast.com
```

### Cost Optimization

- **0-50 listeners**: Single backend instance + mediasoup
- **50-200 listeners**: 2-3 backend instances
- **200-500 listeners**: Add relay nodes in targeted regions
- **500-1000+ listeners**: Enable CDN + HLS (most cost-effective)

**Estimated Costs** (AWS us-east-1):
- 50 listeners: ~$50/month
- 200 listeners: ~$150/month
- 1000 listeners (with CDN): ~$300/month

## Deployment

### Docker Deployment

```bash
# Build backend image
cd backend
docker build -t liveaudiocast-backend:latest .

# Run with docker-compose
docker-compose up -d
```

### Kubernetes Deployment

1. **Create namespace**
   ```bash
   kubectl apply -f infrastructure/k8s/namespace.yaml
   ```

2. **Create secrets and configmaps**
   ```bash
   # Edit secrets first!
   kubectl apply -f infrastructure/k8s/configmap.yaml
   ```

3. **Deploy backend**
   ```bash
   kubectl apply -f infrastructure/k8s/backend-deployment.yaml
   ```

4. **Verify deployment**
   ```bash
   kubectl get pods -n liveaudiocast
   kubectl logs -n liveaudiocast deployment/backend
   ```

### Production Checklist

- [ ] Change all default passwords and secrets
- [ ] Configure SSL/TLS certificates
- [ ] Set up domain and DNS
- [ ] Configure S3 bucket and IAM permissions
- [ ] Set up Firebase for push notifications
- [ ] Configure SMTP for email notifications
- [ ] Enable monitoring (Prometheus/Grafana)
- [ ] Set up log aggregation
- [ ] Configure backup strategy for PostgreSQL
- [ ] Test disaster recovery procedures
- [ ] Load test with expected traffic
- [ ] Configure auto-scaling policies
- [ ] Set up CDN and HLS transcoding
- [ ] Review and harden security settings

## Testing

### Unit Tests

```bash
cd backend
npm test
```

### Integration Tests

```bash
npm run test:integration
```

### Load Testing

```bash
cd scripts/load-test
npm install
node webrtc-pub-sub.js --listeners 50 --duration 300
```

This simulates 50 concurrent listeners for 5 minutes.

## Monitoring

### Health Endpoints

```bash
# Backend health
curl http://localhost:4000/health

# mediasoup stats
curl http://localhost:4000/api/mediasoup/stats \
  -H "Authorization: Bearer {token}"
```

### Metrics

The system exposes metrics via:
- CloudWatch (when deployed on AWS)
- Prometheus endpoint at `/metrics`
- Real-time stats via WebSocket events

### Key Metrics to Monitor

- Active broadcast count
- Total listener count
- CPU and memory per instance
- mediasoup transport count
- WebRTC connection failures
- Average latency
- Bandwidth usage
- CDN hit ratio

## Troubleshooting

### Common Issues

**mediasoup ports not accessible**
```bash
# Ensure UDP ports 40000-49999 are open
sudo ufw allow 40000:49999/udp
```

**Database connection failed**
```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check connection
psql -h localhost -U postgres -d liveaudiocast
```

**WebSocket connection fails**
```javascript
// Check CORS configuration
CORS_ORIGIN=*  // Or specific domain
```

**No audio in broadcast**
```javascript
// Check mediasoup announced IP
// For local: 127.0.0.1
// For prod: Your public IP
MEDIASOUP_ANNOUNCED_IP=YOUR_PUBLIC_IP
```

## Security

- All API endpoints require JWT authentication
- WebRTC media encrypted with SRTP
- TLS/SSL for all HTTP traffic
- Role-based access control enforced server-side
- Rate limiting on API endpoints
- SQL injection prevention via parameterized queries
- XSS protection with helmet.js
- CSRF tokens for state-changing operations

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Support

- Documentation: https://docs.liveaudiocast.com
- Issues: https://github.com/yourusername/liveaudiocast/issues
- Discord: https://discord.gg/liveaudiocast

## Acknowledgments

- [mediasoup](https://mediasoup.org/) - WebRTC SFU
- [Socket.IO](https://socket.io/) - Real-time communication
- [React Native](https://reactnative.dev/) - Mobile development
- [PostgreSQL](https://www.postgresql.org/) - Database
- [Redis](https://redis.io/) - Caching and presence
