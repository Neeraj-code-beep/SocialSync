const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const {
  createPostController,
  getPostsController,
  publishPostToLinkedInController,
  getPostPublicationsController,
  getPublicationController,
  syncPublicationController,
  updatePublicationCommentaryController,
  deletePublicationController,
} = require('../controllers/post.controller');
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

/* POST /api/posts/:postId/publish/linkedin [protected] - Publish text post to LinkedIn */
router.post('/:postId/publish/linkedin', authMiddleware, publishPostToLinkedInController);

/* GET /api/posts/:postId/publications [protected] - List publications for post */
router.get('/:postId/publications', authMiddleware, getPostPublicationsController);

/* GET /api/posts/:postId/publications/:publicationId [protected] - Get single publication */
router.get('/:postId/publications/:publicationId', authMiddleware, getPublicationController);

/* POST /api/posts/:postId/publications/:publicationId/sync [protected] - Sync publication from LinkedIn */
router.post('/:postId/publications/:publicationId/sync', authMiddleware, syncPublicationController);

/* PATCH /api/posts/:postId/publications/:publicationId [protected] - Update LinkedIn publication commentary */
router.patch('/:postId/publications/:publicationId', authMiddleware, updatePublicationCommentaryController);

/* DELETE /api/posts/:postId/publications/:publicationId [protected] - Delete publication on LinkedIn */
router.delete('/:postId/publications/:publicationId', authMiddleware, deletePublicationController);

module.exports = router;
