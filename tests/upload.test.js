const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

require('./setup');
const app = require('../src/app');
const { clearDb, seedUser, generateTestToken } = require('./helpers/inMemoryDb');
const { resetServiceMocks } = require('./helpers/mockServices');

describe('Upload Validation Middleware (/api/posts/post)', () => {
  let token;
  let user;

  beforeEach(async () => {
    clearDb();
    resetServiceMocks();
    const seeded = await seedUser();
    user = seeded.user;
    token = generateTestToken(user._id);
  });

  describe('Supported Image Formats', () => {
    it('1. JPEG image MIME type is accepted', async () => {
      const buffer = Buffer.from('fake-jpeg-content');
      const res = await request(app)
        .post('/api/posts/post')
        .set('Authorization', `Bearer ${token}`)
        .attach('image', buffer, { filename: 'photo.jpeg', contentType: 'image/jpeg' })
        .expect(201);

      assert.strictEqual(res.body.success, true);
    });

    it('2. JPG image MIME type is accepted', async () => {
      const buffer = Buffer.from('fake-jpg-content');
      const res = await request(app)
        .post('/api/posts/post')
        .set('Authorization', `Bearer ${token}`)
        .attach('image', buffer, { filename: 'photo.jpg', contentType: 'image/jpg' })
        .expect(201);

      assert.strictEqual(res.body.success, true);
    });

    it('3. PNG image MIME type is accepted', async () => {
      const buffer = Buffer.from('fake-png-content');
      const res = await request(app)
        .post('/api/posts/post')
        .set('Authorization', `Bearer ${token}`)
        .attach('image', buffer, { filename: 'photo.png', contentType: 'image/png' })
        .expect(201);

      assert.strictEqual(res.body.success, true);
    });

    it('4. WebP image MIME type is accepted', async () => {
      const buffer = Buffer.from('fake-webp-content');
      const res = await request(app)
        .post('/api/posts/post')
        .set('Authorization', `Bearer ${token}`)
        .attach('image', buffer, { filename: 'photo.webp', contentType: 'image/webp' })
        .expect(201);

      assert.strictEqual(res.body.success, true);
    });
  });

  describe('Unsupported Formats & Size Constraints', () => {
    it('5. Unsupported MIME type (e.g. text/plain) is rejected with 400', async () => {
      const buffer = Buffer.from('this is plain text, not an image');
      const res = await request(app)
        .post('/api/posts/post')
        .set('Authorization', `Bearer ${token}`)
        .attach('image', buffer, { filename: 'document.txt', contentType: 'text/plain' })
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('Invalid file type') || res.body.message.includes('JPEG, PNG, and WebP'));
    });

    it('Unsupported MIME type (e.g. application/pdf) is rejected with 400', async () => {
      const buffer = Buffer.from('%PDF-1.4 fake pdf file');
      const res = await request(app)
        .post('/api/posts/post')
        .set('Authorization', `Bearer ${token}`)
        .attach('image', buffer, { filename: 'doc.pdf', contentType: 'application/pdf' })
        .expect(400);

      assert.strictEqual(res.body.success, false);
    });

    it('6. Oversized file (> 10MB) is rejected by Multer error handler with 400', async () => {
      // 10MB + 1KB buffer
      const oversizedBuffer = Buffer.alloc(10 * 1024 * 1024 + 1024);
      const res = await request(app)
        .post('/api/posts/post')
        .set('Authorization', `Bearer ${token}`)
        .attach('image', oversizedBuffer, { filename: 'huge.jpg', contentType: 'image/jpeg' })
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('File size too large') || res.body.message.includes('10 MB'));
    });

    it('7. Missing file is rejected by post controller with 400', async () => {
      const res = await request(app)
        .post('/api/posts/post')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('image file is required'));
    });

    it('8. Unexpected field name is handled safely by Multer error handler with 400', async () => {
      const buffer = Buffer.from('fake-image');
      const res = await request(app)
        .post('/api/posts/post')
        .set('Authorization', `Bearer ${token}`)
        .attach('wrong_field_name', buffer, { filename: 'test.jpg', contentType: 'image/jpeg' })
        .expect(400);

      assert.strictEqual(res.body.success, false);
    });
  });
});
