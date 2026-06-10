const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  image: {
    type: String,
  },
  caption: {
    type: String,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
  },
});

const postModel = mongoose.model('post', postSchema);

module.exports = postModel;
