const mediasoup = require('mediasoup');
const os = require('os');

class MediasoupHandler {
  constructor() {
    this.workers = [];
    this.routers = new Map(); // broadcastId -> router
    this.transports = new Map(); // transportId -> transport
    this.producers = new Map(); // producerId -> producer
    this.consumers = new Map(); // consumerId -> consumer
    this.nextWorkerIndex = 0;
  }

  async initialize() {
    const numWorkers = parseInt(process.env.MEDIASOUP_NUM_WORKERS) || os.cpus().length;

    console.log(`Creating ${numWorkers} mediasoup workers...`);

    for (let i = 0; i < numWorkers; i++) {
      const worker = await mediasoup.createWorker({
        logLevel: 'warn',
        rtcMinPort: parseInt(process.env.MEDIASOUP_MIN_PORT) || 40000,
        rtcMaxPort: parseInt(process.env.MEDIASOUP_MAX_PORT) || 49999,
      });

      worker.on('died', () => {
        console.error(`mediasoup worker ${worker.pid} died, exiting in 2 seconds...`);
        setTimeout(() => process.exit(1), 2000);
      });

      this.workers.push(worker);
      console.log(`mediasoup worker ${worker.pid} created`);
    }

    console.log('mediasoup initialized successfully');
  }

  getNextWorker() {
    const worker = this.workers[this.nextWorkerIndex];
    this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
    return worker;
  }

  async createRouter(broadcastId) {
    const worker = this.getNextWorker();

    const router = await worker.createRouter({
      mediaCodecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
          parameters: {
            useinbandfec: 1,
            usedtx: 1
          }
        }
      ]
    });

    this.routers.set(broadcastId, router);
    console.log(`Router created for broadcast ${broadcastId}`);

    return router;
  }

  getRouter(broadcastId) {
    return this.routers.get(broadcastId);
  }

  async deleteRouter(broadcastId) {
    const router = this.routers.get(broadcastId);

    if (router) {
      router.close();
      this.routers.delete(broadcastId);
      console.log(`Router deleted for broadcast ${broadcastId}`);
    }
  }

  async createWebRtcTransport(broadcastId, type = 'send') {
    const router = this.getRouter(broadcastId) || await this.createRouter(broadcastId);

    const transport = await router.createWebRtcTransport({
      listenIps: [
        {
          ip: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
          announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || undefined
        }
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1000000,
      minimumAvailableOutgoingBitrate: 600000,
      maxSctpMessageSize: 262144,
      maxIncomingBitrate: 1500000
    });

    transport.on('dtlsstatechange', (dtlsState) => {
      if (dtlsState === 'closed') {
        transport.close();
      }
    });

    transport.on('close', () => {
      this.transports.delete(transport.id);
      console.log(`Transport ${transport.id} closed`);
    });

    this.transports.set(transport.id, transport);

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      sctpParameters: transport.sctpParameters
    };
  }

  async connectTransport(transportId, dtlsParameters) {
    const transport = this.transports.get(transportId);

    if (!transport) {
      throw new Error('Transport not found');
    }

    await transport.connect({ dtlsParameters });
    console.log(`Transport ${transportId} connected`);
  }

  async createProducer(transportId, kind, rtpParameters) {
    const transport = this.transports.get(transportId);

    if (!transport) {
      throw new Error('Transport not found');
    }

    const producer = await transport.produce({
      kind,
      rtpParameters
    });

    producer.on('transportclose', () => {
      producer.close();
      this.producers.delete(producer.id);
      console.log(`Producer ${producer.id} closed (transport closed)`);
    });

    this.producers.set(producer.id, producer);
    console.log(`Producer ${producer.id} created for ${kind}`);

    return {
      id: producer.id,
      kind: producer.kind
    };
  }

  async createConsumer(transportId, producerId, rtpCapabilities) {
    const transport = this.transports.get(transportId);

    if (!transport) {
      throw new Error('Transport not found');
    }

    const producer = this.producers.get(producerId);

    if (!producer) {
      throw new Error('Producer not found');
    }

    const router = Array.from(this.routers.values()).find(r =>
      r.canConsume({ producerId, rtpCapabilities })
    );

    if (!router) {
      throw new Error('Cannot consume this producer');
    }

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: false
    });

    consumer.on('transportclose', () => {
      consumer.close();
      this.consumers.delete(consumer.id);
      console.log(`Consumer ${consumer.id} closed (transport closed)`);
    });

    consumer.on('producerclose', () => {
      consumer.close();
      this.consumers.delete(consumer.id);
      console.log(`Consumer ${consumer.id} closed (producer closed)`);
    });

    this.consumers.set(consumer.id, consumer);
    console.log(`Consumer ${consumer.id} created`);

    return {
      id: consumer.id,
      producerId: consumer.producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters
    };
  }

  async pauseProducer(producerId) {
    const producer = this.producers.get(producerId);

    if (!producer) {
      throw new Error('Producer not found');
    }

    await producer.pause();
    console.log(`Producer ${producerId} paused`);
  }

  async resumeProducer(producerId) {
    const producer = this.producers.get(producerId);

    if (!producer) {
      throw new Error('Producer not found');
    }

    await producer.resume();
    console.log(`Producer ${producerId} resumed`);
  }

  async pauseConsumer(consumerId) {
    const consumer = this.consumers.get(consumerId);

    if (!consumer) {
      throw new Error('Consumer not found');
    }

    await consumer.pause();
    console.log(`Consumer ${consumerId} paused`);
  }

  async resumeConsumer(consumerId) {
    const consumer = this.consumers.get(consumerId);

    if (!consumer) {
      throw new Error('Consumer not found');
    }

    await consumer.resume();
    console.log(`Consumer ${consumerId} resumed`);
  }

  closeProducer(producerId) {
    const producer = this.producers.get(producerId);

    if (producer) {
      producer.close();
      this.producers.delete(producerId);
      console.log(`Producer ${producerId} closed`);
    }
  }

  closeConsumer(consumerId) {
    const consumer = this.consumers.get(consumerId);

    if (consumer) {
      consumer.close();
      this.consumers.delete(consumerId);
      console.log(`Consumer ${consumerId} closed`);
    }
  }

  closeTransport(transportId) {
    const transport = this.transports.get(transportId);

    if (transport) {
      transport.close();
      this.transports.delete(transportId);
      console.log(`Transport ${transportId} closed`);
    }
  }

  getRouterRtpCapabilities(broadcastId) {
    const router = this.getRouter(broadcastId);

    if (!router) {
      return null;
    }

    return router.rtpCapabilities;
  }

  getProducer(producerId) {
    return this.producers.get(producerId);
  }

  getConsumer(consumerId) {
    return this.consumers.get(consumerId);
  }

  getTransport(transportId) {
    return this.transports.get(transportId);
  }

  getStats() {
    return {
      workers: this.workers.length,
      routers: this.routers.size,
      transports: this.transports.size,
      producers: this.producers.size,
      consumers: this.consumers.size
    };
  }

  async getProducerStats(producerId) {
    const producer = this.producers.get(producerId);

    if (!producer) {
      throw new Error('Producer not found');
    }

    return await producer.getStats();
  }

  async getConsumerStats(consumerId) {
    const consumer = this.consumers.get(consumerId);

    if (!consumer) {
      throw new Error('Consumer not found');
    }

    return await consumer.getStats();
  }

  async cleanupBroadcast(broadcastId) {
    // Close all consumers, producers, and transports for this broadcast
    const router = this.getRouter(broadcastId);

    if (router) {
      // Collect all transports for this router
      const transportsToClose = [];

      for (const [transportId, transport] of this.transports.entries()) {
        // Close the transport
        transportsToClose.push(transportId);
      }

      transportsToClose.forEach(id => this.closeTransport(id));

      // Delete router
      await this.deleteRouter(broadcastId);
    }

    console.log(`Cleaned up mediasoup resources for broadcast ${broadcastId}`);
  }
}

module.exports = new MediasoupHandler();
