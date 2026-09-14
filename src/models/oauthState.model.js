const mongoose = require('mongoose');

const oauthStateSchema = new mongoose.Schema({
  state: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
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
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600, // 10 minutes TTL auto-cleanup
  },
});

const OAuthState = mongoose.model('OAuthState', oauthStateSchema);

module.exports = OAuthState;
