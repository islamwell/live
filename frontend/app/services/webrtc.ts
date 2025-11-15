import { Device } from 'mediasoup-client';
import { Transport, Producer, Consumer } from 'mediasoup-client/lib/types';
import apiClient from './api';

class WebRTCService {
  private device: Device | null = null;
  private sendTransport: Transport | null = null;
  private recvTransport: Transport | null = null;
  private producer: Producer | null = null;
  private consumer: Consumer | null = null;
  private broadcastId: string | null = null;

  async initialize(broadcastId: string) {
    this.broadcastId = broadcastId;

    // Create mediasoup device
    this.device = new Device();

    // Get router RTP capabilities from server
    const { rtpCapabilities } = await apiClient.getRtpCapabilities(broadcastId);

    // Load device with RTP capabilities
    await this.device.load({ routerRtpCapabilities: rtpCapabilities });

    console.log('WebRTC device initialized');
  }

  async startPublishing(audioTrack: MediaStreamTrack) {
    if (!this.device || !this.broadcastId) {
      throw new Error('Device not initialized');
    }

    // Create send transport
    const transportParams = await apiClient.createTransport(this.broadcastId, 'send');

    this.sendTransport = this.device.createSendTransport(transportParams);

    // Connect transport
    this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await apiClient.connectTransport(this.sendTransport!.id, dtlsParameters);
        callback();
      } catch (error) {
        errback(error as Error);
      }
    });

    // Produce
    this.sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
      try {
        const { id } = await apiClient.produce(
          this.sendTransport!.id,
          kind,
          rtpParameters
        );
        callback({ id });
      } catch (error) {
        errback(error as Error);
      }
    });

    // Produce audio track
    this.producer = await this.sendTransport.produce({
      track: audioTrack,
      codecOptions: {
        opusStereo: true,
        opusDtx: true,
        opusFec: true,
        opusMaxPlaybackRate: 48000
      }
    });

    this.producer.on('transportclose', () => {
      console.log('Send transport closed');
    });

    this.producer.on('trackended', () => {
      console.log('Audio track ended');
    });

    console.log('Started publishing audio');
    return this.producer;
  }

  async startConsuming(producerId: string) {
    if (!this.device || !this.broadcastId) {
      throw new Error('Device not initialized');
    }

    // Create receive transport
    const transportParams = await apiClient.createTransport(this.broadcastId, 'recv');

    this.recvTransport = this.device.createRecvTransport(transportParams);

    // Connect transport
    this.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await apiClient.connectTransport(this.recvTransport!.id, dtlsParameters);
        callback();
      } catch (error) {
        errback(error as Error);
      }
    });

    // Consume
    const consumerParams = await apiClient.consume(
      this.recvTransport.id,
      producerId,
      this.device.rtpCapabilities
    );

    this.consumer = await this.recvTransport.consume(consumerParams);

    // Resume consumer
    await apiClient.resumeConsumer(this.consumer.id);

    this.consumer.on('transportclose', () => {
      console.log('Receive transport closed');
    });

    console.log('Started consuming audio');
    return this.consumer.track;
  }

  async stopPublishing() {
    if (this.producer) {
      this.producer.close();
      this.producer = null;
    }

    if (this.sendTransport) {
      this.sendTransport.close();
      this.sendTransport = null;
    }

    console.log('Stopped publishing');
  }

  async stopConsuming() {
    if (this.consumer) {
      this.consumer.close();
      this.consumer = null;
    }

    if (this.recvTransport) {
      this.recvTransport.close();
      this.recvTransport = null;
    }

    console.log('Stopped consuming');
  }

  async cleanup() {
    await this.stopPublishing();
    await this.stopConsuming();
    this.device = null;
    this.broadcastId = null;
    console.log('WebRTC cleaned up');
  }

  pauseProducer() {
    if (this.producer) {
      this.producer.pause();
    }
  }

  resumeProducer() {
    if (this.producer) {
      this.producer.resume();
    }
  }

  pauseConsumer() {
    if (this.consumer) {
      this.consumer.pause();
    }
  }

  resumeConsumer() {
    if (this.consumer) {
      this.consumer.resume();
    }
  }

  getStats() {
    return {
      producer: this.producer?.getStats(),
      consumer: this.consumer?.getStats()
    };
  }

  isPublishing() {
    return this.producer !== null && !this.producer.closed;
  }

  isConsuming() {
    return this.consumer !== null && !this.consumer.closed;
  }
}

export default new WebRTCService();
