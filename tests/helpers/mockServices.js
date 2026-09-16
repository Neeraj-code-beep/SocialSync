const path = require('path');
const { Readable } = require('stream');
const axios = require('axios');

const aiServicePath = require.resolve('../../src/services/ai.service');
const storageServicePath = require.resolve('../../src/services/storage.service');

let mockCaptionResult = 'AI generated test caption for social media #trending #ai';
let mockStorageResult = {
  url: 'https://ik.imagekit.io/mock/test-image-123.jpg',
  fileId: 'mock-file-id-456',
};

let mockLinkedInTokenResult = {
  access_token: 'mock_linkedin_access_token_secret_12345',
  expires_in: 5184000,
  refresh_token: null,
  refresh_token_expires_in: null,
  scope: 'openid profile email w_member_social',
};

let mockLinkedInProfileResult = {
  sub: 'linkedin_member_sub_98765',
  name: 'Alex Morgan',
  email: 'alex.morgan@example.com',
  picture: 'https://media.licdn.com/dms/image/v2/mock_avatar.jpg',
};

let mockImageInitResult = {
  uploadUrl: 'https://api.linkedin.com/mediaUpload/mock_upload_url_123',
  uploadUrlExpiresAt: Date.now() + 3600000,
  image: 'urn:li:image:MOCK_IMAGE_URN_12345',
};

let mockPublishPostResult = {
  platformPostId: 'urn:li:share:1234567890',
};

let mockGetPostResult = {
  id: 'urn:li:share:1234567890',
  author: 'urn:li:person:linkedin_member_sub_98765',
  commentary: 'Original post commentary #linkedin',
  lifecycleState: 'PUBLISHED',
  visibility: 'PUBLIC',
  publishedAt: 1710000000000,
  createdAt: 1710000000000,
  lastModifiedAt: 1710000000000,
  content: {
    media: {
      id: 'urn:li:image:MOCK_IMAGE_URN_12345',
      altText: 'Sample image',
    },
  },
};

let mockAnalyticsResult = {
  elements: [
    { metricType: 'IMPRESSION', value: 250 },
    { metricType: 'MEMBERS_REACHED', value: 180 },
    { metricType: 'REACTION', value: 15 },
    { metricType: 'COMMENT', value: 4 },
    { metricType: 'RESHARE', value: 2 },
  ],
};

let mockImageFetchBuffer = Buffer.from('mock-valid-jpeg-image-binary-bytes');
let mockImageFetchContentType = 'image/jpeg';
let mockImageFetchError = null;
let mockRedirectDestination = null;

let lastAxiosPostsPayload = null;
let lastAxiosInitializeUpload = null;
let lastAxiosPutPayload = null;
let lastAxiosImageFetch = null;
let lastAxiosGetPost = null;
let lastAxiosUpdatePost = null;
let lastAxiosDeletePost = null;
let lastAxiosAnalytics = null;

let publishErrorToThrow = null;
let shouldMissingPostId = false;
let mockImageInitError = null;
let mockImageInitMissingValues = false;
let mockUploadError = null;
let mockGetPostError = null;
let mockUpdatePostError = null;
let mockDeletePostError = null;
let mockAnalyticsError = null;

let shouldAiFail = false;
let shouldStorageFail = false;
let shouldLinkedInTokenFail = false;
let shouldLinkedInProfileFail = false;

function setupServiceMocks() {
  require.cache[aiServicePath] = {
    id: aiServicePath,
    filename: aiServicePath,
    loaded: true,
    exports: async function mockGenerateCaption(buffer, mimeType) {
      if (shouldAiFail) {
        throw new Error('AI Generation service unavailable');
      }
      return mockCaptionResult;
    },
  };

  require.cache[storageServicePath] = {
    id: storageServicePath,
    filename: storageServicePath,
    loaded: true,
    exports: async function mockUploadFile(buffer, filename) {
      if (shouldStorageFail) {
        throw new Error('ImageKit storage upload failed');
      }
      return mockStorageResult;
    },
  };

  // Intercept axios.get
  axios.get = async function (url, options = {}) {
    // 1. LinkedIn Profile Userinfo
    if (typeof url === 'string' && url.includes('api.linkedin.com/v2/userinfo')) {
      if (shouldLinkedInProfileFail) {
        const err = new Error('Unauthorized token or LinkedIn profile service unavailable');
        err.response = { status: 401, data: { message: 'Unauthorized profile access' } };
        throw err;
      }
      return { status: 200, data: mockLinkedInProfileResult };
    }

    // 2. LinkedIn Posts GET API (/rest/posts/{postUrn})
    if (typeof url === 'string' && url.includes('rest/posts/')) {
      lastAxiosGetPost = { url, headers: options.headers };

      if (mockGetPostError) {
        const err = new Error(mockGetPostError.message || 'LinkedIn Posts GET API error');
        err.response = {
          status: mockGetPostError.status || 502,
          data: {
            serviceErrorCode: mockGetPostError.errorCode || 'LINKEDIN_ERROR',
            message: mockGetPostError.message || 'Failed to fetch post',
          },
        };
        throw err;
      }

      return {
        status: 200,
        headers: { 'linkedin-version': '202608', 'x-restli-protocol-version': '2.0.0' },
        data: mockGetPostResult,
      };
    }

    // 3. LinkedIn Member Post Analytics API (/rest/memberCreatorPostAnalytics)
    if (typeof url === 'string' && url.includes('memberCreatorPostAnalytics')) {
      lastAxiosAnalytics = { url, params: options.params, headers: options.headers };

      if (mockAnalyticsError) {
        const err = new Error(mockAnalyticsError.message || 'LinkedIn Member Creator Analytics API error');
        err.response = {
          status: mockAnalyticsError.status || 502,
          data: {
            serviceErrorCode: mockAnalyticsError.errorCode || 'LINKEDIN_ANALYTICS_ERROR',
            message: mockAnalyticsError.message || 'Failed to fetch post analytics',
            code: mockAnalyticsError.errorCode,
          },
        };
        throw err;
      }

      return {
        status: 200,
        headers: { 'linkedin-version': '202608', 'x-restli-protocol-version': '2.0.0' },
        data: mockAnalyticsResult,
      };
    }

    // Default: treat as image download request (ImageKit or other media CDN)
    lastAxiosImageFetch = { url, options };

    // Simulate redirect if configured
    if (mockRedirectDestination) {
      if (typeof options.beforeRedirect === 'function') {
        options.beforeRedirect({ href: mockRedirectDestination }, {});
      }
    }

    if (mockImageFetchError) {
      const err = new Error(mockImageFetchError.message || 'Image download failed');
      err.response = {
        status: mockImageFetchError.status || 500,
        data: 'Failed to download image',
      };
      throw err;
    }

    // Return stream if responseType is stream
    if (options.responseType === 'stream') {
      const stream = new Readable({
        read() {
          this.push(mockImageFetchBuffer);
          this.push(null);
        },
      });

      return {
        status: 200,
        headers: {
          'content-type': mockImageFetchContentType,
          'content-length': String(mockImageFetchBuffer.length),
        },
        data: stream,
      };
    }

    return {
      status: 200,
      headers: {
        'content-type': mockImageFetchContentType,
        'content-length': String(mockImageFetchBuffer.length),
      },
      data: mockImageFetchBuffer,
    };
  };

  // Intercept axios.post
  axios.post = async function (url, data, options = {}) {
    // 1. LinkedIn Token Exchange
    if (typeof url === 'string' && url.includes('oauth/v2/accessToken')) {
      if (shouldLinkedInTokenFail) {
        const err = new Error('LinkedIn OAuth exchange error: Invalid authorization code');
        err.response = {
          status: 400,
          data: { error: 'invalid_grant', error_description: 'Invalid authorization code' },
        };
        throw err;
      }
      return { status: 200, data: mockLinkedInTokenResult };
    }

    // 2. LinkedIn Images Upload Initialization
    if (typeof url === 'string' && url.includes('rest/images?action=initializeUpload')) {
      lastAxiosInitializeUpload = { url, data, headers: options.headers };

      if (mockImageInitError) {
        const err = new Error(
          mockImageInitError.message || 'LinkedIn Images API initialization failed'
        );
        err.response = {
          status: mockImageInitError.status || 502,
          data: {
            serviceErrorCode: mockImageInitError.errorCode || 'IMAGE_INIT_ERROR',
            message: mockImageInitError.message || 'Initialization failed',
          },
        };
        throw err;
      }

      if (mockImageInitMissingValues) {
        return {
          status: 200,
          headers: { 'x-restli-id': 'urn:li:image:incomplete' },
          data: { value: {} },
        };
      }

      return {
        status: 200,
        headers: { 'x-restli-id': mockImageInitResult.image },
        data: {
          value: {
            uploadUrl: mockImageInitResult.uploadUrl,
            uploadUrlExpiresAt: mockImageInitResult.uploadUrlExpiresAt,
            image: mockImageInitResult.image,
          },
        },
      };
    }

    // 3. LinkedIn Posts Update API (POST with X-RestLi-Method: PARTIAL_UPDATE)
    if (
      typeof url === 'string' &&
      url.includes('rest/posts/') &&
      (options.headers?.['X-RestLi-Method'] === 'PARTIAL_UPDATE' ||
        options.headers?.['x-restli-method'] === 'PARTIAL_UPDATE')
    ) {
      lastAxiosUpdatePost = { url, data, headers: options.headers };

      if (mockUpdatePostError) {
        const err = new Error(mockUpdatePostError.message || 'LinkedIn Post Update failed');
        err.response = {
          status: mockUpdatePostError.status || 502,
          data: {
            serviceErrorCode: mockUpdatePostError.errorCode || 'UPDATE_ERROR',
            message: mockUpdatePostError.message || 'Update failed',
          },
        };
        throw err;
      }

      return { status: 204, headers: {}, data: {} };
    }

    // 4. LinkedIn Posts Create API
    if (typeof url === 'string' && url.includes('rest/posts')) {
      lastAxiosPostsPayload = { url, data, headers: options.headers };

      if (publishErrorToThrow) {
        const err = new Error(publishErrorToThrow.message || 'LinkedIn Posts API error');
        err.response = {
          status: publishErrorToThrow.status || 502,
          data: {
            serviceErrorCode: publishErrorToThrow.errorCode || 'LINKEDIN_ERROR',
            message: publishErrorToThrow.message || 'LinkedIn Posts API error',
          },
        };
        throw err;
      }

      if (shouldMissingPostId) {
        return {
          status: 201,
          headers: {},
          data: {},
        };
      }

      return {
        status: 201,
        headers: {
          'x-restli-id': mockPublishPostResult.platformPostId,
        },
        data: {},
      };
    }

    return { status: 200, data: {} };
  };

  // Intercept axios.put (Image Upload to Pre-signed URL)
  axios.put = async function (url, data, options = {}) {
    lastAxiosPutPayload = { url, data, headers: options.headers };

    if (mockUploadError) {
      const err = new Error(mockUploadError.message || 'Failed to upload binary image bytes');
      err.response = {
        status: mockUploadError.status || 502,
        data: { message: mockUploadError.message || 'Upload failed' },
      };
      throw err;
    }

    return { status: 201, data: {} };
  };

  // Intercept axios.delete (LinkedIn Posts DELETE API)
  axios.delete = async function (url, options = {}) {
    if (typeof url === 'string' && url.includes('rest/posts/')) {
      lastAxiosDeletePost = { url, headers: options.headers };

      if (mockDeletePostError) {
        const err = new Error(mockDeletePostError.message || 'LinkedIn Post Delete failed');
        err.response = {
          status: mockDeletePostError.status || 502,
          data: {
            serviceErrorCode: mockDeletePostError.errorCode || 'DELETE_ERROR',
            message: mockDeletePostError.message || 'Deletion failed',
          },
        };
        throw err;
      }

      return { status: 204, headers: {}, data: {} };
    }

    return { status: 200, data: {} };
  };
}

function resetServiceMocks() {
  mockCaptionResult = 'AI generated test caption for social media #trending #ai';
  mockStorageResult = {
    url: 'https://ik.imagekit.io/mock/test-image-123.jpg',
    fileId: 'mock-file-id-456',
  };
  mockLinkedInTokenResult = {
    access_token: 'mock_linkedin_access_token_secret_12345',
    expires_in: 5184000,
    refresh_token: null,
    refresh_token_expires_in: null,
    scope: 'openid profile email w_member_social',
  };
  mockLinkedInProfileResult = {
    sub: 'linkedin_member_sub_98765',
    name: 'Alex Morgan',
    email: 'alex.morgan@example.com',
    picture: 'https://media.licdn.com/dms/image/v2/mock_avatar.jpg',
  };
  mockImageInitResult = {
    uploadUrl: 'https://api.linkedin.com/mediaUpload/mock_upload_url_123',
    uploadUrlExpiresAt: Date.now() + 3600000,
    image: 'urn:li:image:MOCK_IMAGE_URN_12345',
  };
  mockPublishPostResult = {
    platformPostId: 'urn:li:share:1234567890',
  };
  mockGetPostResult = {
    id: 'urn:li:share:1234567890',
    author: 'urn:li:person:linkedin_member_sub_98765',
    commentary: 'Original post commentary #linkedin',
    lifecycleState: 'PUBLISHED',
    visibility: 'PUBLIC',
    publishedAt: 1710000000000,
    createdAt: 1710000000000,
    lastModifiedAt: 1710000000000,
    content: {
      media: {
        id: 'urn:li:image:MOCK_IMAGE_URN_12345',
        altText: 'Sample image',
      },
    },
  };

  mockAnalyticsResult = {
    elements: [
      { metricType: 'IMPRESSION', value: 250 },
      { metricType: 'MEMBERS_REACHED', value: 180 },
      { metricType: 'REACTION', value: 15 },
      { metricType: 'COMMENT', value: 4 },
      { metricType: 'RESHARE', value: 2 },
    ],
  };

  mockImageFetchBuffer = Buffer.from('mock-valid-jpeg-image-binary-bytes');
  mockImageFetchContentType = 'image/jpeg';
  mockImageFetchError = null;
  mockRedirectDestination = null;

  lastAxiosPostsPayload = null;
  lastAxiosInitializeUpload = null;
  lastAxiosPutPayload = null;
  lastAxiosImageFetch = null;
  lastAxiosGetPost = null;
  lastAxiosUpdatePost = null;
  lastAxiosDeletePost = null;
  lastAxiosAnalytics = null;

  publishErrorToThrow = null;
  shouldMissingPostId = false;
  mockImageInitError = null;
  mockImageInitMissingValues = false;
  mockUploadError = null;
  mockGetPostError = null;
  mockUpdatePostError = null;
  mockDeletePostError = null;
  mockAnalyticsError = null;

  shouldAiFail = false;
  shouldStorageFail = false;
  shouldLinkedInTokenFail = false;
  shouldLinkedInProfileFail = false;

  setupServiceMocks();
}

function setMockAiFailure(fail = true) {
  shouldAiFail = fail;
}

function setMockStorageFailure(fail = true) {
  shouldStorageFail = fail;
}

function setMockLinkedInTokenFailure(fail = true) {
  shouldLinkedInTokenFail = fail;
}

function setMockLinkedInProfileFailure(fail = true) {
  shouldLinkedInProfileFail = fail;
}

function setMockLinkedInProfile(customProfile) {
  mockLinkedInProfileResult = {
    ...mockLinkedInProfileResult,
    ...customProfile,
  };
}

function setMockLinkedInPublishError(errorObj) {
  publishErrorToThrow = errorObj;
}

function setMockLinkedInPublishMissingPostId(fail = true) {
  shouldMissingPostId = fail;
}

function setMockImageInitError(errorObj) {
  mockImageInitError = errorObj;
}

function setMockImageInitMissingValues(missing = true) {
  mockImageInitMissingValues = missing;
}

function setMockUploadError(errorObj) {
  mockUploadError = errorObj;
}

function setMockImageFetchError(errorObj) {
  mockImageFetchError = errorObj;
}

function setMockImageFetchContentType(mime) {
  mockImageFetchContentType = mime;
}

function setMockImageFetchBuffer(buffer) {
  mockImageFetchBuffer = buffer;
}

function setMockRedirectDestination(url) {
  mockRedirectDestination = url;
}

function setMockGetPostResult(data) {
  mockGetPostResult = {
    ...mockGetPostResult,
    ...data,
  };
}

function setMockGetPostError(errorObj) {
  mockGetPostError = errorObj;
}

function setMockUpdatePostError(errorObj) {
  mockUpdatePostError = errorObj;
}

function setMockDeletePostError(errorObj) {
  mockDeletePostError = errorObj;
}

function setMockAnalyticsResult(data) {
  mockAnalyticsResult = data;
}

function setMockAnalyticsError(errorObj) {
  mockAnalyticsError = errorObj;
}

function getLastAxiosPostsPayload() {
  return lastAxiosPostsPayload;
}

function getLastAxiosInitializeUpload() {
  return lastAxiosInitializeUpload;
}

function getLastAxiosPutPayload() {
  return lastAxiosPutPayload;
}

function getLastAxiosImageFetch() {
  return lastAxiosImageFetch;
}

function getLastAxiosGetPost() {
  return lastAxiosGetPost;
}

function getLastAxiosUpdatePost() {
  return lastAxiosUpdatePost;
}

function getLastAxiosDeletePost() {
  return lastAxiosDeletePost;
}

function getLastAxiosAnalytics() {
  return lastAxiosAnalytics;
}

module.exports = {
  setupServiceMocks,
  resetServiceMocks,
  setMockAiFailure,
  setMockStorageFailure,
  setMockLinkedInTokenFailure,
  setMockLinkedInProfileFailure,
  setMockLinkedInProfile,
  setMockLinkedInPublishError,
  setMockLinkedInPublishMissingPostId,
  setMockImageInitError,
  setMockImageInitMissingValues,
  setMockUploadError,
  setMockImageFetchError,
  setMockImageFetchContentType,
  setMockImageFetchBuffer,
  setMockRedirectDestination,
  setMockGetPostResult,
  setMockGetPostError,
  setMockUpdatePostError,
  setMockDeletePostError,
  setMockAnalyticsResult,
  setMockAnalyticsError,
  getLastAxiosPostsPayload,
  getLastAxiosInitializeUpload,
  getLastAxiosPutPayload,
  getLastAxiosImageFetch,
  getLastAxiosGetPost,
  getLastAxiosUpdatePost,
  getLastAxiosDeletePost,
  getLastAxiosAnalytics,
};
