const mongoose = require('mongoose');

const analyticsSnapshotSchema = new mongoose.Schema(
  {
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'post',
      required: true,
      index: true,
    },
    publication: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Publication',
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
    aggregation: {
      type: String,
      enum: ['TOTAL', 'DAILY'],
      default: 'TOTAL',
      required: true,
    },
    metrics: {
      impressions: {
        type: Number,
        default: null,
      },
      membersReached: {
        type: Number,
        default: null,
      },
      reactions: {
        type: Number,
        default: null,
      },
      comments: {
        type: Number,
        default: null,
      },
      reshares: {
        type: Number,
        default: null,
      },
    },
    dateRange: {
      start: {
        type: Date,
        default: null,
      },
      end: {
        type: Date,
        default: null,
      },
    },
    capturedAt: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
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

// Indexes for snapshot retrieval and trend analysis
analyticsSnapshotSchema.index({ publication: 1, capturedAt: -1 });
analyticsSnapshotSchema.index({ post: 1, capturedAt: -1 });
analyticsSnapshotSchema.index({ socialAccount: 1, capturedAt: -1 });

const AnalyticsSnapshot = mongoose.model('AnalyticsSnapshot', analyticsSnapshotSchema);

module.exports = AnalyticsSnapshot;
