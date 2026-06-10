const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      unique: true,
      required: true, // this is called schema level validation...
    },
    password: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

const userModel = mongoose.model('user', userSchema);

module.exports = userModel;
