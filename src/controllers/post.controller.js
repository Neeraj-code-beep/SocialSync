const axios = require('axios');
const net = require('net');
const postModel = require('../models/post.model');
const SocialAccount = require('../models/socialAccount.model');
const Publication = require('../models/publication.model');
const AnalyticsSnapshot = require('../models/analyticsSnapshot.model');
const generateCaption = require('../services/ai.service');
const uploadFile = require('../services/storage.service');
const { linkedinProvider } = require('../services/providers');
const { decrypt } = require('../lib/encryption');
const { config } = require('../config/env.config');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');

const SUPPORTED_IMAGE_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
const MAX_IMAGE_DOWNLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * Checks if an IP address string belongs to private, loopback, link-local, or cloud metadata ranges
 * @param {string} ipStr
 * @returns {boolean} True if IP is blocked/private/internal
 */
function isPrivateOrBlockedIP(ipStr) {
  if (!ipStr) return false;
  let cleanIp = ipStr.trim().toLowerCase();

  // Strip enclosing brackets from IPv6 host if present
  if (cleanIp.startsWith('[') && cleanIp.endsWith(']')) {
    cleanIp = cleanIp.slice(1, -1);
  }

  // Handle IPv4-mapped IPv6 (e.g., ::ffff:127.0.0.1, ::ffff:169.254.169.254)
  if (cleanIp.startsWith('::ffff:')) {
    const mapped = cleanIp.slice(7);
    if (net.isIPv4(mapped)) {
      cleanIp = mapped;
    }
  }

  if (net.isIPv4(cleanIp)) {
    const parts = cleanIp.split('.').map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) return true;

    // 0.0.0.0/8 (Current network)
    if (parts[0] === 0) return true;
    // 127.0.0.0/8 (Loopback / Localhost)
    if (parts[0] === 127) return true;
    // 10.0.0.0/8 (Private RFC1918)
    if (parts[0] === 10) return true;
    // 172.16.0.0/12 (Private RFC1918: 172.16.0.0 - 172.31.255.255)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16 (Private RFC1918)
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 169.254.0.0/16 (Link-Local / Cloud Metadata: 169.254.169.254)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 100.64.0.0/10 (Carrier-Grade NAT)
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 (TEST-NET / Documentation)
    if (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) return true;
    if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return true;
    if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return true;
    // 224.0.0.0/4 (Multicast) and 240.0.0.0/4 (Reserved)
    if (parts[0] >= 224) return true;

    return false;
  }

  if (net.isIPv6(cleanIp)) {
    // Loopback ::1
    if (cleanIp === '::1' || cleanIp === '0:0:0:0:0:0:0:1') return true;
    // Unspecified ::
    if (cleanIp === '::' || cleanIp === '0:0:0:0:0:0:0:0') return true;
    // Link-local: fe80::/10
    if (
      cleanIp.startsWith('fe8') ||
      cleanIp.startsWith('fe9') ||
      cleanIp.startsWith('fea') ||
      cleanIp.startsWith('feb')
    ) {
      return true;
    }
    // Unique local / private: fc00::/7 (fc00:: - fdff::)
    if (cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) return true;
    // Multicast: ff00::/8
    if (cleanIp.startsWith('ff')) return true;

    return false;
  }

  return false;
}

/**
 * Validates an image URL against strict SSRF constraints and trusted media origin
 * @param {string} imageUrl
 * @returns {boolean}
 */
function validateImageUrlForSsrf(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') {
    const err = new Error('Invalid or missing image URL.');
    err.status = 400;
    err.providerErrorCode = 'INVALID_IMAGE_URL';
    throw err;
  }

  let parsed;
  try {
    parsed = new URL(imageUrl);
  } catch {
    const err = new Error('Malformed post image URL.');
    err.status = 400;
    err.providerErrorCode = 'INVALID_IMAGE_URL';
    throw err;
  }

  // 1. Strict Protocol Check (HTTP/HTTPS only)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    const err = new Error('Invalid image URL protocol. Only HTTP and HTTPS are allowed.');
    err.status = 400;
    err.providerErrorCode = 'SSRF_VALIDATION_ERROR';
    throw err;
  }

  const hostname = parsed.hostname.toLowerCase();

  // 2. Reject localhost / cloud metadata hostnames
  const blockedHostnames = [
    'localhost',
    'metadata.google.internal',
    'metadata',
    'instance-data',
  ];
  if (
    blockedHostnames.includes(hostname) ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  ) {
    const err = new Error(
      'Untrusted image URL source: Localhost and metadata hostnames are forbidden.'
    );
    err.status = 400;
    err.providerErrorCode = 'SSRF_VALIDATION_ERROR';
    throw err;
  }

  // 3. Reject private, loopback, link-local, or cloud metadata IP addresses
  if (isPrivateOrBlockedIP(hostname)) {
    const err = new Error(
      'Untrusted image URL source: Private, loopback, or link-local IP addresses are forbidden.'
    );
    err.status = 400;
    err.providerErrorCode = 'SSRF_VALIDATION_ERROR';
    throw err;
  }

  // 4. Constrain to configured trusted ImageKit / Media CDN origin
  const trustedEndpoint = config.imageKit?.urlEndpoint || 'https://ik.imagekit.io';
  try {
    const trustedParsed = new URL(trustedEndpoint);
    const trustedHost = trustedParsed.hostname.toLowerCase();

    if (hostname !== trustedHost && !hostname.endsWith(`.${trustedHost}`)) {
      const err = new Error(
        `Untrusted image URL source (${hostname}). Post image must originate from the trusted media CDN (${trustedHost}).`
      );
      err.status = 400;
      err.providerErrorCode = 'SSRF_VALIDATION_ERROR';
      throw err;
    }
  } catch {
    if (hostname !== 'ik.imagekit.io' && !hostname.endsWith('.imagekit.io')) {
      const err = new Error(
        'Untrusted image URL source: Host does not match configured media CDN.'
      );
      err.status = 400;
      err.providerErrorCode = 'SSRF_VALIDATION_ERROR';
      throw err;
    }
  }

  return true;
}

/**
 * Downloads and validates image bytes from a post's stored image URL with SSRF protection and streaming body bounding
 * @param {string} imageUrl - Persisted image URL
 * @returns {Promise<{ imageBuffer: Buffer, mimeType: string }>}
 */
async function fetchAndValidatePostImage(imageUrl) {
  // 1. Validate initial URL against SSRF constraints
  validateImageUrlForSsrf(imageUrl);

  let response;
  try {
    response = await axios.get(imageUrl, {
      responseType: 'stream',
      timeout: 15000,
      maxRedirects: 3,
      beforeRedirect: (options) => {
        const redirectUrl =
          options.href || `${options.protocol || 'http:'}//${options.host || options.hostname}${options.path || ''}`;
        // Validate every redirect hop against the exact same SSRF rules
        validateImageUrlForSsrf(redirectUrl);
      },
      validateStatus: (status) => status === 200,
    });
  } catch (fetchErr) {
    // Pass through SSRF validation errors directly with 400
    if (fetchErr.providerErrorCode === 'SSRF_VALIDATION_ERROR') {
      throw fetchErr;
    }

    const err = new Error('Failed to retrieve post image from storage for publishing.');
    err.status = fetchErr.response?.status && fetchErr.response.status < 500 ? 400 : 502;
    err.providerErrorCode = 'IMAGE_FETCH_ERROR';
    err.providerMessage = fetchErr.message;
    throw err;
  }

  const rawContentType = response.headers?.['content-type'] || '';
  const mimeType = rawContentType.split(';')[0].trim().toLowerCase();

  if (!SUPPORTED_IMAGE_MIMES.includes(mimeType)) {
    const err = new Error(
      `Unsupported image format for LinkedIn (${mimeType || 'unknown'}). LinkedIn supports JPEG, PNG, and GIF images.`
    );
    err.status = 400;
    err.providerErrorCode = 'UNSUPPORTED_IMAGE_FORMAT';
    throw err;
  }

  // Check Content-Length header if provided upfront
  const contentLength = parseInt(response.headers?.['content-length'], 10);
  if (!isNaN(contentLength) && contentLength > MAX_IMAGE_DOWNLOAD_SIZE_BYTES) {
    if (typeof response.data?.destroy === 'function') {
      response.data.destroy();
    }
    const err = new Error(
      'Image file exceeds maximum allowable size (10MB) for LinkedIn publishing.'
    );
    err.status = 400;
    err.providerErrorCode = 'IMAGE_TOO_LARGE';
    throw err;
  }

  // Read and buffer response stream with strict byte counting to prevent unbounded memory consumption
  return new Promise((resolve, reject) => {
    // If response.data is already a Buffer (e.g. from mock)
    if (Buffer.isBuffer(response.data)) {
      if (response.data.length === 0) {
        const err = new Error('Retrieved image file is empty.');
        err.status = 400;
        err.providerErrorCode = 'EMPTY_IMAGE';
        return reject(err);
      }
      if (response.data.length > MAX_IMAGE_DOWNLOAD_SIZE_BYTES) {
        const err = new Error(
          'Image file exceeds maximum allowable size (10MB) for LinkedIn publishing.'
        );
        err.status = 400;
        err.providerErrorCode = 'IMAGE_TOO_LARGE';
        return reject(err);
      }
      return resolve({ imageBuffer: response.data, mimeType });
    }

    const chunks = [];
    let totalBytes = 0;
    let isFinished = false;

    const timeoutTimer = setTimeout(() => {
      if (!isFinished) {
        isFinished = true;
        if (typeof response.data?.destroy === 'function') {
          response.data.destroy();
        }
        const err = new Error('Image download timed out.');
        err.status = 502;
        err.providerErrorCode = 'IMAGE_FETCH_TIMEOUT';
        reject(err);
      }
    }, 15000);

    response.data.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_IMAGE_DOWNLOAD_SIZE_BYTES) {
        if (!isFinished) {
          isFinished = true;
          clearTimeout(timeoutTimer);
          if (typeof response.data?.destroy === 'function') {
            response.data.destroy();
          }
          const err = new Error(
            'Image file exceeds maximum allowable size (10MB) for LinkedIn publishing.'
          );
          err.status = 400;
          err.providerErrorCode = 'IMAGE_TOO_LARGE';
          reject(err);
        }
      } else {
        chunks.push(chunk);
      }
    });

    response.data.on('end', () => {
      if (!isFinished) {
        isFinished = true;
        clearTimeout(timeoutTimer);
        const imageBuffer = Buffer.concat(chunks);
        if (imageBuffer.length === 0) {
          const err = new Error('Retrieved image file is empty.');
          err.status = 400;
          err.providerErrorCode = 'EMPTY_IMAGE';
          return reject(err);
        }
        resolve({ imageBuffer, mimeType });
      }
    });

    response.data.on('error', (streamErr) => {
      if (!isFinished) {
        isFinished = true;
        clearTimeout(timeoutTimer);
        const err = new Error(`Image download failed: ${streamErr.message}`);
        err.status = 502;
        err.providerErrorCode = 'IMAGE_FETCH_ERROR';
        reject(err);
      }
    });
  });
}

/**
 * Validates social account connectivity, local token expiration, and credential existence
 * @param {Object} socialAccount
 * @returns {Promise<{ valid: boolean, status?: number, message?: string, errorCode?: string }>}
 */
async function validateAccountConnection(socialAccount) {
  if (!socialAccount) {
    return {
      valid: false,
      status: 404,
      message: 'Social account not found or unauthorized.',
      errorCode: 'ACCOUNT_NOT_FOUND',
    };
  }

  if (socialAccount.platform !== 'linkedin') {
    return {
      valid: false,
      status: 400,
      message: 'Target social account is not a LinkedIn account.',
      errorCode: 'INVALID_PLATFORM',
    };
  }

  if (socialAccount.connectionStatus !== 'connected') {
    return {
      valid: false,
      status: 401,
      message: 'LinkedIn account connection is inactive or expired. Please reconnect.',
      errorCode: 'LINKEDIN_REAUTH_REQUIRED',
    };
  }

  // Check local token expiration
  if (socialAccount.expiresAt && new Date(socialAccount.expiresAt).getTime() <= Date.now()) {
    socialAccount.connectionStatus = 'expired';
    await socialAccount.save();

    return {
      valid: false,
      status: 401,
      message: 'LinkedIn access token has expired. Please reconnect your account.',
      errorCode: 'LINKEDIN_REAUTH_REQUIRED',
    };
  }

  if (!socialAccount.accessToken) {
    return {
      valid: false,
      status: 401,
      message: 'LinkedIn credentials are missing or revoked. Please reconnect your account.',
      errorCode: 'LINKEDIN_REAUTH_REQUIRED',
    };
  }

  return { valid: true };
}

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
 * Publishes a post to LinkedIn (single-image or text-only)
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
    const validation = await validateAccountConnection(socialAccount);
    if (!validation.valid) {
      return res.status(validation.status || 400).json({
        success: false,
        message: validation.message,
        errorCode: validation.errorCode,
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
    } catch {
      publication.status = 'failed';
      publication.errorCode = 'TOKEN_DECRYPTION_ERROR';
      publication.errorMessage = 'Failed to decrypt social account access token.';
      await publication.save();

      return res.status(500).json({
        success: false,
        message: 'Security error: Failed to decrypt account credentials.',
      });
    }

    // 9. Call LinkedIn Provider (Image Post or Text Post)
    try {
      let publishResult;

      if (post.image && typeof post.image === 'string' && post.image.trim().length > 0) {
        // Fetch and validate image from stored post image URL (with SSRF checks and streaming byte enforcement)
        const { imageBuffer, mimeType } = await fetchAndValidatePostImage(post.image.trim());

        publishResult = await linkedinProvider.publishImagePost({
          accessToken: decryptedToken,
          authorUrn: socialAccount.platformUserId,
          imageBuffer,
          mimeType,
          commentary,
          altText: 'Image shared on LinkedIn',
        });
      } else {
        publishResult = await linkedinProvider.publishTextPost({
          accessToken: decryptedToken,
          authorUrn: socialAccount.platformUserId,
          commentary,
        });
      }

      // Discard plaintext token immediately
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
      // Discard plaintext token immediately
      decryptedToken = null;

      // Provider 401 handling: mark connection status expired and return normalized reconnect error
      if (providerError.status === 401 || providerError.code === 'UNAUTHORIZED') {
        await SocialAccount.updateOne({ _id: socialAccount._id }, { connectionStatus: 'expired' });
        const errCode = 'LINKEDIN_REAUTH_REQUIRED';
        const errMsg = 'LinkedIn authorization expired or invalid. Please reconnect your account.';
        publication.status = 'failed';
        publication.errorCode = errCode;
        publication.errorMessage = errMsg;
        await publication.save();

        return res.status(401).json({
          success: false,
          message: errMsg,
          errorCode: errCode,
          publication: {
            _id: publication._id,
            status: 'failed',
            errorCode: errCode,
            errorMessage: errMsg,
          },
        });
      }

      // 11. Record failure in publication record safely
      publication.status = 'failed';
      publication.errorCode =
        providerError.providerErrorCode || providerError.code || 'PROVIDER_ERROR';
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

/**
 * Retrieves a single publication details
 * GET /api/posts/:postId/publications/:publicationId
 */
const getPublicationController = async (req, res, next) => {
  const { postId, publicationId } = req.params;
  const userId = req.user._id;

  if (!postId || (mongoose.Types.ObjectId.isValid && !mongoose.Types.ObjectId.isValid(postId))) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or missing postId.',
    });
  }

  if (!publicationId || (mongoose.Types.ObjectId.isValid && !mongoose.Types.ObjectId.isValid(publicationId))) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or missing publicationId.',
    });
  }

  try {
    const post = await postModel.findOne({ _id: postId, user: userId });
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found or unauthorized.',
      });
    }

    const publication = await Publication.findOne({ _id: publicationId, post: post._id })
      .populate('socialAccount', 'displayName platform profileImageUrl')
      .lean();

    if (!publication) {
      return res.status(404).json({
        success: false,
        message: 'Publication not found or unauthorized.',
      });
    }

    // Verify social account belongs to authenticated user
    const socialAccount = await SocialAccount.findOne({
      _id: publication.socialAccount._id || publication.socialAccount,
      user: userId,
    });

    if (!socialAccount) {
      return res.status(404).json({
        success: false,
        message: 'Social account not found or unauthorized.',
      });
    }

    return res.status(200).json({
      success: true,
      publication,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Synchronizes a LinkedIn publication state from LinkedIn Posts API
 * POST /api/posts/:postId/publications/:publicationId/sync
 */
const syncPublicationController = async (req, res, next) => {
  const { postId, publicationId } = req.params;
  const userId = req.user._id;

  if (!postId || (mongoose.Types.ObjectId.isValid && !mongoose.Types.ObjectId.isValid(postId))) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or missing postId.',
    });
  }

  if (!publicationId || (mongoose.Types.ObjectId.isValid && !mongoose.Types.ObjectId.isValid(publicationId))) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or missing publicationId.',
    });
  }

  try {
    const post = await postModel.findOne({ _id: postId, user: userId });
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found or unauthorized.',
      });
    }

    const publication = await Publication.findOne({ _id: publicationId, post: post._id });
    if (!publication) {
      return res.status(404).json({
        success: false,
        message: 'Publication not found or unauthorized.',
      });
    }

    const socialAccount = await SocialAccount.findOne({
      _id: publication.socialAccount,
      user: userId,
    }).select('+accessToken');

    if (!socialAccount) {
      return res.status(404).json({
        success: false,
        message: 'Social account not found or unauthorized.',
      });
    }

    const validation = await validateAccountConnection(socialAccount);
    if (!validation.valid) {
      return res.status(validation.status || 400).json({
        success: false,
        message: validation.message,
        errorCode: validation.errorCode,
      });
    }

    if (!publication.platformPostId) {
      return res.status(400).json({
        success: false,
        message: 'Publication does not have a platform post ID to sync.',
      });
    }

    // Decrypt access token
    let decryptedToken;
    try {
      decryptedToken = decrypt(socialAccount.accessToken);
    } catch {
      return res.status(500).json({
        success: false,
        message: 'Security error: Failed to decrypt account credentials.',
      });
    }

    try {
      const linkedinPost = await linkedinProvider.getPost({
        accessToken: decryptedToken,
        postUrn: publication.platformPostId,
      });

      decryptedToken = null;

      // Update publication safe metadata
      publication.providerMetadata = {
        ...(publication.providerMetadata || {}),
        lifecycleState: linkedinPost.lifecycleState,
        visibility: linkedinPost.visibility,
        contentType: linkedinPost.contentType,
        lastSyncedAt: new Date(),
      };

      if (
        linkedinPost.lifecycleState === 'DELETED' ||
        linkedinPost.lifecycleState === 'REVOKED'
      ) {
        publication.status = 'deleted';
        publication.deletedAt = publication.deletedAt || new Date();
      }

      await publication.save();

      return res.status(200).json({
        success: true,
        message: 'Publication synchronized successfully.',
        publication,
      });
    } catch (providerError) {
      decryptedToken = null;

      // Provider 401 handling: mark connection status expired and return normalized reconnect error
      if (providerError.status === 401 || providerError.code === 'UNAUTHORIZED') {
        await SocialAccount.updateOne({ _id: socialAccount._id }, { connectionStatus: 'expired' });
        return res.status(401).json({
          success: false,
          message: 'LinkedIn authorization expired or invalid. Please reconnect your account.',
          errorCode: 'LINKEDIN_REAUTH_REQUIRED',
        });
      }

      // If LinkedIn returns 404, the post was deleted on LinkedIn
      if (providerError.status === 404) {
        publication.status = 'deleted';
        publication.deletedAt = publication.deletedAt || new Date();
        publication.providerMetadata = {
          ...(publication.providerMetadata || {}),
          lifecycleState: 'DELETED_ON_PROVIDER',
          lastSyncedAt: new Date(),
        };
        await publication.save();

        return res.status(200).json({
          success: true,
          message: 'Post was deleted on LinkedIn. Local publication marked as deleted.',
          publication,
        });
      }

      const statusCode =
        providerError.status && providerError.status >= 400 && providerError.status < 600
          ? providerError.status
          : 502;

      return res.status(statusCode).json({
        success: false,
        message: providerError.providerMessage || providerError.message || 'LinkedIn sync failed.',
        errorCode: providerError.providerErrorCode || 'SYNC_ERROR',
      });
    }
  } catch (error) {
    return next(error);
  }
};

/**
 * Updates commentary of an existing LinkedIn publication
 * PATCH /api/posts/:postId/publications/:publicationId
 */
const updatePublicationCommentaryController = async (req, res, next) => {
  const { postId, publicationId } = req.params;
  const { commentary } = req.body;
  const userId = req.user._id;

  if (!postId || (mongoose.Types.ObjectId.isValid && !mongoose.Types.ObjectId.isValid(postId))) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or missing postId.',
    });
  }

  if (!publicationId || (mongoose.Types.ObjectId.isValid && !mongoose.Types.ObjectId.isValid(publicationId))) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or missing publicationId.',
    });
  }

  if (!commentary || typeof commentary !== 'string' || commentary.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Post commentary text cannot be empty.',
    });
  }

  const trimmedCommentary = commentary.trim();
  if (trimmedCommentary.length > 3000) {
    return res.status(400).json({
      success: false,
      message: 'Commentary exceeds maximum allowable length (3000 characters).',
    });
  }

  try {
    const post = await postModel.findOne({ _id: postId, user: userId });
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found or unauthorized.',
      });
    }

    const publication = await Publication.findOne({ _id: publicationId, post: post._id });
    if (!publication) {
      return res.status(404).json({
        success: false,
        message: 'Publication not found or unauthorized.',
      });
    }

    const socialAccount = await SocialAccount.findOne({
      _id: publication.socialAccount,
      user: userId,
    }).select('+accessToken');

    const validation = await validateAccountConnection(socialAccount);
    if (!validation.valid) {
      return res.status(validation.status || 400).json({
        success: false,
        message: validation.message,
        errorCode: validation.errorCode,
      });
    }

    if (publication.status !== 'published') {
      return res.status(400).json({
        success: false,
        message: `Cannot update a publication with status "${publication.status}". Only published posts can be updated.`,
      });
    }

    if (!publication.platformPostId) {
      return res.status(400).json({
        success: false,
        message: 'Publication does not have a valid platform post ID.',
      });
    }

    // Decrypt access token
    let decryptedToken;
    try {
      decryptedToken = decrypt(socialAccount.accessToken);
    } catch {
      return res.status(500).json({
        success: false,
        message: 'Security error: Failed to decrypt account credentials.',
      });
    }

    try {
      await linkedinProvider.updatePost({
        accessToken: decryptedToken,
        postUrn: publication.platformPostId,
        commentary: trimmedCommentary,
      });

      decryptedToken = null;

      // Only modify local Post state AFTER LinkedIn confirms success
      post.caption = trimmedCommentary;
      await post.save();

      publication.providerMetadata = {
        ...(publication.providerMetadata || {}),
        lastModifiedAt: new Date(),
      };
      await publication.save();

      return res.status(200).json({
        success: true,
        message: 'LinkedIn post commentary updated successfully.',
        post,
        publication,
      });
    } catch (providerError) {
      decryptedToken = null;

      // Provider 401 handling: mark connection status expired and return normalized reconnect error
      if (providerError.status === 401 || providerError.code === 'UNAUTHORIZED') {
        await SocialAccount.updateOne({ _id: socialAccount._id }, { connectionStatus: 'expired' });
        return res.status(401).json({
          success: false,
          message: 'LinkedIn authorization expired or invalid. Please reconnect your account.',
          errorCode: 'LINKEDIN_REAUTH_REQUIRED',
        });
      }

      const statusCode =
        providerError.status && providerError.status >= 400 && providerError.status < 600
          ? providerError.status
          : 502;

      return res.status(statusCode).json({
        success: false,
        message: providerError.providerMessage || providerError.message || 'LinkedIn post update failed.',
        errorCode: providerError.providerErrorCode || 'UPDATE_ERROR',
      });
    }
  } catch (error) {
    return next(error);
  }
};

/**
 * Deletes a LinkedIn publication
 * DELETE /api/posts/:postId/publications/:publicationId
 */
const deletePublicationController = async (req, res, next) => {
  const { postId, publicationId } = req.params;
  const userId = req.user._id;

  if (!postId || (mongoose.Types.ObjectId.isValid && !mongoose.Types.ObjectId.isValid(postId))) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or missing postId.',
    });
  }

  if (!publicationId || (mongoose.Types.ObjectId.isValid && !mongoose.Types.ObjectId.isValid(publicationId))) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or missing publicationId.',
    });
  }

  try {
    const post = await postModel.findOne({ _id: postId, user: userId });
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found or unauthorized.',
      });
    }

    const publication = await Publication.findOne({ _id: publicationId, post: post._id });
    if (!publication) {
      return res.status(404).json({
        success: false,
        message: 'Publication not found or unauthorized.',
      });
    }

    const socialAccount = await SocialAccount.findOne({
      _id: publication.socialAccount,
      user: userId,
    }).select('+accessToken');

    const validation = await validateAccountConnection(socialAccount);
    if (!validation.valid) {
      return res.status(validation.status || 400).json({
        success: false,
        message: validation.message,
        errorCode: validation.errorCode,
      });
    }

    if (!publication.platformPostId) {
      return res.status(400).json({
        success: false,
        message: 'Publication does not have a platform post ID to delete.',
      });
    }

    // Idempotency: if already marked deleted, return success immediately
    if (publication.status === 'deleted') {
      return res.status(200).json({
        success: true,
        message: 'Publication is already deleted.',
        publication,
      });
    }

    // Decrypt access token
    let decryptedToken;
    try {
      decryptedToken = decrypt(socialAccount.accessToken);
    } catch {
      return res.status(500).json({
        success: false,
        message: 'Security error: Failed to decrypt account credentials.',
      });
    }

    try {
      await linkedinProvider.deletePost({
        accessToken: decryptedToken,
        postUrn: publication.platformPostId,
      });

      decryptedToken = null;

      // Mark publication deleted (do NOT physically delete document)
      publication.status = 'deleted';
      publication.deletedAt = new Date();
      publication.providerMetadata = {
        ...(publication.providerMetadata || {}),
        lifecycleState: 'DELETED',
      };
      await publication.save();

      return res.status(200).json({
        success: true,
        message: 'LinkedIn post deleted successfully.',
        publication,
      });
    } catch (providerError) {
      decryptedToken = null;

      // Provider 401 handling: mark connection status expired and return normalized reconnect error
      if (providerError.status === 401 || providerError.code === 'UNAUTHORIZED') {
        await SocialAccount.updateOne({ _id: socialAccount._id }, { connectionStatus: 'expired' });
        return res.status(401).json({
          success: false,
          message: 'LinkedIn authorization expired or invalid. Please reconnect your account.',
          errorCode: 'LINKEDIN_REAUTH_REQUIRED',
        });
      }

      const statusCode =
        providerError.status && providerError.status >= 400 && providerError.status < 600
          ? providerError.status
          : 502;

      return res.status(statusCode).json({
        success: false,
        message: providerError.providerMessage || providerError.message || 'LinkedIn post deletion failed.',
        errorCode: providerError.providerErrorCode || 'DELETE_ERROR',
      });
    }
  } catch (error) {
    return next(error);
  }
};

/**
 * Retrieves analytics for a published LinkedIn publication and persists a snapshot
 * GET /api/posts/:postId/publications/:publicationId/analytics
 */
const getPublicationAnalyticsController = async (req, res, next) => {
  const { postId, publicationId } = req.params;
  const { aggregation = 'TOTAL', startDate, endDate, metrics } = req.query;
  const userId = req.user._id;

  if (!postId || (mongoose.Types.ObjectId.isValid && !mongoose.Types.ObjectId.isValid(postId))) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or missing postId.',
    });
  }

  if (!publicationId || (mongoose.Types.ObjectId.isValid && !mongoose.Types.ObjectId.isValid(publicationId))) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or missing publicationId.',
    });
  }

  try {
    const post = await postModel.findOne({ _id: postId, user: userId });
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found or unauthorized.',
      });
    }

    const publication = await Publication.findOne({ _id: publicationId, post: post._id });
    if (!publication) {
      return res.status(404).json({
        success: false,
        message: 'Publication not found or unauthorized.',
      });
    }

    const socialAccount = await SocialAccount.findOne({
      _id: publication.socialAccount,
      user: userId,
    }).select('+accessToken');

    const validation = await validateAccountConnection(socialAccount);
    if (!validation.valid) {
      return res.status(validation.status || 400).json({
        success: false,
        message: validation.message,
        errorCode: validation.errorCode,
      });
    }

    if (
      socialAccount.scopes &&
      socialAccount.scopes.length > 0 &&
      !socialAccount.scopes.includes('r_member_postAnalytics')
    ) {
      return res.status(403).json({
        success: false,
        message:
          'LinkedIn member post analytics permission (r_member_postAnalytics) missing or access denied. Please reconnect your LinkedIn account.',
        errorCode: 'ANALYTICS_FORBIDDEN',
      });
    }

    if (publication.status !== 'published') {
      return res.status(400).json({
        success: false,
        message: `Analytics are only available for published publications (current status: "${publication.status}").`,
      });
    }

    if (!publication.platformPostId) {
      return res.status(400).json({
        success: false,
        message: 'Publication does not have a platform post ID to fetch analytics.',
      });
    }

    // Parse metrics array if supplied as string
    let parsedMetricsList = [];
    if (metrics) {
      if (Array.isArray(metrics)) {
        parsedMetricsList = metrics;
      } else if (typeof metrics === 'string') {
        parsedMetricsList = metrics.split(',').map((m) => m.trim()).filter(Boolean);
      }
    }

    let dateRange = null;
    if (startDate || endDate) {
      dateRange = { start: startDate, end: endDate };
    }

    // Decrypt access token
    let decryptedToken;
    try {
      decryptedToken = decrypt(socialAccount.accessToken);
    } catch {
      return res.status(500).json({
        success: false,
        message: 'Security error: Failed to decrypt account credentials.',
      });
    }

    try {
      const analyticsResult = await linkedinProvider.getPostAnalytics({
        accessToken: decryptedToken,
        postUrn: publication.platformPostId,
        aggregation,
        dateRange,
        metrics: parsedMetricsList,
      });

      decryptedToken = null;

      // Persist immutable snapshot point-in-time observation
      const snapshot = await AnalyticsSnapshot.create({
        post: post._id,
        publication: publication._id,
        socialAccount: socialAccount._id,
        platform: 'linkedin',
        aggregation: analyticsResult.aggregation,
        metrics: analyticsResult.metrics,
        dateRange: analyticsResult.dateRange,
        capturedAt: new Date(),
        providerMetadata: analyticsResult.providerMetadata || {},
      });

      return res.status(200).json({
        success: true,
        platform: 'linkedin',
        publicationId: publication._id,
        platformPostId: publication.platformPostId,
        aggregation: analyticsResult.aggregation,
        dateRange: analyticsResult.dateRange,
        metrics: analyticsResult.metrics,
        capturedAt: snapshot.capturedAt,
        snapshotId: snapshot._id,
      });
    } catch (providerError) {
      decryptedToken = null;

      // Provider 401 / unauthorized handling: mark connection status expired and return normalized reconnect error
      if (
        providerError.status === 401 ||
        providerError.code === 'ANALYTICS_UNAUTHORIZED' ||
        providerError.code === 'UNAUTHORIZED'
      ) {
        await SocialAccount.updateOne({ _id: socialAccount._id }, { connectionStatus: 'expired' });
        return res.status(401).json({
          success: false,
          message: 'LinkedIn authorization expired or invalid. Please reconnect your account.',
          errorCode: 'LINKEDIN_REAUTH_REQUIRED',
        });
      }

      const statusCode =
        providerError.status && providerError.status >= 400 && providerError.status < 500
          ? providerError.status
          : 502;

      return res.status(statusCode).json({
        success: false,
        message:
          providerError.message ||
          providerError.providerMessage ||
          'Failed to retrieve LinkedIn post analytics.',
        errorCode: providerError.code || providerError.providerErrorCode || 'ANALYTICS_ERROR',
      });
    }
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createPostController,
  getPostsController,
  publishPostToLinkedInController,
  getPostPublicationsController,
  getPublicationController,
  syncPublicationController,
  updatePublicationCommentaryController,
  deletePublicationController,
  getPublicationAnalyticsController,
  fetchAndValidatePostImage,
  validateImageUrlForSsrf,
  isPrivateOrBlockedIP,
};
