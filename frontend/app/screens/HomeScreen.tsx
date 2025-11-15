import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Image,
  StatusBar
} from 'react-native';
import { useBroadcastStore } from '../store/broadcastStore';
import { useAuthStore } from '../store/authStore';

export default function HomeScreen({ navigation }: any) {
  const {
    liveBroadcasts,
    upcomingBroadcasts,
    fetchLiveBroadcasts,
    fetchUpcomingBroadcasts,
    isLoading
  } = useBroadcastStore();

  const { user } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'live' | 'upcoming'>('live');

  useEffect(() => {
    loadBroadcasts();
  }, []);

  const loadBroadcasts = async () => {
    await Promise.all([fetchLiveBroadcasts(), fetchUpcomingBroadcasts()]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBroadcasts();
    setRefreshing(false);
  };

  const renderBroadcastCard = ({ item }: any) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('Player', { broadcastId: item.id })}
    >
      {item.coverImage && (
        <Image source={{ uri: item.coverImage }} style={styles.coverImage} />
      )}
      <View style={styles.cardContent}>
        <View style={styles.headerRow}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          {item.status === 'live' && (
            <View style={styles.liveBadge}>
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
        </View>

        <View style={styles.hostRow}>
          <Image
            source={{
              uri: item.host.avatar || 'https://via.placeholder.com/40'
            }}
            style={styles.avatar}
          />
          <Text style={styles.hostName}>{item.host.displayName}</Text>
        </View>

        {item.description && (
          <Text style={styles.description} numberOfLines={2}>
            {item.description}
          </Text>
        )}

        <View style={styles.footer}>
          {item.status === 'live' ? (
            <View style={styles.listenerCount}>
              <Text style={styles.listenerCountText}>
                👥 {item.currentListenerCount} listening
              </Text>
            </View>
          ) : (
            <Text style={styles.scheduledTime}>
              📅 {new Date(item.scheduledStartTime).toLocaleString()}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyText}>
        {activeTab === 'live'
          ? 'No live broadcasts right now'
          : 'No upcoming broadcasts'}
      </Text>
    </View>
  );

  const broadcasts = activeTab === 'live' ? liveBroadcasts : upcomingBroadcasts;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>LiveAudioCast</Text>
        <TouchableOpacity
          style={styles.profileButton}
          onPress={() => navigation.navigate('Profile')}
        >
          <Image
            source={{ uri: user?.avatar || 'https://via.placeholder.com/40' }}
            style={styles.profileImage}
          />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'live' && styles.activeTab]}
          onPress={() => setActiveTab('live')}
        >
          <Text
            style={[styles.tabText, activeTab === 'live' && styles.activeTabText]}
          >
            Live Now
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'upcoming' && styles.activeTab]}
          onPress={() => setActiveTab('upcoming')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'upcoming' && styles.activeTabText
            ]}
          >
            Upcoming
          </Text>
        </TouchableOpacity>
      </View>

      {/* Broadcast List */}
      <FlatList
        data={broadcasts}
        renderItem={renderBroadcastCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={renderEmptyState}
      />

      {/* Create Broadcast Button (for hosts) */}
      {(user?.role === 'host' || user?.role === 'admin') && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('CreateBroadcast')}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}
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
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff'
  },
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 20
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 20,
    paddingBottom: 16
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent'
  },
  activeTab: {
    borderBottomColor: '#4F46E5'
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666'
  },
  activeTabText: {
    color: '#4F46E5'
  },
  listContent: {
    padding: 16
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden'
  },
  coverImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#2a2a2a'
  },
  cardContent: {
    padding: 16
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginRight: 8
  },
  liveBadge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4
  },
  liveText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold'
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8
  },
  hostName: {
    fontSize: 14,
    color: '#aaa'
  },
  description: {
    fontSize: 14,
    color: '#999',
    marginBottom: 12
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  listenerCount: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  listenerCountText: {
    fontSize: 14,
    color: '#4F46E5'
  },
  scheduledTime: {
    fontSize: 14,
    color: '#999'
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60
  },
  emptyText: {
    fontSize: 16,
    color: '#666'
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8
  },
  fabText: {
    fontSize: 32,
    color: '#fff',
    fontWeight: '300'
  }
});
