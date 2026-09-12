const mongoose = require('mongoose');

const healthChecker = async (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;

  const healthData = {
    status: isDbConnected ? 'healthy' : 'degraded',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    services: {
      database: {
        status: isDbConnected ? 'connected' : 'disconnected',
        readyState: mongoose.connection.readyState,
      },
    },
  };

  const statusCode = isDbConnected ? 200 : 503;

  return res.status(statusCode).json(healthData);
};

module.exports = healthChecker;
