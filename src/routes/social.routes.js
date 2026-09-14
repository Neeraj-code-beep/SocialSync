const express = require('express');
const authMiddleware = require('../middlewares/auth.middleware');
const {
  connectLinkedIn,
  linkedinCallback,
  getConnectedAccounts,
} = require('../controllers/social.controller');

const router = express.Router();

// 1. Initiate LinkedIn OAuth connection (requires active user session)
router.get('/linkedin/connect', authMiddleware, connectLinkedIn);

// 2. LinkedIn OAuth 2.0 redirect callback endpoint
router.get('/linkedin/callback', linkedinCallback);

// 3. List connected social accounts for the authenticated member
router.get('/accounts', authMiddleware, getConnectedAccounts);

module.exports = router;
