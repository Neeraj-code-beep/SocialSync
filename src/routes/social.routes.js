const express = require('express');
const authMiddleware = require('../middlewares/auth.middleware');
const {
  connectLinkedIn,
  reauthorizeLinkedIn,
  linkedinCallback,
  getConnectedAccounts,
  disconnectLinkedIn,
} = require('../controllers/social.controller');

const router = express.Router();

// 1. Initiate LinkedIn OAuth connection (requires active user session)
router.get('/linkedin/connect', authMiddleware, connectLinkedIn);

// 2. Reauthorize LinkedIn OAuth connection with latest required scopes
router.post('/linkedin/reauthorize', authMiddleware, reauthorizeLinkedIn);

// 3. LinkedIn OAuth 2.0 redirect callback endpoint
router.get('/linkedin/callback', linkedinCallback);

// 4. List connected social accounts for the authenticated member
router.get('/accounts', authMiddleware, getConnectedAccounts);

// 5. Disconnect LinkedIn account safely
router.delete('/linkedin', authMiddleware, disconnectLinkedIn);
router.delete('/linkedin/:id', authMiddleware, disconnectLinkedIn);

module.exports = router;
