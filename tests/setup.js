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
process.env.LINKEDIN_CLIENT_ID = 'mock_linkedin_client_id_12345';
process.env.LINKEDIN_CLIENT_SECRET = 'mock_linkedin_client_secret_67890';
process.env.LINKEDIN_REDIRECT_URI = 'http://localhost:4000/api/social/linkedin/callback';
process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = 'test_encryption_key_minimum_32_characters_for_aes_gcm';

const { setupServiceMocks } = require('./helpers/mockServices');
const { setupInMemoryDb } = require('./helpers/inMemoryDb');

// Initialize Mocks and In-Memory Harness
setupServiceMocks();
setupInMemoryDb();
