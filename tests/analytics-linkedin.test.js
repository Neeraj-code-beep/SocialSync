const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const mongoose = require('mongoose');

require('./setup');

const {
  setupInMemoryDb,
  clearDb,
  seedUser,
  seedPost,
  seedSocialAccount,
  seedPublication,
  seedAnalyticsSnapshot,
  generateTestToken,
} = require('./helpers/inMemoryDb');

const {
  setupServiceMocks,
  resetServiceMocks,
  setMockAnalyticsResult,
  setMockAnalyticsError,
  getLastAxiosAnalytics,
} = require('./helpers/mockServices');

// Setup in-memory DB and mock external dependencies before importing app
setupInMemoryDb();
setupServiceMocks();

const app = require('../src/app');
const request = supertest(app);
const linkedinProvider = require('../src/services/providers/linkedin.provider');
const AnalyticsSnapshot = require('../src/models/analyticsSnapshot.model');

describe('PHASE 1.3C: LinkedIn Member Post Analytics', () => {
  let testUser;
  let testToken;
  let otherUser;
  let otherToken;
  let testPost;
  let testSocialAccount;
  let testPublication;

  before(async () => {
    // Initial setup
  });

  beforeEach(async () => {
    clearDb();
    resetServiceMocks();

    const seeded = await seedUser({ username: 'analyticstester', email: 'analytics@example.com' });
    testUser = seeded.user;
    testToken = generateTestToken(testUser._id);

    const otherSeeded = await seedUser({ username: 'otheranalytics', email: 'other@example.com' });
    otherUser = otherSeeded.user;
    otherToken = generateTestToken(otherUser._id);

    testPost = seedPost(testUser._id, {
      caption: 'Insights and performance post for test #analytics',
    });

    testSocialAccount = seedSocialAccount(testUser._id, {
      platform: 'linkedin',
      platformUserId: 'urn:li:person:analytics_user_123',
      displayName: 'Analytics Member',
      scopes: ['openid', 'profile', 'email', 'w_member_social', 'r_member_postAnalytics'],
      connectionStatus: 'connected',
    });

    testPublication = seedPublication(testPost._id, testSocialAccount._id, {
      platform: 'linkedin',
      platformPostId: 'urn:li:share:987654321',
      status: 'published',
    });
  });

  // =========================================================================
  // 1. PROVIDER UNIT TESTS: linkedinProvider.getPostAnalytics
  // =========================================================================
  describe('1. LinkedIn Provider Unit Tests (getPostAnalytics & Capabilities)', () => {
    it('1.1 should expose canGetAnalytics: true in capabilities', () => {
      const caps = linkedinProvider.capabilities();
      assert.strictEqual(caps.canGetAnalytics, true);
      assert.strictEqual(caps.platform, 'linkedin');
    });

    it('1.2 should reject when accessToken is missing', async () => {
      await assert.rejects(
        async () => {
          await linkedinProvider.getPostAnalytics({
            accessToken: '',
            postUrn: 'urn:li:share:123',
          });
        },
        (err) => {
          assert.strictEqual(err.status, 401);
          assert.strictEqual(err.code, 'ANALYTICS_UNAUTHORIZED');
          return true;
        }
      );
    });

    it('1.3 should reject when postUrn is missing or empty', async () => {
      await assert.rejects(
        async () => {
          await linkedinProvider.getPostAnalytics({
            accessToken: 'valid_mock_token',
            postUrn: '   ',
          });
        },
        (err) => {
          assert.strictEqual(err.status, 400);
          assert.strictEqual(err.code, 'ANALYTICS_INVALID_REQUEST');
          return true;
        }
      );
    });

    it('1.4 should reject unsupported aggregation type (e.g. HOURLY)', async () => {
      await assert.rejects(
        async () => {
          await linkedinProvider.getPostAnalytics({
            accessToken: 'valid_mock_token',
            postUrn: 'urn:li:share:123',
            aggregation: 'HOURLY',
          });
        },
        (err) => {
          assert.strictEqual(err.status, 400);
          assert.strictEqual(err.code, 'ANALYTICS_INVALID_REQUEST');
          return true;
        }
      );
    });

    it('1.5 should reject MEMBERS_REACHED combined with DAILY aggregation before making API call', async () => {
      await assert.rejects(
        async () => {
          await linkedinProvider.getPostAnalytics({
            accessToken: 'valid_mock_token',
            postUrn: 'urn:li:share:123',
            aggregation: 'DAILY',
            metrics: ['IMPRESSION', 'MEMBERS_REACHED'],
          });
        },
        (err) => {
          assert.strictEqual(err.status, 400);
          assert.strictEqual(err.code, 'ANALYTICS_INVALID_REQUEST');
          assert.match(err.message, /MEMBERS_REACHED metric is not supported for DAILY aggregation/i);
          return true;
        }
      );
    });

    it('1.6 should reject when startDate is after endDate', async () => {
      await assert.rejects(
        async () => {
          await linkedinProvider.getPostAnalytics({
            accessToken: 'valid_mock_token',
            postUrn: 'urn:li:share:123',
            dateRange: { start: '2026-09-15', end: '2026-09-01' },
          });
        },
        (err) => {
          assert.strictEqual(err.status, 400);
          assert.strictEqual(err.code, 'ANALYTICS_INVALID_REQUEST');
          assert.match(err.message, /startDate cannot be after endDate/i);
          return true;
        }
      );
    });

    it('1.7 should reject when invalid date strings are provided in dateRange', async () => {
      await assert.rejects(
        async () => {
          await linkedinProvider.getPostAnalytics({
            accessToken: 'valid_mock_token',
            postUrn: 'urn:li:share:123',
            dateRange: { start: 'invalid-date', end: '2026-09-15' },
          });
        },
        (err) => {
          assert.strictEqual(err.status, 400);
          assert.strictEqual(err.code, 'ANALYTICS_INVALID_REQUEST');
          assert.match(err.message, /invalid date format/i);
          return true;
        }
      );
    });

    it('1.8 should construct RestLi 2.0 query with TOTAL aggregation and correct headers', async () => {
      setMockAnalyticsResult({
        elements: [
          { metricType: 'IMPRESSION', value: 500 },
          { metricType: 'MEMBERS_REACHED', value: 350 },
          { metricType: 'REACTION', value: 45 },
          { metricType: 'COMMENT', value: 12 },
          { metricType: 'RESHARE', value: 7 },
        ],
      });

      const res = await linkedinProvider.getPostAnalytics({
        accessToken: 'mock_token_abc',
        postUrn: 'urn:li:share:123456',
        aggregation: 'TOTAL',
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.platformPostId, 'urn:li:share:123456');
      assert.strictEqual(res.aggregation, 'TOTAL');
      assert.strictEqual(res.metrics.impressions, 500);
      assert.strictEqual(res.metrics.membersReached, 350);
      assert.strictEqual(res.metrics.reactions, 45);
      assert.strictEqual(res.metrics.comments, 12);
      assert.strictEqual(res.metrics.reshares, 7);

      const lastCall = getLastAxiosAnalytics();
      assert.ok(lastCall);
      assert.strictEqual(lastCall.headers['Authorization'], 'Bearer mock_token_abc');
      assert.strictEqual(lastCall.headers['Linkedin-Version'], '202608');
      assert.strictEqual(lastCall.headers['X-Restli-Protocol-Version'], '2.0.0');
      assert.strictEqual(lastCall.params.q, 'entity');
      assert.ok(lastCall.params.entity.includes('urn%3Ali%3Ashare%3A123456'));
      assert.ok(lastCall.params.entity.includes('aggregation:TOTAL'));
    });

    it('1.9 should construct RestLi dateRange parameter properly', async () => {
      setMockAnalyticsResult({
        elements: [
          { metricType: 'IMPRESSION', value: 100 },
          { metricType: 'REACTION', value: 5 },
        ],
      });

      const res = await linkedinProvider.getPostAnalytics({
        accessToken: 'mock_token_abc',
        postUrn: 'urn:li:share:123456',
        aggregation: 'DAILY',
        dateRange: { start: '2026-09-01', end: '2026-09-10' },
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.aggregation, 'DAILY');
      assert.strictEqual(res.metrics.impressions, 100);
      assert.strictEqual(res.metrics.reactions, 5);
      assert.strictEqual(res.metrics.membersReached, null); // unavailable metrics are null

      const lastCall = getLastAxiosAnalytics();
      assert.ok(lastCall.params.entity.includes('dateRange:(start:(year:2026,month:9,day:1)'));
    });

    it('1.10 should map unreturned metrics to null instead of 0', async () => {
      setMockAnalyticsResult({
        elements: [
          { metricType: 'IMPRESSION', value: 200 },
          // No reactions, comments, reshares, or membersReached in LinkedIn response
        ],
      });

      const res = await linkedinProvider.getPostAnalytics({
        accessToken: 'mock_token_abc',
        postUrn: 'urn:li:share:123',
      });

      assert.strictEqual(res.metrics.impressions, 200);
      assert.strictEqual(res.metrics.membersReached, null);
      assert.strictEqual(res.metrics.reactions, null);
      assert.strictEqual(res.metrics.comments, null);
      assert.strictEqual(res.metrics.reshares, null);
    });

    it('1.11 should normalize 403 Forbidden to ANALYTICS_FORBIDDEN with reconnect guidance', async () => {
      setMockAnalyticsError({
        status: 403,
        errorCode: 'ACCESS_DENIED',
        message: 'Member post analytics permission missing',
      });

      await assert.rejects(
        async () => {
          await linkedinProvider.getPostAnalytics({
            accessToken: 'token_missing_scope',
            postUrn: 'urn:li:share:123',
          });
        },
        (err) => {
          assert.strictEqual(err.status, 403);
          assert.strictEqual(err.code, 'ANALYTICS_FORBIDDEN');
          assert.match(err.message, /r_member_postAnalytics.*reconnect/i);
          return true;
        }
      );
    });

    it('1.12 should normalize 401 Unauthorized to ANALYTICS_UNAUTHORIZED', async () => {
      setMockAnalyticsError({
        status: 401,
        message: 'Expired member access token',
      });

      await assert.rejects(
        async () => {
          await linkedinProvider.getPostAnalytics({
            accessToken: 'expired_token',
            postUrn: 'urn:li:share:123',
          });
        },
        (err) => {
          assert.strictEqual(err.status, 401);
          assert.strictEqual(err.code, 'ANALYTICS_UNAUTHORIZED');
          return true;
        }
      );
    });

    it('1.13 should normalize 404 Not Found to ANALYTICS_NOT_FOUND', async () => {
      setMockAnalyticsError({
        status: 404,
        message: 'Post not found or analytics not yet available',
      });

      await assert.rejects(
        async () => {
          await linkedinProvider.getPostAnalytics({
            accessToken: 'valid_token',
            postUrn: 'urn:li:share:nonexistent',
          });
        },
        (err) => {
          assert.strictEqual(err.status, 404);
          assert.strictEqual(err.code, 'ANALYTICS_NOT_FOUND');
          return true;
        }
      );
    });

    it('1.14 should normalize 429 Rate Limit to ANALYTICS_RATE_LIMITED', async () => {
      setMockAnalyticsError({
        status: 429,
        message: 'Throttle limit reached for creator analytics',
      });

      await assert.rejects(
        async () => {
          await linkedinProvider.getPostAnalytics({
            accessToken: 'valid_token',
            postUrn: 'urn:li:share:123',
          });
        },
        (err) => {
          assert.strictEqual(err.status, 429);
          assert.strictEqual(err.code, 'ANALYTICS_RATE_LIMITED');
          return true;
        }
      );
    });

    it('1.15 should normalize 500/502 to ANALYTICS_PROVIDER_UNAVAILABLE', async () => {
      setMockAnalyticsError({
        status: 502,
        message: 'Bad gateway from LinkedIn REST API',
      });

      await assert.rejects(
        async () => {
          await linkedinProvider.getPostAnalytics({
            accessToken: 'valid_token',
            postUrn: 'urn:li:share:123',
          });
        },
        (err) => {
          assert.strictEqual(err.status, 502);
          assert.strictEqual(err.code, 'ANALYTICS_PROVIDER_UNAVAILABLE');
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 2. CONTROLLER & API INTEGRATION TESTS: GET /api/posts/:postId/publications/:publicationId/analytics
  // =========================================================================
  describe('2. Endpoint Integration Tests (GET /api/posts/:postId/publications/:publicationId/analytics)', () => {
    it('2.1 should reject unauthenticated request with 401', async () => {
      const res = await request
        .get(`/api/posts/${testPost._id}/publications/${testPublication._id}/analytics`)
        .expect(401);

      assert.strictEqual(res.body.success, false);
    });

    it('2.2 should reject invalid postId format with 400', async () => {
      const res = await request
        .get(`/api/posts/invalid-post-id/publications/${testPublication._id}/analytics`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /invalid or missing postid/i);
    });

    it('2.3 should reject invalid publicationId format with 400', async () => {
      const res = await request
        .get(`/api/posts/${testPost._id}/publications/invalid-pub-id/analytics`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /invalid or missing publicationid/i);
    });

    it('2.4 should enforce multi-tenant ownership: 404 when accessing another user\'s post analytics', async () => {
      const res = await request
        .get(`/api/posts/${testPost._id}/publications/${testPublication._id}/analytics`)
        .set('Authorization', `Bearer ${otherToken}`) // Other user token
        .expect(404);

      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /post not found or unauthorized/i);
    });

    it('2.5 should return 404 if publication does not belong to post', async () => {
      const otherPost = seedPost(testUser._id, { caption: 'Another post' });
      const res = await request
        .get(`/api/posts/${otherPost._id}/publications/${testPublication._id}/analytics`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(404);

      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /publication not found or unauthorized/i);
    });

    it('2.6 should return 400 if publication is not published (e.g. failed status)', async () => {
      const failedPub = seedPublication(testPost._id, testSocialAccount._id, {
        status: 'failed',
        platformPostId: null,
      });

      const res = await request
        .get(`/api/posts/${testPost._id}/publications/${failedPub._id}/analytics`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /only available for published publications/i);
    });

    it('2.7 should return 400 if publication status is deleted', async () => {
      const deletedPub = seedPublication(testPost._id, testSocialAccount._id, {
        status: 'deleted',
        platformPostId: 'urn:li:share:deleted_123',
      });

      const res = await request
        .get(`/api/posts/${testPost._id}/publications/${deletedPub._id}/analytics`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /only available for published publications/i);
    });

    it('2.8 should return 400 if publication has no platformPostId', async () => {
      const noUrnPub = seedPublication(testPost._id, testSocialAccount._id, {
        status: 'published',
        platformPostId: '',
      });

      const res = await request
        .get(`/api/posts/${testPost._id}/publications/${noUrnPub._id}/analytics`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /does not have a platform post id/i);
    });

    it('2.9 should return 200, parse analytics, and persist an immutable AnalyticsSnapshot in DB', async () => {
      setMockAnalyticsResult({
        elements: [
          { metricType: 'IMPRESSION', value: 1250 },
          { metricType: 'MEMBERS_REACHED', value: 890 },
          { metricType: 'REACTION', value: 64 },
          { metricType: 'COMMENT', value: 18 },
          { metricType: 'RESHARE', value: 9 },
        ],
      });

      const res = await request
        .get(`/api/posts/${testPost._id}/publications/${testPublication._id}/analytics`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.platform, 'linkedin');
      assert.strictEqual(res.body.publicationId, testPublication._id.toString());
      assert.strictEqual(res.body.platformPostId, 'urn:li:share:987654321');
      assert.strictEqual(res.body.aggregation, 'TOTAL');
      assert.strictEqual(res.body.metrics.impressions, 1250);
      assert.strictEqual(res.body.metrics.membersReached, 890);
      assert.strictEqual(res.body.metrics.reactions, 64);
      assert.strictEqual(res.body.metrics.comments, 18);
      assert.strictEqual(res.body.metrics.reshares, 9);
      assert.ok(res.body.capturedAt);
      assert.ok(res.body.snapshotId);

      // Verify AnalyticsSnapshot was persisted in in-memory DB
      const snapshots = await AnalyticsSnapshot.find({ publication: testPublication._id });
      assert.strictEqual(snapshots.length, 1);
      assert.strictEqual(snapshots[0].metrics.impressions, 1250);
      assert.strictEqual(snapshots[0].metrics.membersReached, 890);
      assert.strictEqual(snapshots[0].metrics.reactions, 64);
      assert.strictEqual(snapshots[0].aggregation, 'TOTAL');
      assert.strictEqual(snapshots[0].post.toString(), testPost._id.toString());
      assert.strictEqual(snapshots[0].socialAccount.toString(), testSocialAccount._id.toString());
    });

    it('2.10 should preserve snapshot history and create a new record on subsequent refresh without overwriting', async () => {
      // First snapshot observation
      setMockAnalyticsResult({
        elements: [{ metricType: 'IMPRESSION', value: 100 }],
      });

      await request
        .get(`/api/posts/${testPost._id}/publications/${testPublication._id}/analytics`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      // Second snapshot observation (refreshed later with higher numbers)
      setMockAnalyticsResult({
        elements: [{ metricType: 'IMPRESSION', value: 250 }],
      });

      await request
        .get(`/api/posts/${testPost._id}/publications/${testPublication._id}/analytics`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      const snapshots = await AnalyticsSnapshot.find({ publication: testPublication._id });
      assert.strictEqual(snapshots.length, 2);
      assert.strictEqual(snapshots[0].metrics.impressions, 100);
      assert.strictEqual(snapshots[1].metrics.impressions, 250);
    });

    it('2.11 should return 403 with ANALYTICS_FORBIDDEN error code when permission is missing', async () => {
      setMockAnalyticsError({
        status: 403,
        errorCode: 'ACCESS_DENIED',
        message: 'r_member_postAnalytics permission not granted',
      });

      const res = await request
        .get(`/api/posts/${testPost._id}/publications/${testPublication._id}/analytics`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(403);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.errorCode, 'ANALYTICS_FORBIDDEN');
      assert.match(res.body.message, /r_member_postAnalytics.*reconnect/i);
    });

    it('2.12 should support optional query parameters: aggregation=DAILY with date range', async () => {
      setMockAnalyticsResult({
        elements: [
          { metricType: 'IMPRESSION', value: 45 },
          { metricType: 'REACTION', value: 3 },
        ],
      });

      const res = await request
        .get(
          `/api/posts/${testPost._id}/publications/${testPublication._id}/analytics?aggregation=DAILY&startDate=2026-09-01&endDate=2026-09-10`
        )
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.aggregation, 'DAILY');
      assert.strictEqual(res.body.metrics.impressions, 45);
      assert.strictEqual(res.body.metrics.reactions, 3);
      assert.strictEqual(res.body.metrics.membersReached, null);
    });

    it('2.13 should reject invalid query parameter combination: DAILY + MEMBERS_REACHED with 400', async () => {
      const res = await request
        .get(
          `/api/posts/${testPost._id}/publications/${testPublication._id}/analytics?aggregation=DAILY&metrics=IMPRESSION,MEMBERS_REACHED`
        )
        .set('Authorization', `Bearer ${testToken}`)
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.errorCode, 'ANALYTICS_INVALID_REQUEST');
      assert.match(res.body.message, /MEMBERS_REACHED metric is not supported for DAILY aggregation/i);
    });

    it('2.14 should reject invalid date order (startDate > endDate) with 400', async () => {
      const res = await request
        .get(
          `/api/posts/${testPost._id}/publications/${testPublication._id}/analytics?startDate=2026-09-20&endDate=2026-09-10`
        )
        .set('Authorization', `Bearer ${testToken}`)
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.errorCode, 'ANALYTICS_INVALID_REQUEST');
      assert.match(res.body.message, /startDate cannot be after endDate/i);
    });

    it('2.15 should return 429 with ANALYTICS_RATE_LIMITED when LinkedIn throttles request', async () => {
      setMockAnalyticsError({
        status: 429,
        message: 'Too many requests',
      });

      const res = await request
        .get(`/api/posts/${testPost._id}/publications/${testPublication._id}/analytics`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(429);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.errorCode, 'ANALYTICS_RATE_LIMITED');
    });

    it('2.16 should return 502 with ANALYTICS_PROVIDER_UNAVAILABLE on upstream LinkedIn failure', async () => {
      setMockAnalyticsError({
        status: 500,
        message: 'Internal server error on LinkedIn',
      });

      const res = await request
        .get(`/api/posts/${testPost._id}/publications/${testPublication._id}/analytics`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(502);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.errorCode, 'ANALYTICS_PROVIDER_UNAVAILABLE');
    });
  });
});
