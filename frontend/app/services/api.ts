import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api';

class ApiClient {
  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      async (config) => {
        const token = await AsyncStorage.getItem('accessToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor to handle token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const refreshToken = await AsyncStorage.getItem('refreshToken');
            const response = await axios.post(`${API_URL}/auth/refresh`, {
              refreshToken
            });

            const { accessToken } = response.data;
            await AsyncStorage.setItem('accessToken', accessToken);

            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            return this.client(originalRequest);
          } catch (refreshError) {
            await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'user']);
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  // Auth
  async register(data) {
    const response = await this.client.post('/auth/register', data);
    await this.saveTokens(response.data);
    return response.data;
  }

  async login(email, password) {
    const response = await this.client.post('/auth/login', { email, password });
    await this.saveTokens(response.data);
    return response.data;
  }

  async logout() {
    await this.client.post('/auth/logout');
    await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'user']);
  }

  async getMe() {
    const response = await this.client.get('/auth/me');
    return response.data.user;
  }

  async saveTokens(data) {
    await AsyncStorage.setItem('accessToken', data.accessToken);
    await AsyncStorage.setItem('refreshToken', data.refreshToken);
    await AsyncStorage.setItem('user', JSON.stringify(data.user));
  }

  // Broadcasts
  async getBroadcasts(params = {}) {
    const response = await this.client.get('/broadcasts', { params });
    return response.data;
  }

  async getBroadcast(id) {
    const response = await this.client.get(`/broadcasts/${id}`);
    return response.data;
  }

  async createBroadcast(data) {
    const response = await this.client.post('/broadcasts', data);
    return response.data;
  }

  async updateBroadcast(id, data) {
    const response = await this.client.patch(`/broadcasts/${id}`, data);
    return response.data;
  }

  async deleteBroadcast(id) {
    const response = await this.client.delete(`/broadcasts/${id}`);
    return response.data;
  }

  async startBroadcast(id) {
    const response = await this.client.post(`/broadcasts/${id}/start`);
    return response.data;
  }

  async endBroadcast(id) {
    const response = await this.client.post(`/broadcasts/${id}/end`);
    return response.data;
  }

  async getBroadcastStats(id) {
    const response = await this.client.get(`/broadcasts/${id}/stats`);
    return response.data;
  }

  async getUpcomingBroadcasts(limit = 20) {
    const response = await this.client.get('/broadcasts/upcoming', {
      params: { limit }
    });
    return response.data;
  }

  async getLiveBroadcasts(limit = 20) {
    const response = await this.client.get('/broadcasts/live', {
      params: { limit }
    });
    return response.data;
  }

  async getPastBroadcasts(params = {}) {
    const response = await this.client.get('/broadcasts/past', { params });
    return response.data;
  }

  // Recordings
  async getRecordings(params = {}) {
    const response = await this.client.get('/recordings', { params });
    return response.data;
  }

  async getRecording(id) {
    const response = await this.client.get(`/recordings/${id}`);
    return response.data;
  }

  async startRecording(broadcastId) {
    const response = await this.client.post(`/recordings/broadcasts/${broadcastId}/record/start`);
    return response.data;
  }

  async stopRecording(broadcastId) {
    const response = await this.client.post(`/recordings/broadcasts/${broadcastId}/record/stop`);
    return response.data;
  }

  // MediaSoup
  async getRtpCapabilities(broadcastId) {
    const response = await this.client.get(`/mediasoup/${broadcastId}/rtp-capabilities`);
    return response.data;
  }

  async createTransport(broadcastId, type) {
    const response = await this.client.post(`/mediasoup/${broadcastId}/transports`, { type });
    return response.data;
  }

  async connectTransport(transportId, dtlsParameters) {
    const response = await this.client.post(`/mediasoup/transports/${transportId}/connect`, {
      dtlsParameters
    });
    return response.data;
  }

  async produce(transportId, kind, rtpParameters) {
    const response = await this.client.post(`/mediasoup/transports/${transportId}/produce`, {
      kind,
      rtpParameters
    });
    return response.data;
  }

  async consume(transportId, producerId, rtpCapabilities) {
    const response = await this.client.post(`/mediasoup/transports/${transportId}/consume`, {
      producerId,
      rtpCapabilities
    });
    return response.data;
  }

  async resumeConsumer(consumerId) {
    const response = await this.client.post(`/mediasoup/consumers/${consumerId}/resume`);
    return response.data;
  }
}

export default new ApiClient();
