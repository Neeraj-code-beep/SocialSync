const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { config } = require('./config/env.config');
const { apiLimiter } = require('./middlewares/rateLimiter.middleware');
const { errorHandler, notFoundHandler } = require('./middlewares/error.middleware');
const healthChecker = require('./controllers/health.controller');

const authRoutes = require('./routes/auth.routes');
const postRoutes = require('./routes/post.routes');
const socialRoutes = require('./routes/social.routes');

const app = express();

// 1. Security Headers via Helmet
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// 2. CORS Configuration
const allowedOrigins = config.clientUrl.includes(',')
  ? config.clientUrl.split(',').map((url) => url.trim())
  : [config.clientUrl];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server) in development
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy violation: Origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// 3. Body Parsing & Cookies
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// 4. Global Rate Limiter
app.use('/api', apiLimiter);

// 5. Health Probes
app.get('/api/health', healthChecker);
app.get('/health', healthChecker);

// 6. Application API Routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/social', socialRoutes);

// 7. 404 Handler for Unmatched API Routes
app.use('/api', notFoundHandler);

// 8. Centralized Error Handler
app.use(errorHandler);

module.exports = app;
