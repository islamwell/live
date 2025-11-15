const express = require('express');
const mediasoupHandler = require('./mediasoupHandler');
const { authenticate } = require('../middleware/auth');
const { Broadcast, Session } = require('../models');

const router = express.Router();

// Get router RTP capabilities for a broadcast
router.get('/:broadcastId/rtp-capabilities', authenticate, async (req, res) => {
  try {
    const { broadcastId } = req.params;

    // Check if broadcast exists
    const broadcast = await Broadcast.findByPk(broadcastId);

    if (!broadcast) {
      return res.status(404).json({ error: 'Broadcast not found' });
    }

    // Get or create router
    let rtpCapabilities = mediasoupHandler.getRouterRtpCapabilities(broadcastId);

    if (!rtpCapabilities) {
      await mediasoupHandler.createRouter(broadcastId);
      rtpCapabilities = mediasoupHandler.getRouterRtpCapabilities(broadcastId);
    }

    res.json({ rtpCapabilities });
  } catch (error) {
    console.error('Error getting RTP capabilities:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create WebRTC transport
router.post('/:broadcastId/transports', authenticate, async (req, res) => {
  try {
    const { broadcastId } = req.params;
    const { type } = req.body; // 'send' or 'recv'

    const transportParams = await mediasoupHandler.createWebRtcTransport(broadcastId, type);

    // Store transport ID in session
    const session = await Session.findOne({
      where: {
        broadcastId,
        userId: req.user.id,
        status: 'connected'
      }
    });

    if (session) {
      await session.update({ transportId: transportParams.id });
    }

    res.json(transportParams);
  } catch (error) {
    console.error('Error creating transport:', error);
    res.status(500).json({ error: error.message });
  }
});

// Connect transport
router.post('/transports/:transportId/connect', authenticate, async (req, res) => {
  try {
    const { transportId } = req.params;
    const { dtlsParameters } = req.body;

    await mediasoupHandler.connectTransport(transportId, dtlsParameters);

    res.json({ connected: true });
  } catch (error) {
    console.error('Error connecting transport:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create producer (for hosts publishing audio)
router.post('/transports/:transportId/produce', authenticate, async (req, res) => {
  try {
    const { transportId } = req.params;
    const { kind, rtpParameters } = req.body;

    const producerParams = await mediasoupHandler.createProducer(transportId, kind, rtpParameters);

    // Store producer ID in session
    const transport = mediasoupHandler.getTransport(transportId);
    const session = await Session.findOne({
      where: {
        transportId,
        userId: req.user.id,
        status: 'connected'
      }
    });

    if (session) {
      await session.update({ producerId: producerParams.id });
    }

    res.json(producerParams);
  } catch (error) {
    console.error('Error creating producer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create consumer (for listeners receiving audio)
router.post('/transports/:transportId/consume', authenticate, async (req, res) => {
  try {
    const { transportId } = req.params;
    const { producerId, rtpCapabilities } = req.body;

    const consumerParams = await mediasoupHandler.createConsumer(
      transportId,
      producerId,
      rtpCapabilities
    );

    // Store consumer ID in session
    const session = await Session.findOne({
      where: {
        userId: req.user.id,
        status: 'connected'
      }
    });

    if (session) {
      const consumerIds = session.consumerIds || [];
      consumerIds.push(consumerParams.id);
      await session.update({ consumerIds });
    }

    res.json(consumerParams);
  } catch (error) {
    console.error('Error creating consumer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Resume consumer
router.post('/consumers/:consumerId/resume', authenticate, async (req, res) => {
  try {
    const { consumerId } = req.params;

    await mediasoupHandler.resumeConsumer(consumerId);

    res.json({ resumed: true });
  } catch (error) {
    console.error('Error resuming consumer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Pause producer
router.post('/producers/:producerId/pause', authenticate, async (req, res) => {
  try {
    const { producerId } = req.params;

    await mediasoupHandler.pauseProducer(producerId);

    res.json({ paused: true });
  } catch (error) {
    console.error('Error pausing producer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Resume producer
router.post('/producers/:producerId/resume', authenticate, async (req, res) => {
  try {
    const { producerId } = req.params;

    await mediasoupHandler.resumeProducer(producerId);

    res.json({ resumed: true });
  } catch (error) {
    console.error('Error resuming producer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get mediasoup stats
router.get('/stats', authenticate, async (req, res) => {
  try {
    const stats = mediasoupHandler.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get producer stats
router.get('/producers/:producerId/stats', authenticate, async (req, res) => {
  try {
    const { producerId } = req.params;
    const stats = await mediasoupHandler.getProducerStats(producerId);
    res.json(stats);
  } catch (error) {
    console.error('Error getting producer stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get consumer stats
router.get('/consumers/:consumerId/stats', authenticate, async (req, res) => {
  try {
    const { consumerId } = req.params;
    const stats = await mediasoupHandler.getConsumerStats(consumerId);
    res.json(stats);
  } catch (error) {
    console.error('Error getting consumer stats:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
