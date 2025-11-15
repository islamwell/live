const authService = require('../auth/authService');

// Middleware to authenticate JWT token
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const user = await authService.getUserFromToken(token);

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: error.message });
  }
};

// Middleware to check if user has required role(s)
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!authService.hasRole(req.user, allowedRoles)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: req.user.role
      });
    }

    next();
  };
};

// Middleware for admin-only routes
const adminOnly = authorize('admin');

// Middleware for host and admin routes
const hostOnly = authorize('admin', 'host');

// Optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const user = await authService.getUserFromToken(token);
      req.user = user;
    }

    next();
  } catch (error) {
    // Continue without user
    next();
  }
};

module.exports = {
  authenticate,
  authorize,
  adminOnly,
  hostOnly,
  optionalAuth
};
