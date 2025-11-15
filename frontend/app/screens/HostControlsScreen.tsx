import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Alert
} from 'react-native';
import { useBroadcastStore } from '../store/broadcastStore';
import { usePlayerStore } from '../store/playerStore';
import apiClient from '../services/api';
import webrtcService from '../services/webrtc';

export default function HostControlsScreen({ route, navigation }: any) {
  const { broadcastId } = route.params;
  const { currentBroadcast, fetchBroadcast } = useBroadcastStore();
  const { listenerCount, isRecording, setRecording } = usePlayerStore();

  const [isPublishing, setIsPublishing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    fetchBroadcast(broadcastId);
  }, [broadcastId]);

  const startBroadcast = async () => {
    try {
      Alert.alert(
        'Start Broadcast',
        'Are you ready to go live?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Start',
            onPress: async () => {
              // Request microphone permission
              const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true
                }
              });

              setAudioStream(stream);

              // Start broadcast on server
              await apiClient.startBroadcast(broadcastId);

              // Initialize WebRTC
              await webrtcService.initialize(broadcastId);

              // Start publishing audio
              const audioTrack = stream.getAudioTracks()[0];
              await webrtcService.startPublishing(audioTrack);

              setIsPublishing(true);

              Alert.alert('Success', 'You are now live!');
            }
          }
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to start broadcast');
    }
  };

  const endBroadcast = async () => {
    Alert.alert(
      'End Broadcast',
      'Are you sure you want to end this broadcast?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End',
          style: 'destructive',
          onPress: async () => {
            try {
              // Stop publishing
              await webrtcService.stopPublishing();

              // Stop audio stream
              if (audioStream) {
                audioStream.getTracks().forEach(track => track.stop());
              }

              // End broadcast on server
              await apiClient.endBroadcast(broadcastId);

              setIsPublishing(false);

              Alert.alert('Broadcast Ended', 'Your broadcast has ended', [
                {
                  text: 'OK',
                  onPress: () => navigation.goBack()
                }
              ]);
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to end broadcast');
            }
          }
        }
      ]
    );
  };

  const toggleMute = () => {
    if (isMuted) {
      webrtcService.resumeProducer();
    } else {
      webrtcService.pauseProducer();
    }
    setIsMuted(!isMuted);
  };

  const toggleRecording = async () => {
    try {
      if (isRecording) {
        await apiClient.stopRecording(broadcastId);
        setRecording(false);
        Alert.alert('Recording Stopped', 'Your broadcast recording has been saved');
      } else {
        await apiClient.startRecording(broadcastId);
        setRecording(true);
        Alert.alert('Recording Started', 'Your broadcast is now being recorded');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to toggle recording');
    }
  };

  const shareBroadcast = () => {
    // Implement share functionality
    Alert.alert('Share', `Share link: https://liveaudiocast.com/b/${broadcastId}`);
  };

  const viewStats = () => {
    navigation.navigate('BroadcastStats', { broadcastId });
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
        <Text style={styles.headerTitle}>Host Controls</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Broadcast Info */}
        <View style={styles.infoCard}>
          <Text style={styles.broadcastTitle}>{currentBroadcast.title}</Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusBadge,
                isPublishing ? styles.statusLive : styles.statusOffline
              ]}
            >
              <Text style={styles.statusText}>
                {isPublishing ? 'LIVE' : 'OFFLINE'}
              </Text>
            </View>
            <Text style={styles.listenerCount}>👥 {listenerCount}</Text>
          </View>
        </View>

        {/* Main Controls */}
        <View style={styles.controlsCard}>
          {!isPublishing ? (
            <TouchableOpacity
              style={styles.startButton}
              onPress={startBroadcast}
            >
              <Text style={styles.startButtonText}>Start Broadcast</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={styles.endButton} onPress={endBroadcast}>
                <Text style={styles.endButtonText}>End Broadcast</Text>
              </TouchableOpacity>

              <View style={styles.quickActions}>
                <TouchableOpacity
                  style={[
                    styles.quickAction,
                    isMuted && styles.quickActionActive
                  ]}
                  onPress={toggleMute}
                >
                  <Text style={styles.quickActionIcon}>
                    {isMuted ? '🔇' : '🎤'}
                  </Text>
                  <Text style={styles.quickActionText}>
                    {isMuted ? 'Unmute' : 'Mute'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.quickAction,
                    isRecording && styles.quickActionActive
                  ]}
                  onPress={toggleRecording}
                >
                  <Text style={styles.quickActionIcon}>⏺</Text>
                  <Text style={styles.quickActionText}>
                    {isRecording ? 'Stop Rec' : 'Record'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quickAction}
                  onPress={shareBroadcast}
                >
                  <Text style={styles.quickActionIcon}>🔗</Text>
                  <Text style={styles.quickActionText}>Share</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quickAction}
                  onPress={viewStats}
                >
                  <Text style={styles.quickActionIcon}>📊</Text>
                  <Text style={styles.quickActionText}>Stats</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* Settings */}
        <View style={styles.settingsCard}>
          <Text style={styles.sectionTitle}>Broadcast Settings</Text>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Enable Chat</Text>
            <Switch
              value={currentBroadcast.chatEnabled}
              onValueChange={async (value) => {
                await apiClient.updateBroadcast(broadcastId, {
                  chatEnabled: value
                });
                await fetchBroadcast(broadcastId);
              }}
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Enable Reactions</Text>
            <Switch
              value={currentBroadcast.reactionsEnabled}
              onValueChange={async (value) => {
                await apiClient.updateBroadcast(broadcastId, {
                  reactionsEnabled: value
                });
                await fetchBroadcast(broadcastId);
              }}
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Allow Raise Hand</Text>
            <Switch
              value={currentBroadcast.raiseHandEnabled}
              onValueChange={async (value) => {
                await apiClient.updateBroadcast(broadcastId, {
                  raiseHandEnabled: value
                });
                await fetchBroadcast(broadcastId);
              }}
            />
          </View>
        </View>

        {/* Broadcast Details */}
        <View style={styles.detailsCard}>
          <Text style={styles.sectionTitle}>Details</Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Broadcast ID</Text>
            <Text style={styles.detailValue}>{broadcastId}</Text>
          </View>

          {currentBroadcast.scheduledStartTime && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Scheduled</Text>
              <Text style={styles.detailValue}>
                {new Date(currentBroadcast.scheduledStartTime).toLocaleString()}
              </Text>
            </View>
          )}

          {currentBroadcast.actualStartTime && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Started</Text>
              <Text style={styles.detailValue}>
                {new Date(currentBroadcast.actualStartTime).toLocaleString()}
              </Text>
            </View>
          )}

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Peak Listeners</Text>
            <Text style={styles.detailValue}>
              {currentBroadcast.peakListenerCount}
            </Text>
          </View>
        </View>
      </ScrollView>
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
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff'
  },
  content: {
    padding: 16
  },
  infoCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16
  },
  broadcastTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12
  },
  statusLive: {
    backgroundColor: '#ef4444'
  },
  statusOffline: {
    backgroundColor: '#666'
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold'
  },
  listenerCount: {
    fontSize: 16,
    color: '#4F46E5',
    fontWeight: '600'
  },
  controlsCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16
  },
  startButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center'
  },
  startButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold'
  },
  endButton: {
    backgroundColor: '#ef4444',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16
  },
  endButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold'
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around'
  },
  quickAction: {
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#2a2a2a',
    minWidth: 70
  },
  quickActionActive: {
    backgroundColor: '#4F46E5'
  },
  quickActionIcon: {
    fontSize: 24,
    marginBottom: 4
  },
  quickActionText: {
    fontSize: 12,
    color: '#fff'
  },
  settingsCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  settingLabel: {
    fontSize: 16,
    color: '#ccc'
  },
  detailsCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  detailLabel: {
    fontSize: 14,
    color: '#999'
  },
  detailValue: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500'
  },
  loadingText: {
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
    marginTop: 100
  }
});
