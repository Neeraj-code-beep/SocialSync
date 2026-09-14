const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const userModel = require('../../src/models/user.models');
const postModel = require('../../src/models/post.model');
const OAuthState = require('../../src/models/oauthState.model');
const SocialAccount = require('../../src/models/socialAccount.model');
const Publication = require('../../src/models/publication.model');
const { config } = require('../../src/config/env.config');

// In-Memory Collections Store
let usersCollection = [];
let postsCollection = [];
let oauthStatesCollection = [];
let socialAccountsCollection = [];
let publicationsCollection = [];

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

  postModel.findOne = function (filter = {}) {
    const match = postsCollection.find((p) => {
      if (filter._id && p._id.toString() !== filter._id.toString()) return false;
      if (filter.user && p.user?.toString() !== filter.user.toString()) return false;
      return true;
    });
    let result = match ? clone(match) : null;

    const chain = {
      select: function () {
        return chain;
      },
      lean: function () {
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

  postModel.findById = function (id) {
    const stringId = id?.toString();
    const match = postsCollection.find((p) => p._id.toString() === stringId);
    let result = match ? clone(match) : null;

    const chain = {
      select: function () {
        return chain;
      },
      lean: function () {
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

  // --- OAUTH STATE INTERCEPTS ---
  OAuthState.create = function (doc) {
    const _id = new mongoose.Types.ObjectId();
    const now = new Date();
    const newState = {
      _id,
      ...doc,
      user: doc.user?.toString() || doc.user,
      createdAt: now,
    };
    oauthStatesCollection.push(newState);
    return Promise.resolve(newState);
  };

  OAuthState.findOne = function (filter = {}) {
    const match = oauthStatesCollection.find((s) => {
      if (filter.state && s.state !== filter.state) return false;
      if (filter.platform && s.platform !== filter.platform) return false;
      return true;
    });
    return Promise.resolve(match ? clone(match) : null);
  };

  OAuthState.findOneAndDelete = function (filter = {}) {
    const index = oauthStatesCollection.findIndex((s) => {
      if (filter.state && s.state !== filter.state) return false;
      if (filter.platform && s.platform !== filter.platform) return false;
      return true;
    });

    if (index === -1) {
      return Promise.resolve(null);
    }

    const [deleted] = oauthStatesCollection.splice(index, 1);
    return Promise.resolve(clone(deleted));
  };

  // --- SOCIAL ACCOUNT INTERCEPTS ---
  SocialAccount.create = function (doc) {
    const _id = new mongoose.Types.ObjectId();
    const now = new Date();
    const newAccount = {
      _id,
      ...doc,
      user: doc.user?.toString() || doc.user,
      createdAt: now,
      updatedAt: now,
    };
    socialAccountsCollection.push(newAccount);
    return Promise.resolve(newAccount);
  };

  SocialAccount.findOneAndUpdate = function (filter, update, options = {}) {
    const matchIndex = socialAccountsCollection.findIndex((a) => {
      if (filter.user && a.user?.toString() !== filter.user?.toString()) return false;
      if (filter.platform && a.platform !== filter.platform) return false;
      if (filter.platformUserId && a.platformUserId !== filter.platformUserId) return false;
      return true;
    });

    const now = new Date();

    if (matchIndex !== -1) {
      const existing = socialAccountsCollection[matchIndex];
      const updated = {
        ...existing,
        ...update,
        updatedAt: now,
      };
      socialAccountsCollection[matchIndex] = updated;
      return Promise.resolve(clone(updated));
    }

    if (options.upsert) {
      const _id = new mongoose.Types.ObjectId();
      const newAccount = {
        _id,
        user: filter.user?.toString() || filter.user,
        platform: filter.platform,
        platformUserId: filter.platformUserId,
        connectionStatus: 'connected',
        scopes: [],
        ...update,
        createdAt: now,
        updatedAt: now,
      };
      socialAccountsCollection.push(newAccount);
      return Promise.resolve(clone(newAccount));
    }

    return Promise.resolve(null);
  };

  SocialAccount.findOne = function (filter = {}) {
    const match = socialAccountsCollection.find((a) => {
      if (filter._id && a._id.toString() !== filter._id.toString()) return false;
      if (filter.user && a.user?.toString() !== filter.user?.toString()) return false;
      if (filter.platform && a.platform !== filter.platform) return false;
      if (filter.platformUserId && a.platformUserId !== filter.platformUserId) return false;
      return true;
    });
    let result = match ? clone(match) : null;

    const chain = {
      select: function () {
        return chain;
      },
      lean: function () {
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

  SocialAccount.find = function (filter = {}) {
    let results = [...socialAccountsCollection];
    if (filter.user) {
      const targetUser = filter.user?.toString();
      results = results.filter((a) => a.user?.toString() === targetUser);
    }
    if (filter.platform) {
      results = results.filter((a) => a.platform === filter.platform);
    }

    const queryChain = {
      sort: function () {
        return queryChain;
      },
      select: function () {
        return queryChain;
      },
      lean: function () {
        return queryChain;
      },
      then: function (resolve, reject) {
        return Promise.resolve(results.map(clone)).then(resolve, reject);
      },
      catch: function (reject) {
        return Promise.resolve([]).catch(reject);
      },
    };

    return queryChain;
  };

  // --- PUBLICATION MODEL INTERCEPTS ---
  Publication.create = function (doc) {
    const _id = new mongoose.Types.ObjectId();
    const now = new Date();

    // In-memory partial unique index check: at most one status: 'published' for (post, socialAccount)
    if (doc.status === 'published') {
      const existingPublished = publicationsCollection.find(
        (p) =>
          p.post?.toString() === doc.post?.toString() &&
          p.socialAccount?.toString() === doc.socialAccount?.toString() &&
          p.status === 'published'
      );
      if (existingPublished) {
        const err = new Error('E11000 duplicate key error: publication already exists');
        err.code = 11000;
        return Promise.reject(err);
      }
    }

    const newPublication = {
      _id,
      post: doc.post?.toString() || doc.post,
      socialAccount: doc.socialAccount?.toString() || doc.socialAccount,
      platform: doc.platform || 'linkedin',
      platformPostId: doc.platformPostId || null,
      status: doc.status || 'publishing',
      publishedAt: doc.publishedAt || null,
      errorCode: doc.errorCode || null,
      errorMessage: doc.errorMessage || null,
      providerMetadata: doc.providerMetadata || {},
      createdAt: now,
      updatedAt: now,
      save: function () {
        this.updatedAt = new Date();
        const idx = publicationsCollection.findIndex((p) => p._id.toString() === _id.toString());
        if (idx !== -1) {
          publicationsCollection[idx] = { ...this };
        }
        return Promise.resolve(this);
      },
    };
    publicationsCollection.push(newPublication);
    return Promise.resolve(newPublication);
  };

  Publication.findOne = function (filter = {}) {
    const match = publicationsCollection.find((p) => {
      if (filter._id && p._id.toString() !== filter._id.toString()) return false;
      if (filter.post && p.post?.toString() !== filter.post?.toString()) return false;
      if (filter.socialAccount && p.socialAccount?.toString() !== filter.socialAccount?.toString()) return false;
      if (filter.status && p.status !== filter.status) return false;
      if (filter.platform && p.platform !== filter.platform) return false;
      if (filter.platformPostId && p.platformPostId !== filter.platformPostId) return false;
      if (filter.createdAt && filter.createdAt.$gte) {
        if (new Date(p.createdAt) < new Date(filter.createdAt.$gte)) return false;
      }
      return true;
    });

    if (!match) return Promise.resolve(null);

    const doc = {
      ...clone(match),
      save: function () {
        this.updatedAt = new Date();
        const idx = publicationsCollection.findIndex((p) => p._id.toString() === match._id.toString());
        if (idx !== -1) {
          publicationsCollection[idx] = { ...this };
        }
        return Promise.resolve(this);
      },
    };
    return Promise.resolve(doc);
  };

  Publication.find = function (filter = {}) {
    let results = publicationsCollection.filter((p) => {
      if (filter.post && p.post?.toString() !== filter.post?.toString()) return false;
      if (filter.socialAccount && p.socialAccount?.toString() !== filter.socialAccount?.toString()) return false;
      if (filter.status && p.status !== filter.status) return false;
      if (filter.platform && p.platform !== filter.platform) return false;
      return true;
    });

    const queryChain = {
      populate: function (field) {
        if (field === 'socialAccount') {
          results = results.map((pub) => {
            const acc = socialAccountsCollection.find((a) => a._id.toString() === pub.socialAccount?.toString());
            return {
              ...pub,
              socialAccount: acc
                ? {
                    _id: acc._id,
                    displayName: acc.displayName,
                    platform: acc.platform,
                    profileImageUrl: acc.profileImageUrl,
                  }
                : pub.socialAccount,
            };
          });
        }
        return queryChain;
      },
      sort: function () {
        return queryChain;
      },
      lean: function () {
        return queryChain;
      },
      then: function (resolve, reject) {
        return Promise.resolve(results.map(clone)).then(resolve, reject);
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
  oauthStatesCollection = [];
  socialAccountsCollection = [];
  publicationsCollection = [];
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

// Helper to seed social account
function seedSocialAccount(userId, custom = {}) {
  const _id = new mongoose.Types.ObjectId();
  const account = {
    _id,
    user: userId.toString(),
    platform: custom.platform || 'linkedin',
    platformUserId: custom.platformUserId || `li_sub_${Date.now()}`,
    displayName: custom.displayName || 'LinkedIn Tester',
    email: custom.email || 'tester@linkedin.com',
    profileImageUrl: custom.profileImageUrl || 'https://media.licdn.com/mock.jpg',
    profileUrl: custom.profileUrl || null,
    accessToken: custom.accessToken || {
      ciphertext: 'deadbeef123',
      iv: 'aabbcc112233',
      tag: 'ffeedd998877',
      version: 'v1',
    },
    expiresAt: custom.expiresAt || new Date(Date.now() + 5184000 * 1000),
    scopes: custom.scopes || ['openid', 'profile', 'email', 'w_member_social'],
    connectionStatus: custom.connectionStatus || 'connected',
    createdAt: custom.createdAt || new Date(),
    updatedAt: custom.updatedAt || new Date(),
  };
  socialAccountsCollection.push(account);
  return account;
}

// Helper to seed publication
function seedPublication(postId, socialAccountId, custom = {}) {
  const _id = new mongoose.Types.ObjectId();
  const publication = {
    _id,
    post: postId.toString(),
    socialAccount: socialAccountId.toString(),
    platform: custom.platform || 'linkedin',
    platformPostId: custom.platformPostId || `urn:li:share:${Date.now()}`,
    status: custom.status || 'published',
    publishedAt: custom.publishedAt || new Date(),
    errorCode: custom.errorCode || null,
    errorMessage: custom.errorMessage || null,
    providerMetadata: custom.providerMetadata || {
      apiVersion: '202401',
      lifecycleState: 'PUBLISHED',
      visibility: 'PUBLIC',
    },
    createdAt: custom.createdAt || new Date(),
    updatedAt: custom.updatedAt || new Date(),
    save: function () {
      this.updatedAt = new Date();
      const idx = publicationsCollection.findIndex((p) => p._id.toString() === _id.toString());
      if (idx !== -1) {
        publicationsCollection[idx] = { ...this };
      }
      return Promise.resolve(this);
    },
  };
  publicationsCollection.push(publication);
  return publication;
}

module.exports = {
  setupInMemoryDb,
  clearDb,
  seedUser,
  seedPost,
  seedSocialAccount,
  seedPublication,
  generateTestToken,
};
