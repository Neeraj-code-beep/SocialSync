const express = require('express');
const router = express.Router();
const {
  registerController,
  loginController,
} = require('../controllers/auth.controller');
const healthChecker = require('../controllers/health.controller');

/*
POST /register
POST /login
GET /user [protected
]
*/

const authMiddleware = require('../middlewares/auth.middleware');

router.post('/register', registerController);
router.post('/login', loginController);
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
