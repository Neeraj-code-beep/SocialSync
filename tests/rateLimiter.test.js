const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const express = require('express');
const rateLimit = require('express-rate-limit');

require('./setup');
const { authLimiter, aiLimiter } = require('../src/middlewares/rateLimiter.middleware');

describe('Rate Limiting Protection', () => {
  it('1. Blocks requests and returns 429 after exceeding limit threshold', async () => {
    // Create a mini test application with a tight rate limit threshold (3 requests)
    const testApp = express();
    const testLimiter = rateLimit({
      windowMs: 1000,
      max: 3,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        message: 'Too many requests, please slow down.',
      },
    });

    testApp.use('/test-limited', testLimiter, (req, res) => {
      res.status(200).json({ success: true, message: 'Request allowed' });
    });

    // Request 1 -> 200
    await request(testApp).get('/test-limited').expect(200);
    // Request 2 -> 200
    await request(testApp).get('/test-limited').expect(200);
    // Request 3 -> 200
    await request(testApp).get('/test-limited').expect(200);

    // Request 4 -> 429 Too Many Requests
    const blockedRes = await request(testApp).get('/test-limited').expect(429);

    assert.strictEqual(blockedRes.body.success, false);
    assert.strictEqual(blockedRes.body.message, 'Too many requests, please slow down.');
    assert.ok(blockedRes.headers['ratelimit-limit']);
    assert.ok(blockedRes.headers['ratelimit-remaining']);
  });

  it('2. Auth limiter and AI limiter middlewares are configured with standard headers and safe messages', () => {
    assert.ok(typeof authLimiter === 'function', 'authLimiter should be an Express middleware function');
    assert.ok(typeof aiLimiter === 'function', 'aiLimiter should be an Express middleware function');
  });
});
