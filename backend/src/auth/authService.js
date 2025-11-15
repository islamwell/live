const jwt = require('jsonwebtoken');
const { User } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

class AuthService {
  generateAccessToken(user) {
    const payload = {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      type: 'access'
    };

    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN
    });
  }

  generateRefreshToken(user) {
    const payload = {
      id: user.id,
      type: 'refresh'
    };

    return jwt.sign(payload, JWT_REFRESH_SECRET, {
      expiresIn: JWT_REFRESH_EXPIRES_IN
    });
  }

  generateTokens(user) {
    return {
      accessToken: this.generateAccessToken(user),
      refreshToken: this.generateRefreshToken(user)
    };
  }

  verifyAccessToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid or expired access token');
    }
  }

  verifyRefreshToken(token) {
    try {
      return jwt.verify(token, JWT_REFRESH_SECRET);
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }

  async register(userData) {
    const { email, username, password, role = 'listener', displayName } = userData;

    // Check if user already exists
    const existingUser = await User.findOne({
      where: {
        [require('sequelize').Op.or]: [{ email }, { username }]
      }
    });

    if (existingUser) {
      if (existingUser.email === email) {
        throw new Error('Email already in use');
      }
      if (existingUser.username === username) {
        throw new Error('Username already taken');
      }
    }

    // Create user
    const user = await User.create({
      email,
      username,
      password,
      role,
      displayName: displayName || username
    });

    // Generate tokens
    const tokens = this.generateTokens(user);

    return {
      user: user.toJSON(),
      ...tokens
    };
  }

  async login(credentials) {
    const { email, password } = credentials;

    // Find user
    const user = await User.findOne({ where: { email } });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Check if user is suspended
    if (user.isSuspended) {
      throw new Error('Account has been suspended');
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    await user.update({ lastLoginAt: new Date() });

    // Generate tokens
    const tokens = this.generateTokens(user);

    return {
      user: user.toJSON(),
      ...tokens
    };
  }

  async refreshAccessToken(refreshToken) {
    const decoded = this.verifyRefreshToken(refreshToken);

    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    const user = await User.findByPk(decoded.id);

    if (!user) {
      throw new Error('User not found');
    }

    if (user.isSuspended) {
      throw new Error('Account has been suspended');
    }

    return {
      accessToken: this.generateAccessToken(user)
    };
  }

  async getUserFromToken(token) {
    const decoded = this.verifyAccessToken(token);
    const user = await User.findByPk(decoded.id);

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  hasRole(user, allowedRoles) {
    if (!Array.isArray(allowedRoles)) {
      allowedRoles = [allowedRoles];
    }

    return allowedRoles.includes(user.role);
  }

  isAdmin(user) {
    return user.role === 'admin';
  }

  isHost(user) {
    return user.role === 'admin' || user.role === 'host';
  }
}

module.exports = new AuthService();
