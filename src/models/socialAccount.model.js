const mongoose = require('mongoose');

const encryptedTokenSchema = new mongoose.Schema(
  {
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    tag: { type: String, required: true },
    version: { type: String, default: 'v1' },
  },
  { _id: false }
);

const socialAccountSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      required: true,
      index: true,
    },
    platform: {
      type: String,
      enum: ['linkedin'],
      required: true,
    },
    platformUserId: {
      type: String,
      required: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    profileImageUrl: {
      type: String,
      trim: true,
    },
    profileUrl: {
      type: String,
      trim: true,
    },
    accessToken: {
      type: encryptedTokenSchema,
      required: true,
      select: false, // Never returned in normal queries
    },
    refreshToken: {
      type: encryptedTokenSchema,
      select: false, // Never returned in normal queries
    },
    expiresAt: {
      type: Date,
    },
    refreshTokenExpiresAt: {
      type: Date,
    },
    scopes: {
      type: [String],
      default: [],
    },
    connectionStatus: {
      type: String,
      enum: ['connected', 'expired', 'revoked', 'error'],
      default: 'connected',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.accessToken;
        delete ret.refreshToken;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      transform: function (doc, ret) {
        delete ret.accessToken;
        delete ret.refreshToken;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Prevent duplicate connections of the same platform account for a user
socialAccountSchema.index({ user: 1, platform: 1, platformUserId: 1 }, { unique: true });
socialAccountSchema.index({ user: 1, platform: 1 });

const SocialAccount = mongoose.model('SocialAccount', socialAccountSchema);

module.exports = SocialAccount;
