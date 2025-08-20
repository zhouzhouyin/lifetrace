const express = require('express');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const applySecurity = require('./middlewares/helmetCors');
const logger = require('./services/logger');
const { authLimiter, aiLimiter } = require('./middlewares/rateLimiters');
const authenticateToken = require('./middlewares/auth');

const app = express();

// base middlewares
app.use(express.json({ limit: '2mb' }));
applySecurity(app);
app.use(compression());
app.use(morgan('tiny'));

// health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// static uploads with CORS headers
const uploadDir = path.join(__dirname, 'Uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use('/Uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'http://localhost:3000');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  logger.info('Serving static file', { path: req.path, ip: req.ip });
  express.static(uploadDir)(req, res, next);
});
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'http://localhost:3000');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  logger.info('Serving static file (alias)', { path: req.path, ip: req.ip });
  express.static(uploadDir)(req, res, next);
});

// TODO: mount routes here (auth, notes, uploads, family, public, ai)
module.exports = app;

