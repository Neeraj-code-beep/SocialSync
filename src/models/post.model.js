const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
  {
    image: {
      type: String,
      required: true,
    },
    caption: {
      type: String,
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient user post history retrieval ordered by date
postSchema.index({ user: 1, createdAt: -1 });

const postModel = mongoose.model('post', postSchema);

module.exports = postModel;
