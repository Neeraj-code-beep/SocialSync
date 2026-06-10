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

router.post('/register', registerController);
router.post('/login', loginController);
router.get('/health', healthChecker);

module.exports = router;
