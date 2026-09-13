const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

require('./setup');
const app = require('../src/app');
const { clearDb, seedUser, seedPost, generateTestToken } = require('./helpers/inMemoryDb');
const { resetServiceMocks, setMockAiFailure, setMockStorageFailure } = require('./helpers/mockServices');

describe('Post & Post History API (/api/posts)', () => {
  beforeEach(() => {
    clearDb();
    resetServiceMocks();
  });

  describe('POST /api/posts/post (Create Post)', () => {
    it('1. Authenticated user can create a post with valid image payload', async () => {
      const { user } = await seedUser();
      const token = generateTestToken(user._id);

      const fakeImageBuffer = Buffer.from('fake-jpeg-data');

      const res = await request(app)
        .post('/api/posts/post')
        .set('Authorization', `Bearer ${token}`)
        .attach('image', fakeImageBuffer, { filename: 'test.jpg', contentType: 'image/jpeg' })
        .expect(201);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.message, 'Post created successfully');
      assert.ok(res.body.post);
      assert.ok(res.body.post.caption);
      assert.ok(res.body.post.image.includes('ik.imagekit.io'));
      assert.strictEqual(res.body.post.user, user._id.toString());
    });

    it('2. Missing file is rejected with 400', async () => {
      const { user } = await seedUser();
      const token = generateTestToken(user._id);

      const res = await request(app)
        .post('/api/posts/post')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('image file is required'));
    });

    it('3. Created post belongs to authenticated user ID', async () => {
      const { user } = await seedUser();
      const token = generateTestToken(user._id);

      const fakeImageBuffer = Buffer.from('fake-png-data');

      const res = await request(app)
        .post('/api/posts/post')
        .set('Authorization', `Bearer ${token}`)
        .attach('image', fakeImageBuffer, { filename: 'test.png', contentType: 'image/png' })
        .expect(201);

      assert.strictEqual(res.body.post.user, user._id.toString());
    });

    it('Handles AI service failure gracefully with centralized error', async () => {
      const { user } = await seedUser();
      const token = generateTestToken(user._id);
      setMockAiFailure(true);

      const fakeImageBuffer = Buffer.from('fake-jpg-data');

      const res = await request(app)
        .post('/api/posts/post')
        .set('Authorization', `Bearer ${token}`)
        .attach('image', fakeImageBuffer, { filename: 'test.jpg', contentType: 'image/jpeg' })
        .expect(500);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message);
    });

    it('Handles storage upload failure gracefully with centralized error', async () => {
      const { user } = await seedUser();
      const token = generateTestToken(user._id);
      setMockStorageFailure(true);

      const fakeImageBuffer = Buffer.from('fake-jpg-data');

      const res = await request(app)
        .post('/api/posts/post')
        .set('Authorization', `Bearer ${token}`)
        .attach('image', fakeImageBuffer, { filename: 'test.jpg', contentType: 'image/jpeg' })
        .expect(500);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message);
    });
  });

  describe('GET /api/posts (Post History & User Isolation)', () => {
    it('4. GET /api/posts requires authentication (rejects 401 if unauthenticated)', async () => {
      const res = await request(app).get('/api/posts').expect(401);
      assert.strictEqual(res.body.success, false);
    });

    it('5. GET /api/posts returns only posts belonging to authenticated user', async () => {
      const { user: userA } = await seedUser({ username: 'user_a' });
      const { user: userB } = await seedUser({ username: 'user_b' });

      // Seed 3 posts for User A and 2 for User B
      seedPost(userA._id, { caption: 'User A - Post 1' });
      seedPost(userA._id, { caption: 'User A - Post 2' });
      seedPost(userA._id, { caption: 'User A - Post 3' });
      seedPost(userB._id, { caption: 'User B - Post 1' });
      seedPost(userB._id, { caption: 'User B - Post 2' });

      const tokenA = generateTestToken(userA._id);

      const res = await request(app)
        .get('/api/posts')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.posts.length, 3);
      assert.ok(res.body.posts.every((p) => p.user === userA._id.toString()));
    });

    it('6. User A cannot retrieve User B posts (User Isolation strictly enforced)', async () => {
      const { user: userA } = await seedUser({ username: 'isolate_a' });
      const { user: userB } = await seedUser({ username: 'isolate_b' });

      seedPost(userB._id, { caption: 'Private Post of User B' });

      const tokenA = generateTestToken(userA._id);

      const res = await request(app)
        .get('/api/posts')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.posts.length, 0, 'User A should see 0 posts');
      assert.strictEqual(res.body.pagination.totalPosts, 0);
    });

    it('7. Default pagination returns page 1 with limit 10', async () => {
      const { user } = await seedUser();
      const token = generateTestToken(user._id);

      for (let i = 1; i <= 15; i++) {
        seedPost(user._id, { caption: `Post number ${i}` });
      }

      const res = await request(app)
        .get('/api/posts')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      assert.strictEqual(res.body.pagination.currentPage, 1);
      assert.strictEqual(res.body.pagination.limit, 10);
      assert.strictEqual(res.body.pagination.totalPosts, 15);
      assert.strictEqual(res.body.pagination.totalPages, 2);
      assert.strictEqual(res.body.pagination.hasMore, true);
      assert.strictEqual(res.body.posts.length, 10);
    });

    it('8. Custom page and limit work as expected', async () => {
      const { user } = await seedUser();
      const token = generateTestToken(user._id);

      for (let i = 1; i <= 12; i++) {
        seedPost(user._id, { caption: `Post ${i}` });
      }

      const res = await request(app)
        .get('/api/posts?page=2&limit=5')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      assert.strictEqual(res.body.pagination.currentPage, 2);
      assert.strictEqual(res.body.pagination.limit, 5);
      assert.strictEqual(res.body.pagination.totalPages, 3);
      assert.strictEqual(res.body.pagination.hasMore, true);
      assert.strictEqual(res.body.posts.length, 5);
    });

    it('9. Limit cannot exceed the configured maximum (50)', async () => {
      const { user } = await seedUser();
      const token = generateTestToken(user._id);

      const res = await request(app)
        .get('/api/posts?limit=100')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      assert.strictEqual(res.body.pagination.limit, 50);
    });

    it('10. Invalid pagination input is safely normalized to defaults', async () => {
      const { user } = await seedUser();
      const token = generateTestToken(user._id);

      // Negative page and zero limit
      const res1 = await request(app)
        .get('/api/posts?page=-5&limit=0')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      assert.strictEqual(res1.body.pagination.currentPage, 1);
      assert.strictEqual(res1.body.pagination.limit, 10);

      // String / non-numeric inputs
      const res2 = await request(app)
        .get('/api/posts?page=abc&limit=xyz')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      assert.strictEqual(res2.body.pagination.currentPage, 1);
      assert.strictEqual(res2.body.pagination.limit, 10);
    });

    it('11. Results are ordered newest-first (createdAt: -1)', async () => {
      const { user } = await seedUser();
      const token = generateTestToken(user._id);

      const oldDate = new Date('2026-01-01T10:00:00Z');
      const midDate = new Date('2026-02-01T10:00:00Z');
      const newDate = new Date('2026-03-01T10:00:00Z');

      seedPost(user._id, { caption: 'Old Post', createdAt: oldDate });
      seedPost(user._id, { caption: 'Newest Post', createdAt: newDate });
      seedPost(user._id, { caption: 'Mid Post', createdAt: midDate });

      const res = await request(app)
        .get('/api/posts')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      assert.strictEqual(res.body.posts[0].caption, 'Newest Post');
      assert.strictEqual(res.body.posts[1].caption, 'Mid Post');
      assert.strictEqual(res.body.posts[2].caption, 'Old Post');
    });

    it('12. Pagination metadata is correct across boundaries', async () => {
      const { user } = await seedUser();
      const token = generateTestToken(user._id);

      for (let i = 1; i <= 6; i++) {
        seedPost(user._id, { caption: `Post ${i}` });
      }

      // Page 2 of 2 with limit 3 (hasMore = false)
      const res = await request(app)
        .get('/api/posts?page=2&limit=3')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      assert.strictEqual(res.body.pagination.currentPage, 2);
      assert.strictEqual(res.body.pagination.totalPages, 2);
      assert.strictEqual(res.body.pagination.totalPosts, 6);
      assert.strictEqual(res.body.pagination.hasMore, false);
      assert.strictEqual(res.body.posts.length, 3);
    });

    it('13. Empty result set returns a valid response shape', async () => {
      const { user } = await seedUser();
      const token = generateTestToken(user._id);

      const res = await request(app)
        .get('/api/posts')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.deepStrictEqual(res.body.posts, []);
      assert.deepStrictEqual(res.body.pagination, {
        totalPosts: 0,
        totalPages: 1,
        currentPage: 1,
        limit: 10,
        hasMore: false,
      });
    });
  });
});
