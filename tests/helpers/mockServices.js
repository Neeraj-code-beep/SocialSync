const path = require('path');

const aiServicePath = require.resolve('../../src/services/ai.service');
const storageServicePath = require.resolve('../../src/services/storage.service');

let mockCaptionResult = 'AI generated test caption for social media #trending #ai';
let mockStorageResult = {
  url: 'https://ik.imagekit.io/mock/test-image-123.jpg',
  fileId: 'mock-file-id-456',
};

let shouldAiFail = false;
let shouldStorageFail = false;

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
}

function resetServiceMocks() {
  mockCaptionResult = 'AI generated test caption for social media #trending #ai';
  mockStorageResult = {
    url: 'https://ik.imagekit.io/mock/test-image-123.jpg',
    fileId: 'mock-file-id-456',
  };
  shouldAiFail = false;
  shouldStorageFail = false;
  setupServiceMocks();
}

function setMockAiFailure(fail = true) {
  shouldAiFail = fail;
}

function setMockStorageFailure(fail = true) {
  shouldStorageFail = fail;
}

module.exports = {
  setupServiceMocks,
  resetServiceMocks,
  setMockAiFailure,
  setMockStorageFailure,
};
