# LiveAudioCast Frontend

Cross-platform frontend applications for LiveAudioCast - mobile (iOS/Android) and web.

## Structure

```
frontend/
├── app/                    # React Native (Expo) mobile app
└── web/                    # React web application
```

## Mobile App (React Native + Expo)

### Features

- **Authentication**: Login and registration with JWT
- **Home Screen**: Browse live and upcoming broadcasts
- **Player**: Listen to broadcasts with WebRTC audio
- **Host Controls**: Manage broadcasts, start/stop, record
- **Chat & Reactions**: Real-time messaging and emoji reactions
- **Raise Hand**: Request to speak functionality
- **Profile**: User profile and settings

### Prerequisites

- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- iOS Simulator (Mac) or Android Studio (for emulators)
- Expo Go app on your physical device (optional)

### Setup

1. **Install dependencies**
   ```bash
   cd frontend/app
   npm install
   ```

2. **Configure environment**

   Create `.env` file:
   ```env
   EXPO_PUBLIC_API_URL=http://localhost:4000
   ```

   For physical devices, use your computer's IP:
   ```env
   EXPO_PUBLIC_API_URL=http://192.168.1.100:4000
   ```

3. **Start development server**
   ```bash
   npm start
   ```

4. **Run on platform**
   - Press `i` for iOS simulator
   - Press `a` for Android emulator
   - Scan QR code with Expo Go app on physical device

### Screens

#### Home Screen (`screens/HomeScreen.tsx`)
- Lists live and upcoming broadcasts
- Tab navigation between Live Now and Upcoming
- Pull to refresh
- Create broadcast button (for hosts)

#### Player Screen (`screens/PlayerScreen.tsx`)
- WebRTC audio playback
- Live listener count
- Real-time chat
- Emoji reactions with animations
- Mute controls
- Raise hand to speak

#### Host Controls (`screens/HostControlsScreen.tsx`)
- Start/stop broadcast
- Microphone control (mute/unmute)
- Recording toggle
- Broadcast settings (chat, reactions, raise hand)
- Share broadcast link
- View statistics

#### Login Screen (`screens/LoginScreen.tsx`)
- Email/password authentication
- Registration form
- Error handling

#### Profile Screen (`screens/ProfileScreen.tsx`)
- User information
- Logout functionality

### Services

#### API Client (`services/api.ts`)
- REST API communication
- Automatic token refresh
- Request/response interceptors
- Methods for all endpoints:
  - Authentication (login, register, refresh)
  - Broadcasts (list, create, update, delete, start, end)
  - Recordings (list, get, start, stop)
  - MediaSoup (RTP capabilities, transports, produce, consume)

#### WebSocket Service (`services/socket.ts`)
- Socket.IO client
- Event-driven architecture
- Auto-reconnection
- Methods:
  - Join/leave broadcast
  - Send chat messages
  - Send reactions
  - Raise/lower hand
  - Typing indicators

#### WebRTC Service (`services/webrtc.ts`)
- mediasoup-client wrapper
- Audio publishing (for hosts)
- Audio consumption (for listeners)
- Transport management
- Producer/consumer controls
- Stats and diagnostics

### State Management (Zustand)

#### Auth Store (`store/authStore.ts`)
- User authentication state
- Login/register/logout actions
- Token management
- Auto-load user on app start

#### Broadcast Store (`store/broadcastStore.ts`)
- Broadcast listings (live, upcoming, past)
- Current broadcast details
- CRUD operations
- Start/end broadcast actions

#### Player Store (`store/playerStore.ts`)
- Playback state
- Chat messages
- Reactions
- Listener count
- Recording state
- Audio track management

### Building for Production

#### iOS

1. **Configure app**
   ```bash
   eas build:configure
   ```

2. **Build**
   ```bash
   eas build --platform ios
   ```

3. **Submit to App Store**
   ```bash
   eas submit --platform ios
   ```

#### Android

1. **Build**
   ```bash
   eas build --platform android
   ```

2. **Submit to Play Store**
   ```bash
   eas submit --platform android
   ```

### Testing

```bash
# Run tests
npm test

# Run with coverage
npm test -- --coverage
```

## Web App (React + Vite)

### Setup

1. **Install dependencies**
   ```bash
   cd frontend/web
   npm install
   ```

2. **Configure environment**

   Create `.env` file:
   ```env
   VITE_API_URL=http://localhost:4000
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Build for production**
   ```bash
   npm run build
   ```

5. **Preview production build**
   ```bash
   npm run preview
   ```

### Deployment

#### Vercel

```bash
npm install -g vercel
vercel
```

#### Netlify

```bash
npm install -g netlify-cli
netlify deploy
```

#### Docker

```bash
# Build image
docker build -t liveaudiocast-web .

# Run container
docker run -p 3000:80 liveaudiocast-web
```

## Common Issues

### WebRTC not working on mobile

**Solution**: Ensure your backend URL uses HTTPS in production, or use your local IP address for development.

### Audio not playing

**Solution**:
1. Check microphone permissions
2. Verify WebRTC connection in console
3. Ensure mediasoup server is running
4. Check firewall rules for UDP ports 40000-49999

### Socket connection fails

**Solution**:
1. Verify backend is running
2. Check CORS configuration on backend
3. Ensure API_URL is correct
4. Check network connectivity

### Expo build fails

**Solution**:
1. Update Expo SDK: `expo upgrade`
2. Clear cache: `expo start -c`
3. Reinstall node_modules: `rm -rf node_modules && npm install`

## Performance Tips

1. **Optimize WebRTC**
   - Use TURN server for better connectivity
   - Enable adaptive bitrate
   - Monitor packet loss and adjust codec settings

2. **Reduce Bundle Size**
   - Use dynamic imports for screens
   - Enable Hermes engine (Android)
   - Optimize images and assets

3. **Improve Rendering**
   - Use React.memo for expensive components
   - Implement virtualized lists for large datasets
   - Debounce/throttle frequent updates

## Architecture

### Component Hierarchy

```
App
├── NavigationContainer
│   └── Stack.Navigator
│       ├── Login Screen (unauthenticated)
│       └── Main (authenticated)
│           ├── Tab.Navigator
│           │   ├── Home Screen
│           │   └── Profile Screen
│           ├── Player Screen
│           └── Host Controls Screen
```

### Data Flow

1. User actions trigger store methods
2. Store methods call API/Socket/WebRTC services
3. Services communicate with backend
4. Responses update store state
5. Components re-render with new state

## Environment Variables

### Mobile App

```env
EXPO_PUBLIC_API_URL=http://localhost:4000
```

### Web App

```env
VITE_API_URL=http://localhost:4000
VITE_WS_URL=ws://localhost:4000
```

## Security Considerations

1. **Token Storage**: Uses AsyncStorage (encrypted on iOS)
2. **HTTPS Only**: Enforce secure connections in production
3. **Input Validation**: Validate all user inputs
4. **XSS Prevention**: Sanitize chat messages
5. **CSRF Protection**: Use CSRF tokens for state changes

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/my-feature`
3. Make changes and test thoroughly
4. Commit: `git commit -m 'Add my feature'`
5. Push: `git push origin feature/my-feature`
6. Create Pull Request

## License

MIT License - see LICENSE file for details
