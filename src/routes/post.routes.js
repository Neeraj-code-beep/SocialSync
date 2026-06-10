const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const { createPostController } = require('../controllers/post.controller');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

/* POST /api/post [protected] {image-file}*/
router.post(
  '/post',
  authMiddleware,
  upload.single('image'),
  createPostController,
);

module.exports = router;
