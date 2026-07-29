const userModel = require('../models/user.models');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');


// ============================================================
// REGISTER CONTROLLER
// ============================================================

async function registerController(req, res) {
  try {
    const { username, email, password } = req.body;

    // Validate required fields
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username, email and password are required',
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
      // Give a more useful error message
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

    // Generate JWT
    const token = jwt.sign(
      {
        user: user._id,
      },
      process.env.JWT_SECRET || 'secret',
      {
        expiresIn: '7d',
      }
    );

    // Store token in cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Send response
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
    console.error('Register Controller Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
}


// ============================================================
// LOGIN CONTROLLER
// ============================================================

async function loginController(req, res) {
  try {
    /*
      "identifier" can contain either:

      username
      OR
      email

      Example:

      {
        "identifier": "dheeraj"
      }

      OR

      {
        "identifier": "dheeraj@gmail.com"
      }
    */

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

    // Do not reveal whether username/email exists
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username/email or password',
      });
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(
      password,
      user.password
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username/email or password',
      });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        user: user._id,
      },
      process.env.JWT_SECRET || 'secret',
      {
        expiresIn: '7d',
      }
    );

    // Store JWT in cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

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
    console.error('Login Controller Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  registerController,
  loginController,
};
