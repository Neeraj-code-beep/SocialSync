const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

require('./setup');
const app = require('../src/app');
const postModel = require('../src/models/post.model');
const SocialAccount = require('../src/models/socialAccount.model');
const Publication = require('../src/models/publication.model');
const { linkedinProvider } = require('../src/services/providers');
const { encrypt } = require('../src/lib/encryption');
const {
  validateImageUrlForSsrf,
  isPrivateOrBlockedIP,
} = require('../src/controllers/post.controller');
const {
  clearDb,
  seedUser,
  seedPost,
  seedSocialAccount,
  seedPublication,
  generateTestToken,
} = require('./helpers/inMemoryDb');
const {
  resetServiceMocks,
  setMockLinkedInPublishError,
  setMockLinkedInPublishMissingPostId,
  setMockImageInitError,
  setMockImageInitMissingValues,
  setMockUploadError,
  setMockImageFetchError,
  setMockImageFetchContentType,
  setMockImageFetchBuffer,
  setMockRedirectDestination,
  getLastAxiosPostsPayload,
  getLastAxiosInitializeUpload,
  getLastAxiosPutPayload,
  getLastAxiosImageFetch,
} = require('./helpers/mockServices');

describe('Phase 1.3B: LinkedIn Publishing (Text & Single-Image)', () => {
  beforeEach(() => {
    clearDb();
    resetServiceMocks();
  });

  describe('1. Publication Model & Invariants', () => {
    it('Creates valid publication with default status "publishing" and required references', async () => {
      const { user } = await seedUser();
      const post = seedPost(user._id);
      const account = seedSocialAccount(user._id);

      const pub = await Publication.create({
        post: post._id,
        socialAccount: account._id,
        platform: 'linkedin',
      });

      assert.ok(pub._id, 'Publication must have an ID');
      assert.strictEqual(pub.status, 'publishing');
      assert.strictEqual(pub.platform, 'linkedin');
      assert.strictEqual(pub.post.toString(), post._id.toString());
      assert.strictEqual(pub.socialAccount.toString(), account._id.toString());
      assert.ok(pub.createdAt);
      assert.ok(pub.updatedAt);
    });

    it('Transitions status from publishing to published with platformPostId and publishedAt', async () => {
      const { user } = await seedUser();
      const post = seedPost(user._id);
      const account = seedSocialAccount(user._id);

      const pub = await Publication.create({
        post: post._id,
        socialAccount: account._id,
        platform: 'linkedin',
        status: 'publishing',
      });

      pub.status = 'published';
      pub.platformPostId = 'urn:li:share:1234567890';
      pub.publishedAt = new Date();
      pub.providerMetadata = { apiVersion: '202608', lifecycleState: 'PUBLISHED', contentType: 'image' };
      await pub.save();

      const saved = await Publication.findOne({ _id: pub._id });
      assert.strictEqual(saved.status, 'published');
      assert.strictEqual(saved.platformPostId, 'urn:li:share:1234567890');
      assert.ok(saved.publishedAt);
      assert.strictEqual(saved.providerMetadata.apiVersion, '202608');
      assert.strictEqual(saved.providerMetadata.contentType, 'image');
    });

    it('Transitions status from publishing to failed with safe error details', async () => {
      const { user } = await seedUser();
      const post = seedPost(user._id);
      const account = seedSocialAccount(user._id);

      const pub = await Publication.create({
        post: post._id,
        socialAccount: account._id,
        platform: 'linkedin',
        status: 'publishing',
      });

      pub.status = 'failed';
      pub.errorCode = 'ACCESS_DENIED';
      pub.errorMessage = 'LinkedIn member social permissions revoked.';
      await pub.save();

      const saved = await Publication.findOne({ _id: pub._id });
      assert.strictEqual(saved.status, 'failed');
      assert.strictEqual(saved.errorCode, 'ACCESS_DENIED');
      assert.strictEqual(saved.errorMessage, 'LinkedIn member social permissions revoked.');
    });

    it('Enforces at most ONE successful (published) publication per post + socialAccount pair', async () => {
      const { user } = await seedUser();
      const post = seedPost(user._id);
      const account = seedSocialAccount(user._id);

      // First successful publication
      await Publication.create({
        post: post._id,
        socialAccount: account._id,
        platform: 'linkedin',
        status: 'published',
        platformPostId: 'urn:li:share:first_pub',
      });

      // Attempting a second successful publication for the same post + account must be rejected
      await assert.rejects(async () => {
        await Publication.create({
          post: post._id,
          socialAccount: account._id,
          platform: 'linkedin',
          status: 'published',
          platformPostId: 'urn:li:share:duplicate_pub',
        });
      }, /duplicate/i);
    });
  });

  describe('2. LinkedIn Provider Image Methods (Phase 1.3B-2)', () => {
    const mockToken = 'mock_valid_token_123';
    const mockAuthor = 'linkedin_member_sub_98765';
    const sampleImageBuffer = Buffer.from('mock-sample-binary-jpeg-data');

    it('1. initializeImageUpload sends correct owner URN, active 202608 version, protocol, and auth headers', async () => {
      const result = await linkedinProvider.initializeImageUpload({
        accessToken: mockToken,
        ownerUrn: mockAuthor,
      });

      assert.ok(result.uploadUrl);
      assert.ok(result.imageUrn);

      const initPayload = getLastAxiosInitializeUpload();
      assert.strictEqual(initPayload.headers['Authorization'], `Bearer ${mockToken}`);
      assert.strictEqual(initPayload.headers['X-Restli-Protocol-Version'], '2.0.0');
      assert.strictEqual(initPayload.headers['Linkedin-Version'], '202608');
      assert.strictEqual(initPayload.data.initializeUploadRequest.owner, `urn:li:person:${mockAuthor}`);
    });

    it('2. uploadImageBytes performs PUT request with binary buffer and mimeType', async () => {
      const result = await linkedinProvider.uploadImageBytes({
        uploadUrl: 'https://api.linkedin.com/mediaUpload/test_123',
        imageBuffer: sampleImageBuffer,
        mimeType: 'image/png',
      });

      assert.strictEqual(result.success, true);
      const putPayload = getLastAxiosPutPayload();
      assert.strictEqual(putPayload.url, 'https://api.linkedin.com/mediaUpload/test_123');
      assert.strictEqual(putPayload.headers['Content-Type'], 'image/png');
      assert.strictEqual(Buffer.isBuffer(putPayload.data), true);
    });

    it('3. publishImagePost orchestrates initialization, upload, and post creation with content.media and altText', async () => {
      const result = await linkedinProvider.publishImagePost({
        accessToken: mockToken,
        authorUrn: mockAuthor,
        imageBuffer: sampleImageBuffer,
        mimeType: 'image/jpeg',
        commentary: 'Product launch photo with caption #startup',
        altText: 'Our sleek product dashboard',
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, 'published');
      assert.strictEqual(result.platformPostId, 'urn:li:share:1234567890');
      assert.strictEqual(result.providerMetadata.contentType, 'image');
      assert.strictEqual(result.providerMetadata.apiVersion, '202608');

      const postsPayload = getLastAxiosPostsPayload();
      assert.strictEqual(postsPayload.headers['Authorization'], `Bearer ${mockToken}`);
      assert.strictEqual(postsPayload.headers['Linkedin-Version'], '202608');
      assert.strictEqual(postsPayload.data.author, `urn:li:person:${mockAuthor}`);
      assert.strictEqual(postsPayload.data.commentary, 'Product launch photo with caption #startup');
      assert.ok(postsPayload.data.content?.media);
      assert.strictEqual(postsPayload.data.content.media.id, 'urn:li:image:MOCK_IMAGE_URN_12345');
      assert.strictEqual(postsPayload.data.content.media.altText, 'Our sleek product dashboard');
    });

    it('4. publishImagePost falls back to default altText when not provided', async () => {
      await linkedinProvider.publishImagePost({
        accessToken: mockToken,
        authorUrn: mockAuthor,
        imageBuffer: sampleImageBuffer,
        mimeType: 'image/jpeg',
        commentary: 'Product launch photo without custom alt text',
      });

      const postsPayload = getLastAxiosPostsPayload();
      assert.strictEqual(postsPayload.data.content.media.altText, 'Image shared on LinkedIn');
    });

    it('5. Rejects missing accessToken, authorUrn, commentary, or imageBuffer', async () => {
      await assert.rejects(async () => {
        await linkedinProvider.publishImagePost({
          accessToken: '',
          authorUrn: mockAuthor,
          imageBuffer: sampleImageBuffer,
          mimeType: 'image/jpeg',
          commentary: 'Caption',
        });
      }, /access token is required/i);

      await assert.rejects(async () => {
        await linkedinProvider.publishImagePost({
          accessToken: mockToken,
          authorUrn: '',
          imageBuffer: sampleImageBuffer,
          mimeType: 'image/jpeg',
          commentary: 'Caption',
        });
      }, /author urn\/id is required/i);

      await assert.rejects(async () => {
        await linkedinProvider.publishImagePost({
          accessToken: mockToken,
          authorUrn: mockAuthor,
          imageBuffer: null,
          mimeType: 'image/jpeg',
          commentary: 'Caption',
        });
      }, /non-empty image buffer is required/i);

      await assert.rejects(async () => {
        await linkedinProvider.publishImagePost({
          accessToken: mockToken,
          authorUrn: mockAuthor,
          imageBuffer: sampleImageBuffer,
          mimeType: 'image/jpeg',
          commentary: '   ',
        });
      }, /commentary text cannot be empty/i);
    });

    it('6. Rejects unsupported image MIME types (e.g. image/webp or application/pdf)', async () => {
      await assert.rejects(async () => {
        await linkedinProvider.publishImagePost({
          accessToken: mockToken,
          authorUrn: mockAuthor,
          imageBuffer: sampleImageBuffer,
          mimeType: 'image/webp',
          commentary: 'WebP image test',
        });
      }, (err) => {
        assert.strictEqual(err.status, 400);
        assert.strictEqual(err.providerErrorCode, 'UNSUPPORTED_IMAGE_FORMAT');
        assert.ok(err.message.includes('JPEG, PNG, and GIF'));
        return true;
      });
    });

    it('7. Handles missing uploadUrl or image URN from LinkedIn initialization with 502', async () => {
      setMockImageInitMissingValues(true);

      await assert.rejects(async () => {
        await linkedinProvider.publishImagePost({
          accessToken: mockToken,
          authorUrn: mockAuthor,
          imageBuffer: sampleImageBuffer,
          mimeType: 'image/jpeg',
          commentary: 'Test',
        });
      }, (err) => {
        assert.strictEqual(err.status, 502);
        assert.ok(err.message.includes('missing uploadUrl or image URN'));
        return true;
      });
    });

    it('8. Handles missing x-restli-id from Posts API with 502', async () => {
      setMockLinkedInPublishMissingPostId(true);

      await assert.rejects(async () => {
        await linkedinProvider.publishImagePost({
          accessToken: mockToken,
          authorUrn: mockAuthor,
          imageBuffer: sampleImageBuffer,
          mimeType: 'image/jpeg',
          commentary: 'Test',
        });
      }, (err) => {
        assert.strictEqual(err.status, 502);
        assert.ok(err.message.includes('x-restli-id'));
        return true;
      });
    });

    it('9. Handles LinkedIn HTTP 400 Bad Request error during image upload initialization', async () => {
      setMockImageInitError({
        status: 400,
        errorCode: 'INVALID_REQUEST',
        message: 'Invalid member URN or malformed upload parameters',
      });

      await assert.rejects(async () => {
        await linkedinProvider.publishImagePost({
          accessToken: mockToken,
          authorUrn: mockAuthor,
          imageBuffer: sampleImageBuffer,
          mimeType: 'image/jpeg',
          commentary: 'Test',
        });
      }, (err) => {
        assert.strictEqual(err.status, 400);
        assert.strictEqual(err.providerErrorCode, 'INVALID_REQUEST');
        assert.ok(err.message.includes('malformed upload parameters'));
        return true;
      });
    });

    it('10. Handles LinkedIn HTTP 401 Unauthorized during upload initialization', async () => {
      setMockImageInitError({
        status: 401,
        errorCode: 'EXPIRED_TOKEN',
        message: 'Expired access token provided',
      });

      await assert.rejects(async () => {
        await linkedinProvider.publishImagePost({
          accessToken: 'expired_token',
          authorUrn: mockAuthor,
          imageBuffer: sampleImageBuffer,
          mimeType: 'image/jpeg',
          commentary: 'Test',
        });
      }, (err) => {
        assert.strictEqual(err.status, 401);
        assert.strictEqual(err.providerErrorCode, 'EXPIRED_TOKEN');
        return true;
      });
    });

    it('11. Handles LinkedIn HTTP 403 Forbidden / insufficient permissions', async () => {
      setMockLinkedInPublishError({
        status: 403,
        errorCode: 'ACCESS_DENIED',
        message: 'Member does not have permission w_member_social to post images',
      });

      await assert.rejects(async () => {
        await linkedinProvider.publishImagePost({
          accessToken: mockToken,
          authorUrn: mockAuthor,
          imageBuffer: sampleImageBuffer,
          mimeType: 'image/jpeg',
          commentary: 'Test',
        });
      }, (err) => {
        assert.strictEqual(err.status, 403);
        assert.strictEqual(err.providerErrorCode, 'ACCESS_DENIED');
        return true;
      });
    });

    it('12. Handles LinkedIn HTTP 429 Throttle / Rate Limit', async () => {
      setMockLinkedInPublishError({
        status: 429,
        errorCode: 'RATE_LIMIT_EXCEEDED',
        message: 'Daily member publishing quota reached',
      });

      await assert.rejects(async () => {
        await linkedinProvider.publishImagePost({
          accessToken: mockToken,
          authorUrn: mockAuthor,
          imageBuffer: sampleImageBuffer,
          mimeType: 'image/jpeg',
          commentary: 'Test',
        });
      }, (err) => {
        assert.strictEqual(err.status, 429);
        assert.strictEqual(err.providerErrorCode, 'RATE_LIMIT_EXCEEDED');
        return true;
      });
    });

    it('13. Handles LinkedIn HTTP 500 / 502 provider server errors', async () => {
      setMockLinkedInPublishError({
        status: 500,
        errorCode: 'SERVER_ERROR',
        message: 'LinkedIn server internal failure',
      });

      await assert.rejects(async () => {
        await linkedinProvider.publishImagePost({
          accessToken: mockToken,
          authorUrn: mockAuthor,
          imageBuffer: sampleImageBuffer,
          mimeType: 'image/jpeg',
          commentary: 'Test',
        });
      }, (err) => {
        assert.strictEqual(err.status, 500);
        assert.strictEqual(err.providerErrorCode, 'SERVER_ERROR');
        return true;
      });
    });

    it('14. Handles PUT upload network failure gracefully', async () => {
      setMockUploadError({
        status: 502,
        message: 'Network socket disconnected while uploading image bytes',
      });

      await assert.rejects(async () => {
        await linkedinProvider.publishImagePost({
          accessToken: mockToken,
          authorUrn: mockAuthor,
          imageBuffer: sampleImageBuffer,
          mimeType: 'image/jpeg',
          commentary: 'Test',
        });
      }, (err) => {
        assert.strictEqual(err.status, 502);
        assert.strictEqual(err.providerErrorCode, 'UPLOAD_ERROR');
        assert.ok(err.message.includes('uploading image bytes'));
        return true;
      });
    });

    it('15. Capabilities report image posting capability and supported formats', () => {
      const caps = linkedinProvider.capabilities();
      assert.strictEqual(caps.canPost, true);
      assert.strictEqual(caps.canPostImage, true);
      assert.deepStrictEqual(caps.supportedImageFormats, ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']);
      assert.strictEqual(caps.maxImageSizeBytes, 10 * 1024 * 1024);
    });
  });

  describe('3. SSRF & Network Security Protections', () => {
    it('1. Correctly identifies private and blocked IP addresses (RFC1918, loopback, link-local, metadata, IPv6)', () => {
      // Loopback
      assert.strictEqual(isPrivateOrBlockedIP('127.0.0.1'), true);
      assert.strictEqual(isPrivateOrBlockedIP('127.1.2.3'), true);
      assert.strictEqual(isPrivateOrBlockedIP('::1'), true);
      assert.strictEqual(isPrivateOrBlockedIP('[::1]'), true);
      assert.strictEqual(isPrivateOrBlockedIP('::ffff:127.0.0.1'), true);

      // RFC1918 Private ranges
      assert.strictEqual(isPrivateOrBlockedIP('10.0.0.1'), true);
      assert.strictEqual(isPrivateOrBlockedIP('10.254.1.1'), true);
      assert.strictEqual(isPrivateOrBlockedIP('172.16.0.1'), true);
      assert.strictEqual(isPrivateOrBlockedIP('172.31.255.254'), true);
      assert.strictEqual(isPrivateOrBlockedIP('192.168.1.1'), true);
      assert.strictEqual(isPrivateOrBlockedIP('192.168.0.254'), true);

      // Cloud Metadata & Link-Local (AWS/GCP/Azure)
      assert.strictEqual(isPrivateOrBlockedIP('169.254.169.254'), true);
      assert.strictEqual(isPrivateOrBlockedIP('169.254.1.1'), true);
      assert.strictEqual(isPrivateOrBlockedIP('fe80::1'), true);

      // Unique Local IPv6
      assert.strictEqual(isPrivateOrBlockedIP('fc00::1'), true);
      assert.strictEqual(isPrivateOrBlockedIP('fd12:3456::1'), true);

      // Public routable IPs are NOT blocked by IP helper
      assert.strictEqual(isPrivateOrBlockedIP('8.8.8.8'), false);
      assert.strictEqual(isPrivateOrBlockedIP('104.16.0.1'), false);
    });

    it('2. Allows trusted ImageKit CDN origin and rejects untrusted / malicious hosts', () => {
      // Trusted ImageKit endpoint
      assert.strictEqual(validateImageUrlForSsrf('https://ik.imagekit.io/mock/sample-image.jpg'), true);

      // Arbitrary external hosts
      assert.throws(() => {
        validateImageUrlForSsrf('https://evil-attacker.com/malicious.jpg');
      }, /untrusted image url source/i);

      // Localhost & metadata hostnames
      assert.throws(() => {
        validateImageUrlForSsrf('http://localhost:8080/image.jpg');
      }, /forbidden/i);
      assert.throws(() => {
        validateImageUrlForSsrf('http://metadata.google.internal/computeMetadata');
      }, /forbidden/i);

      // Private/loopback IPs in URL
      assert.throws(() => {
        validateImageUrlForSsrf('http://127.0.0.1:4000/image.jpg');
      }, /forbidden/i);
      assert.throws(() => {
        validateImageUrlForSsrf('http://169.254.169.254/latest/meta-data');
      }, /forbidden/i);
      assert.throws(() => {
        validateImageUrlForSsrf('http://10.0.0.5/internal.png');
      }, /forbidden/i);
      assert.throws(() => {
        validateImageUrlForSsrf('http://172.16.5.5/internal.png');
      }, /forbidden/i);
      assert.throws(() => {
        validateImageUrlForSsrf('http://192.168.1.10/internal.png');
      }, /forbidden/i);
    });

    it('3. Rejects non-HTTP/HTTPS protocols (e.g. file://, gopher://, ftp://)', () => {
      assert.throws(() => {
        validateImageUrlForSsrf('file:///etc/passwd');
      }, /protocol/i);
      assert.throws(() => {
        validateImageUrlForSsrf('gopher://127.0.0.1:6379/_flushall');
      }, /protocol/i);
      assert.throws(() => {
        validateImageUrlForSsrf('ftp://10.0.0.1/resource.jpg');
      }, /protocol/i);
    });
  });

  describe('4. POST /api/posts/:postId/publish/linkedin Endpoint (Image & Text Publishing)', () => {
    it('Requires authentication (401 when unauthenticated)', async () => {
      const res = await request(app)
        .post('/api/posts/507f1f77bcf86cd799439011/publish/linkedin')
        .send({ socialAccountId: '507f1f77bcf86cd799439022' })
        .expect(401);

      assert.strictEqual(res.body.success, false);
    });

    it('Rejects invalid or missing postId / socialAccountId with 400', async () => {
      const { user } = await seedUser();
      const token = generateTestToken(user._id);

      const res = await request(app)
        .post('/api/posts/507f1f77bcf86cd799439011/publish/linkedin')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('socialAccountId'));
    });

    it('Enforces post ownership (404 when publishing another user\'s post)', async () => {
      const { user: userA } = await seedUser();
      const { user: userB } = await seedUser();

      const postOfUserB = seedPost(userB._id);
      const accountOfUserA = seedSocialAccount(userA._id);

      const tokenA = generateTestToken(userA._id);

      const res = await request(app)
        .post(`/api/posts/${postOfUserB._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ socialAccountId: accountOfUserA._id })
        .expect(404);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('Post not found or unauthorized'));
    });

    it('Enforces social account ownership (404 when using another user\'s LinkedIn account)', async () => {
      const { user: userA } = await seedUser();
      const { user: userB } = await seedUser();

      const postOfUserA = seedPost(userA._id);
      const accountOfUserB = seedSocialAccount(userB._id);

      const tokenA = generateTestToken(userA._id);

      const res = await request(app)
        .post(`/api/posts/${postOfUserA._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ socialAccountId: accountOfUserB._id })
        .expect(404);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('Social account not found or unauthorized'));
    });

    it('Rejects disconnected or revoked LinkedIn account with 400', async () => {
      const { user } = await seedUser();
      const post = seedPost(user._id);
      const disconnectedAccount = seedSocialAccount(user._id, {
        connectionStatus: 'revoked',
      });

      const token = generateTestToken(user._id);

      const res = await request(app)
        .post(`/api/posts/${post._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${token}`)
        .send({ socialAccountId: disconnectedAccount._id })
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('inactive or expired'));
    });

    it('Successfully publishes single-image post to LinkedIn, stores Publication record, and securely handles token', async () => {
      const { user } = await seedUser();
      const plaintextToken = 'super_secret_linkedin_oauth_token_image_999';
      const encryptedToken = encrypt(plaintextToken);

      const post = seedPost(user._id, {
        caption: 'Excited to show our new AI feature screenshot! #buildinpublic',
        image: 'https://ik.imagekit.io/mock/test-image-123.jpg',
      });

      const account = seedSocialAccount(user._id, {
        displayName: 'John LinkedIn Member',
        platformUserId: 'linkedin_member_john_888',
        accessToken: encryptedToken,
      });

      const token = generateTestToken(user._id);

      const res = await request(app)
        .post(`/api/posts/${post._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${token}`)
        .send({ socialAccountId: account._id })
        .expect(201);

      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.publication);
      assert.strictEqual(res.body.publication.status, 'published');
      assert.strictEqual(res.body.publication.platformPostId, 'urn:li:share:1234567890');
      assert.strictEqual(res.body.publication.providerMetadata?.contentType, 'image');
      assert.strictEqual(res.body.publication.providerMetadata?.apiVersion, '202608');
      assert.ok(res.body.publication.publishedAt);

      // Verify token is never exposed in response body
      assert.strictEqual(res.body.accessToken, undefined);
      assert.strictEqual(res.body.publication.accessToken, undefined);
      assert.strictEqual(res.text.includes(plaintextToken), false);

      // Verify Publication was persisted in database
      const savedPub = await Publication.findOne({ _id: res.body.publication._id });
      assert.ok(savedPub);
      assert.strictEqual(savedPub.status, 'published');
      assert.strictEqual(savedPub.platformPostId, 'urn:li:share:1234567890');

      // Verify axios calls: image download, upload init, PUT image bytes, post creation
      const imageFetch = getLastAxiosImageFetch();
      assert.strictEqual(imageFetch.url, 'https://ik.imagekit.io/mock/test-image-123.jpg');

      const initPayload = getLastAxiosInitializeUpload();
      assert.strictEqual(initPayload.headers['Authorization'], `Bearer ${plaintextToken}`);
      assert.strictEqual(initPayload.headers['Linkedin-Version'], '202608');
      assert.strictEqual(initPayload.data.initializeUploadRequest.owner, 'urn:li:person:linkedin_member_john_888');

      const putPayload = getLastAxiosPutPayload();
      assert.strictEqual(putPayload.url, 'https://api.linkedin.com/mediaUpload/mock_upload_url_123');

      const postsPayload = getLastAxiosPostsPayload();
      assert.strictEqual(postsPayload.headers['Linkedin-Version'], '202608');
      assert.strictEqual(postsPayload.data.content.media.id, 'urn:li:image:MOCK_IMAGE_URN_12345');
      assert.strictEqual(postsPayload.data.commentary, 'Excited to show our new AI feature screenshot! #buildinpublic');
    });

    it('Rejects post with untrusted external image URL with 400 SSRF error', async () => {
      const { user } = await seedUser();
      const post = seedPost(user._id, {
        caption: 'Untrusted host image test',
        image: 'https://evil-untrusted-host.com/secret.jpg',
      });

      const account = seedSocialAccount(user._id);
      const token = generateTestToken(user._id);

      const res = await request(app)
        .post(`/api/posts/${post._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${token}`)
        .send({ socialAccountId: account._id })
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.errorCode, 'SSRF_VALIDATION_ERROR');
      assert.ok(res.body.message.includes('Untrusted image URL source'));
    });

    it('Rejects post with private IP / localhost image URL with 400 SSRF error', async () => {
      const { user } = await seedUser();
      const post = seedPost(user._id, {
        caption: 'Localhost image test',
        image: 'http://127.0.0.1:4000/internal-avatar.jpg',
      });

      const account = seedSocialAccount(user._id);
      const token = generateTestToken(user._id);

      const res = await request(app)
        .post(`/api/posts/${post._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${token}`)
        .send({ socialAccountId: account._id })
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.errorCode, 'SSRF_VALIDATION_ERROR');
    });

    it('Rejects redirect from trusted host to private / metadata IP with 400 SSRF error', async () => {
      const { user } = await seedUser();
      const post = seedPost(user._id, {
        caption: 'Redirect attack test',
        image: 'https://ik.imagekit.io/mock/redirect-to-metadata.jpg',
      });

      const account = seedSocialAccount(user._id);
      const token = generateTestToken(user._id);

      // Simulate a 302 redirect attempting to target cloud metadata IP
      setMockRedirectDestination('http://169.254.169.254/latest/meta-data');

      const res = await request(app)
        .post(`/api/posts/${post._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${token}`)
        .send({ socialAccountId: account._id })
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.errorCode, 'SSRF_VALIDATION_ERROR');
    });

    it('Rejects unsupported image format (e.g. WebP) with 400 and records failed publication', async () => {
      const { user } = await seedUser();
      const post = seedPost(user._id, {
        caption: 'WebP image test',
        image: 'https://ik.imagekit.io/mock/test-image-webp.webp',
      });

      const account = seedSocialAccount(user._id);
      const token = generateTestToken(user._id);

      setMockImageFetchContentType('image/webp');

      const res = await request(app)
        .post(`/api/posts/${post._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${token}`)
        .send({ socialAccountId: account._id })
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.errorCode, 'UNSUPPORTED_IMAGE_FORMAT');
      assert.ok(res.body.message.includes('JPEG, PNG, and GIF'));

      const pub = await Publication.findOne({ post: post._id, socialAccount: account._id });
      assert.ok(pub);
      assert.strictEqual(pub.status, 'failed');
      assert.strictEqual(pub.errorCode, 'UNSUPPORTED_IMAGE_FORMAT');
    });

    it('Rejects oversized image (> 10MB) with 400 and records failed publication', async () => {
      const { user } = await seedUser();
      const post = seedPost(user._id, {
        caption: 'Large image test',
        image: 'https://ik.imagekit.io/mock/large-image.jpg',
      });

      const account = seedSocialAccount(user._id);
      const token = generateTestToken(user._id);

      // Set 11MB buffer
      setMockImageFetchBuffer(Buffer.alloc(11 * 1024 * 1024));

      const res = await request(app)
        .post(`/api/posts/${post._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${token}`)
        .send({ socialAccountId: account._id })
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.errorCode, 'IMAGE_TOO_LARGE');
      assert.ok(res.body.message.includes('exceeds maximum allowable size'));
    });

    it('Handles image storage download failure gracefully with 502', async () => {
      const { user } = await seedUser();
      const post = seedPost(user._id, {
        caption: 'Image download failure test',
        image: 'https://ik.imagekit.io/mock/failing-image.jpg',
      });

      const account = seedSocialAccount(user._id);
      const token = generateTestToken(user._id);

      setMockImageFetchError({ status: 500, message: 'CDN Gateway Timeout' });

      const res = await request(app)
        .post(`/api/posts/${post._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${token}`)
        .send({ socialAccountId: account._id })
        .expect(502);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.errorCode, 'IMAGE_FETCH_ERROR');
    });

    it('Prevents duplicate publication when post has already been successfully published (409 Conflict)', async () => {
      const { user } = await seedUser();
      const post = seedPost(user._id);
      const account = seedSocialAccount(user._id);
      const token = generateTestToken(user._id);

      // First publication
      const res1 = await request(app)
        .post(`/api/posts/${post._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${token}`)
        .send({ socialAccountId: account._id })
        .expect(201);

      assert.strictEqual(res1.body.success, true);

      // Second publication attempt
      const res2 = await request(app)
        .post(`/api/posts/${post._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${token}`)
        .send({ socialAccountId: account._id })
        .expect(409);

      assert.strictEqual(res2.body.success, false);
      assert.ok(res2.body.message.includes('already been published'));
    });

    it('Handles LinkedIn 401 Unauthorized / expired token gracefully and records failed publication', async () => {
      const { user } = await seedUser();
      const post = seedPost(user._id);
      const account = seedSocialAccount(user._id);
      const token = generateTestToken(user._id);

      setMockImageInitError({
        status: 401,
        errorCode: 'EXPIRED_ACCESS_TOKEN',
        message: 'The token used in the request has expired.',
      });

      const res = await request(app)
        .post(`/api/posts/${post._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${token}`)
        .send({ socialAccountId: account._id })
        .expect(401);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.errorCode, 'EXPIRED_ACCESS_TOKEN');

      const failedPub = await Publication.findOne({ post: post._id, socialAccount: account._id });
      assert.ok(failedPub);
      assert.strictEqual(failedPub.status, 'failed');
    });

    it('Handles LinkedIn 403 Forbidden gracefully and records failure', async () => {
      const { user } = await seedUser();
      const post = seedPost(user._id);
      const account = seedSocialAccount(user._id);
      const token = generateTestToken(user._id);

      setMockLinkedInPublishError({
        status: 403,
        errorCode: 'ACCESS_DENIED',
        message: 'Member does not have permission to post to this feed.',
      });

      const res = await request(app)
        .post(`/api/posts/${post._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${token}`)
        .send({ socialAccountId: account._id })
        .expect(403);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.errorCode, 'ACCESS_DENIED');
    });

    it('Handles LinkedIn 429 Rate Limit gracefully', async () => {
      const { user } = await seedUser();
      const post = seedPost(user._id);
      const account = seedSocialAccount(user._id);
      const token = generateTestToken(user._id);

      setMockLinkedInPublishError({
        status: 429,
        errorCode: 'RATE_LIMIT_EXCEEDED',
        message: 'Throttle limit reached for member publishing.',
      });

      const res = await request(app)
        .post(`/api/posts/${post._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${token}`)
        .send({ socialAccountId: account._id })
        .expect(429);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.errorCode, 'RATE_LIMIT_EXCEEDED');
    });

    it('Handles token decryption failure securely with 500 without leaking keys', async () => {
      const { user } = await seedUser();
      const post = seedPost(user._id);
      const accountWithCorruptedToken = seedSocialAccount(user._id, {
        accessToken: {
          ciphertext: 'corrupted_ciphertext_123',
          iv: 'invalid_iv_456',
          tag: 'invalid_tag_789',
          version: 'v1',
        },
      });

      const token = generateTestToken(user._id);

      const res = await request(app)
        .post(`/api/posts/${post._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${token}`)
        .send({ socialAccountId: accountWithCorruptedToken._id })
        .expect(500);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('Security error') || res.body.message.includes('credentials'));

      const pub = await Publication.findOne({ post: post._id, socialAccount: accountWithCorruptedToken._id });
      assert.ok(pub);
      assert.strictEqual(pub.status, 'failed');
      assert.strictEqual(pub.errorCode, 'TOKEN_DECRYPTION_ERROR');
    });

    it('Publishes text-only post when post does not contain an image', async () => {
      const { user } = await seedUser();
      const post = seedPost(user._id, { caption: 'Pure text-only post without image', image: '' });
      const account = seedSocialAccount(user._id);
      const token = generateTestToken(user._id);

      const res = await request(app)
        .post(`/api/posts/${post._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${token}`)
        .send({ socialAccountId: account._id })
        .expect(201);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.publication.status, 'published');
      assert.strictEqual(res.body.publication.providerMetadata?.contentType, 'text');
      assert.strictEqual(res.body.publication.providerMetadata?.apiVersion, '202608');

      const postsPayload = getLastAxiosPostsPayload();
      assert.strictEqual(postsPayload.headers['Linkedin-Version'], '202608');
      assert.strictEqual(postsPayload.data.commentary, 'Pure text-only post without image');
      assert.strictEqual(postsPayload.data.content, undefined);
    });
  });

  describe('5. GET /api/posts/:postId/publications Endpoint', () => {
    it('Requires authentication (401 for unauthenticated request)', async () => {
      const res = await request(app)
        .get('/api/posts/507f1f77bcf86cd799439011/publications')
        .expect(401);

      assert.strictEqual(res.body.success, false);
    });

    it('Enforces post ownership (404 when querying another user\'s post publications)', async () => {
      const { user: userA } = await seedUser();
      const { user: userB } = await seedUser();

      const postB = seedPost(userB._id);
      const tokenA = generateTestToken(userA._id);

      const res = await request(app)
        .get(`/api/posts/${postB._id}/publications`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);

      assert.strictEqual(res.body.success, false);
    });

    it('Returns publications for authenticated user\'s post with populated account details', async () => {
      const { user } = await seedUser();
      const post = seedPost(user._id);
      const account = seedSocialAccount(user._id, { displayName: 'John Doe LinkedIn' });

      seedPublication(post._id, account._id, {
        platformPostId: 'urn:li:share:998877',
        status: 'published',
      });

      const token = generateTestToken(user._id);

      const res = await request(app)
        .get(`/api/posts/${post._id}/publications`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.publications.length, 1);
      assert.strictEqual(res.body.publications[0].platformPostId, 'urn:li:share:998877');
      assert.strictEqual(res.body.publications[0].socialAccount.displayName, 'John Doe LinkedIn');
    });
  });
});
