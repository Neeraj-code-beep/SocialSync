const axios = require('axios');
const { config } = require('../../config/env.config');

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';

// Official current self-serve LinkedIn permissions:
// openid, profile, email (Sign In with LinkedIn using OpenID Connect)
// w_member_social (Share on LinkedIn / create posts on behalf of member)
const REQUIRED_SCOPES = ['openid', 'profile', 'email', 'w_member_social'];

const linkedinProvider = {
  platform: 'linkedin',

  /**
   * Generates official LinkedIn OAuth 2.0 authorization URL
   * @param {{ state: string, redirectUri?: string, scopes?: string[] }} params
   * @returns {string} Full authorization URL
   */
  getAuthorizationUrl({ state, redirectUri, scopes = REQUIRED_SCOPES }) {
    if (!state) {
      throw new Error('OAuth state is required to construct authorization URL.');
    }

    const clientId = config.linkedin.clientId;
    const resolvedRedirectUri = redirectUri || config.linkedin.redirectUri;

    if (!clientId || !resolvedRedirectUri) {
      throw new Error('LinkedIn client ID or redirect URI is not configured.');
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: resolvedRedirectUri,
      state,
      scope: scopes.join(' '),
    });

    return `${LINKEDIN_AUTH_URL}?${params.toString()}`;
  },

  /**
   * Exchanges an authorization code for member access token
   * @param {{ code: string, redirectUri?: string }} params
   * @returns {Promise<{ accessToken: string, expiresIn: number, refreshToken?: string, refreshTokenExpiresIn?: number, scopes: string[] }>}
   */
  async exchangeCode({ code, redirectUri }) {
    if (!code) {
      throw new Error('Authorization code is required for token exchange.');
    }

    const clientId = config.linkedin.clientId;
    const clientSecret = config.linkedin.clientSecret;
    const resolvedRedirectUri = redirectUri || config.linkedin.redirectUri;

    const payload = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: resolvedRedirectUri,
    });

    try {
      const response = await axios.post(LINKEDIN_TOKEN_URL, payload.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      });

      const data = response.data;
      if (!data || !data.access_token) {
        throw new Error('Invalid response from LinkedIn token exchange.');
      }

      // Granted scopes (either returned by LinkedIn or fallback to requested scopes)
      const grantedScopes = data.scope
        ? data.scope.split(' ').map((s) => s.trim()).filter(Boolean)
        : REQUIRED_SCOPES;

      return {
        accessToken: data.access_token,
        expiresIn: data.expires_in || 5184000, // Default 60 days (5184000 seconds)
        refreshToken: data.refresh_token || null,
        refreshTokenExpiresIn: data.refresh_token_expires_in || null,
        scopes: grantedScopes,
      };
    } catch (error) {
      const providerError =
        error.response?.data?.error_description ||
        error.response?.data?.error ||
        error.message ||
        'Failed to exchange authorization code with LinkedIn.';
      throw new Error(`LinkedIn OAuth exchange error: ${providerError}`);
    }
  },

  /**
   * Retrieves authenticated member's profile using official OpenID Connect userinfo endpoint
   * @param {{ accessToken: string }} params
   * @returns {Promise<{ platformUserId: string, displayName: string, email?: string, profileImageUrl?: string, profileUrl?: string }>}
   */
  async getAuthenticatedProfile({ accessToken }) {
    if (!accessToken) {
      throw new Error('Access token is required to fetch LinkedIn profile.');
    }

    try {
      const response = await axios.get(LINKEDIN_USERINFO_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        timeout: 10000,
      });

      const data = response.data;
      if (!data || !data.sub) {
        throw new Error('Malformed member profile received from LinkedIn userinfo.');
      }

      const displayName =
        data.name ||
        `${data.given_name || ''} ${data.family_name || ''}`.trim() ||
        'LinkedIn Member';

      return {
        platformUserId: data.sub,
        displayName,
        email: data.email || null,
        profileImageUrl: data.picture || null,
        profileUrl: null,
      };
    } catch (error) {
      const providerError =
        error.response?.data?.message ||
        error.message ||
        'Failed to fetch member identity from LinkedIn.';
      throw new Error(`LinkedIn profile error: ${providerError}`);
    }
  },

  /**
   * Returns supported capabilities for the LinkedIn integration slice
   */
  capabilities() {
    return {
      platform: 'linkedin',
      canPost: true,
      canSchedule: false,
      hasProgrammaticRefreshToken: false,
      tokenLifespanDays: 60,
    };
  },
};

module.exports = linkedinProvider;
