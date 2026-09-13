// Set test environment configuration
process.env.NODE_ENV = 'test';
process.env.PORT = '4001';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.JWT_SECRET = 'test_jwt_secret_must_be_minimum_32_characters_long_for_security';
process.env.GEMINI_API_KEY = 'mock_gemini_api_key_for_testing';
process.env.IMAGEKIT_PUBLIC_KEY = 'mock_imagekit_public_key';
process.env.IMAGEKIT_PRIVATE_KEY = 'mock_imagekit_private_key';
process.env.IMAGEKIT_URL_ENDPOINT = 'https://ik.imagekit.io/mock';
process.env.MONGODB_URL = 'mongodb://127.0.0.1:27017/socialsync_test';

const { setupServiceMocks } = require('./helpers/mockServices');
const { setupInMemoryDb } = require('./helpers/inMemoryDb');

// Initialize Mocks and In-Memory Harness
setupServiceMocks();
setupInMemoryDb();
