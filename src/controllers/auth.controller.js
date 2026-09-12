const userModel = require('../models/user.models');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { config } = require('../config/env.config');

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.isProduction,
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// ============================================================
// REGISTER CONTROLLER
// ============================================================
async function registerController(req, res, next) {
  try {
    const { username, email, password } = req.body;

    // Validate required fields
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username, email and password are required',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
      });
    }

    // Normalize values
    const normalizedUsername = username.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();

    // Check whether username OR email already exists
    const existingUser = await userModel.findOne({
      $or: [
        { username: normalizedUsername },
        { email: normalizedEmail },
      ],
    });

    if (existingUser) {
      if (existingUser.username === normalizedUsername) {
        return res.status(409).json({
          success: false,
          message: 'Username already exists',
        });
      }

      if (existingUser.email === normalizedEmail) {
        return res.status(409).json({
          success: false,
          message: 'Email already registered',
        });
      }

      return res.status(409).json({
        success: false,
        message: 'User already exists',
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await userModel.create({
      username: normalizedUsername,
      email: normalizedEmail,
      password: hashedPassword,
    });

    // Generate JWT with mandatory secret
    const token = jwt.sign(
      {
        user: user._id,
      },
      config.jwtSecret,
      {
        expiresIn: '7d',
      }
    );

    // Store token in HTTP-only cookie
    res.cookie('token', token, COOKIE_OPTIONS);

    // Send response (exclude password)
    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    return next(error);
  }
}

// ============================================================
// LOGIN CONTROLLER
// ============================================================
async function loginController(req, res, next) {
  try {
    const { identifier, username, password } = req.body;
    const loginIdentifier = identifier || username;

    // Validate required fields
    if (!loginIdentifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username/email and password are required',
      });
    }

    // Normalize username/email
    const normalizedIdentifier = loginIdentifier.trim().toLowerCase();

    // Find user using username OR email
    const user = await userModel.findOne({
      $or: [
        { username: normalizedIdentifier },
        { email: normalizedIdentifier },
      ],
    });

    // Do not reveal whether username/email exists to prevent account enumeration
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Generate JWT with mandatory secret
    const token = jwt.sign(
      {
        user: user._id,
      },
      config.jwtSecret,
      {
        expiresIn: '7d',
      }
    );

    // Store JWT in HTTP-only cookie
    res.cookie('token', token, COOKIE_OPTIONS);

    // Send response
    return res.status(200).json({
      success: true,
      message: 'User logged in successfully',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    return next(error);
  }
}

// ============================================================
// LOGOUT CONTROLLER
// ============================================================
async function logoutController(req, res) {
  res.clearCookie('token', {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
  });

  return res.status(200).json({
    success: true,
    message: 'User logged out successfully',
  });
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  registerController,
  loginController,
  logoutController,
};
