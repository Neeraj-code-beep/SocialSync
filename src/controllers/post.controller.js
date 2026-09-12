const postModel = require('../models/post.model');
const generateCaption = require('../services/ai.service');
const uploadFile = require('../services/storage.service');
const { v4: uuidv4 } = require('uuid');

const createPostController = async (req, res, next) => {
  try {
    const file = req.file;

    // 1. Guard against missing file payload
    if (!file || !file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'An image file is required to create a post.',
      });
    }

    // 2. Generate AI Caption using dynamic MIME type and file buffer
    const caption = await generateCaption(file.buffer, file.mimetype);

    // 3. Upload image buffer to ImageKit CDN
    const filename = `${uuidv4()}-${Date.now()}`;
    const storageResult = await uploadFile(file.buffer, filename);

    // 4. Persist post metadata in database with authenticated user ID
    const post = await postModel.create({
      caption: caption,
      image: storageResult.url,
      user: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: 'Post created successfully',
      post,
    });
  } catch (error) {
    return next(error);
  }
};

const getPostsController = async (req, res, next) => {
  try {
    // 1. Sanitize & normalize pagination query parameters
    let page = parseInt(req.query.page, 10);
    let limit = parseInt(req.query.limit, 10);

    if (isNaN(page) || page < 1) {
      page = 1;
    }

    if (isNaN(limit) || limit < 1) {
      limit = 10;
    } else if (limit > 50) {
      limit = 50;
    }

    const skip = (page - 1) * limit;

    // 2. Query posts strictly scoped to authenticated user with newest posts first
    const query = { user: req.user._id };

    const [posts, totalPosts] = await Promise.all([
      postModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      postModel.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalPosts / limit) || 1;
    const hasMore = page < totalPages;

    return res.status(200).json({
      success: true,
      posts,
      pagination: {
        totalPosts,
        totalPages,
        currentPage: page,
        limit,
        hasMore,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createPostController,
  getPostsController,
};
