import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  TextInput,
  Animated
} from 'react-native';
import { Audio } from 'expo-av';
import { useBroadcastStore } from '../store/broadcastStore';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import socketService from '../services/socket';
import webrtcService from '../services/webrtc';

const REACTIONS = ['👍', '❤️', '🔥', '👏', '🎉', '😂'];

export default function PlayerScreen({ route, navigation }: any) {
  const { broadcastId } = route.params;
  const { currentBroadcast, fetchBroadcast } = useBroadcastStore();
  const { user } = useAuthStore();
  const {
    isPlaying,
    isMuted,
    isHandRaised,
    listenerCount,
    chatMessages,
    reactions,
    setPlaying,
    setMuted,
    setHandRaised,
    setListenerCount,
    addChatMessage,
    addReaction,
    setAudioTrack,
    reset
  } = usePlayerStore();

  const [chatMessage, setChatMessage] = useState('');
  const [showChat, setShowChat] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const reactionAnimations = useRef<Map<string, Animated.Value>>(new Map());

  useEffect(() => {
    init();

    return () => {
      cleanup();
    };
  }, [broadcastId]);

  const init = async () => {
    try {
      // Fetch broadcast details
      await fetchBroadcast(broadcastId);

      // Connect to WebSocket
      await socketService.connect();

      // Set up socket event listeners
      setupSocketListeners();

      // Join broadcast
      socketService.joinBroadcast(broadcastId);

      // Initialize WebRTC for audio
      await webrtcService.initialize(broadcastId);

      // Start consuming audio (if not host)
      if (currentBroadcast?.hostId !== user?.id) {
        await startListening();
      }
    } catch (error) {
      console.error('Failed to initialize player:', error);
    }
  };

  const setupSocketListeners = () => {
    socketService.on('joined', handleJoined);
    socketService.on('userJoined', handleUserJoined);
    socketService.on('userLeft', handleUserLeft);
    socketService.on('chatMessage', handleChatMessage);
    socketService.on('reaction', handleReaction);
    socketService.on('removed', handleRemoved);
  };

  const handleJoined = (data: any) => {
    console.log('Joined broadcast:', data);
    setListenerCount(data.listenerCount);
    setPlaying(true);
  };

  const handleUserJoined = (data: any) => {
    setListenerCount(data.listenerCount);
  };

  const handleUserLeft = (data: any) => {
    setListenerCount(data.listenerCount);
  };

  const handleChatMessage = (data: any) => {
    addChatMessage(data);
  };

  const handleReaction = (data: any) => {
    addReaction(data);
    animateReaction(data.emoji);
  };

  const handleRemoved = () => {
    alert('You have been removed from this broadcast');
    navigation.goBack();
  };

  const startListening = async () => {
    try {
      // Get the producer ID from server (in production, this would come from signaling)
      // For now, we'll assume the host's producer ID is available
      const producerId = 'host-producer-id'; // This would come from server

      const audioTrack = await webrtcService.startConsuming(producerId);

      // Create audio element and play
      if (audioTrack) {
        const stream = new MediaStream([audioTrack]);
        setAudioTrack(audioTrack);

        // On web, attach to audio element
        if (audioRef.current) {
          audioRef.current.srcObject = stream;
          audioRef.current.play();
        }
      }
    } catch (error) {
      console.error('Failed to start listening:', error);
    }
  };

  const cleanup = async () => {
    socketService.leaveBroadcast(broadcastId);
    await webrtcService.cleanup();
    socketService.disconnect();
    reset();
  };

  const toggleMute = () => {
    setMuted(!isMuted);
    if (isMuted) {
      webrtcService.resumeConsumer();
    } else {
      webrtcService.pauseConsumer();
    }
  };

  const toggleHandRaise = () => {
    if (isHandRaised) {
      socketService.lowerHand(broadcastId);
    } else {
      socketService.raiseHand(broadcastId);
    }
    setHandRaised(!isHandRaised);
  };

  const sendMessage = () => {
    if (chatMessage.trim()) {
      socketService.sendChatMessage(broadcastId, chatMessage.trim());
      setChatMessage('');
    }
  };

  const sendReaction = (emoji: string) => {
    socketService.sendReaction(broadcastId, emoji);
  };

  const animateReaction = (emoji: string) => {
    const key = `${emoji}-${Date.now()}`;
    const animation = new Animated.Value(0);
    reactionAnimations.current.set(key, animation);

    Animated.timing(animation, {
      toValue: 1,
      duration: 2000,
      useNativeDriver: true
    }).start(() => {
      reactionAnimations.current.delete(key);
    });
  };

  if (!currentBroadcast) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <View style={styles.liveBadge}>
          <View style={styles.liveIndicator} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        <TouchableOpacity onPress={() => setShowChat(!showChat)}>
          <Text style={styles.chatButton}>💬</Text>
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <ScrollView contentContainerStyle={styles.content}>
        {/* Host Info */}
        <View style={styles.hostSection}>
          <Image
            source={{
              uri:
                currentBroadcast.host.avatar ||
                'https://via.placeholder.com/120'
            }}
            style={styles.hostAvatar}
          />
          <Text style={styles.hostName}>{currentBroadcast.host.displayName}</Text>
          <Text style={styles.broadcastTitle}>{currentBroadcast.title}</Text>
          {currentBroadcast.description && (
            <Text style={styles.description}>{currentBroadcast.description}</Text>
          )}
        </View>

        {/* Listener Count */}
        <View style={styles.statsRow}>
          <Text style={styles.listenerCount}>👥 {listenerCount} listening</Text>
        </View>

        {/* Reactions Display */}
        <View style={styles.reactionsContainer}>
          {reactions.slice(-5).map((reaction, index) => (
            <Text key={index} style={styles.reactionFloating}>
              {reaction.emoji}
            </Text>
          ))}
        </View>

        {/* Chat (if visible) */}
        {showChat && (
          <View style={styles.chatContainer}>
            <Text style={styles.chatTitle}>Chat</Text>
            <ScrollView style={styles.chatMessages}>
              {chatMessages.map((msg) => (
                <View key={msg.id} style={styles.chatMessage}>
                  <Text style={styles.chatUsername}>{msg.displayName}:</Text>
                  <Text style={styles.chatText}>{msg.message}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.chatInput}>
              <TextInput
                style={styles.input}
                placeholder="Type a message..."
                placeholderTextColor="#666"
                value={chatMessage}
                onChangeText={setChatMessage}
                onSubmitEditing={sendMessage}
              />
              <TouchableOpacity onPress={sendMessage}>
                <Text style={styles.sendButton}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Controls */}
      <View style={styles.controls}>
        {/* Reaction Bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.reactionBar}
        >
          {REACTIONS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              style={styles.reactionButton}
              onPress={() => sendReaction(emoji)}
            >
              <Text style={styles.reactionEmoji}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.actionButton} onPress={toggleMute}>
            <Text style={styles.actionIcon}>{isMuted ? '🔇' : '🔊'}</Text>
            <Text style={styles.actionLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
          </TouchableOpacity>

          {currentBroadcast.raiseHandEnabled && (
            <TouchableOpacity
              style={[
                styles.actionButton,
                isHandRaised && styles.actionButtonActive
              ]}
              onPress={toggleHandRaise}
            >
              <Text style={styles.actionIcon}>✋</Text>
              <Text style={styles.actionLabel}>
                {isHandRaised ? 'Lower' : 'Raise'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Hidden audio element for web */}
      <audio ref={audioRef as any} style={{ display: 'none' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 50,
    backgroundColor: '#1a1a1a'
  },
  backButton: {
    fontSize: 24,
    color: '#fff'
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ef4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginRight: 6
  },
  liveText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold'
  },
  chatButton: {
    fontSize: 24
  },
  content: {
    padding: 20
  },
  hostSection: {
    alignItems: 'center',
    marginBottom: 32
  },
  hostAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 16,
    borderWidth: 3,
    borderColor: '#4F46E5'
  },
  hostName: {
    fontSize: 18,
    color: '#aaa',
    marginBottom: 8
  },
  broadcastTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12
  },
  description: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 20
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24
  },
  listenerCount: {
    fontSize: 16,
    color: '#4F46E5',
    fontWeight: '600'
  },
  reactionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginBottom: 24
  },
  reactionFloating: {
    fontSize: 32,
    margin: 4
  },
  chatContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24
  },
  chatTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12
  },
  chatMessages: {
    maxHeight: 200,
    marginBottom: 12
  },
  chatMessage: {
    marginBottom: 8
  },
  chatUsername: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4F46E5'
  },
  chatText: {
    fontSize: 14,
    color: '#ccc'
  },
  chatInput: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  input: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    marginRight: 8
  },
  sendButton: {
    color: '#4F46E5',
    fontWeight: 'bold'
  },
  controls: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 16
  },
  reactionBar: {
    paddingHorizontal: 20,
    marginBottom: 16
  },
  reactionButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 24,
    marginRight: 12
  },
  reactionEmoji: {
    fontSize: 24
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 20
  },
  actionButton: {
    alignItems: 'center',
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#2a2a2a'
  },
  actionButtonActive: {
    backgroundColor: '#4F46E5'
  },
  actionIcon: {
    fontSize: 32,
    marginBottom: 4
  },
  actionLabel: {
    fontSize: 12,
    color: '#fff'
  },
  loadingText: {
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
    marginTop: 100
  }
});
