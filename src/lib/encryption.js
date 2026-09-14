const crypto = require('crypto');
const { config } = require('../config/env.config');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard 96-bit IV recommended for AES-GCM
const CURRENT_VERSION = 'v1';

/**
 * Derives a 32-byte key buffer deterministically from configured encryption secret
 * @param {string} [customKey]
 * @returns {Buffer}
 */
function getEncryptionKey(customKey) {
  const secret = customKey || config.socialTokenEncryptionKey;
  if (!secret || typeof secret !== 'string' || secret.length < 32) {
    throw new Error(
      'Token encryption failed: SOCIAL_TOKEN_ENCRYPTION_KEY must be configured with at least 32 characters.'
    );
  }
  // Deterministically hash to 256-bit (32 bytes) key Buffer
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts plaintext string using AES-256-GCM authenticated encryption
 * @param {string} plaintext - Sensitive string to encrypt (e.g., OAuth access token)
 * @param {string} [customKey] - Optional custom encryption secret
 * @returns {{ ciphertext: string, iv: string, tag: string, version: string }}
 */
function encrypt(plaintext, customKey) {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Encryption error: Plaintext must be a non-empty string.');
  }

  const key = getEncryptionKey(customKey);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const tag = cipher.getAuthTag().toString('hex');

  return {
    ciphertext,
    iv: iv.toString('hex'),
    tag,
    version: CURRENT_VERSION,
  };
}

/**
 * Decrypts an AES-256-GCM encrypted payload and verifies authentication tag
 * @param {{ ciphertext: string, iv: string, tag: string, version?: string }} payload
 * @param {string} [customKey] - Optional custom encryption secret
 * @returns {string} - Decrypted plaintext
 */
function decrypt(payload, customKey) {
  if (!payload || !payload.ciphertext || !payload.iv || !payload.tag) {
    throw new Error('Decryption error: Malformed encrypted token payload.');
  }

  const key = getEncryptionKey(customKey);
  const iv = Buffer.from(payload.iv, 'hex');
  const tag = Buffer.from(payload.tag, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(payload.ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

module.exports = {
  encrypt,
  decrypt,
  CURRENT_VERSION,
};
