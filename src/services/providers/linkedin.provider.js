const axios = require('axios');
const { config } = require('../../config/env.config');

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';

const LINKEDIN_POSTS_URL = 'https://api.linkedin.com/rest/posts';
const LINKEDIN_IMAGES_URL = 'https://api.linkedin.com/rest/images?action=initializeUpload';
const LINKEDIN_ANALYTICS_URL = 'https://api.linkedin.com/rest/memberCreatorPostAnalytics';

// Official current self-serve LinkedIn permissions:
// openid, profile, email (Sign In with LinkedIn using OpenID Connect)
// w_member_social (Share on LinkedIn / create posts on behalf of member)
// r_member_postAnalytics (Member Post Statistics / Creator Analytics)
const REQUIRED_SCOPES = ['openid', 'profile', 'email', 'w_member_social', 'r_member_postAnalytics'];

// Supported image formats for LinkedIn Images REST API
const SUPPORTED_IMAGE_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];

/**
 * Standardizes member URN format
 * @param {string} authorUrn
 * @returns {string} Formatted URN (e.g. urn:li:person:12345)
 */
function formatAuthorUrn(authorUrn) {
  if (!authorUrn) return '';
  return authorUrn.startsWith('urn:li:') ? authorUrn : `urn:li:person:${authorUrn}`;
}

const linkedinProvider = {
  platform: 'linkedin',

  /**
   * Generates official LinkedIn OAuth 2.0 authorization URL
   * @param {{ state: string, redirectUri?: string, scopes?: string[] }} params
   * @returns {string} Full authorization URL
   */
  getAuthorizationUrl({ state, redirectUri, scopes = REQUIRED_SCOPES }) {
    if (!state) {
      throw new Error('OAuth state is required to construct authorization URL.');
    }

    const clientId = config.linkedin.clientId;
    const resolvedRedirectUri = redirectUri || config.linkedin.redirectUri;

    if (!clientId || !resolvedRedirectUri) {
      throw new Error('LinkedIn client ID or redirect URI is not configured.');
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: resolvedRedirectUri,
      state,
      scope: scopes.join(' '),
    });

    return `${LINKEDIN_AUTH_URL}?${params.toString()}`;
  },

  /**
   * Exchanges an authorization code for member access token
   * @param {{ code: string, redirectUri?: string }} params
   * @returns {Promise<{ accessToken: string, expiresIn: number, refreshToken?: string, refreshTokenExpiresIn?: number, scopes: string[] }>}
   */
  async exchangeCode({ code, redirectUri }) {
    if (!code) {
      throw new Error('Authorization code is required for token exchange.');
    }

    const clientId = config.linkedin.clientId;
    const clientSecret = config.linkedin.clientSecret;
    const resolvedRedirectUri = redirectUri || config.linkedin.redirectUri;

    const payload = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: resolvedRedirectUri,
    });

    try {
      const response = await axios.post(LINKEDIN_TOKEN_URL, payload.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      });

      const data = response.data;
      if (!data || !data.access_token) {
        throw new Error('Invalid response from LinkedIn token exchange.');
      }

      // Granted scopes (either returned by LinkedIn or fallback to requested scopes)
      const grantedScopes = data.scope
        ? data.scope.split(' ').map((s) => s.trim()).filter(Boolean)
        : REQUIRED_SCOPES;

      return {
        accessToken: data.access_token,
        expiresIn: data.expires_in || 5184000, // Default 60 days (5184000 seconds)
        refreshToken: data.refresh_token || null,
        refreshTokenExpiresIn: data.refresh_token_expires_in || null,
        scopes: grantedScopes,
      };
    } catch (error) {
      const providerError =
        error.response?.data?.error_description ||
        error.response?.data?.error ||
        error.message ||
        'Failed to exchange authorization code with LinkedIn.';
      throw new Error(`LinkedIn OAuth exchange error: ${providerError}`);
    }
  },

  /**
   * Retrieves authenticated member's profile using official OpenID Connect userinfo endpoint
   * @param {{ accessToken: string }} params
   * @returns {Promise<{ platformUserId: string, displayName: string, email?: string, profileImageUrl?: string, profileUrl?: string }>}
   */
  async getAuthenticatedProfile({ accessToken }) {
    if (!accessToken) {
      throw new Error('Access token is required to fetch LinkedIn profile.');
    }

    try {
      const response = await axios.get(LINKEDIN_USERINFO_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        timeout: 10000,
      });

      const data = response.data;
      if (!data || !data.sub) {
        throw new Error('Malformed member profile received from LinkedIn userinfo.');
      }

      const displayName =
        data.name ||
        `${data.given_name || ''} ${data.family_name || ''}`.trim() ||
        'LinkedIn Member';

      return {
        platformUserId: data.sub,
        displayName,
        email: data.email || null,
        profileImageUrl: data.picture || null,
        profileUrl: null,
      };
    } catch (error) {
      const providerError =
        error.response?.data?.message ||
        error.message ||
        'Failed to fetch member identity from LinkedIn.';
      throw new Error(`LinkedIn profile error: ${providerError}`);
    }
  },

  /**
   * Initializes image upload with LinkedIn Images API
   * POST https://api.linkedin.com/rest/images?action=initializeUpload
   *
   * @param {{ accessToken: string, ownerUrn: string }} params
   * @returns {Promise<{ uploadUrl: string, uploadUrlExpiresAt: number, imageUrn: string }>}
   */
  async initializeImageUpload({ accessToken, ownerUrn }) {
    if (!accessToken) {
      const err = new Error('Access token is required to initialize LinkedIn image upload.');
      err.status = 401;
      throw err;
    }

    if (!ownerUrn) {
      const err = new Error('Owner URN/ID is required to initialize LinkedIn image upload.');
      err.status = 400;
      throw err;
    }

    const formattedOwner = formatAuthorUrn(ownerUrn);
    const apiVersion = config.linkedin.apiVersion || '202608';

    const payload = {
      initializeUploadRequest: {
        owner: formattedOwner,
      },
    };

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      'Linkedin-Version': apiVersion,
    };

    try {
      const response = await axios.post(LINKEDIN_IMAGES_URL, payload, {
        headers,
        timeout: 15000,
      });

      const value = response.data?.value;
      if (!value || !value.uploadUrl || !value.image) {
        const err = new Error(
          'Invalid response from LinkedIn image upload initialization (missing uploadUrl or image URN).'
        );
        err.status = 502;
        throw err;
      }

      return {
        uploadUrl: value.uploadUrl,
        uploadUrlExpiresAt: value.uploadUrlExpiresAt,
        imageUrn: value.image,
      };
    } catch (error) {
      if (error.status === 502 && error.message.includes('missing uploadUrl or image URN')) {
        throw error;
      }

      const responseStatus = error.response?.status;
      const responseData = error.response?.data;
      const rawMessage =
        responseData?.message ||
        responseData?.error_description ||
        responseData?.error ||
        error.message ||
        'LinkedIn image initialization failed.';

      const err = new Error(`LinkedIn Images API error: ${rawMessage}`);
      err.status = responseStatus || 502;
      err.providerErrorCode =
        responseData?.serviceErrorCode || responseData?.code || 'LINKEDIN_ERROR';
      err.providerMessage = rawMessage;
      throw err;
    }
  },

  /**
   * Uploads raw binary image bytes to the pre-signed LinkedIn upload URL
   * PUT <uploadUrl>
   *
   * @param {{ uploadUrl: string, imageBuffer: Buffer, mimeType?: string }} params
   * @returns {Promise<{ success: boolean }>}
   */
  async uploadImageBytes({ uploadUrl, imageBuffer, mimeType }) {
    if (!uploadUrl) {
      const err = new Error('Upload URL is required to upload image bytes.');
      err.status = 400;
      throw err;
    }

    if (!imageBuffer || !Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
      const err = new Error('Non-empty image buffer is required to upload image bytes.');
      err.status = 400;
      throw err;
    }

    try {
      await axios.put(uploadUrl, imageBuffer, {
        headers: {
          'Content-Type': mimeType || 'application/octet-stream',
        },
        timeout: 30000,
        maxBodyLength: 20 * 1024 * 1024,
        maxContentLength: 20 * 1024 * 1024,
      });

      return { success: true };
    } catch (error) {
      const responseStatus = error.response?.status;
      const responseData = error.response?.data;
      const rawMessage =
        responseData?.message ||
        responseData?.error ||
        error.message ||
        'Failed to upload image bytes to LinkedIn upload URL.';

      const err = new Error(`LinkedIn image upload error: ${rawMessage}`);
      err.status = responseStatus || 502;
      err.providerErrorCode =
        responseData?.serviceErrorCode || responseData?.code || 'UPLOAD_ERROR';
      err.providerMessage = rawMessage;
      throw err;
    }
  },

  /**
   * Publishes an organic single-image post to LinkedIn using official Images + Posts REST API
   * POST https://api.linkedin.com/rest/posts
   *
   * @param {{ accessToken: string, authorUrn: string, imageBuffer: Buffer, mimeType: string, commentary: string, altText?: string }} params
   * @returns {Promise<{ success: boolean, platformPostId: string, status: string, providerMetadata: object }>}
   */
  async publishImagePost({ accessToken, authorUrn, imageBuffer, mimeType, commentary, altText }) {
    if (!accessToken) {
      const err = new Error('Access token is required to publish image post to LinkedIn.');
      err.status = 401;
      throw err;
    }

    if (!authorUrn) {
      const err = new Error('Author URN/ID is required to publish image post to LinkedIn.');
      err.status = 400;
      throw err;
    }

    if (!commentary || typeof commentary !== 'string' || commentary.trim().length === 0) {
      const err = new Error('Post commentary text cannot be empty.');
      err.status = 400;
      throw err;
    }

    if (!imageBuffer || !Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
      const err = new Error('A valid non-empty image buffer is required for LinkedIn image publishing.');
      err.status = 400;
      throw err;
    }

    const normalizedMime = (mimeType || '').toLowerCase().trim();
    if (!SUPPORTED_IMAGE_MIMES.includes(normalizedMime)) {
      const err = new Error(
        `Unsupported image format: ${mimeType || 'unknown'}. LinkedIn Images API only supports JPEG, PNG, and GIF.`
      );
      err.status = 400;
      err.providerErrorCode = 'UNSUPPORTED_IMAGE_FORMAT';
      throw err;
    }

    // Step 1: Initialize image upload
    const { uploadUrl, imageUrn } = await this.initializeImageUpload({
      accessToken,
      ownerUrn: authorUrn,
    });

    // Step 2: Upload raw image bytes to uploadUrl
    await this.uploadImageBytes({
      uploadUrl,
      imageBuffer,
      mimeType: normalizedMime,
    });

    // Step 3: Create LinkedIn post referencing image asset
    const formattedAuthor = formatAuthorUrn(authorUrn);
    const apiVersion = config.linkedin.apiVersion || '202608';

    const safeAltText =
      altText && typeof altText === 'string' && altText.trim().length > 0
        ? altText.trim().slice(0, 400)
        : 'Image shared on LinkedIn';

    const payload = {
      author: formattedAuthor,
      commentary: commentary.trim(),
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      content: {
        media: {
          altText: safeAltText,
          id: imageUrn,
        },
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      'Linkedin-Version': apiVersion,
    };

    try {
      const response = await axios.post(LINKEDIN_POSTS_URL, payload, {
        headers,
        timeout: 15000,
      });

      const platformPostId =
        response.headers?.['x-restli-id'] ||
        response.headers?.['X-RestLi-Id'] ||
        response.headers?.['x-restli-id'.toLowerCase()];

      if (!platformPostId) {
        const err = new Error('LinkedIn Posts API did not return post identifier (x-restli-id).');
        err.status = 502;
        throw err;
      }

      return {
        success: true,
        platformPostId,
        status: 'published',
        providerMetadata: {
          apiVersion,
          lifecycleState: 'PUBLISHED',
          visibility: 'PUBLIC',
          contentType: 'image',
          imageUrn,
        },
      };
    } catch (error) {
      if (error.status === 502 && error.message.includes('x-restli-id')) {
        throw error;
      }

      const responseStatus = error.response?.status;
      const responseData = error.response?.data;
      const rawMessage =
        responseData?.message ||
        responseData?.error_description ||
        responseData?.error ||
        error.message ||
        'LinkedIn Posts API request failed.';

      const err = new Error(`LinkedIn Posts API error: ${rawMessage}`);
      err.status = responseStatus || 502;
      err.providerErrorCode =
        responseData?.serviceErrorCode || responseData?.code || 'LINKEDIN_ERROR';
      err.providerMessage = rawMessage;
      throw err;
    }
  },

  /**
   * Publishes an organic text-only post to LinkedIn using official REST Posts API
   * POST https://api.linkedin.com/rest/posts
   *
   * @param {{ accessToken: string, authorUrn: string, commentary: string }} params
   * @returns {Promise<{ success: boolean, platformPostId: string, status: string, providerMetadata: object }>}
   */
  async publishTextPost({ accessToken, authorUrn, commentary }) {
    if (!accessToken) {
      const err = new Error('Access token is required to publish post to LinkedIn.');
      err.status = 401;
      throw err;
    }

    if (!authorUrn) {
      const err = new Error('Author URN/ID is required to publish post to LinkedIn.');
      err.status = 400;
      throw err;
    }

    if (!commentary || typeof commentary !== 'string' || commentary.trim().length === 0) {
      const err = new Error('Post commentary text cannot be empty.');
      err.status = 400;
      throw err;
    }

    // Standardize author URN (urn:li:person:{sub} or direct URN)
    const formattedAuthor = formatAuthorUrn(authorUrn);
    const apiVersion = config.linkedin.apiVersion || '202608';

    const payload = {
      author: formattedAuthor,
      commentary: commentary.trim(),
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      'Linkedin-Version': apiVersion,
    };

    try {
      const response = await axios.post(LINKEDIN_POSTS_URL, payload, {
        headers,
        timeout: 15000,
      });

      // Extract x-restli-id from response headers
      const platformPostId =
        response.headers?.['x-restli-id'] ||
        response.headers?.['X-RestLi-Id'] ||
        response.headers?.['x-restli-id'.toLowerCase()];

      if (!platformPostId) {
        const err = new Error('LinkedIn Posts API did not return post identifier (x-restli-id).');
        err.status = 502;
        throw err;
      }

      return {
        success: true,
        platformPostId,
        status: 'published',
        providerMetadata: {
          apiVersion,
          lifecycleState: 'PUBLISHED',
          visibility: 'PUBLIC',
          contentType: 'text',
        },
      };
    } catch (error) {
      // Avoid re-wrapping our own custom thrown error
      if (error.status === 502 && error.message.includes('x-restli-id')) {
        throw error;
      }

      const responseStatus = error.response?.status;
      const responseData = error.response?.data;
      const rawMessage =
        responseData?.message ||
        responseData?.error_description ||
        responseData?.error ||
        error.message ||
        'LinkedIn Posts API request failed.';

      const err = new Error(`LinkedIn Posts API error: ${rawMessage}`);
      err.status = responseStatus || 502;
      err.providerErrorCode =
        responseData?.serviceErrorCode || responseData?.code || 'LINKEDIN_ERROR';
      err.providerMessage = rawMessage;
      throw err;
    }
  },

  /**
   * Retrieves a published LinkedIn post by its URN
   * GET https://api.linkedin.com/rest/posts/{postUrn}
   *
   * @param {{ accessToken: string, postUrn: string }} params
   * @returns {Promise<{ id: string, author: string, commentary: string, lifecycleState: string, visibility: string, publishedAt: Date|null, createdAt: Date|null, lastModifiedAt: Date|null, contentType: string }>}
   */
  async getPost({ accessToken, postUrn }) {
    if (!accessToken) {
      const err = new Error('Access token is required to fetch LinkedIn post.');
      err.status = 401;
      throw err;
    }

    if (!postUrn || typeof postUrn !== 'string' || postUrn.trim().length === 0) {
      const err = new Error('Post URN is required to fetch LinkedIn post.');
      err.status = 400;
      throw err;
    }

    const apiVersion = config.linkedin.apiVersion || '202608';
    const cleanUrn = postUrn.trim();
    const encodedUrn = encodeURIComponent(cleanUrn);
    const url = `${LINKEDIN_POSTS_URL}/${encodedUrn}`;

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
      'Linkedin-Version': apiVersion,
    };

    try {
      const response = await axios.get(url, {
        headers,
        timeout: 15000,
      });

      const data = response.data || {};

      let contentType = 'text';
      if (data.content?.media) {
        contentType = 'image';
      }

      return {
        id: data.id || cleanUrn,
        author: data.author || null,
        commentary: data.commentary || '',
        lifecycleState: data.lifecycleState || 'PUBLISHED',
        visibility: data.visibility || 'PUBLIC',
        publishedAt: data.publishedAt ? new Date(data.publishedAt) : null,
        createdAt: data.createdAt ? new Date(data.createdAt) : null,
        lastModifiedAt: data.lastModifiedAt ? new Date(data.lastModifiedAt) : null,
        contentType,
      };
    } catch (error) {
      const responseStatus = error.response?.status;
      const responseData = error.response?.data;
      const rawMessage =
        responseData?.message ||
        responseData?.error_description ||
        responseData?.error ||
        error.message ||
        'Failed to fetch LinkedIn post.';

      const err = new Error(`LinkedIn Posts API error: ${rawMessage}`);
      err.status = responseStatus || 502;
      err.providerErrorCode =
        responseData?.serviceErrorCode || responseData?.code || 'LINKEDIN_ERROR';
      err.providerMessage = rawMessage;
      throw err;
    }
  },

  /**
   * Partially updates an existing LinkedIn post commentary
   * POST https://api.linkedin.com/rest/posts/{postUrn} (with X-RestLi-Method: PARTIAL_UPDATE)
   *
   * @param {{ accessToken: string, postUrn: string, commentary: string }} params
   * @returns {Promise<{ success: boolean, commentary: string }>}
   */
  async updatePost({ accessToken, postUrn, commentary }) {
    if (!accessToken) {
      const err = new Error('Access token is required to update LinkedIn post.');
      err.status = 401;
      throw err;
    }

    if (!postUrn || typeof postUrn !== 'string' || postUrn.trim().length === 0) {
      const err = new Error('Post URN is required to update LinkedIn post.');
      err.status = 400;
      throw err;
    }

    if (!commentary || typeof commentary !== 'string' || commentary.trim().length === 0) {
      const err = new Error('Post commentary text cannot be empty.');
      err.status = 400;
      throw err;
    }

    const apiVersion = config.linkedin.apiVersion || '202608';
    const cleanUrn = postUrn.trim();
    const encodedUrn = encodeURIComponent(cleanUrn);
    const url = `${LINKEDIN_POSTS_URL}/${encodedUrn}`;
    const trimmedCommentary = commentary.trim();

    const payload = {
      patch: {
        $set: {
          commentary: trimmedCommentary,
        },
      },
    };

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      'Linkedin-Version': apiVersion,
      'X-RestLi-Method': 'PARTIAL_UPDATE',
    };

    try {
      await axios.post(url, payload, {
        headers,
        timeout: 15000,
      });

      return {
        success: true,
        commentary: trimmedCommentary,
      };
    } catch (error) {
      const responseStatus = error.response?.status;
      const responseData = error.response?.data;
      const rawMessage =
        responseData?.message ||
        responseData?.error_description ||
        responseData?.error ||
        error.message ||
        'LinkedIn post update failed.';

      const err = new Error(`LinkedIn Posts API error: ${rawMessage}`);
      err.status = responseStatus || 502;
      err.providerErrorCode =
        responseData?.serviceErrorCode || responseData?.code || 'LINKEDIN_ERROR';
      err.providerMessage = rawMessage;
      throw err;
    }
  },

  /**
   * Deletes a published LinkedIn post by its URN
   * DELETE https://api.linkedin.com/rest/posts/{postUrn}
   *
   * @param {{ accessToken: string, postUrn: string }} params
   * @returns {Promise<{ success: boolean }>}
   */
  async deletePost({ accessToken, postUrn }) {
    if (!accessToken) {
      const err = new Error('Access token is required to delete LinkedIn post.');
      err.status = 401;
      throw err;
    }

    if (!postUrn || typeof postUrn !== 'string' || postUrn.trim().length === 0) {
      const err = new Error('Post URN is required to delete LinkedIn post.');
      err.status = 400;
      throw err;
    }

    const apiVersion = config.linkedin.apiVersion || '202608';
    const cleanUrn = postUrn.trim();
    const encodedUrn = encodeURIComponent(cleanUrn);
    const url = `${LINKEDIN_POSTS_URL}/${encodedUrn}`;

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
      'Linkedin-Version': apiVersion,
      'X-RestLi-Method': 'DELETE',
    };

    try {
      await axios.delete(url, {
        headers,
        timeout: 15000,
      });

      return { success: true };
    } catch (error) {
      const responseStatus = error.response?.status;
      if (responseStatus === 404) {
        return { success: true, alreadyDeleted: true };
      }

      const responseData = error.response?.data;
      const rawMessage =
        responseData?.message ||
        responseData?.error_description ||
        responseData?.error ||
        error.message ||
        'LinkedIn post deletion failed.';

      const err = new Error(`LinkedIn Posts API error: ${rawMessage}`);
      err.status = responseStatus || 502;
      err.providerErrorCode =
        responseData?.serviceErrorCode || responseData?.code || 'LINKEDIN_ERROR';
      err.providerMessage = rawMessage;
      throw err;
    }
  },

  /**
   * Retrieves analytics for a specific LinkedIn post
   * GET https://api.linkedin.com/rest/memberCreatorPostAnalytics?q=entity&entity=...
   *
   * @param {{ accessToken: string, postUrn: string, aggregation?: 'TOTAL'|'DAILY', dateRange?: { start: string|Date, end: string|Date }, metrics?: string[] }} params
   * @returns {Promise<{ success: boolean, platformPostId: string, aggregation: string, dateRange: object|null, metrics: { impressions: number|null, membersReached: number|null, reactions: number|null, comments: number|null, reshares: number|null }, providerMetadata: object }>}
   */
  async getPostAnalytics({ accessToken, postUrn, aggregation = 'TOTAL', dateRange, metrics = [] }) {
    if (!accessToken) {
      const err = new Error('Access token is required to fetch LinkedIn post analytics.');
      err.status = 401;
      err.code = 'ANALYTICS_UNAUTHORIZED';
      throw err;
    }

    if (!postUrn || typeof postUrn !== 'string' || postUrn.trim().length === 0) {
      const err = new Error('Post URN is required to fetch LinkedIn post analytics.');
      err.status = 400;
      err.code = 'ANALYTICS_INVALID_REQUEST';
      throw err;
    }

    const cleanUrn = postUrn.trim();
    const normalizedAgg = (aggregation || 'TOTAL').toUpperCase();
    if (!['TOTAL', 'DAILY'].includes(normalizedAgg)) {
      const err = new Error(`Unsupported aggregation: ${aggregation}. Must be 'TOTAL' or 'DAILY'.`);
      err.status = 400;
      err.code = 'ANALYTICS_INVALID_REQUEST';
      throw err;
    }

    // Validation: MEMBERS_REACHED is not supported with DAILY aggregation by LinkedIn API
    const requestedMetrics = Array.isArray(metrics) ? metrics.map((m) => m.toUpperCase()) : [];
    if (normalizedAgg === 'DAILY' && requestedMetrics.includes('MEMBERS_REACHED')) {
      const err = new Error('MEMBERS_REACHED metric is not supported for DAILY aggregation by LinkedIn API.');
      err.status = 400;
      err.code = 'ANALYTICS_INVALID_REQUEST';
      throw err;
    }

    let parsedStartDate = null;
    let parsedEndDate = null;
    let restliDateRangeStr = '';

    if (dateRange && (dateRange.start || dateRange.end)) {
      if (!dateRange.start || !dateRange.end) {
        const err = new Error('Both start and end dates are required when specifying a date range.');
        err.status = 400;
        err.code = 'ANALYTICS_INVALID_REQUEST';
        throw err;
      }

      parsedStartDate = new Date(dateRange.start);
      parsedEndDate = new Date(dateRange.end);

      if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
        const err = new Error('Invalid date format provided in dateRange.');
        err.status = 400;
        err.code = 'ANALYTICS_INVALID_REQUEST';
        throw err;
      }

      if (parsedStartDate > parsedEndDate) {
        const err = new Error('startDate cannot be after endDate.');
        err.status = 400;
        err.code = 'ANALYTICS_INVALID_REQUEST';
        throw err;
      }

      const startYear = parsedStartDate.getUTCFullYear();
      const startMonth = parsedStartDate.getUTCMonth() + 1;
      const startDay = parsedStartDate.getUTCDate();

      const endYear = parsedEndDate.getUTCFullYear();
      const endMonth = parsedEndDate.getUTCMonth() + 1;
      const endDay = parsedEndDate.getUTCDate();

      restliDateRangeStr = `,dateRange:(start:(year:${startYear},month:${startMonth},day:${startDay}),end:(year:${endYear},month:${endMonth},day:${endDay}))`;
    }

    const apiVersion = config.linkedin.apiVersion || '202608';
    const entityParam = `(postUrn:${encodeURIComponent(cleanUrn)},aggregation:${normalizedAgg}${restliDateRangeStr})`;

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
      'Linkedin-Version': apiVersion,
    };

    try {
      const response = await axios.get(LINKEDIN_ANALYTICS_URL, {
        params: {
          q: 'entity',
          entity: entityParam,
        },
        headers,
        timeout: 15000,
      });

      const data = response.data || {};
      const parsedMetrics = {
        impressions: null,
        membersReached: null,
        reactions: null,
        comments: null,
        reshares: null,
      };

      // Helper to assign metric value safely
      const setMetric = (key, val) => {
        if (typeof val === 'number' && !isNaN(val)) {
          parsedMetrics[key] = (parsedMetrics[key] || 0) + val;
        } else if (typeof val === 'string' && !isNaN(Number(val))) {
          parsedMetrics[key] = (parsedMetrics[key] || 0) + Number(val);
        }
      };

      // 1. Direct fields check (if top-level object)
      if (data.impressions !== undefined) setMetric('impressions', data.impressions);
      if (data.membersReached !== undefined) setMetric('membersReached', data.membersReached);
      if (data.uniqueImpressions !== undefined) setMetric('membersReached', data.uniqueImpressions);
      if (data.reactions !== undefined) setMetric('reactions', data.reactions);
      if (data.likes !== undefined) setMetric('reactions', data.likes);
      if (data.comments !== undefined) setMetric('comments', data.comments);
      if (data.reshares !== undefined) setMetric('reshares', data.reshares);
      if (data.shares !== undefined) setMetric('reshares', data.shares);

      // 2. Elements list parsing
      const elements = Array.isArray(data.elements)
        ? data.elements
        : data.elements
        ? [data.elements]
        : [];

      for (const el of elements) {
        if (!el) continue;

        // Metric entry breakdown
        const metricType = (el.metricType || el.type || el.metric || '').toUpperCase();
        const value = el.value !== undefined ? el.value : el.count !== undefined ? el.count : el.total;

        if (metricType) {
          if (metricType.includes('IMPRESSION') && !metricType.includes('UNIQUE') && !metricType.includes('MEMBER')) {
            setMetric('impressions', value);
          } else if (
            metricType.includes('MEMBER') ||
            metricType.includes('REACH') ||
            metricType.includes('UNIQUE_IMPRESSION')
          ) {
            setMetric('membersReached', value);
          } else if (metricType.includes('REACTION') || metricType.includes('LIKE')) {
            setMetric('reactions', value);
          } else if (metricType.includes('COMMENT')) {
            setMetric('comments', value);
          } else if (metricType.includes('RESHARE') || metricType.includes('SHARE')) {
            setMetric('reshares', value);
          }
        }

        // Direct keys inside element
        if (el.impressions !== undefined) setMetric('impressions', el.impressions);
        if (el.membersReached !== undefined) setMetric('membersReached', el.membersReached);
        if (el.uniqueImpressions !== undefined) setMetric('membersReached', el.uniqueImpressions);
        if (el.reactions !== undefined) setMetric('reactions', el.reactions);
        if (el.likes !== undefined) setMetric('reactions', el.likes);
        if (el.comments !== undefined) setMetric('comments', el.comments);
        if (el.reshares !== undefined) setMetric('reshares', el.reshares);
        if (el.shares !== undefined) setMetric('reshares', el.shares);

        // Nested entries inside element
        if (Array.isArray(el.entry) || Array.isArray(el.entries)) {
          const entries = el.entry || el.entries;
          for (const entry of entries) {
            const entryType = (entry.metricType || entry.type || entry.metric || '').toUpperCase();
            const entryVal = entry.value !== undefined ? entry.value : entry.count !== undefined ? entry.count : entry.total;
            if (entryType.includes('IMPRESSION') && !entryType.includes('UNIQUE') && !entryType.includes('MEMBER')) {
              setMetric('impressions', entryVal);
            } else if (
              entryType.includes('MEMBER') ||
              entryType.includes('REACH') ||
              entryType.includes('UNIQUE_IMPRESSION')
            ) {
              setMetric('membersReached', entryVal);
            } else if (entryType.includes('REACTION') || entryType.includes('LIKE')) {
              setMetric('reactions', entryVal);
            } else if (entryType.includes('COMMENT')) {
              setMetric('comments', entryVal);
            } else if (entryType.includes('RESHARE') || entryType.includes('SHARE')) {
              setMetric('reshares', entryVal);
            }
          }
        }
      }

      return {
        success: true,
        platformPostId: cleanUrn,
        aggregation: normalizedAgg,
        dateRange: parsedStartDate && parsedEndDate ? { start: parsedStartDate, end: parsedEndDate } : null,
        metrics: parsedMetrics,
        providerMetadata: {
          apiVersion,
          totalElements: elements.length,
        },
      };
    } catch (error) {
      if (error.code && error.code.startsWith('ANALYTICS_')) {
        throw error;
      }

      const responseStatus = error.response?.status;
      const responseData = error.response?.data;
      const rawMessage =
        responseData?.message ||
        responseData?.error_description ||
        responseData?.error ||
        error.message ||
        'LinkedIn Member Creator Post Analytics request failed.';

      let normalizedCode = 'ANALYTICS_PROVIDER_UNAVAILABLE';
      let userFriendlyMessage = `LinkedIn Analytics error: ${rawMessage}`;

      if (responseStatus === 400) {
        normalizedCode = 'ANALYTICS_INVALID_REQUEST';
      } else if (responseStatus === 401) {
        normalizedCode = 'ANALYTICS_UNAUTHORIZED';
        userFriendlyMessage = 'LinkedIn authorization expired or invalid. Please reconnect your account.';
      } else if (responseStatus === 403) {
        normalizedCode = 'ANALYTICS_FORBIDDEN';
        userFriendlyMessage =
          'LinkedIn member post analytics permission (r_member_postAnalytics) missing or access denied. Please reconnect your LinkedIn account.';
      } else if (responseStatus === 404) {
        normalizedCode = 'ANALYTICS_NOT_FOUND';
        userFriendlyMessage = 'Post not found or analytics not yet available for this post on LinkedIn.';
      } else if (responseStatus === 429) {
        normalizedCode = 'ANALYTICS_RATE_LIMITED';
        userFriendlyMessage = 'LinkedIn analytics rate limit reached. Please try again later.';
      }

      const err = new Error(userFriendlyMessage);
      err.status = responseStatus || 502;
      err.code = normalizedCode;
      err.providerErrorCode =
        responseData?.serviceErrorCode || responseData?.code || 'LINKEDIN_ANALYTICS_ERROR';
      err.providerMessage = rawMessage;
      throw err;
    }
  },

  /**
   * Returns supported capabilities for the LinkedIn integration slice
   */
  capabilities() {
    return {
      platform: 'linkedin',
      canPost: true,
      canPostImage: true,
      canUpdate: true,
      canDelete: true,
      canGetAnalytics: true,
      supportedImageFormats: SUPPORTED_IMAGE_MIMES,
      maxImageSizeBytes: 10 * 1024 * 1024, // 10MB
      canSchedule: false,
      hasProgrammaticRefreshToken: false,
      tokenLifespanDays: 60,
    };
  },
};

module.exports = linkedinProvider;
