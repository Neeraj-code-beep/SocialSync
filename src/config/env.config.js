require('dotenv').config();

const REQUIRED_ENV_VARS = [
  'MONGODB_URL',
  'JWT_SECRET',
  'GEMINI_API_KEY',
  'IMAGEKIT_PUBLIC_KEY',
  'IMAGEKIT_PRIVATE_KEY',
  'IMAGEKIT_URL_ENDPOINT',
];

function validateEnv() {
  const missing = [];

  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName] || process.env[varName].trim() === '') {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[Startup Error] Missing required environment variable(s): ${missing.join(', ')}. Please check your .env configuration.`
    );
  }
}

const config = {
  port: parseInt(process.env.PORT, 10) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  clientUrl: process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173',
  mongoUri: process.env.MONGODB_URL,
  jwtSecret: process.env.JWT_SECRET,
  geminiApiKey: process.env.GEMINI_API_KEY,
  imageKit: {
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
  },
};

module.exports = {
  validateEnv,
  config,
};
