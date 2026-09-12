const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { createPostController, getPostsController } = require('../controllers/post.controller');
const upload = require('../middlewares/upload.middleware');
const { aiLimiter } = require('../middlewares/rateLimiter.middleware');

/* GET /api/posts [protected] - Retrieve user post history with pagination */
router.get('/', authMiddleware, getPostsController);

/* POST /api/posts/post [protected] {image-file}*/
router.post(
  '/post',
  authMiddleware,
  aiLimiter,
  upload.single('image'),
  createPostController
);

router.post(
  '/generate',
  authMiddleware,
  aiLimiter,
  upload.single('image'),
  createPostController
);

module.exports = router;
