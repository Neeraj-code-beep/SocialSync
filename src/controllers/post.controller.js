const postModel = require('../models/post.model');
const SocialAccount = require('../models/socialAccount.model');
const Publication = require('../models/publication.model');
const generateCaption = require('../services/ai.service');
const uploadFile = require('../services/storage.service');
const { linkedinProvider } = require('../services/providers');
const { decrypt } = require('../lib/encryption');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');

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

/**
 * Publishes a text-only post to LinkedIn
 * POST /api/posts/:postId/publish/linkedin
 */
const publishPostToLinkedInController = async (req, res, next) => {
  const { postId } = req.params;
  const { socialAccountId } = req.body;
  const userId = req.user._id;

  // 1. Validate parameter formats
  if (!postId || (mongoose.Types.ObjectId.isValid && !mongoose.Types.ObjectId.isValid(postId))) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or missing postId.',
    });
  }

  if (!socialAccountId || (mongoose.Types.ObjectId.isValid && !mongoose.Types.ObjectId.isValid(socialAccountId))) {
    return res.status(400).json({
      success: false,
      message: 'A valid socialAccountId is required in request body.',
    });
  }

  try {
    // 2. Load post strictly scoped to authenticated user
    const post = await postModel.findOne({ _id: postId, user: userId });
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found or unauthorized.',
      });
    }

    // 3. Load social account strictly scoped to authenticated user (explicitly selecting encrypted access token)
    const socialAccount = await SocialAccount.findOne({
      _id: socialAccountId,
      user: userId,
    }).select('+accessToken');

    if (!socialAccount) {
      return res.status(404).json({
        success: false,
        message: 'Social account not found or unauthorized.',
      });
    }

    // 4. Validate platform and connection status
    if (socialAccount.platform !== 'linkedin') {
      return res.status(400).json({
        success: false,
        message: 'Target social account is not a LinkedIn account.',
      });
    }

    if (socialAccount.connectionStatus !== 'connected') {
      return res.status(400).json({
        success: false,
        message: 'LinkedIn account connection is inactive or expired. Please reconnect.',
      });
    }

    // 5. Content validation: caption must be non-empty text
    const commentary = (post.caption || '').trim();
    if (!commentary) {
      return res.status(400).json({
        success: false,
        message: 'Cannot publish a post with empty text caption.',
      });
    }

    // 6. Idempotency: Check if already successfully published to this account
    const existingPublished = await Publication.findOne({
      post: post._id,
      socialAccount: socialAccount._id,
      status: 'published',
    });

    if (existingPublished) {
      return res.status(409).json({
        success: false,
        message: 'This post has already been published to this LinkedIn account.',
        publication: existingPublished,
      });
    }

    // Guard against rapid concurrent duplicate requests
    const recentPublishing = await Publication.findOne({
      post: post._id,
      socialAccount: socialAccount._id,
      status: 'publishing',
      createdAt: { $gte: new Date(Date.now() - 30000) },
    });

    if (recentPublishing) {
      return res.status(409).json({
        success: false,
        message: 'A publishing attempt is currently in progress for this post.',
      });
    }

    // 7. Create initial publishing record
    const publication = await Publication.create({
      post: post._id,
      socialAccount: socialAccount._id,
      platform: 'linkedin',
      status: 'publishing',
    });

    // 8. Decrypt access token
    let decryptedToken;
    try {
      decryptedToken = decrypt(socialAccount.accessToken);
    } catch (decryptError) {
      publication.status = 'failed';
      publication.errorCode = 'TOKEN_DECRYPTION_ERROR';
      publication.errorMessage = 'Failed to decrypt social account access token.';
      await publication.save();

      return res.status(500).json({
        success: false,
        message: 'Security error: Failed to decrypt account credentials.',
      });
    }

    // 9. Call LinkedIn Posts API Provider
    try {
      const publishResult = await linkedinProvider.publishTextPost({
        accessToken: decryptedToken,
        authorUrn: socialAccount.platformUserId,
        commentary,
      });

      // Discard plaintext token
      decryptedToken = null;

      // 10. Update publication on success
      publication.status = 'published';
      publication.platformPostId = publishResult.platformPostId;
      publication.publishedAt = new Date();
      publication.providerMetadata = publishResult.providerMetadata || {};
      await publication.save();

      return res.status(201).json({
        success: true,
        message: 'Post published to LinkedIn successfully.',
        publication,
      });
    } catch (providerError) {
      // Discard plaintext token
      decryptedToken = null;

      // 11. Record failure in publication record safely
      publication.status = 'failed';
      publication.errorCode = providerError.providerErrorCode || 'PROVIDER_ERROR';
      publication.errorMessage =
        providerError.providerMessage || providerError.message || 'LinkedIn publishing failed.';
      await publication.save();

      const statusCode =
        providerError.status && providerError.status >= 400 && providerError.status < 600
          ? providerError.status
          : 502;

      return res.status(statusCode).json({
        success: false,
        message: publication.errorMessage,
        errorCode: publication.errorCode,
        publication: {
          _id: publication._id,
          status: 'failed',
          errorCode: publication.errorCode,
          errorMessage: publication.errorMessage,
        },
      });
    }
  } catch (error) {
    return next(error);
  }
};

/**
 * Retrieves publications for a given post
 * GET /api/posts/:postId/publications
 */
const getPostPublicationsController = async (req, res, next) => {
  const { postId } = req.params;
  const userId = req.user._id;

  try {
    const post = await postModel.findOne({ _id: postId, user: userId });
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found or unauthorized.',
      });
    }

    const publications = await Publication.find({ post: post._id })
      .populate('socialAccount', 'displayName platform profileImageUrl')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      publications,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createPostController,
  getPostsController,
  publishPostToLinkedInController,
  getPostPublicationsController,
};
