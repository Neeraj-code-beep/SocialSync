const { describe, it, before, beforeEach } = require('node:test');
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
  setMockLinkedInPublishError,
  setMockAnalyticsError,
  getLastAxiosPostsPayload,
  getLastAxiosAnalytics,
} = require('./helpers/mockServices');

// Setup in-memory DB and mock external dependencies
setupInMemoryDb();
setupServiceMocks();

const app = require('../src/app');
const request = supertest(app);
const linkedinProvider = require('../src/services/providers/linkedin.provider');
const OAuthState = require('../src/models/oauthState.model');
const SocialAccount = require('../src/models/socialAccount.model');
const postModel = require('../src/models/post.model');
const Publication = require('../src/models/publication.model');
const AnalyticsSnapshot = require('../src/models/analyticsSnapshot.model');
const { encrypt, decrypt } = require('../src/lib/encryption');

describe('PHASE 1.3D: LinkedIn Account Lifecycle & Management', () => {
  let userA;
  let tokenA;
  let userB;
  let tokenB;

  beforeEach(async () => {
    clearDb();
    resetServiceMocks();

    const seededA = await seedUser({ username: 'lifecycle_user_a', email: 'usera@example.com' });
    userA = seededA.user;
    tokenA = generateTestToken(userA._id);

    const seededB = await seedUser({ username: 'lifecycle_user_b', email: 'userb@example.com' });
    userB = seededB.user;
    tokenB = generateTestToken(userB._id);
  });

  // =========================================================================
  // 1. REAUTHORIZATION / ADDITIONAL SCOPES
  // =========================================================================
  describe('1. Reauthorization & Scopes', () => {
    it('1. Authenticated reauthorization request creates fresh state and returns authorization URL', async () => {
      const res = await request
        .post('/api/social/linkedin/reauthorize')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.authorizationUrl);
      assert.ok(res.body.state);
      assert.strictEqual(res.body.reauthorization, true);

      // Verify OAuthState was persisted in database bound to userA
      const savedState = await OAuthState.findOne({ state: res.body.state });
      assert.ok(savedState, 'OAuthState must be persisted');
      assert.strictEqual(savedState.user.toString(), userA._id.toString());
      assert.strictEqual(savedState.platform, 'linkedin');
    });

    it('2. Unauthenticated reauthorization request is rejected with 401', async () => {
      const res = await request
        .post('/api/social/linkedin/reauthorize')
        .expect(401);

      assert.strictEqual(res.body.success, false);
    });

    it('3. Fresh OAuth state is generated per reauthorization request (unique & non-reusable)', async () => {
      const res1 = await request
        .post('/api/social/linkedin/reauthorize')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const res2 = await request
        .post('/api/social/linkedin/reauthorize')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      assert.notStrictEqual(res1.body.state, res2.body.state, 'Each reauthorization must generate a distinct state');
    });

    it('4. State is bound to correct authenticated user and verified on callback', async () => {
      const res = await request
        .post('/api/social/linkedin/reauthorize')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const stateToken = res.body.state;
      const stateDoc = await OAuthState.findOne({ state: stateToken });
      assert.strictEqual(stateDoc.user.toString(), userA._id.toString());
      assert.notStrictEqual(stateDoc.user.toString(), userB._id.toString());
    });

    it('5. Reauthorization requests all required scopes including r_member_postAnalytics', async () => {
      const res = await request
        .post('/api/social/linkedin/reauthorize')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const authUrl = res.body.authorizationUrl;
      assert.ok(authUrl.includes('openid'));
      assert.ok(authUrl.includes('profile'));
      assert.ok(authUrl.includes('email'));
      assert.ok(authUrl.includes('w_member_social'));
      assert.ok(authUrl.includes('r_member_postAnalytics'));
    });

    it('6. Rejects or ignores arbitrary client-supplied scopes from frontend', async () => {
      const res = await request
        .post('/api/social/linkedin/reauthorize')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ scopes: ['arbitrary_admin_scope', 'r_full_network'] })
        .expect(200);

      const authUrl = res.body.authorizationUrl;
      assert.ok(!authUrl.includes('arbitrary_admin_scope'));
      assert.ok(!authUrl.includes('r_full_network'));
      assert.ok(authUrl.includes('r_member_postAnalytics'));
    });

    it('7. Callback updates existing SocialAccount on reauthorization and persists granted scopes', async () => {
      // Pre-seed an older connection without r_member_postAnalytics
      const existingAccount = seedSocialAccount(userA._id, {
        platform: 'linkedin',
        platformUserId: 'linkedin_member_sub_98765',
        displayName: 'Old Member Profile',
        scopes: ['openid', 'profile', 'email', 'w_member_social'],
        connectionStatus: 'connected',
      });

      const stateToken = 'reauth_state_test_token_123';
      await OAuthState.create({ state: stateToken, user: userA._id, platform: 'linkedin' });

      // Run callback with updated mock scopes
      await request
        .get(`/api/social/linkedin/callback?code=reauth_code_xyz&state=${stateToken}`)
        .expect(302);

      const updatedAccount = await SocialAccount.findById(existingAccount._id);
      assert.ok(updatedAccount);
      assert.strictEqual(updatedAccount.displayName, 'Alex Morgan');
      assert.strictEqual(updatedAccount.connectionStatus, 'connected');
    });

    it('8. Callback does not create duplicate SocialAccount records for the same member identity', async () => {
      const state1 = 'state_reauth_step_1';
      await OAuthState.create({ state: state1, user: userA._id, platform: 'linkedin' });
      await request.get(`/api/social/linkedin/callback?code=code_1&state=${state1}`).expect(302);

      const state2 = 'state_reauth_step_2';
      await OAuthState.create({ state: state2, user: userA._id, platform: 'linkedin' });
      await request.get(`/api/social/linkedin/callback?code=code_2&state=${state2}`).expect(302);

      const count = await SocialAccount.countDocuments({
        user: userA._id,
        platform: 'linkedin',
        platformUserId: 'linkedin_member_sub_98765',
      });
      assert.strictEqual(count, 1, 'Duplicate records must not be created');
    });

    it('9. Missing analytics scope allows publishing to work but blocks analytics with 403', async () => {
      // Seed account with only publishing scope, missing analytics scope
      const accountWithoutAnalytics = seedSocialAccount(userA._id, {
        platform: 'linkedin',
        platformUserId: 'urn:li:person:user_without_analytics',
        displayName: 'No Analytics User',
        scopes: ['openid', 'profile', 'email', 'w_member_social'],
        connectionStatus: 'connected',
      });

      const post = seedPost(userA._id, { caption: 'Publishing without analytics permission #test' });

      // 1. Publishing works normally
      const pubRes = await request
        .post(`/api/posts/${post._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ socialAccountId: accountWithoutAnalytics._id })
        .expect(201);

      assert.strictEqual(pubRes.body.success, true);
      const publicationId = pubRes.body.publication._id;

      // 2. Analytics request is blocked with 403 ANALYTICS_FORBIDDEN
      const analyticsRes = await request
        .get(`/api/posts/${post._id}/publications/${publicationId}/analytics`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(403);

      assert.strictEqual(analyticsRes.body.success, false);
      assert.strictEqual(analyticsRes.body.errorCode, 'ANALYTICS_FORBIDDEN');
    });
  });

  // =========================================================================
  // 2. TOKEN EXPIRATION & 401 ERROR HANDLING
  // =========================================================================
  describe('2. Token Expiration & Provider 401 Handling', () => {
    it('11. Locally expired token is detected before making LinkedIn API call and marks account expired', async () => {
      const expiredAccount = seedSocialAccount(userA._id, {
        platform: 'linkedin',
        platformUserId: 'urn:li:person:expired_user_123',
        displayName: 'Expired Member',
        expiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
        connectionStatus: 'connected',
      });

      const post = seedPost(userA._id, { caption: 'Testing local expiration check #post' });

      const res = await request
        .post(`/api/posts/${post._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ socialAccountId: expiredAccount._id })
        .expect(401);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.errorCode, 'LINKEDIN_REAUTH_REQUIRED');

      // Verify SocialAccount status transitioned to expired in DB
      const updatedAccount = await SocialAccount.findById(expiredAccount._id);
      assert.strictEqual(updatedAccount.connectionStatus, 'expired');

      // Verify no publish API payload was dispatched
      assert.strictEqual(getLastAxiosPostsPayload(), null);
    });

    it('12. Expired token is not sent to LinkedIn for post analytics', async () => {
      const expiredAccount = seedSocialAccount(userA._id, {
        platform: 'linkedin',
        platformUserId: 'urn:li:person:expired_analytics_user',
        displayName: 'Expired Analytics User',
        expiresAt: new Date(Date.now() - 10000),
        connectionStatus: 'connected',
        scopes: ['openid', 'profile', 'email', 'w_member_social', 'r_member_postAnalytics'],
      });

      const post = seedPost(userA._id, { caption: 'Post for analytics expiry check' });
      const pub = seedPublication(post._id, expiredAccount._id, {
        platform: 'linkedin',
        platformPostId: 'urn:li:share:expired_test_share',
        status: 'published',
      });

      const res = await request
        .get(`/api/posts/${post._id}/publications/${pub._id}/analytics`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(401);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.errorCode, 'LINKEDIN_REAUTH_REQUIRED');

      const updatedAccount = await SocialAccount.findById(expiredAccount._id);
      assert.strictEqual(updatedAccount.connectionStatus, 'expired');
      assert.strictEqual(getLastAxiosAnalytics(), null);
    });

    it('13. Provider 401 marks connection status as expired and returns normalized response', async () => {
      const activeAccount = seedSocialAccount(userA._id, {
        platform: 'linkedin',
        platformUserId: 'urn:li:person:user_with_revoked_remote_token',
        displayName: 'Remote Revoked User',
        expiresAt: new Date(Date.now() + 86400000), // Local date looks valid
        connectionStatus: 'connected',
      });

      const post = seedPost(userA._id, { caption: 'Testing 401 provider handling' });

      // Mock LinkedIn returning 401 Unauthorized
      setMockLinkedInPublishError({
        status: 401,
        errorCode: 'UNAUTHORIZED',
        message: 'Invalid access token provided to LinkedIn API',
      });

      const res = await request
        .post(`/api/posts/${post._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ socialAccountId: activeAccount._id })
        .expect(401);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.errorCode, 'LINKEDIN_REAUTH_REQUIRED');

      // Verify SocialAccount status is transitioned to expired
      const updatedAccount = await SocialAccount.findById(activeAccount._id);
      assert.strictEqual(updatedAccount.connectionStatus, 'expired');
    });

    it('14. Raw provider 401 details are not leaked to the frontend response', async () => {
      const account = seedSocialAccount(userA._id, {
        platform: 'linkedin',
        platformUserId: 'urn:li:person:leak_test_user',
        connectionStatus: 'connected',
      });

      const post = seedPost(userA._id, { caption: 'Leak test' });

      setMockLinkedInPublishError({
        status: 401,
        errorCode: 'INTERNAL_LINKEDIN_REVOCATION_DETAIL',
        message: 'Internal token 0x99238 revoked at cluster us-east-1',
      });

      const res = await request
        .post(`/api/posts/${post._id}/publish/linkedin`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ socialAccountId: account._id })
        .expect(401);

      assert.strictEqual(res.body.errorCode, 'LINKEDIN_REAUTH_REQUIRED');
      assert.strictEqual(res.body.message, 'LinkedIn authorization expired or invalid. Please reconnect your account.');
      assert.ok(!JSON.stringify(res.body).includes('0x99238'));
    });

    it('15. Token remains encrypted at rest and is never exposed in SocialAccount queries', async () => {
      const account = seedSocialAccount(userA._id, {
        platform: 'linkedin',
        platformUserId: 'urn:li:person:crypto_test_user',
        connectionStatus: 'connected',
      });

      const loadedAccount = await SocialAccount.findById(account._id);
      assert.strictEqual(loadedAccount.accessToken, undefined);

      const loadedWithToken = await SocialAccount.findById(account._id).select('+accessToken');
      assert.ok(loadedWithToken.accessToken);
      assert.ok(loadedWithToken.accessToken.ciphertext);
      assert.ok(loadedWithToken.accessToken.iv);
      assert.ok(loadedWithToken.accessToken.tag);
    });
  });

  // =========================================================================
  // 3. DISCONNECT LINKEDIN & HISTORICAL DATA PRESERVATION
  // =========================================================================
  describe('3. Disconnect LinkedIn & Historical Data Preservation', () => {
    it('16. Unauthenticated disconnect request is rejected with 401', async () => {
      const res = await request.delete('/api/social/linkedin').expect(401);
      assert.strictEqual(res.body.success, false);
    });

    it('17. User can disconnect own LinkedIn account and credentials are securely cleared', async () => {
      const account = seedSocialAccount(userA._id, {
        platform: 'linkedin',
        platformUserId: 'urn:li:person:disconnect_user_a',
        displayName: 'User A Disconnect',
        connectionStatus: 'connected',
      });

      const res = await request
        .delete('/api/social/linkedin')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.account.connectionStatus, 'revoked');

      // Verify SocialAccount in DB has status revoked and no access credentials remaining
      const dbAccount = await SocialAccount.findById(account._id).select('+accessToken +refreshToken');
      assert.strictEqual(dbAccount.connectionStatus, 'revoked');
      assert.strictEqual(dbAccount.accessToken, undefined);
      assert.strictEqual(dbAccount.refreshToken, undefined);
      assert.strictEqual(dbAccount.expiresAt, undefined);
    });

    it('18. User cannot disconnect another user’s LinkedIn account (user isolation)', async () => {
      const accountB = seedSocialAccount(userB._id, {
        platform: 'linkedin',
        platformUserId: 'urn:li:person:user_b_account',
        displayName: 'User B Account',
        connectionStatus: 'connected',
      });

      // User A attempts to disconnect User B's account by ID
      const res = await request
        .delete(`/api/social/linkedin/${accountB._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);

      assert.strictEqual(res.body.success, false);

      // Verify User B's account is still connected
      const checkB = await SocialAccount.findById(accountB._id);
      assert.strictEqual(checkB.connectionStatus, 'connected');
    });

    it('19. Disconnecting LinkedIn preserves historical Posts, Publications, and AnalyticsSnapshots', async () => {
      // 1. Create Post
      const post = seedPost(userA._id, { caption: 'Historical post that must survive disconnect' });

      // 2. Connect account
      const account = seedSocialAccount(userA._id, {
        platform: 'linkedin',
        platformUserId: 'urn:li:person:survivor_user',
        displayName: 'Survivor User',
        connectionStatus: 'connected',
      });

      // 3. Create Publication
      const pub = seedPublication(post._id, account._id, {
        platform: 'linkedin',
        platformPostId: 'urn:li:share:historical_share_111',
        status: 'published',
        publishedAt: new Date(),
      });

      // 4. Create AnalyticsSnapshot
      const snapshot = seedAnalyticsSnapshot(post._id, pub._id, account._id, {
        metrics: { impressions: 1500, membersReached: 1200, reactions: 80, comments: 20, reshares: 10 },
      });

      // 5. Disconnect account
      await request
        .delete('/api/social/linkedin')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // 6. Verify Post remains intact
      const postAfter = await postModel.findById(post._id);
      assert.ok(postAfter, 'Post must survive social account disconnect');
      assert.strictEqual(postAfter.caption, 'Historical post that must survive disconnect');

      // 7. Verify Publication remains intact
      const pubAfter = await Publication.findById(pub._id);
      assert.ok(pubAfter, 'Publication must survive social account disconnect');
      assert.strictEqual(pubAfter.status, 'published');
      assert.strictEqual(pubAfter.platformPostId, 'urn:li:share:historical_share_111');

      // 8. Verify AnalyticsSnapshot remains intact
      const snapshotAfter = await AnalyticsSnapshot.findById(snapshot._id);
      assert.ok(snapshotAfter, 'AnalyticsSnapshot must survive social account disconnect');
      assert.strictEqual(snapshotAfter.metrics.impressions, 1500);
    });
  });

  // =========================================================================
  // 4. RECONNECT & RESTORATION FLOW
  // =========================================================================
  describe('4. Reconnect & Restoration Flow', () => {
    it('24-27. Revoked account can reconnect, restores existing SocialAccount, creates no duplicates, and preserves historical linkages', async () => {
      // 1. Initial connection & published post
      const post = seedPost(userA._id, { caption: 'Reconnection test post' });
      const originalAccount = seedSocialAccount(userA._id, {
        platform: 'linkedin',
        platformUserId: 'linkedin_member_sub_98765',
        displayName: 'Alex Morgan',
        connectionStatus: 'connected',
      });

      const pub = seedPublication(post._id, originalAccount._id, {
        platform: 'linkedin',
        platformPostId: 'urn:li:share:reconnect_share_999',
        status: 'published',
      });

      // 2. Disconnect
      await request
        .delete('/api/social/linkedin')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const revokedAccount = await SocialAccount.findById(originalAccount._id);
      assert.strictEqual(revokedAccount.connectionStatus, 'revoked');

      // 3. Reconnect via OAuth callback
      const stateToken = 'reconnect_flow_state_token_777';
      await OAuthState.create({ state: stateToken, user: userA._id, platform: 'linkedin' });

      await request
        .get(`/api/social/linkedin/callback?code=reconnect_code_123&state=${stateToken}`)
        .expect(302);

      // 4. Verify existing record was restored to connected
      const restoredAccount = await SocialAccount.findById(originalAccount._id).select('+accessToken');
      assert.ok(restoredAccount);
      assert.strictEqual(restoredAccount.connectionStatus, 'connected');
      assert.ok(restoredAccount.accessToken);

      // 5. Verify no duplicate SocialAccount was created
      const allAccounts = await SocialAccount.find({
        user: userA._id,
        platform: 'linkedin',
        platformUserId: 'linkedin_member_sub_98765',
      });
      assert.strictEqual(allAccounts.length, 1);

      // 6. Verify publication remains attached to restored account
      const pubAfter = await Publication.findById(pub._id);
      assert.strictEqual(pubAfter.socialAccount.toString(), restoredAccount._id.toString());
    });
  });

  // =========================================================================
  // 5. PROVIDER CAPABILITIES TRUTHFULNESS
  // =========================================================================
  describe('5. Truthful Capabilities Reporting', () => {
    it('28. Capabilities report hasProgrammaticRefreshToken: false, canRefresh: false, canRevoke: false', () => {
      const caps = linkedinProvider.capabilities();
      assert.strictEqual(caps.hasProgrammaticRefreshToken, false);
      assert.strictEqual(caps.canRefresh, false);
      assert.strictEqual(caps.canRevoke, false);
      assert.strictEqual(caps.canPost, true);
      assert.strictEqual(caps.canPostImage, true);
      assert.strictEqual(caps.canGetAnalytics, true);
      assert.strictEqual(caps.tokenLifespanDays, 60);
    });
  });
});
