const mongoose = require('mongoose');

const publicationSchema = new mongoose.Schema(
  {
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'post',
      required: true,
      index: true,
    },
    socialAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SocialAccount',
      required: true,
      index: true,
    },
    platform: {
      type: String,
      enum: ['linkedin'],
      required: true,
      index: true,
    },
    platformPostId: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['publishing', 'published', 'failed', 'deleted'],
      default: 'publishing',
      required: true,
      index: true,
    },
    publishedAt: {
      type: Date,
    },
    deletedAt: {
      type: Date,
    },
    errorCode: {
      type: String,
      trim: true,
    },
    errorMessage: {
      type: String,
      trim: true,
    },
    providerMetadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Enforce at most ONE successful publication per post + socialAccount pair
// Using a MongoDB partial unique index allows retries on failed attempts while preventing duplicate published posts
publicationSchema.index(
  { post: 1, socialAccount: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'published' },
  }
);

// Indexes for efficient querying of publication history per post and account
publicationSchema.index({ post: 1, createdAt: -1 });
publicationSchema.index({ socialAccount: 1, status: 1 });
publicationSchema.index({ platformPostId: 1 }, { sparse: true });

const Publication = mongoose.model('Publication', publicationSchema);

module.exports = Publication;
