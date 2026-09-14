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
  getLastPublishPayload,
} = require('./helpers/mockServices');

describe('Phase 1.3B-1: LinkedIn Text-Only Publishing & Publication Model', () => {
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
      pub.providerMetadata = { apiVersion: '202401', lifecycleState: 'PUBLISHED' };
      await pub.save();

      const saved = await Publication.findOne({ _id: pub._id });
      assert.strictEqual(saved.status, 'published');
      assert.strictEqual(saved.platformPostId, 'urn:li:share:1234567890');
      assert.ok(saved.publishedAt);
      assert.strictEqual(saved.providerMetadata.apiVersion, '202401');
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

  describe('2. LinkedIn Provider publishTextPost Method', () => {
    it('Requires accessToken, authorUrn, and non-empty commentary', async () => {
      await assert.rejects(async () => {
        await linkedinProvider.publishTextPost({
          accessToken: '',
          authorUrn: 'sub_123',
          commentary: 'Hello world',
        });
      }, /access token is required/i);

      await assert.rejects(async () => {
        await linkedinProvider.publishTextPost({
          accessToken: 'valid_token',
          authorUrn: '',
          commentary: 'Hello world',
        });
      }, /author urn\/id is required/i);

      await assert.rejects(async () => {
        await linkedinProvider.publishTextPost({
          accessToken: 'valid_token',
          authorUrn: 'sub_123',
          commentary: '   ',
        });
      }, /commentary text cannot be empty/i);
    });

    it('Publishes post, extracts x-restli-id identifier, and formats author URN correctly', async () => {
      const result = await linkedinProvider.publishTextPost({
        accessToken: 'mock_valid_token_123',
        authorUrn: 'linkedin_member_sub_98765',
        commentary: 'Sharing great insights from Social Sync #tech',
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, 'published');
      assert.strictEqual(result.platformPostId, 'urn:li:share:1234567890');
      assert.strictEqual(result.providerMetadata.apiVersion, '202401');

      const payload = getLastPublishPayload();
      assert.strictEqual(payload.accessToken, 'mock_valid_token_123');
      assert.strictEqual(payload.authorUrn, 'linkedin_member_sub_98765');
      assert.strictEqual(payload.commentary, 'Sharing great insights from Social Sync #tech');
    });

    it('Throws 502 error when LinkedIn response is missing x-restli-id header', async () => {
      setMockLinkedInPublishMissingPostId(true);

      await assert.rejects(async () => {
        await linkedinProvider.publishTextPost({
          accessToken: 'mock_valid_token',
          authorUrn: 'sub_123',
          commentary: 'Test post',
        });
      }, (err) => {
        assert.strictEqual(err.status, 502);
        assert.ok(err.message.includes('x-restli-id'));
        return true;
      });
    });

    it('Propagates normalized provider error with status code and safe error message', async () => {
      setMockLinkedInPublishError({
        status: 403,
        message: 'Member does not have permission w_member_social to post.',
        errorCode: 'NOT_ENOUGH_PERMISSIONS',
      });

      await assert.rejects(async () => {
        await linkedinProvider.publishTextPost({
          accessToken: 'mock_token',
          authorUrn: 'sub_123',
          commentary: 'Test post',
        });
      }, (err) => {
        assert.strictEqual(err.status, 403);
        assert.strictEqual(err.providerErrorCode, 'NOT_ENOUGH_PERMISSIONS');
        assert.ok(err.message.includes('w_member_social'));
        return true;
      });
    });
  });

  describe('3. POST /api/posts/:postId/publish/linkedin Endpoint', () => {
    it('Requires authentication (401 when no token is provided)', async () => {
      const res = await request(app)
        .post('/api/posts/507f1f77bcf86cd799439011/publish/linkedin')
        .send({ socialAccountId: '507f1f77bcf86cd799439022' })
        .expect(401);

      assert.strictEqual(res.body.success, false);
    });

    it('Rejects missing or invalid postId or socialAccountId with 400', async () => {
      const { user } = await seedUser();
      const token = generateTestToken(user._id);

      // Missing socialAccountId
      const res1 = await request(app)
        .post('/api/posts/507f1f77bcf86cd799439011/publish/linkedin')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);

      assert.strictEqual(res1.body.success, false);
      assert.ok(res1.body.message.includes('socialAccountId'));
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

    it('Rejects non-LinkedIn social account with 400', async () => {
      const { user } = await seedUser();
      const post = seedPost(user._id);
      const nonLinkedInAccount = seedSocialAccount(user._id, { platform: 'twitter' });

      const token = generateTestToken(user._id);

      const res = await request(app)
        .post(`/api/posts/${post._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${token}`)
        .send({ socialAccountId: nonLinkedInAccount._id })
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('not a LinkedIn account'));
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

    it('Rejects post with empty caption with 400', async () => {
      const { user } = await seedUser();
      const emptyPost = seedPost(user._id, { caption: '   ' });
      const account = seedSocialAccount(user._id);

      const token = generateTestToken(user._id);

      const res = await request(app)
        .post(`/api/posts/${emptyPost._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${token}`)
        .send({ socialAccountId: account._id })
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('empty text caption'));
    });

    it('Successfully publishes post, stores LinkedIn post ID, publishedAt, and never returns plaintext token', async () => {
      const { user } = await seedUser();
      const plaintextToken = 'super_secret_linkedin_oauth_token_999888';
      const encryptedToken = encrypt(plaintextToken);

      const post = seedPost(user._id, { caption: 'Excited to announce our new release! #launch' });
      const account = seedSocialAccount(user._id, {
        displayName: 'Sarah Connor',
        platformUserId: 'linkedin_member_777',
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
      assert.ok(res.body.publication.publishedAt);

      // Verify token is never exposed in response
      assert.strictEqual(res.body.accessToken, undefined);
      assert.strictEqual(res.body.publication.accessToken, undefined);
      assert.strictEqual(res.text.includes(plaintextToken), false);

      // Verify Publication was persisted in database
      const savedPub = await Publication.findOne({ _id: res.body.publication._id });
      assert.ok(savedPub);
      assert.strictEqual(savedPub.status, 'published');
      assert.strictEqual(savedPub.platformPostId, 'urn:li:share:1234567890');
      assert.strictEqual(savedPub.post.toString(), post._id.toString());
      assert.strictEqual(savedPub.socialAccount.toString(), account._id.toString());

      // Verify payload passed to provider had decrypted token and correct member identity
      const providerPayload = getLastPublishPayload();
      assert.strictEqual(providerPayload.accessToken, plaintextToken);
      assert.strictEqual(providerPayload.authorUrn, 'linkedin_member_777');
      assert.strictEqual(providerPayload.commentary, 'Excited to announce our new release! #launch');
    });

    it('Prevents duplicate publication when post has already been successfully published (409 Conflict)', async () => {
      const { user } = await seedUser();
      const post = seedPost(user._id);
      const account = seedSocialAccount(user._id, {
        accessToken: encrypt('token_for_dup_test'),
      });

      const token = generateTestToken(user._id);

      // 1. Initial publication
      const res1 = await request(app)
        .post(`/api/posts/${post._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${token}`)
        .send({ socialAccountId: account._id })
        .expect(201);

      assert.strictEqual(res1.body.success, true);

      // 2. Second publication attempt must be rejected with 409
      const res2 = await request(app)
        .post(`/api/posts/${post._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${token}`)
        .send({ socialAccountId: account._id })
        .expect(409);

      assert.strictEqual(res2.body.success, false);
      assert.ok(res2.body.message.includes('already been published'));
      assert.ok(res2.body.publication);
    });

    it('Handles LinkedIn 401 Unauthorized / expired token gracefully and records failed publication', async () => {
      const { user } = await seedUser();
      const post = seedPost(user._id);
      const account = seedSocialAccount(user._id, {
        accessToken: encrypt('expired_linkedin_token'),
      });

      const token = generateTestToken(user._id);

      setMockLinkedInPublishError({
        status: 401,
        message: 'The token used in the request has expired.',
        errorCode: 'EXPIRED_ACCESS_TOKEN',
      });

      const res = await request(app)
        .post(`/api/posts/${post._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${token}`)
        .send({ socialAccountId: account._id })
        .expect(401);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.errorCode, 'EXPIRED_ACCESS_TOKEN');
      assert.ok(res.body.message.includes('expired'));

      // Verify failed Publication record was stored
      const failedPub = await Publication.findOne({
        post: post._id,
        socialAccount: account._id,
      });
      assert.ok(failedPub);
      assert.strictEqual(failedPub.status, 'failed');
      assert.strictEqual(failedPub.errorCode, 'EXPIRED_ACCESS_TOKEN');
    });

    it('Handles LinkedIn 403 Forbidden gracefully and records failure', async () => {
      const { user } = await seedUser();
      const post = seedPost(user._id);
      const account = seedSocialAccount(user._id, {
        accessToken: encrypt('forbidden_token'),
      });

      const token = generateTestToken(user._id);

      setMockLinkedInPublishError({
        status: 403,
        message: 'Member does not have permission to post to this feed.',
        errorCode: 'ACCESS_DENIED',
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
      const account = seedSocialAccount(user._id, {
        accessToken: encrypt('ratelimited_token'),
      });

      const token = generateTestToken(user._id);

      setMockLinkedInPublishError({
        status: 429,
        message: 'Throttle limit reached for member publishing.',
        errorCode: 'RATE_LIMIT_EXCEEDED',
      });

      const res = await request(app)
        .post(`/api/posts/${post._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${token}`)
        .send({ socialAccountId: account._id })
        .expect(429);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.errorCode, 'RATE_LIMIT_EXCEEDED');
    });

    it('Handles LinkedIn 500 / 502 server errors gracefully', async () => {
      const { user } = await seedUser();
      const post = seedPost(user._id);
      const account = seedSocialAccount(user._id, {
        accessToken: encrypt('server_error_token'),
      });

      const token = generateTestToken(user._id);

      setMockLinkedInPublishError({
        status: 500,
        message: 'Internal server error from LinkedIn Posts API.',
        errorCode: 'SERVER_ERROR',
      });

      const res = await request(app)
        .post(`/api/posts/${post._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${token}`)
        .send({ socialAccountId: account._id })
        .expect(500);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.errorCode, 'SERVER_ERROR');
    });

    it('Handles missing x-restli-id response header from LinkedIn with 502', async () => {
      const { user } = await seedUser();
      const post = seedPost(user._id);
      const account = seedSocialAccount(user._id, {
        accessToken: encrypt('missing_header_token'),
      });

      const token = generateTestToken(user._id);
      setMockLinkedInPublishMissingPostId(true);

      const res = await request(app)
        .post(`/api/posts/${post._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${token}`)
        .send({ socialAccountId: account._id })
        .expect(502);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('x-restli-id'));
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

      // Check publication recorded failure
      const pub = await Publication.findOne({ post: post._id, socialAccount: accountWithCorruptedToken._id });
      assert.ok(pub);
      assert.strictEqual(pub.status, 'failed');
      assert.strictEqual(pub.errorCode, 'TOKEN_DECRYPTION_ERROR');
    });
  });

  describe('4. GET /api/posts/:postId/publications Endpoint', () => {
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
