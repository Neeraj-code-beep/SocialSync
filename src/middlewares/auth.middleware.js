const jwt = require('jsonwebtoken');
const userModel = require('../models/user.models');
const { config } = require('../config/env.config');

async function authMiddleware(req, res, next) {
  try {
    // 1. Extract token from HTTP-only cookie or Authorization Bearer header
    let token = req.cookies?.token;
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized access. No authentication token provided.',
      });
    }

    // 2. Verify JWT signature with mandatory secret
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Session has expired. Please log in again.',
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token.',
      });
    }

    const userId = decoded.user || decoded.id || decoded.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Malformed token payload.',
      });
    }

    // 3. Verify user existence in database (excluding password hash from req.user)
    const user = await userModel.findById(userId).select('-password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User account no longer exists or session is invalid.',
      });
    }

    // 4. Attach sanitized user object to request
    req.user = user;
    next();
  } catch (error) {
    return next(error);
  }
}

module.exports = authMiddleware;
