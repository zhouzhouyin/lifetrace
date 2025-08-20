const cors = require('cors');
const helmet = require('helmet');

module.exports = function applySecurity(app) {
  const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
  app.use(cors({
    origin: CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
  }));
};

