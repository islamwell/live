const express = require('express');
const authService = require('./authService');
const { validate, schemas } = require('../middleware/validator');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Register new user
router.post('/register', validate(schemas.register), async (req, res) => {
  try {
    const result = await authService.register(req.validatedData);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Login
router.post('/login', validate(schemas.login), async (req, res) => {
  try {
    const result = await authService.login(req.validatedData);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

// Refresh access token
router.post('/refresh', validate(schemas.refreshToken), async (req, res) => {
  try {
    const result = await authService.refreshAccessToken(req.validatedData.refreshToken);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  res.json({ user: req.user });
});

// Logout (client-side only, invalidate tokens)
router.post('/logout', authenticate, async (req, res) => {
  // In a production app, you might want to blacklist the token
  // or maintain a session store
  res.json({ message: 'Logged out successfully' });
});

// Update FCM token
router.post('/fcm-token', authenticate, async (req, res) => {
  try {
    const { fcmToken } = req.body;
    await req.user.update({ fcmToken });
    res.json({ message: 'FCM token updated' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update APNS token
router.post('/apns-token', authenticate, async (req, res) => {
  try {
    const { apnsToken } = req.body;
    await req.user.update({ apnsToken });
    res.json({ message: 'APNS token updated' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update web push subscription
router.post('/web-push-subscription', authenticate, async (req, res) => {
  try {
    const { subscription } = req.body;
    await req.user.update({ webPushSubscription: subscription });
    res.json({ message: 'Web push subscription updated' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
