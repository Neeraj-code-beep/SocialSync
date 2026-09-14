const path = require('path');

const aiServicePath = require.resolve('../../src/services/ai.service');
const storageServicePath = require.resolve('../../src/services/storage.service');
const linkedinProviderPath = require.resolve('../../src/services/providers/linkedin.provider');

let mockCaptionResult = 'AI generated test caption for social media #trending #ai';
let mockStorageResult = {
  url: 'https://ik.imagekit.io/mock/test-image-123.jpg',
  fileId: 'mock-file-id-456',
};

let mockLinkedInTokenResult = {
  accessToken: 'mock_linkedin_access_token_secret_12345',
  expiresIn: 5184000,
  refreshToken: null,
  refreshTokenExpiresIn: null,
  scopes: ['openid', 'profile', 'email', 'w_member_social'],
};

let mockLinkedInProfileResult = {
  platformUserId: 'linkedin_member_sub_98765',
  displayName: 'Alex Morgan',
  email: 'alex.morgan@example.com',
  profileImageUrl: 'https://media.licdn.com/dms/image/v2/mock_avatar.jpg',
  profileUrl: null,
};

let shouldAiFail = false;
let shouldStorageFail = false;
let shouldLinkedInTokenFail = false;
let shouldLinkedInProfileFail = false;

function setupServiceMocks() {
  require.cache[aiServicePath] = {
    id: aiServicePath,
    filename: aiServicePath,
    loaded: true,
    exports: async function mockGenerateCaption(buffer, mimeType) {
      if (shouldAiFail) {
        throw new Error('AI Generation service unavailable');
      }
      return mockCaptionResult;
    },
  };

  require.cache[storageServicePath] = {
    id: storageServicePath,
    filename: storageServicePath,
    loaded: true,
    exports: async function mockUploadFile(buffer, filename) {
      if (shouldStorageFail) {
        throw new Error('ImageKit storage upload failed');
      }
      return mockStorageResult;
    },
  };

  const actualProvider = jestOrReq(linkedinProviderPath);
  require.cache[linkedinProviderPath] = {
    id: linkedinProviderPath,
    filename: linkedinProviderPath,
    loaded: true,
    exports: {
      ...actualProvider,
      exchangeCode: async function ({ code, redirectUri }) {
        if (shouldLinkedInTokenFail) {
          throw new Error('LinkedIn OAuth exchange error: Invalid authorization code');
        }
        return { ...mockLinkedInTokenResult };
      },
      getAuthenticatedProfile: async function ({ accessToken }) {
        if (shouldLinkedInProfileFail) {
          throw new Error('LinkedIn profile error: Unauthorized token or service unavailable');
        }
        return { ...mockLinkedInProfileResult };
      },
    },
  };
}

function jestOrReq(modulePath) {
  delete require.cache[modulePath];
  return require(modulePath);
}

function resetServiceMocks() {
  mockCaptionResult = 'AI generated test caption for social media #trending #ai';
  mockStorageResult = {
    url: 'https://ik.imagekit.io/mock/test-image-123.jpg',
    fileId: 'mock-file-id-456',
  };
  mockLinkedInTokenResult = {
    accessToken: 'mock_linkedin_access_token_secret_12345',
    expiresIn: 5184000,
    refreshToken: null,
    refreshTokenExpiresIn: null,
    scopes: ['openid', 'profile', 'email', 'w_member_social'],
  };
  mockLinkedInProfileResult = {
    platformUserId: 'linkedin_member_sub_98765',
    displayName: 'Alex Morgan',
    email: 'alex.morgan@example.com',
    profileImageUrl: 'https://media.licdn.com/dms/image/v2/mock_avatar.jpg',
    profileUrl: null,
  };
  shouldAiFail = false;
  shouldStorageFail = false;
  shouldLinkedInTokenFail = false;
  shouldLinkedInProfileFail = false;
  setupServiceMocks();
}

function setMockAiFailure(fail = true) {
  shouldAiFail = fail;
}

function setMockStorageFailure(fail = true) {
  shouldStorageFail = fail;
}

function setMockLinkedInTokenFailure(fail = true) {
  shouldLinkedInTokenFail = fail;
}

function setMockLinkedInProfileFailure(fail = true) {
  shouldLinkedInProfileFail = fail;
}

function setMockLinkedInProfile(customProfile) {
  mockLinkedInProfileResult = {
    ...mockLinkedInProfileResult,
    ...customProfile,
  };
}

module.exports = {
  setupServiceMocks,
  resetServiceMocks,
  setMockAiFailure,
  setMockStorageFailure,
  setMockLinkedInTokenFailure,
  setMockLinkedInProfileFailure,
  setMockLinkedInProfile,
};
