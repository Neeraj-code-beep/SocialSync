const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

require('./setup');
const app = require('../src/app');
const { clearDb, seedUser, generateTestToken } = require('./helpers/inMemoryDb');

describe('Authentication API (/api/auth)', () => {
  beforeEach(() => {
    clearDb();
  });

  describe('POST /api/auth/register', () => {
    it('1. Register succeeds with valid input', async () => {
      const payload = {
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'password123',
      };

      const res = await request(app)
        .post('/api/auth/register')
        .send(payload)
        .expect(201);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.user.username, 'newuser');
      assert.strictEqual(res.body.user.email, 'newuser@example.com');
      assert.ok(res.body.token, 'Token must be returned');
      assert.strictEqual(res.body.user.password, undefined, 'Password must not be returned');
    });

    it('2. Duplicate registration is rejected with 409', async () => {
      await seedUser({ username: 'existinguser', email: 'existing@example.com' });

      // Duplicate username
      const dupUserRes = await request(app)
        .post('/api/auth/register')
        .send({ username: 'existinguser', email: 'other@example.com', password: 'password123' })
        .expect(409);

      assert.strictEqual(dupUserRes.body.success, false);

      // Duplicate email
      const dupEmailRes = await request(app)
        .post('/api/auth/register')
        .send({ username: 'otheruser', email: 'existing@example.com', password: 'password123' })
        .expect(409);

      assert.strictEqual(dupEmailRes.body.success, false);
    });

    it('Registration rejects short password (< 6 chars)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'shortpassuser', email: 'short@example.com', password: '123' })
        .expect(400);

      assert.strictEqual(res.body.success, false);
    });
  });

  describe('POST /api/auth/login', () => {
    it('3. Login succeeds with valid credentials', async () => {
      await seedUser({ username: 'validuser', email: 'valid@example.com', password: 'secretpassword' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'validuser', password: 'secretpassword' })
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.token, 'Token should be returned');
      assert.strictEqual(res.body.user.username, 'validuser');

      // Check cookie header
      const cookies = res.headers['set-cookie'];
      assert.ok(cookies, 'set-cookie header should be present');
      assert.ok(cookies.some((c) => c.includes('token=')), 'token cookie should be set');
    });

    it('4. Login fails with invalid credentials', async () => {
      await seedUser({ username: 'validuser', email: 'valid@example.com', password: 'secretpassword' });

      // Wrong password
      const wrongPassRes = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'validuser', password: 'wrongpassword' })
        .expect(401);

      assert.strictEqual(wrongPassRes.body.success, false);

      // Non-existent user
      const nonExistentRes = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'nobody', password: 'password123' })
        .expect(401);

      assert.strictEqual(nonExistentRes.body.success, false);
    });
  });

  describe('Protected endpoint authentication & authorization', () => {
    it('5. Protected endpoint rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/posts').expect(401);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('Unauthorized') || res.body.message.includes('authentication token'));
    });

    it('6. Valid authentication allows access to protected endpoint', async () => {
      const { user } = await seedUser();
      const token = generateTestToken(user._id);

      const res = await request(app)
        .get('/api/posts')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.posts));
    });

    it('7. Invalid JWT signature is rejected with 401', async () => {
      const res = await request(app)
        .get('/api/posts')
        .set('Authorization', 'Bearer invalid.token.payload')
        .expect(401);

      assert.strictEqual(res.body.success, false);
    });

    it('8. JWT referencing nonexistent/deleted user is rejected with 401', async () => {
      const fakeUserId = '65f000000000000000000999';
      const token = generateTestToken(fakeUserId);

      const res = await request(app)
        .get('/api/posts')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      assert.strictEqual(res.body.success, false);
    });
  });

  describe('GET /api/auth/me & POST /api/auth/logout', () => {
    it("9. /api/auth/me returns the authenticated user's profile", async () => {
      const { user } = await seedUser({ username: 'meuser', email: 'me@example.com' });
      const token = generateTestToken(user._id);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.user.username, 'meuser');
      assert.strictEqual(res.body.user.email, 'me@example.com');
    });

    it('10. Logout endpoint clears cookie and returns 200', async () => {
      const res = await request(app).post('/api/auth/logout').expect(200);
      assert.strictEqual(res.body.success, true);
      const cookies = res.headers['set-cookie'];
      assert.ok(cookies, 'set-cookie header must be present');
      assert.ok(cookies.some((c) => c.includes('token=;') || c.includes('Expires=')), 'Token cookie should be cleared');
    });
  });
});
