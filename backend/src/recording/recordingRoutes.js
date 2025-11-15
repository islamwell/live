const express = require('express');
const recordingService = require('./recordingService');
const { authenticate, hostOnly } = require('../middleware/auth');

const router = express.Router();

// Start recording
router.post('/broadcasts/:broadcastId/record/start', authenticate, hostOnly, async (req, res) => {
  try {
    const recording = await recordingService.startRecording(req.params.broadcastId, req.user.id);
    res.json(recording);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Stop recording
router.post('/broadcasts/:broadcastId/record/stop', authenticate, async (req, res) => {
  try {
    const recording = await recordingService.stopRecording(
      req.params.broadcastId,
      req.user.id,
      req.user.role
    );
    res.json(recording);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// List recordings
router.get('/', authenticate, async (req, res) => {
  try {
    const { broadcastId, isPublic, limit, offset } = req.query;

    const filters = {
      broadcastId,
      isPublic: isPublic !== undefined ? isPublic === 'true' : undefined,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined
    };

    const result = await recordingService.listRecordings(filters);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get specific recording
router.get('/:id', authenticate, async (req, res) => {
  try {
    const recording = await recordingService.getRecording(req.params.id);
    res.json(recording);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// Update recording visibility
router.patch('/:id/visibility', authenticate, async (req, res) => {
  try {
    const { isPublic } = req.body;

    const recording = await recordingService.updateRecordingVisibility(
      req.params.id,
      isPublic,
      req.user.id,
      req.user.role
    );

    res.json(recording);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete recording
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await recordingService.deleteRecording(
      req.params.id,
      req.user.id,
      req.user.role
    );

    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get recordings for a broadcast
router.get('/broadcasts/:broadcastId', authenticate, async (req, res) => {
  try {
    const result = await recordingService.listRecordings({
      broadcastId: req.params.broadcastId
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
