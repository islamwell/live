# LiveAudioCast Project Structure

## Overview

```
liveaudiocast/
├── backend/                    # Node.js backend with mediasoup
├── frontend/                   # Frontend applications
│   ├── app/                   # React Native mobile app
│   └── web/                   # React web app
├── infrastructure/            # Deployment configurations
├── scripts/                   # Utility and testing scripts
├── docs/                      # Documentation
├── docker-compose.yml         # Local development setup
└── README.md                  # Main documentation
```

## Backend Structure

```
backend/
├── src/
│   ├── auth/                  # Authentication & authorization
│   │   ├── authService.js    # JWT generation, validation
│   │   └── authRoutes.js     # Login, register, refresh endpoints
│   │
│   ├── broadcasts/            # Broadcast management
│   │   ├── broadcastService.js  # CRUD, scheduling, stats
│   │   └── broadcastRoutes.js   # REST API endpoints
│   │
│   ├── signaling/             # WebRTC signaling & real-time
│   │   ├── socketGateway.js     # Socket.IO gateway
│   │   ├── mediasoupHandler.js  # mediasoup SFU management
│   │   └── mediasoupRoutes.js   # WebRTC API endpoints
│   │
│   ├── recording/             # Recording service
│   │   ├── recordingService.js  # S3 upload, download URLs
│   │   └── recordingRoutes.js   # Recording API
│   │
│   ├── notifications/         # Push & email notifications
│   │   └── notificationService.js  # FCM, APNS, SMTP
│   │
│   ├── models/                # Database models (Sequelize)
│   │   ├── index.js          # Model exports and associations
│   │   ├── User.js           # User model with bcrypt
│   │   ├── Broadcast.js      # Broadcast with scheduling
│   │   ├── Recording.js      # Recording metadata
│   │   ├── Reminder.js       # Scheduled reminders
│   │   ├── Session.js        # Active WebRTC sessions
│   │   ├── Reaction.js       # Emoji reactions
│   │   ├── ChatMessage.js    # Chat messages
│   │   └── Follow.js         # User follows
│   │
│   ├── middleware/            # Express middleware
│   │   ├── auth.js           # JWT authentication
│   │   └── validator.js      # Request validation (Joi)
│   │
│   ├── utils/                 # Utilities
│   │   ├── migrate.js        # Database migration script
│   │   └── ScalingOrchestrator.js  # Auto-scaling & CDN
│   │
│   ├── config/                # Configuration
│   │   └── database.js       # Database connection
│   │
│   └── server.js              # Main entry point
│
├── Dockerfile                 # Production Docker image
├── package.json               # Dependencies
└── .env.example               # Environment variables template
```

## Frontend Structure

### Mobile App (React Native + Expo)

```
frontend/app/
├── screens/                   # Screen components
│   ├── Home.tsx              # Upcoming/live broadcasts list
│   ├── Player.tsx            # Audio player with controls
│   ├── HostControls.tsx      # Host dashboard
│   ├── Schedule.tsx          # Create/edit broadcasts
│   └── AdminDashboard.tsx    # Admin panel
│
├── components/                # Reusable components
│   ├── AudioPlayer.tsx       # WebRTC audio player
│   ├── Chat.tsx              # Chat interface
│   ├── ReactionBar.tsx       # Emoji reactions
│   ├── BroadcastCard.tsx     # Broadcast preview card
│   └── UserAvatar.tsx        # User avatar component
│
├── services/                  # API clients
│   ├── api.ts                # REST API client
│   ├── socket.ts             # Socket.IO client
│   └── webrtc.ts             # WebRTC/mediasoup client
│
├── hooks/                     # Custom React hooks
│   ├── useAuth.ts            # Authentication hook
│   ├── useBroadcast.ts       # Broadcast state hook
│   └── useWebRTC.ts          # WebRTC connection hook
│
├── navigation/                # Navigation configuration
│   └── AppNavigator.tsx      # Stack & tab navigation
│
├── store/                     # State management (Zustand)
│   ├── authStore.ts          # Auth state
│   ├── broadcastStore.ts     # Broadcast state
│   └── playerStore.ts        # Player state
│
├── App.tsx                    # Root component
└── package.json               # Dependencies
```

### Web App (React + Vite)

```
frontend/web/
├── src/
│   ├── components/           # React components
│   │   ├── Home/            # Home page components
│   │   ├── Player/          # Player components
│   │   ├── Host/            # Host dashboard
│   │   └── Admin/           # Admin dashboard
│   │
│   ├── pages/                # Page components
│   │   ├── HomePage.tsx
│   │   ├── PlayerPage.tsx
│   │   ├── SchedulePage.tsx
│   │   └── AdminPage.tsx
│   │
│   ├── services/             # API and services
│   │   ├── api.ts           # Axios client
│   │   ├── socket.ts        # Socket.IO client
│   │   └── webrtc.ts        # mediasoup client
│   │
│   ├── hooks/                # React hooks
│   ├── store/                # Zustand stores
│   ├── App.tsx               # Root component
│   └── main.tsx              # Entry point
│
├── public/                    # Static assets
├── index.html                 # HTML template
├── vite.config.ts             # Vite configuration
└── package.json               # Dependencies
```

## Infrastructure

```
infrastructure/
├── k8s/                       # Kubernetes manifests
│   ├── namespace.yaml        # Namespace definition
│   ├── configmap.yaml        # Configuration
│   ├── backend-deployment.yaml  # Backend deployment + HPA
│   └── ingress.yaml          # Ingress for load balancing
│
├── docker/                    # Additional Docker configs
│   └── nginx.conf            # Nginx for web frontend
│
└── terraform/                 # Infrastructure as Code
    ├── main.tf               # Main configuration
    ├── vpc.tf                # VPC and networking
    ├── rds.tf                # PostgreSQL RDS
    ├── elasticache.tf        # Redis cluster
    ├── s3.tf                 # S3 buckets
    └── cloudfront.tf         # CDN distribution
```

## Scripts

```
scripts/
├── load-test/                 # Load testing tools
│   ├── webrtc-pub-sub.js     # WebRTC load test
│   ├── hls-load-test.js      # HLS load test
│   ├── gradual-load-test.js  # Gradual ramp test
│   └── package.json          # Dependencies
│
└── seed/                      # Database seeding
    └── seed-data.js          # Sample data generator
```

## Documentation

```
docs/
├── SCALING_RUNBOOK.md         # Detailed scaling guide
├── PROJECT_STRUCTURE.md       # This file
├── API.md                     # API documentation
└── ARCHITECTURE.md            # System architecture
```

## Key Files

### Configuration Files

- **docker-compose.yml**: Local development environment
- **backend/.env.example**: Backend environment variables template
- **backend/package.json**: Backend dependencies
- **frontend/app/package.json**: Mobile app dependencies
- **frontend/web/package.json**: Web app dependencies

### Entry Points

- **backend/src/server.js**: Backend server entry
- **frontend/app/App.tsx**: Mobile app entry
- **frontend/web/src/main.tsx**: Web app entry
- **scripts/load-test/webrtc-pub-sub.js**: Load test entry

## Database Schema

### Tables

1. **users**: User accounts with authentication
2. **broadcasts**: Broadcasts with scheduling and metadata
3. **recordings**: Recording files with S3 references
4. **reminders**: Scheduled notification reminders
5. **sessions**: Active WebRTC sessions
6. **reactions**: Emoji reactions
7. **chat_messages**: Chat messages
8. **follows**: User follow relationships

### Relationships

- User has many Broadcasts (as host)
- Broadcast has many Recordings
- Broadcast has many Reminders
- Broadcast has many Sessions
- User has many Sessions
- User follows many Users (many-to-many)

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh token
- `GET /api/auth/me` - Get current user

### Broadcasts
- `GET /api/broadcasts` - List broadcasts
- `POST /api/broadcasts` - Create broadcast
- `GET /api/broadcasts/:id` - Get broadcast
- `PATCH /api/broadcasts/:id` - Update broadcast
- `DELETE /api/broadcasts/:id` - Delete broadcast
- `POST /api/broadcasts/:id/start` - Start broadcast
- `POST /api/broadcasts/:id/end` - End broadcast

### Recordings
- `GET /api/recordings` - List recordings
- `GET /api/recordings/:id` - Get recording
- `POST /api/broadcasts/:id/record/start` - Start recording
- `POST /api/broadcasts/:id/record/stop` - Stop recording

### WebRTC (mediasoup)
- `GET /api/mediasoup/:broadcastId/rtp-capabilities` - Get RTP capabilities
- `POST /api/mediasoup/:broadcastId/transports` - Create transport
- `POST /api/mediasoup/transports/:id/connect` - Connect transport
- `POST /api/mediasoup/transports/:id/produce` - Create producer
- `POST /api/mediasoup/transports/:id/consume` - Create consumer

## WebSocket Events

### Client → Server
- `join` - Join broadcast
- `leave` - Leave broadcast
- `chatMessage` - Send chat message
- `reaction` - Send emoji reaction
- `raiseHand` - Raise hand to speak
- `lowerHand` - Lower hand

### Server → Client
- `joined` - Join confirmation
- `userJoined` - Another user joined
- `userLeft` - User left
- `chatMessage` - New chat message
- `reaction` - New reaction
- `handRaised` - User raised hand
- `muted` - User was muted
- `removed` - User was removed

## Environment Variables

### Required (Backend)

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=liveaudiocast
DB_USER=postgres
DB_PASSWORD=***

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=***
JWT_REFRESH_SECRET=***

# MediaSoup
MEDIASOUP_LISTEN_IP=0.0.0.0
MEDIASOUP_ANNOUNCED_IP=your-public-ip
MEDIASOUP_MIN_PORT=40000
MEDIASOUP_MAX_PORT=49999

# AWS S3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=***
AWS_SECRET_ACCESS_KEY=***
S3_BUCKET_NAME=***

# Firebase (optional)
FCM_PROJECT_ID=***
FCM_PRIVATE_KEY=***
FCM_CLIENT_EMAIL=***

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_USER=***
SMTP_PASSWORD=***
```

## Development Workflow

1. **Start backend**:
   ```bash
   docker-compose up -d
   ```

2. **Run mobile app**:
   ```bash
   cd frontend/app
   npm start
   ```

3. **Run web app**:
   ```bash
   cd frontend/web
   npm run dev
   ```

4. **Run tests**:
   ```bash
   cd scripts/load-test
   node webrtc-pub-sub.js --listeners 50
   ```

## Deployment Workflow

1. **Build Docker image**:
   ```bash
   docker build -t liveaudiocast-backend:latest backend/
   ```

2. **Push to registry**:
   ```bash
   docker push your-registry/liveaudiocast-backend:latest
   ```

3. **Deploy to Kubernetes**:
   ```bash
   kubectl apply -f infrastructure/k8s/
   ```

4. **Verify deployment**:
   ```bash
   kubectl get pods -n liveaudiocast
   ```

## Monitoring and Logging

- **Health endpoint**: `GET /health`
- **Metrics**: CloudWatch or Prometheus at `/metrics`
- **Logs**: stdout/stderr, aggregated via CloudWatch Logs or ELK
- **Real-time stats**: WebSocket events
- **Dashboards**: Grafana (import from `infrastructure/monitoring/`)

## Scaling Patterns

### Horizontal Scaling
- Backend pods auto-scale via HPA (3-20 replicas)
- mediasoup workers scale with pod count
- Stateless design enables easy scaling

### Vertical Scaling
- Increase instance size for CPU/memory
- More vCPUs = more mediasoup workers
- Better single-broadcast performance

### Geographic Distribution
- Deploy in multiple regions
- Use relay nodes for geo-proximity
- Route users to nearest region

### CDN Offloading
- Activate HLS+CDN at 100+ listeners
- Reduces origin load dramatically
- Enables massive scale (1000+ listeners)

## Security Considerations

1. **Authentication**: JWT with short expiry + refresh tokens
2. **Authorization**: Role-based access control (RBAC)
3. **Transport**: TLS for HTTP, SRTP for WebRTC
4. **Secrets**: Store in Kubernetes Secrets or AWS Secrets Manager
5. **Rate Limiting**: Applied at API gateway
6. **Input Validation**: Joi schemas for all inputs
7. **SQL Injection**: Parameterized queries via Sequelize
8. **XSS Protection**: Helmet.js middleware
9. **CORS**: Configured for specific origins

## Performance Targets

| Metric | Target | Critical |
|--------|--------|----------|
| API Latency P95 | < 200ms | < 500ms |
| WebRTC Latency P95 | < 300ms | < 800ms |
| Connection Success Rate | > 98% | > 90% |
| CPU per Instance | < 70% | < 85% |
| Memory per Instance | < 75% | < 90% |
| Concurrent Listeners per Instance | 50 | 80 |

## Cost Estimates

| Scale | Monthly Cost (AWS) |
|-------|-------------------|
| 50 listeners | $60-100 |
| 200 listeners | $200-300 |
| 1000 listeners | $900-1200 |

Costs include: EC2/ECS, RDS, ElastiCache, S3, data transfer, and CloudFront.
