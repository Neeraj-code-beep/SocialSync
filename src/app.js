const express = require('express');
const authRoutes = require('./routes/auth.routes');
const postRoutes = require('./routes/post.routes');
const cookieParser = require('cookie-parser');

const cors = require('cors');

const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);

module.exports = app;
