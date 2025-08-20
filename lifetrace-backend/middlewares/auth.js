const jwt = require('jsonwebtoken');
const logger = require('../services/logger');

module.exports = function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    logger.warn('No token provided', { ip: req.ip });
    return res.status(401).json({ message: '未提供令牌' });
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      logger.warn('Invalid token', { ip: req.ip, error: err.message });
      return res.status(403).json({ message: '无效的令牌', error: err.message });
    }
    req.user = user;
    next();
  });
};

