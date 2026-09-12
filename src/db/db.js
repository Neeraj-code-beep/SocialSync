const mongoose = require('mongoose');
const { config } = require('../config/env.config');

const connectToDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`[Database] MongoDB connected successfully to host: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error('[Database Error] Failed to connect to MongoDB:', error.message);
    throw error;
  }
};

const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
    console.log('[Database] MongoDB connection closed gracefully.');
  } catch (error) {
    console.error('[Database Error] Error during MongoDB disconnection:', error.message);
  }
};

module.exports = {
  connectToDB,
  disconnectDB,
};
