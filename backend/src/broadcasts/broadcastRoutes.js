const express = require('express');
const broadcastService = require('./broadcastService');
const { authenticate, hostOnly, optionalAuth } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validator');

const router = express.Router();

// Create new broadcast (host/admin only)
router.post('/', authenticate, hostOnly, validate(schemas.createBroadcast), async (req, res) => {
  try {
    const broadcast = await broadcastService.createBroadcast(req.user.id, req.validatedData);
    res.status(201).json(broadcast);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// List broadcasts with filters
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { status, hostId, isPublic, limit, offset, search } = req.query;

    const filters = {
      status,
      hostId,
      isPublic: isPublic !== undefined ? isPublic === 'true' : undefined,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
      search
    };

    const result = await broadcastService.listBroadcasts(filters);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get upcoming broadcasts
router.get('/upcoming', optionalAuth, async (req, res) => {
  try {
    const { limit } = req.query;
    const broadcasts = await broadcastService.getUpcomingBroadcasts(
      req.user?.id,
      limit ? parseInt(limit) : undefined
    );
    res.json(broadcasts);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get live broadcasts
router.get('/live', async (req, res) => {
  try {
    const { limit } = req.query;
    const broadcasts = await broadcastService.getLiveBroadcasts(
      limit ? parseInt(limit) : undefined
    );
    res.json(broadcasts);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get past broadcasts
router.get('/past', optionalAuth, async (req, res) => {
  try {
    const { hostId, limit, offset } = req.query;
    const result = await broadcastService.getPastBroadcasts(
      hostId,
      limit ? parseInt(limit) : undefined,
      offset ? parseInt(offset) : undefined
    );
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get specific broadcast
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const broadcast = await broadcastService.getBroadcast(req.params.id, req.user?.id);
    res.json(broadcast);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// Update broadcast
router.patch('/:id', authenticate, validate(schemas.updateBroadcast), async (req, res) => {
  try {
    const broadcast = await broadcastService.updateBroadcast(
      req.params.id,
      req.user.id,
      req.user.role,
      req.validatedData
    );
    res.json(broadcast);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete broadcast
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const broadcast = await broadcastService.deleteBroadcast(
      req.params.id,
      req.user.id,
      req.user.role
    );
    res.json({ message: 'Broadcast deleted', broadcast });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Start broadcast
router.post('/:id/start', authenticate, hostOnly, async (req, res) => {
  try {
    const broadcast = await broadcastService.startBroadcast(req.params.id, req.user.id);
    res.json(broadcast);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// End broadcast
router.post('/:id/end', authenticate, async (req, res) => {
  try {
    const broadcast = await broadcastService.endBroadcast(
      req.params.id,
      req.user.id,
      req.user.role
    );
    res.json(broadcast);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get broadcast statistics
router.get('/:id/stats', authenticate, async (req, res) => {
  try {
    const stats = await broadcastService.getBroadcastStats(req.params.id);
    res.json(stats);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Trigger reminders manually
router.post('/:id/remind', authenticate, hostOnly, async (req, res) => {
  try {
    // This would trigger the notification worker
    res.json({ message: 'Reminders will be sent' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
