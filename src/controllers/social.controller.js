const crypto = require('crypto');
const OAuthState = require('../models/oauthState.model');
const SocialAccount = require('../models/socialAccount.model');
const { linkedinProvider } = require('../services/providers');
const { encrypt } = require('../lib/encryption');
const { config } = require('../config/env.config');

/**
 * Initiates the LinkedIn OAuth 2.0 3-legged authorization flow
 * GET /api/social/linkedin/connect
 */
async function connectLinkedIn(req, res, next) {
  try {
    const userId = req.user._id;

    // 1. Generate cryptographically random, unpredictable 32-byte state token
    const stateToken = crypto.randomBytes(32).toString('hex');

    // 2. Persist OAuth state bound to authenticated user with TTL expiry
    await OAuthState.create({
      state: stateToken,
      user: userId,
      platform: 'linkedin',
    });

    // 3. Construct official LinkedIn OAuth authorization URL
    const authorizationUrl = linkedinProvider.getAuthorizationUrl({
      state: stateToken,
    });

    if (req.query.redirect === 'true') {
      return res.redirect(authorizationUrl);
    }

    return res.status(200).json({
      success: true,
      authorizationUrl,
      state: stateToken,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Handles the LinkedIn OAuth 2.0 authorization callback
 * GET /api/social/linkedin/callback
 */
async function linkedinCallback(req, res, next) {
  const { code, state, error, error_description } = req.query;
  const clientDashboardUrl = `${config.clientUrl}/dashboard`;

  // 1. Handle user cancellation or LinkedIn-side errors safely
  if (error) {
    const reason = encodeURIComponent(error_description || error || 'Access was denied by the user.');
    return res.redirect(`${clientDashboardUrl}?connection=linkedin_error&reason=${reason}`);
  }

  // 2. Validate existence of required query parameters
  if (!code || !state) {
    const reason = encodeURIComponent('Missing OAuth authorization code or state parameter.');
    return res.redirect(`${clientDashboardUrl}?connection=linkedin_error&reason=${reason}`);
  }

  try {
    // 3. Atomically validate and consume state to prevent replay attacks
    const storedState = await OAuthState.findOneAndDelete({
      state,
      platform: 'linkedin',
    });

    if (!storedState) {
      const reason = encodeURIComponent('Invalid, expired, or previously used OAuth session state.');
      return res.redirect(`${clientDashboardUrl}?connection=linkedin_error&reason=${reason}`);
    }

    const boundUserId = storedState.user;

    // 4. Exchange authorization code with LinkedIn for member tokens
    const tokenResult = await linkedinProvider.exchangeCode({ code });

    // 5. Retrieve authenticated member's profile identity via OpenID userinfo
    const profile = await linkedinProvider.getAuthenticatedProfile({
      accessToken: tokenResult.accessToken,
    });

    // 6. Encrypt sensitive token material before persisting (AES-256-GCM)
    const encryptedAccessToken = encrypt(tokenResult.accessToken);
    const encryptedRefreshToken = tokenResult.refreshToken
      ? encrypt(tokenResult.refreshToken)
      : undefined;

    // 7. Calculate access token expiration timestamp
    const expiresAt = new Date(Date.now() + (tokenResult.expiresIn || 5184000) * 1000);
    const refreshTokenExpiresAt = tokenResult.refreshTokenExpiresIn
      ? new Date(Date.now() + tokenResult.refreshTokenExpiresIn * 1000)
      : undefined;

    // 8. Upsert SocialAccount for user + platform + platformUserId
    await SocialAccount.findOneAndUpdate(
      {
        user: boundUserId,
        platform: 'linkedin',
        platformUserId: profile.platformUserId,
      },
      {
        displayName: profile.displayName,
        email: profile.email,
        profileImageUrl: profile.profileImageUrl,
        profileUrl: profile.profileUrl,
        accessToken: encryptedAccessToken,
        ...(encryptedRefreshToken && { refreshToken: encryptedRefreshToken }),
        expiresAt,
        ...(refreshTokenExpiresAt && { refreshTokenExpiresAt }),
        scopes: tokenResult.scopes,
        connectionStatus: 'connected',
        updatedAt: new Date(),
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    // 9. Redirect user back to frontend dashboard with success indicator
    const accountName = encodeURIComponent(profile.displayName);
    return res.redirect(
      `${clientDashboardUrl}?connection=linkedin_success&account=${accountName}`
    );
  } catch (err) {
    // Safe error message returned to client without leaking internal error details
    const reason = encodeURIComponent('Failed to link LinkedIn account. Please try again.');
    return res.redirect(`${clientDashboardUrl}?connection=linkedin_error&reason=${reason}`);
  }
}

/**
 * Retrieves all connected social accounts for the currently authenticated user
 * GET /api/social/accounts
 */
async function getConnectedAccounts(req, res, next) {
  try {
    const userId = req.user._id;

    // Query exclusively by authenticated user ID (tokens excluded by default via schema select: false)
    const accounts = await SocialAccount.find({ user: userId })
      .sort({ createdAt: -1 })
      .lean();

    // Ensure tokens are never exposed in API output
    const safeAccounts = accounts.map((acc) => {
      const { accessToken, refreshToken, __v, ...safe } = acc;
      return safe;
    });

    return res.status(200).json({
      success: true,
      count: safeAccounts.length,
      accounts: safeAccounts,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  connectLinkedIn,
  linkedinCallback,
  getConnectedAccounts,
};
