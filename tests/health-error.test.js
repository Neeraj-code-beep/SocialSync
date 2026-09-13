const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');

require('./setup');
const app = require('../src/app');

describe('Health Checks & Centralized Error Handling', () => {
  describe('GET /api/health & /health', () => {
    it('1. Health probe returns healthy (200) when database is connected', async () => {
      // Mock readyState = 1 (connected)
      const originalReadyState = mongoose.connection.readyState;
      Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

      const res = await request(app).get('/api/health').expect(200);

      assert.strictEqual(res.body.status, 'healthy');
      assert.strictEqual(res.body.services.database.status, 'connected');
      assert.ok(typeof res.body.uptime === 'number');
      assert.ok(res.body.timestamp);

      // Restore
      Object.defineProperty(mongoose.connection, 'readyState', { value: originalReadyState, configurable: true });
    });

    it('Health probe returns degraded (503) when database is disconnected', async () => {
      // Mock readyState = 0 (disconnected)
      const originalReadyState = mongoose.connection.readyState;
      Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true });

      const res = await request(app).get('/api/health').expect(503);

      assert.strictEqual(res.body.status, 'degraded');
      assert.strictEqual(res.body.services.database.status, 'disconnected');

      // Restore
      Object.defineProperty(mongoose.connection, 'readyState', { value: originalReadyState, configurable: true });
    });
  });

  describe('Centralized 404 & 500 Error Handlers', () => {
    it('2. Unknown route returns centralized 404 response', async () => {
      const res = await request(app).get('/api/non-existent-route-12345').expect(404);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('API endpoint not found'));
      assert.ok(res.body.message.includes('/api/non-existent-route-12345'));
    });

    it('3. Unexpected server errors are formatted cleanly by centralized error handler', async () => {
      // Request with invalid JSON syntax body to trigger express body-parser / centralized error handler
      const res = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json syntax}')
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message);
    });

    it('4. Production responses do not leak stack traces or internal secrets', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const res = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json syntax}')
        .expect(400);

      assert.strictEqual(res.body.stack, undefined, 'Stack trace must not be exposed');
      assert.strictEqual(res.body.geminiKey, undefined);
      assert.strictEqual(res.body.jwtSecret, undefined);

      process.env.NODE_ENV = originalNodeEnv;
    });
  });
});
