const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const userModel = require('../../src/models/user.models');
const postModel = require('../../src/models/post.model');
const { config } = require('../../src/config/env.config');

// In-Memory Collections Store
let usersCollection = [];
let postsCollection = [];

// Helper to deep clone objects
const clone = (obj) => JSON.parse(JSON.stringify(obj));

// Set up Mongoose model method intercepts for fast, deterministic in-memory testing
function setupInMemoryDb() {
  // --- USER MODEL INTERCEPTS ---
  userModel.findOne = function (filter) {
    let match = null;
    if (filter.$or) {
      match = usersCollection.find((u) =>
        filter.$or.some((cond) => {
          if (cond.username && u.username === cond.username) return true;
          if (cond.email && u.email === cond.email) return true;
          return false;
        })
      );
    } else if (filter._id) {
      match = usersCollection.find((u) => u._id.toString() === filter._id.toString());
    } else if (filter.username) {
      match = usersCollection.find((u) => u.username === filter.username);
    } else if (filter.email) {
      match = usersCollection.find((u) => u.email === filter.email);
    }

    const doc = match ? { ...match } : null;
    return Promise.resolve(doc);
  };

  userModel.findById = function (id) {
    const stringId = id?.toString();
    const match = usersCollection.find((u) => u._id.toString() === stringId);
    let result = match ? { ...match } : null;

    const chain = {
      select: function (projection) {
        if (result && projection === '-password') {
          const { password, ...userWithoutPassword } = result;
          result = userWithoutPassword;
        }
        return chain;
      },
      then: function (resolve, reject) {
        return Promise.resolve(result).then(resolve, reject);
      },
      catch: function (reject) {
        return Promise.resolve(result).catch(reject);
      },
    };
    return chain;
  };

  userModel.create = function (doc) {
    const _id = new mongoose.Types.ObjectId();
    const now = new Date();
    const newUser = {
      _id,
      ...doc,
      createdAt: now,
      updatedAt: now,
    };
    usersCollection.push(newUser);
    return Promise.resolve(newUser);
  };

  // --- POST MODEL INTERCEPTS ---
  postModel.create = function (doc) {
    const _id = new mongoose.Types.ObjectId();
    const now = new Date();
    const newPost = {
      _id,
      ...doc,
      user: doc.user?.toString() || doc.user,
      createdAt: now,
      updatedAt: now,
    };
    postsCollection.push(newPost);
    return Promise.resolve(newPost);
  };

  postModel.countDocuments = function (filter = {}) {
    let results = postsCollection;
    if (filter.user) {
      const targetUser = filter.user?.toString();
      results = results.filter((p) => p.user?.toString() === targetUser);
    }
    return Promise.resolve(results.length);
  };

  postModel.find = function (filter = {}) {
    let results = [...postsCollection];
    if (filter.user) {
      const targetUser = filter.user?.toString();
      results = results.filter((p) => p.user?.toString() === targetUser);
    }

    let sortOrder = -1; // Default newest first
    let skipVal = 0;
    let limitVal = 10;

    const queryChain = {
      sort: function (sortObj) {
        if (sortObj?.createdAt === 1) sortOrder = 1;
        else sortOrder = -1;
        return queryChain;
      },
      skip: function (n) {
        skipVal = Math.max(0, n);
        return queryChain;
      },
      limit: function (n) {
        limitVal = n;
        return queryChain;
      },
      lean: function () {
        return queryChain;
      },
      then: function (resolve, reject) {
        let sorted = [...results].sort((a, b) => {
          const dateA = new Date(a.createdAt).getTime();
          const dateB = new Date(b.createdAt).getTime();
          return sortOrder === -1 ? dateB - dateA : dateA - dateB;
        });

        const paginated = sorted.slice(skipVal, skipVal + limitVal).map(clone);
        return Promise.resolve(paginated).then(resolve, reject);
      },
      catch: function (reject) {
        return Promise.resolve([]).catch(reject);
      },
    };

    return queryChain;
  };
}

// Reset data store between tests
function clearDb() {
  usersCollection = [];
  postsCollection = [];
}

// Helper to seed a test user
async function seedUser(custom = {}) {
  const password = custom.password || 'password123';
  const hashedPassword = await bcrypt.hash(password, 10);
  const _id = new mongoose.Types.ObjectId();
  const user = {
    _id,
    username: custom.username || `testuser_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    email: custom.email || `test_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`,
    password: hashedPassword,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  usersCollection.push(user);
  return { user, rawPassword: password };
}

// Helper to generate a valid JWT token for a user
function generateTestToken(userId) {
  return jwt.sign(
    { user: userId.toString() },
    config.jwtSecret || 'test_jwt_secret_must_be_minimum_32_characters_long_for_security',
    { expiresIn: '1d' }
  );
}

// Helper to seed multiple posts
function seedPost(userId, custom = {}) {
  const _id = new mongoose.Types.ObjectId();
  const post = {
    _id,
    caption: custom.caption || 'Sample test caption for social media #viral',
    image: custom.image || 'https://ik.imagekit.io/mock/test.jpg',
    user: userId.toString(),
    createdAt: custom.createdAt || new Date(),
    updatedAt: custom.updatedAt || new Date(),
  };
  postsCollection.push(post);
  return post;
}

module.exports = {
  setupInMemoryDb,
  clearDb,
  seedUser,
  seedPost,
  generateTestToken,
};
