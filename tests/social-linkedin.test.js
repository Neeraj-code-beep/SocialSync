const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

require('./setup');
const app = require('../src/app');
const OAuthState = require('../src/models/oauthState.model');
const SocialAccount = require('../src/models/socialAccount.model');
const { encrypt, decrypt } = require('../src/lib/encryption');
const { linkedinProvider } = require('../src/services/providers');
const {
  clearDb,
  seedUser,
  seedSocialAccount,
  generateTestToken,
} = require('./helpers/inMemoryDb');
const {
  resetServiceMocks,
  setMockLinkedInTokenFailure,
  setMockLinkedInProfileFailure,
} = require('./helpers/mockServices');

describe('Phase 1.3A: LinkedIn OAuth & Social Account Connection', () => {
  beforeEach(() => {
    clearDb();
    resetServiceMocks();
  });

  describe('1. Token Encryption Utility (AES-256-GCM)', () => {
    it('Encrypts plaintext string to authenticated ciphertext structure with iv and tag', () => {
      const plaintext = 'oauth_access_token_super_secret_payload_12345';
      const result = encrypt(plaintext);

      assert.ok(result.ciphertext, 'Ciphertext must be present');
      assert.ok(result.iv, 'IV must be present');
      assert.ok(result.tag, 'Authentication tag must be present');
      assert.strictEqual(result.version, 'v1');
      assert.notStrictEqual(result.ciphertext, plaintext, 'Ciphertext must not be plaintext');
    });

    it('Decrypts valid encrypted payload back to original plaintext', () => {
      const plaintext = 'linkedin_member_token_abc_xyz_9999';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      assert.strictEqual(decrypted, plaintext);
    });

    it('Rejects tampering or corrupted ciphertext / tag with authentication failure', () => {
      const encrypted = encrypt('sensitive_token_data');
      // Corrupt the ciphertext
      const tampered = {
        ...encrypted,
        ciphertext: encrypted.ciphertext.substring(0, encrypted.ciphertext.length - 2) + '00',
      };

      assert.throws(() => {
        decrypt(tampered);
      });
    });

    it('Rejects encryption secret shorter than 32 characters', () => {
      assert.throws(() => {
        encrypt('test_token', 'too_short_key');
      }, /must be configured with at least 32 characters/);
    });
  });

  describe('2. LinkedIn Provider Abstraction & URL Generation', () => {
    it('Generates official authorization URL with correct endpoint, client_id, redirect_uri, and scopes', () => {
      const state = 'secure_random_state_1234567890';
      const url = linkedinProvider.getAuthorizationUrl({ state });

      assert.ok(url.startsWith('https://www.linkedin.com/oauth/v2/authorization'));
      assert.ok(url.includes('response_type=code'));
      assert.ok(url.includes('client_id=mock_linkedin_client_id_12345'));
      assert.ok(url.includes('state=secure_random_state_1234567890'));
      assert.ok(url.includes('openid'));
      assert.ok(url.includes('profile'));
      assert.ok(url.includes('email'));
      assert.ok(url.includes('w_member_social'));
    });

    it('Returns correct provider capabilities for Phase 1.3A', () => {
      const caps = linkedinProvider.capabilities();
      assert.strictEqual(caps.platform, 'linkedin');
      assert.strictEqual(caps.canPost, true);
      assert.strictEqual(caps.canSchedule, false);
      assert.strictEqual(caps.hasProgrammaticRefreshToken, false);
      assert.strictEqual(caps.tokenLifespanDays, 60);
    });
  });

  describe('3. GET /api/social/linkedin/connect (OAuth Initiation)', () => {
    it('Requires authentication (rejects unauthenticated request with 401)', async () => {
      const res = await request(app).get('/api/social/linkedin/connect').expect(401);
      assert.strictEqual(res.body.success, false);
    });

    it('Generates cryptographically random state and binds it to the authenticated user', async () => {
      const { user } = await seedUser();
      const token = generateTestToken(user._id);

      const res = await request(app)
        .get('/api/social/linkedin/connect')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.authorizationUrl);
      assert.ok(res.body.state);

      // Verify OAuthState was persisted in database bound to user._id
      const savedState = await OAuthState.findOne({ state: res.body.state });
      assert.ok(savedState, 'OAuthState must be persisted');
      assert.strictEqual(savedState.user.toString(), user._id.toString());
      assert.strictEqual(savedState.platform, 'linkedin');
    });

    it('Supports redirect=true query to trigger HTTP 302 redirect', async () => {
      const { user } = await seedUser();
      const token = generateTestToken(user._id);

      const res = await request(app)
        .get('/api/social/linkedin/connect?redirect=true')
        .set('Authorization', `Bearer ${token}`)
        .expect(302);

      assert.ok(res.headers.location.startsWith('https://www.linkedin.com/oauth/v2/authorization'));
    });
  });

  describe('4. GET /api/social/linkedin/callback (Authorization Code Exchange & Persistence)', () => {
    it('Redirects to error when member cancels/denies authorization', async () => {
      const res = await request(app)
        .get('/api/social/linkedin/callback?error=user_cancelled_authorize&error_description=User+denied')
        .expect(302);

      assert.ok(res.headers.location.includes('connection=linkedin_error'));
      const decodedLocation = decodeURIComponent(res.headers.location);
      assert.ok(decodedLocation.includes('User denied') || decodedLocation.includes('user_cancelled'));
    });

    it('Rejects callback with missing code or state', async () => {
      const res = await request(app).get('/api/social/linkedin/callback').expect(302);
      assert.ok(res.headers.location.includes('connection=linkedin_error'));
    });

    it('Rejects invalid, expired, or tampered state', async () => {
      const res = await request(app)
        .get('/api/social/linkedin/callback?code=mock_code&state=non_existent_fake_state')
        .expect(302);

      assert.ok(res.headers.location.includes('connection=linkedin_error'));
    });

    it('Successfully exchanges code, creates SocialAccount with encrypted tokens, and prevents replay', async () => {
      const { user } = await seedUser();
      const stateToken = 'valid_pregenerated_state_token_123';

      // Seed valid state bound to user
      await OAuthState.create({
        state: stateToken,
        user: user._id,
        platform: 'linkedin',
      });

      const res = await request(app)
        .get(`/api/social/linkedin/callback?code=valid_linkedin_auth_code&state=${stateToken}`)
        .expect(302);

      assert.ok(res.headers.location.includes('connection=linkedin_success'));
      assert.ok(res.headers.location.includes('account=Alex%20Morgan'));

      // 1. Verify state was consumed (single use / replay prevention)
      const stateAfter = await OAuthState.findOne({ state: stateToken });
      assert.strictEqual(stateAfter, null, 'OAuth state must be deleted after consumption');

      // 2. Verify replay of the same callback fails
      const replayRes = await request(app)
        .get(`/api/social/linkedin/callback?code=valid_linkedin_auth_code&state=${stateToken}`)
        .expect(302);
      assert.ok(replayRes.headers.location.includes('connection=linkedin_error'));

      // 3. Verify SocialAccount was persisted correctly in DB
      const account = await SocialAccount.findOne({
        user: user._id,
        platform: 'linkedin',
      }).select('+accessToken');

      assert.ok(account, 'SocialAccount must be created in DB');
      assert.strictEqual(account.displayName, 'Alex Morgan');
      assert.strictEqual(account.email, 'alex.morgan@example.com');
      assert.strictEqual(account.platformUserId, 'linkedin_member_sub_98765');
      assert.strictEqual(account.connectionStatus, 'connected');
      assert.deepStrictEqual(account.scopes, ['openid', 'profile', 'email', 'w_member_social']);

      // 4. Verify token was encrypted at rest (not stored as plaintext)
      assert.ok(account.accessToken, 'Encrypted access token subdocument must exist');
      assert.ok(account.accessToken.ciphertext);
      assert.ok(account.accessToken.iv);
      assert.ok(account.accessToken.tag);
      assert.notStrictEqual(account.accessToken.ciphertext, 'mock_linkedin_access_token_secret_12345');

      // 5. Verify token can be decrypted with the server key
      const decryptedToken = decrypt(account.accessToken);
      assert.strictEqual(decryptedToken, 'mock_linkedin_access_token_secret_12345');
    });

    it('Reconnecting the same LinkedIn account updates existing record instead of duplicating', async () => {
      const { user } = await seedUser();

      // First connection
      const state1 = 'state_connection_run_1';
      await OAuthState.create({ state: state1, user: user._id, platform: 'linkedin' });
      await request(app)
        .get(`/api/social/linkedin/callback?code=code_1&state=${state1}`)
        .expect(302);

      // Second connection for same LinkedIn member ID
      const state2 = 'state_connection_run_2';
      await OAuthState.create({ state: state2, user: user._id, platform: 'linkedin' });
      await request(app)
        .get(`/api/social/linkedin/callback?code=code_2&state=${state2}`)
        .expect(302);

      const accounts = await SocialAccount.find({
        user: user._id,
        platform: 'linkedin',
        platformUserId: 'linkedin_member_sub_98765',
      });

      assert.strictEqual(accounts.length, 1, 'Duplicate platform account should not create multiple records');
    });

    it('Handles LinkedIn token exchange provider failure gracefully', async () => {
      const { user } = await seedUser();
      const stateToken = 'state_for_failing_exchange';
      await OAuthState.create({ state: stateToken, user: user._id, platform: 'linkedin' });

      setMockLinkedInTokenFailure(true);

      const res = await request(app)
        .get(`/api/social/linkedin/callback?code=bad_code&state=${stateToken}`)
        .expect(302);

      assert.ok(res.headers.location.includes('connection=linkedin_error'));
    });

    it('Handles LinkedIn profile retrieval provider failure gracefully', async () => {
      const { user } = await seedUser();
      const stateToken = 'state_for_failing_profile';
      await OAuthState.create({ state: stateToken, user: user._id, platform: 'linkedin' });

      setMockLinkedInProfileFailure(true);

      const res = await request(app)
        .get(`/api/social/linkedin/callback?code=valid_code&state=${stateToken}`)
        .expect(302);

      assert.ok(res.headers.location.includes('connection=linkedin_error'));
    });
  });

  describe('5. GET /api/social/accounts (Social Accounts List & Security)', () => {
    it('Requires authentication (401 for unauthenticated request)', async () => {
      const res = await request(app).get('/api/social/accounts').expect(401);
      assert.strictEqual(res.body.success, false);
    });

    it('Returns connected accounts for authenticated user and strictly enforces user isolation', async () => {
      const { user: userA } = await seedUser({ username: 'user_a', email: 'a@example.com' });
      const { user: userB } = await seedUser({ username: 'user_b', email: 'b@example.com' });

      const tokenA = generateTestToken(userA._id);
      const tokenB = generateTestToken(userB._id);

      // Seed account for User A
      seedSocialAccount(userA._id, {
        displayName: 'User A LinkedIn',
        platformUserId: 'sub_user_a',
      });

      // Seed account for User B
      seedSocialAccount(userB._id, {
        displayName: 'User B LinkedIn',
        platformUserId: 'sub_user_b',
      });

      // User A request
      const resA = await request(app)
        .get('/api/social/accounts')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      assert.strictEqual(resA.body.success, true);
      assert.strictEqual(resA.body.count, 1);
      assert.strictEqual(resA.body.accounts[0].displayName, 'User A LinkedIn');

      // User B request
      const resB = await request(app)
        .get('/api/social/accounts')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      assert.strictEqual(resB.body.success, true);
      assert.strictEqual(resB.body.count, 1);
      assert.strictEqual(resB.body.accounts[0].displayName, 'User B LinkedIn');
    });

    it('Never exposes encrypted or plaintext access tokens in GET /api/social/accounts response', async () => {
      const { user } = await seedUser();
      const token = generateTestToken(user._id);

      seedSocialAccount(user._id, {
        displayName: 'Protected User',
        accessToken: {
          ciphertext: 'aabbcc112233',
          iv: '001122334455',
          tag: '998877665544',
          version: 'v1',
        },
      });

      const res = await request(app)
        .get('/api/social/accounts')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      const returnedAccount = res.body.accounts[0];

      assert.strictEqual(returnedAccount.accessToken, undefined, 'accessToken must never be exposed');
      assert.strictEqual(returnedAccount.refreshToken, undefined, 'refreshToken must never be exposed');
      assert.strictEqual(returnedAccount.__v, undefined);
      assert.strictEqual(returnedAccount.displayName, 'Protected User');
      assert.strictEqual(returnedAccount.platform, 'linkedin');
      assert.strictEqual(returnedAccount.connectionStatus, 'connected');
    });
  });
});
