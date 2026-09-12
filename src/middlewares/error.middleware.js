const multer = require('multer');

function errorHandler(err, req, res, next) {
  // Handle Multer upload errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum allowed size is 10 MB.',
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file upload field.',
      });
    }
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`,
    });
  }

  // Handle custom file type errors
  if (err.name === 'InvalidFileTypeError') {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  // Handle Mongoose duplicate key error
  if (err.code === 11000) {
    const fields = Object.keys(err.keyValue || {});
    return res.status(409).json({
      success: false,
      message: `${fields.join(', ')} already exists.`,
    });
  }

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors || {}).map((e) => e.message);
    return res.status(400).json({
      success: false,
      message: messages.join(', ') || 'Validation error',
    });
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid authorization token.',
    });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Authorization token expired.',
    });
  }

  // Generic status code and safe message
  const statusCode = err.status || err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  // Log error internally in non-production for debugging without exposing secrets
  if (!isProduction) {
    console.error('[Internal Error Handler]:', err.message);
  }

  return res.status(statusCode).json({
    success: false,
    message: statusCode === 500 && isProduction ? 'Internal server error' : err.message || 'Internal server error',
  });
}

function notFoundHandler(req, res) {
  return res.status(404).json({
    success: false,
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
};
