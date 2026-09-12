const express = require('express');
const router = express.Router();
const {
  registerController,
  loginController,
  logoutController,
} = require('../controllers/auth.controller');
const healthChecker = require('../controllers/health.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { authLimiter } = require('../middlewares/rateLimiter.middleware');

router.post('/register', authLimiter, registerController);
router.post('/login', authLimiter, loginController);
router.post('/logout', logoutController);
router.get('/health', healthChecker);

router.get('/me', authMiddleware, (req, res) => {
  res.status(200).json({
    success: true,
    user: {
      id: req.user._id,
      username: req.user.username,
      email: req.user.email,
    },
  });
});

module.exports = router;
