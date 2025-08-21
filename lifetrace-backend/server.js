require('dotenv').config();
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'Set' : 'Not set');
console.log('PORT:', process.env.PORT || 5002);
console.log('SPARK_API_PASSWORD:', process.env.SPARK_API_PASSWORD ? 'Set' : 'Not set');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const helmet = require('helmet');
const winston = require('winston');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const compression = require('compression');
const morgan = require('morgan');
const crypto = require('crypto');
const { authLimiter, aiLimiter } = require('./middlewares/rateLimiters');

const app = express();

// Ensure Uploads directory exists
const uploadDir = path.join(__dirname, 'Uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Logger configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
    winston.format.metadata()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

// Middleware
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
const ALLOWED_ORIGINS = CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow same-origin/non-browser requests
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '2mb' }));
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(morgan('tiny'));

// Basic health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});
// Render default health check path alias
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// iFLYTEK IAT sign endpoint (returns a signed wss url; secrets stay on server)
app.get('/api/asr/sign', authenticateToken, (req, res) => {
  try {
    const appId = process.env.XF_IAT_APPID || '';
    const apiKey = process.env.XF_IAT_APIKEY || '';
    const apiSecret = process.env.XF_IAT_APISECRET || '';
    const wsUrl = (process.env.XF_IAT_URL || 'wss://iat-api.xfyun.cn/v2/iat');
    if (!appId || !apiKey || !apiSecret) {
      return res.status(500).json({ message: 'ASR 未配置：缺少 APPID/APIKEY/APISECRET' });
    }
    const host = new URL(wsUrl).host;
    const date = new Date().toUTCString();
    const requestLine = 'GET /v2/iat HTTP/1.1';
    const signatureOrigin = `host: ${host}\ndate: ${date}\n${requestLine}`;
    const signatureSha = crypto.createHmac('sha256', apiSecret).update(signatureOrigin).digest('base64');
    const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureSha}"`;
    const authorization = Buffer.from(authorizationOrigin).toString('base64');
    const signedUrl = `${wsUrl}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${host}`;
    res.json({ url: signedUrl, appId });
  } catch (err) {
    logger.error('ASR sign error', { error: err.message });
    res.status(500).json({ message: '签名失败：' + err.message });
  }
});
// Serve static files with explicit CORS headers
app.use('/Uploads', (req, res, next) => {
  const reqOrigin = req.headers.origin;
  const allow = ALLOWED_ORIGINS.includes(reqOrigin) ? reqOrigin : (ALLOWED_ORIGINS[0] || '*');
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  logger.info('Serving static file', { path: req.path, ip: req.ip });
  express.static(uploadDir)(req, res, next);
});

// case-insensitive alias
app.use('/uploads', (req, res, next) => {
  const reqOrigin = req.headers.origin;
  const allow = ALLOWED_ORIGINS.includes(reqOrigin) ? reqOrigin : (ALLOWED_ORIGINS[0] || '*');
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  logger.info('Serving static file (alias)', { path: req.path, ip: req.ip });
  express.static(uploadDir)(req, res, next);
});

// MongoDB connection
const mongoUri = process.env.MONGO_URI || 'mongodb://lifetraceUser:lifetrace123@localhost:27017/lifetrace?authSource=lifetrace';
mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => logger.info('Connected to MongoDB'))
.catch(err => logger.error('MongoDB connection error', { error: err.message }));

// User schema with unique uid
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email: { type: String },
  uid: { type: String, required: true, unique: true }, // 唯一 ID，注册生成
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);
// Family schemas
const familyRequestSchema = new mongoose.Schema({
  requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  relationFromRequester: { type: String, default: '' },
  relationFromTarget: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
familyRequestSchema.pre('save', function(next) { this.updatedAt = new Date(); next(); });
const FamilyRequest = mongoose.model('FamilyRequest', familyRequestSchema);

const familySchema = new mongoose.Schema({
  userAId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userBId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  relationAtoB: { type: String, default: '' },
  relationBtoA: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});
familySchema.index({ userAId: 1, userBId: 1 }, { unique: true });
const Family = mongoose.model('Family', familySchema);

// Helper to generate unique UID
const generateUid = async () => {
  while (true) {
    const candidate = String(Math.floor(100000 + Math.random() * 900000)); // 6 位数字
    const exists = await User.findOne({ uid: candidate }).lean();
    if (!exists) return candidate;
  }
};

// Note schema
const noteSectionMediaSchema = new mongoose.Schema({
  type: { type: String, enum: ['image', 'video', 'audio'], required: true },
  url: { type: String, required: true },
  desc: { type: String, default: '' }
}, { _id: false });

const noteSectionSchema = new mongoose.Schema({
  title: { type: String, default: '' },
  text: { type: String, default: '' },
  media: { type: [noteSectionMediaSchema], default: [] }
}, { _id: false });

const noteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, default: '' },
  content: { type: String, required: true },
  sections: { type: [noteSectionSchema], default: [] },
  isPublic: { type: Boolean, default: false },
  cloudStatus: { type: String, default: 'Not Uploaded' },
  type: { type: String, enum: ['Note', 'Biography'], default: 'Note' },
  timestamp: { type: Date, default: Date.now },
  likes: { type: Number, default: 0 },
  url: { type: String },
  sharedWithFamily: { type: Boolean, default: false },
});
const Note = mongoose.model('Note', noteSchema);

// Upload schema
const uploadSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  filePath: { type: String, required: true },
  desc: { type: String },
  timestamp: { type: Date, default: Date.now }
});
const Upload = mongoose.model('Upload', uploadSchema);

// Favorite schema: 用户收藏的公开传记
const favoriteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  noteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Note', required: true },
  createdAt: { type: Date, default: Date.now }
});
favoriteSchema.index({ userId: 1, noteId: 1 }, { unique: true });
const Favorite = mongoose.model('Favorite', favoriteSchema);

// Report schema: 用户举报公开传记（人工审核）
const reportSchema = new mongoose.Schema({
  reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  noteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Note', required: true },
  reason: { type: String, default: '' },
  details: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'reviewed', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});
reportSchema.index({ reporterId: 1, noteId: 1 }, { unique: true });
const Report = mongoose.model('Report', reportSchema);

// Validate ObjectId
const isValidObjectId = (id) => mongoose.isValidObjectId(id);

// JWT authentication middleware
const authenticateToken = (req, res, next) => {
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

// 星火 X1 代理路由
app.post('/api/spark', authenticateToken, aiLimiter, async (req, res) => {
  try {
    const response = await axios.post(
      'https://spark-api-open.xf-yun.com/v2/chat/completions',
      req.body,
      {
        headers: {
          Authorization: `Bearer ${process.env.SPARK_API_PASSWORD}`,
          'Content-Type': 'application/json',
        },
      }
    );
    logger.info('Spark API request successful', { userId: req.user.userId, ip: req.ip });
    res.json(response.data);
  } catch (err) {
    logger.error('Spark API error', {
      error: err.response?.data?.message || err.message,
      code: err.response?.data?.code,
      userId: req.user.userId,
      ip: req.ip,
    });
    res.status(err.response?.status || 500).json({
      message: err.response?.data?.message || err.message,
      code: err.response?.data?.code,
    });
  }
});

// Get user info (with uid and userId)
app.get('/api/user', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      logger.warn('User not found', { userId: req.user.userId, ip: req.ip });
      return res.status(404).json({ message: '用户不存在' });
    }
    logger.info('User info retrieved', { userId: req.user.userId, ip: req.ip });
    res.json({ username: user.username, email: user.email, uid: user.uid, userId: user._id.toString(), role: user.role || 'user' });
  } catch (err) {
    logger.error('Get user error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '获取用户信息失败：' + err.message });
  }
});

// Get public notes and biographies
app.get('/api/public', async (req, res) => {
  try {
    const publicNotes = await Note.find({ isPublic: true, cloudStatus: 'Uploaded' }).populate('userId', 'username uid').lean();
    const publicBiographies = await Note.find({ isPublic: true, type: 'Biography', cloudStatus: 'Uploaded' }).populate('userId', 'username uid').lean();
    logger.info('Public data retrieved', { userId: req.user.userId, notesCount: publicNotes.length, biographiesCount: publicBiographies.length, ip: req.ip });
    res.json({
      notes: publicNotes.map(note => ({
        id: note._id.toString(),
        title: note.title,
        content: note.content,
        sections: note.sections || [],
        isPublic: note.isPublic,
        cloudStatus: note.cloudStatus,
        type: note.type,
        timestamp: note.timestamp,
        likes: note.likes,
        url: note.url,
        username: note.userId?.username || 'unknown',
        uid: note.userId?.uid || ''
      })),
      biographies: publicBiographies.map(bio => ({
        id: bio._id.toString(),
        title: bio.title,
        content: bio.content,
        sections: bio.sections || [],
        isPublic: bio.isPublic,
        cloudStatus: bio.cloudStatus,
        type: bio.type,
        timestamp: bio.timestamp,
        likes: bio.likes,
        url: bio.url,
        username: bio.userId?.username || 'unknown',
        uid: bio.userId?.uid || ''
      }))
    });
  } catch (err) {
    logger.error('Get public data error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '获取公开内容失败：' + err.message });
  }
});

// Public biographies with sections
app.get('/api/public/biographies', async (req, res) => {
  try {
    const items = await Note.find({ isPublic: true, type: 'Biography', cloudStatus: 'Uploaded' }).populate('userId', 'username uid').lean();
    res.json(items.map(n => ({
      id: n._id.toString(),
      title: n.title,
      content: n.content,
      sections: n.sections || [],
      isPublic: n.isPublic,
      cloudStatus: n.cloudStatus,
      type: n.type,
      timestamp: n.timestamp,
      likes: n.likes,
      url: n.url,
      username: n.userId?.username || 'unknown',
      uid: n.userId?.uid || ''
    })));
  } catch (err) {
    logger.error('Get public biographies error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '获取公开传记失败：' + err.message });
  }
});

// Public notes
app.get('/api/public/notes', async (req, res) => {
  try {
    const items = await Note.find({ isPublic: true, type: 'Note', cloudStatus: 'Uploaded' }).populate('userId', 'username uid').lean();
    res.json(items.map(n => ({
      id: n._id.toString(),
      title: n.title,
      content: n.content,
      sections: n.sections || [],
      isPublic: n.isPublic,
      cloudStatus: n.cloudStatus,
      type: n.type,
      timestamp: n.timestamp,
      likes: n.likes,
      url: n.url,
      username: n.userId?.username || 'unknown',
      uid: n.userId?.uid || ''
    })));
  } catch (err) {
    logger.error('Get public notes error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '获取公开随笔失败：' + err.message });
  }
});

// Register route with uid assignment
app.post('/api/register', authLimiter, async (req, res) => {
  const { username, password, email, adminInvite } = req.body;
  if (!username || !password) {
    logger.warn('Missing username or password', { ip: req.ip });
    return res.status(400).json({ message: '用户名和密码为必填项' });
  }
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      logger.warn('Username already exists', { username, ip: req.ip });
      return res.status(400).json({ message: '用户名已存在' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const uid = await generateUid();
    const role = adminInvite && adminInvite === process.env.ADMIN_INVITE ? 'admin' : 'user';
    const user = new User({ username, password: hashedPassword, email, uid, role });
    await user.save();
    logger.info('User registered', { username, ip: req.ip });
    res.status(201).json({ message: '注册成功', uid: user.uid, userId: user._id.toString() });
  } catch (err) {
    logger.error('Registration error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '注册失败：' + err.message });
  }
});

// Login route (return uid)
app.post('/api/login', authLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    logger.warn('Missing username or password', { ip: req.ip });
    return res.status(400).json({ message: '用户名和密码为必填项' });
  }
  try {
    const user = await User.findOne({ username });
    if (!user) {
      logger.warn('User not found', { username, ip: req.ip });
      return res.status(400).json({ message: '用户不存在' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      logger.warn('Incorrect password', { username, ip: req.ip });
      return res.status(400).json({ message: '密码错误' });
    }
    const token = jwt.sign({ userId: user._id, username, role: user.role || 'user' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    logger.info('User logged in', { username, ip: req.ip });
    res.json({ token, username, uid: user.uid, userId: user._id.toString(), role: user.role || 'user' });
  } catch (err) {
    logger.error('Login error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '登录失败：' + err.message });
  }
});

// Family: list members
app.get('/api/family', authenticateToken, async (req, res) => {
  try {
    const pairs = await Family.find({ $or: [{ userAId: req.user.userId }, { userBId: req.user.userId }] })
      .populate('userAId', 'username uid')
      .populate('userBId', 'username uid')
      .lean();
    const result = pairs.map(p => {
      const isA = String(p.userAId._id) === String(req.user.userId);
      const peer = isA ? p.userBId : p.userAId;
      const relation = isA ? p.relationAtoB : p.relationBtoA;
      return { userId: peer._id.toString(), username: peer.username, uid: peer.uid, relation };
    });
    res.json(result);
  } catch (err) {
    logger.error('Get family error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '获取家族成员失败：' + err.message });
  }
});

// Family: list pending requests for current user
app.get('/api/family/requests', authenticateToken, async (req, res) => {
  try {
    const items = await FamilyRequest.find({ targetId: req.user.userId, status: 'pending' })
      .populate('requesterId', 'username uid')
      .lean();
    res.json(items.map(r => ({ id: r._id.toString(), requester: { userId: r.requesterId._id.toString(), username: r.requesterId.username, uid: r.requesterId.uid }, relationFromRequester: r.relationFromRequester, createdAt: r.createdAt })));
  } catch (err) {
    logger.error('Get family requests error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '获取家人请求失败：' + err.message });
  }
});

// Family: create request by target uid
app.post('/api/family/request', authenticateToken, async (req, res) => {
  const { targetUid, relationFromRequester } = req.body;
  if (!targetUid) return res.status(400).json({ message: '缺少目标UID' });
  try {
    const target = await User.findOne({ uid: targetUid });
    if (!target) return res.status(404).json({ message: '未找到该UID用户' });
    if (String(target._id) === String(req.user.userId)) return res.status(400).json({ message: '不能添加自己为家人' });
    // prevent duplicate if already family
    const exists = await Family.findOne({ $or: [
      { userAId: req.user.userId, userBId: target._id },
      { userAId: target._id, userBId: req.user.userId },
    ]});
    if (exists) return res.status(400).json({ message: '已是家人' });
    const fr = new FamilyRequest({ requesterId: req.user.userId, targetId: target._id, relationFromRequester: relationFromRequester || '' });
    await fr.save();
    res.status(201).json({ id: fr._id.toString(), message: '请求已发送' });
  } catch (err) {
    logger.error('Create family request error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '发送家人请求失败：' + err.message });
  }
});

// Family: accept request
app.post('/api/family/accept', authenticateToken, async (req, res) => {
  const { requestId, relationFromTarget } = req.body;
  if (!isValidObjectId(requestId)) return res.status(400).json({ message: '无效的请求ID' });
  try {
    const fr = await FamilyRequest.findOne({ _id: requestId, targetId: req.user.userId, status: 'pending' });
    if (!fr) return res.status(404).json({ message: '请求不存在或已处理' });
    fr.status = 'accepted';
    fr.relationFromTarget = relationFromTarget || '';
    await fr.save();
    // create family pair (both directions in one doc)
    const dup = await Family.findOne({ $or: [
      { userAId: fr.requesterId, userBId: fr.targetId },
      { userAId: fr.targetId, userBId: fr.requesterId },
    ]});
    if (!dup) {
      await new Family({ userAId: fr.requesterId, userBId: fr.targetId, relationAtoB: fr.relationFromRequester, relationBtoA: fr.relationFromTarget }).save();
    }
    res.json({ message: '已接受请求' });
  } catch (err) {
    logger.error('Accept family request error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '接受请求失败：' + err.message });
  }
});

// Family: reject request
app.post('/api/family/reject', authenticateToken, async (req, res) => {
  const { requestId } = req.body;
  if (!isValidObjectId(requestId)) return res.status(400).json({ message: '无效的请求ID' });
  try {
    const fr = await FamilyRequest.findOne({ _id: requestId, targetId: req.user.userId, status: 'pending' });
    if (!fr) return res.status(404).json({ message: '请求不存在或已处理' });
    fr.status = 'rejected';
    await fr.save();
    res.json({ message: '已拒绝请求' });
  } catch (err) {
    logger.error('Reject family request error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '拒绝请求失败：' + err.message });
  }
});

// Family: shared biographies (private within family)
app.get('/api/family/biographies', authenticateToken, async (req, res) => {
  try {
    const pairs = await Family.find({ $or: [{ userAId: req.user.userId }, { userBId: req.user.userId }] }).lean();
    const peerIds = pairs.map(p => String(p.userAId) === String(req.user.userId) ? p.userBId : p.userAId);
    const ids = [req.user.userId, ...peerIds];
    const notes = await Note.find({ userId: { $in: ids }, type: 'Biography', sharedWithFamily: true }).sort({ timestamp: -1 });
    res.json(notes.map(note => ({
      id: note._id.toString(),
      title: note.title,
      content: note.content,
      isPublic: note.isPublic,
      cloudStatus: note.cloudStatus,
      type: note.type,
      sharedWithFamily: note.sharedWithFamily,
      ownerId: note.userId.toString(),
      isOwner: String(note.userId) === String(req.user.userId),
      timestamp: note.timestamp,
      likes: note.likes,
      url: note.url
    })));
  } catch (err) {
    logger.error('Get family biographies error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '获取家族传记失败：' + err.message });
  }
});

// Get all notes
app.get('/api/notes', authenticateToken, async (req, res) => {
  try {
    const notes = await Note.find({ userId: req.user.userId });
    logger.info('Notes retrieved', { userId: req.user.userId, count: notes.length, ip: req.ip });
    res.json(notes.map(note => ({
      id: note._id.toString(),
      title: note.title,
      content: note.content,
      sections: note.sections || [],
      isPublic: note.isPublic,
      sharedWithFamily: note.sharedWithFamily,
      cloudStatus: note.cloudStatus,
      type: note.type,
      timestamp: note.timestamp,
      likes: note.likes,
      url: note.url
    })));
  } catch (err) {
    logger.error('Get notes error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '获取笔记失败：' + err.message });
  }
});

// Get single note
app.get('/api/note/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    logger.warn('Invalid note ID', { noteId: id, userId: req.user.userId, ip: req.ip });
    return res.status(400).json({ message: '无效的笔记 ID' });
  }
  try {
    const note = await Note.findOne({ _id: id, userId: req.user.userId });
    if (!note) {
      logger.warn('Note not found', { noteId: id, userId: req.user.userId, ip: req.ip });
      return res.status(404).json({ message: '笔记不存在' });
    }
    logger.info('Note retrieved', { noteId: id, userId: req.user.userId, ip: req.ip });
    res.json({
      id: note._id.toString(),
      title: note.title,
      content: note.content,
      sections: note.sections || [],
      isPublic: note.isPublic,
      sharedWithFamily: note.sharedWithFamily,
      cloudStatus: note.cloudStatus,
      type: note.type,
      timestamp: note.timestamp,
      likes: note.likes,
      url: note.url
    });
  } catch (err) {
    logger.error('Get note error', { error: err.message, noteId: id, ip: req.ip });
    res.status(500).json({ message: '获取笔记失败：' + err.message });
  }
});

// Get single note if in same family (or self)
app.get('/api/family/note/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    logger.warn('Invalid family note ID', { noteId: id, userId: req.user.userId, ip: req.ip });
    return res.status(400).json({ message: '无效的笔记 ID' });
  }
  try {
    const note = await Note.findById(id);
    if (!note) {
      logger.warn('Family note not found', { noteId: id, userId: req.user.userId, ip: req.ip });
      return res.status(404).json({ message: '笔记不存在' });
    }
    const isOwner = String(note.userId) === String(req.user.userId);
    let isFamily = false;
    if (!isOwner) {
      const rel = await Family.findOne({ $or: [
        { userAId: req.user.userId, userBId: note.userId },
        { userAId: note.userId, userBId: req.user.userId },
      ]});
      isFamily = !!rel;
    }
    if (!isOwner && !isFamily) {
      logger.warn('No family access to note', { noteId: id, userId: req.user.userId, ip: req.ip });
      return res.status(403).json({ message: '无权访问该笔记' });
    }
    logger.info('Family note retrieved', { noteId: id, userId: req.user.userId, ip: req.ip });
    res.json({
      id: note._id.toString(),
      title: note.title,
      content: note.content,
      sections: note.sections || [],
      isPublic: note.isPublic,
      sharedWithFamily: note.sharedWithFamily,
      cloudStatus: note.cloudStatus,
      type: note.type,
      timestamp: note.timestamp,
      likes: note.likes,
      url: note.url
    });
  } catch (err) {
    logger.error('Get family note error', { error: err.message, noteId: id, ip: req.ip });
    res.status(500).json({ message: '获取家族笔记失败：' + err.message });
  }
});

// Toggle public visibility (ensure id belongs to user)
app.put('/api/note/:id/public', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { isPublic } = req.body;
  if (!isValidObjectId(id)) return res.status(400).json({ message: '无效的笔记 ID' });
  try {
    const note = await Note.findOne({ _id: id, userId: req.user.userId });
    if (!note) return res.status(404).json({ message: '笔记不存在' });
    note.isPublic = !!isPublic;
    note.timestamp = new Date();
    await note.save();
    res.json({ id: note._id.toString(), isPublic: note.isPublic });
  } catch (err) {
    logger.error('Toggle public error', { error: err.message, noteId: id, ip: req.ip });
    res.status(500).json({ message: '更新公开状态失败：' + err.message });
  }
});

// Toggle family share (ensure id belongs to user)
app.put('/api/note/:id/family-share', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { shared } = req.body;
  if (!isValidObjectId(id)) return res.status(400).json({ message: '无效的笔记 ID' });
  try {
    const note = await Note.findOne({ _id: id, userId: req.user.userId });
    if (!note) return res.status(404).json({ message: '笔记不存在' });
    note.sharedWithFamily = !!shared;
    note.timestamp = new Date();
    await note.save();
    res.json({ id: note._id.toString(), sharedWithFamily: note.sharedWithFamily });
  } catch (err) {
    logger.error('Toggle family share error', { error: err.message, noteId: id, ip: req.ip });
    res.status(500).json({ message: '更新家族分享状态失败：' + err.message });
  }
});

// Create note
app.post('/api/note', authenticateToken, async (req, res) => {
  const { title, content, isPublic, cloudStatus, type, sharedWithFamily, sections } = req.body;
  if (!content) {
    logger.warn('Missing note content', { userId: req.user.userId, ip: req.ip });
    return res.status(400).json({ message: '笔记内容为必填项' });
  }
  try {
    const note = new Note({
      userId: req.user.userId,
      title: title || '',
      content,
      sections: Array.isArray(sections) ? sections : [],
      isPublic: isPublic || false,
      cloudStatus: cloudStatus || 'Not Uploaded',
      type: type || 'Note',
      sharedWithFamily: !!sharedWithFamily,
      timestamp: new Date()
    });
    await note.save();
    logger.info('Note created', { userId: req.user.userId, noteId: note._id, type: note.type, ip: req.ip });
    res.status(201).json({
      id: note._id.toString(),
      title: note.title,
      content: note.content,
      sections: note.sections || [],
      isPublic: note.isPublic,
      cloudStatus: note.cloudStatus,
      type: note.type,
      timestamp: note.timestamp,
      likes: note.likes,
      url: note.url
    });
  } catch (err) {
    logger.error('Create note error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '创建笔记失败：' + err.message });
  }
});

// Report a public biography
app.post('/api/report', authenticateToken, async (req, res) => {
  const { noteId, reason, details } = req.body || {};
  if (!isValidObjectId(noteId)) return res.status(400).json({ message: '无效的传记 ID' });
  try {
    const note = await Note.findById(noteId).lean();
    if (!note) {
      logger.warn('Report: note not found', { noteId, userId: req.user.userId, ip: req.ip });
      return res.status(404).json({ message: '传记不存在' });
    }
    if (note.type !== 'Biography') {
      logger.warn('Report: note is not Biography', { noteId, type: note.type, userId: req.user.userId, ip: req.ip });
      return res.status(400).json({ message: '仅支持举报传记' });
    }
    // 放宽条件：允许举报非公开传记（例如从家族或直达链接场景），方便后台核查
    // Upsert to avoid duplicate report by same user
    await Report.updateOne(
      { reporterId: req.user.userId, noteId },
      { $set: { reason: reason || '', details: details || '', status: 'pending' }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
    logger.info('Report submitted', { userId: req.user.userId, noteId, ip: req.ip });
    res.json({ message: '已提交举报，待审核' });
  } catch (err) {
    logger.error('Submit report error', { error: err.message, userId: req.user.userId, noteId, ip: req.ip });
    res.status(500).json({ message: '提交举报失败：' + err.message });
  }
});

// List reports (admin view). TODO: add role check when roles are available
app.get('/api/reports', authenticateToken, async (req, res) => {
  try {
    if ((req.user?.role || 'user') !== 'admin') return res.status(403).json({ message: '仅管理员可访问' });
    const reports = await Report.find({}).populate('reporterId', 'username').populate('noteId', 'title type isPublic').sort({ createdAt: -1 }).lean();
    res.json(reports.map(r => ({
      id: r._id.toString(),
      reporterUsername: r.reporterId?.username || '',
      noteId: r.noteId?._id?.toString?.() || '',
      noteTitle: r.noteId?.title || '',
      status: r.status,
      reason: r.reason || '',
      details: r.details || '',
      createdAt: r.createdAt,
    })));
  } catch (err) {
    logger.error('List reports error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '获取举报列表失败：' + err.message });
  }
});

// Update report status
app.put('/api/report/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};
  if (!isValidObjectId(id)) return res.status(400).json({ message: '无效的举报 ID' });
  if (!['pending', 'reviewed', 'rejected'].includes(status)) return res.status(400).json({ message: '无效的状态' });
  try {
    if ((req.user?.role || 'user') !== 'admin') return res.status(403).json({ message: '仅管理员可操作' });
    const updated = await Report.findByIdAndUpdate(id, { status }, { new: true }).lean();
    if (!updated) return res.status(404).json({ message: '举报不存在' });
    logger.info('Report updated', { reportId: id, status, userId: req.user.userId, ip: req.ip });
    res.json({ id: updated._id.toString(), status: updated.status });
  } catch (err) {
    logger.error('Update report error', { error: err.message, reportId: id, ip: req.ip });
    res.status(500).json({ message: '更新举报状态失败：' + err.message });
  }
});

// Update note
app.put('/api/note/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title, content, isPublic, cloudStatus, type, sharedWithFamily, sections } = req.body;
  if (!isValidObjectId(id)) {
    logger.warn('Invalid note ID', { noteId: id, userId: req.user.userId, ip: req.ip });
    return res.status(400).json({ message: '无效的笔记 ID' });
  }
  if (!content) {
    logger.warn('Missing note content', { noteId: id, userId: req.user.userId, ip: req.ip });
    return res.status(400).json({ message: '笔记内容为必填项' });
  }
  try {
    const note = await Note.findOneAndUpdate(
      { _id: id, userId: req.user.userId },
      { title, content, sections: Array.isArray(sections) ? sections : [], isPublic, cloudStatus, type, sharedWithFamily: !!sharedWithFamily, timestamp: new Date() },
      { new: true }
    );
    if (!note) {
      logger.warn('Note not found for update', { noteId: id, userId: req.user.userId, ip: req.ip });
      return res.status(404).json({ message: '笔记不存在' });
    }
    logger.info('Note updated', { noteId: id, userId: req.user.userId, type: note.type, ip: req.ip });
    res.json({
      id: note._id.toString(),
      title: note.title,
      content: note.content,
      sections: note.sections || [],
      isPublic: note.isPublic,
      cloudStatus: note.cloudStatus,
      type: note.type,
      timestamp: note.timestamp,
      likes: note.likes,
      url: note.url
    });
  } catch (err) {
    logger.error('Update note error', { error: err.message, noteId: id, ip: req.ip });
    res.status(500).json({ message: '更新笔记失败：' + err.message });
  }
});

// Delete note
app.delete('/api/note/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    logger.warn('Invalid note ID', { noteId: id, userId: req.user.userId, ip: req.ip });
    return res.status(400).json({ message: '无效的笔记 ID' });
  }
  try {
    const note = await Note.findOneAndDelete({ _id: id, userId: req.user.userId });
    if (!note) {
      logger.warn('Note not found for deletion', { noteId: id, userId: req.user.userId, ip: req.ip });
      return res.status(404).json({ message: '笔记不存在' });
    }
    logger.info('Note deleted', { noteId: id, userId: req.user.userId, type: note.type, ip: req.ip });
    res.json({ message: '笔记删除成功' });
  } catch (err) {
    logger.error('Delete note error', { error: err.message, noteId: id, ip: req.ip });
    res.status(500).json({ message: '删除笔记失败：' + err.message });
  }
});

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
// Upload constraints
const allowedMimes = [
  'image/png','image/jpeg','image/jpg','image/gif','image/webp','image/bmp',
  'video/mp4','video/webm','video/ogg','video/quicktime','video/x-msvideo','video/x-matroska',
  'audio/mpeg','audio/wav','audio/x-wav','audio/ogg','audio/opus','audio/webm','audio/mp4','audio/aac','audio/x-m4a','audio/m4a','audio/flac','audio/3gpp','audio/amr','audio/x-ms-wma'
];
const allowedExts = new Set(['.png','.jpg','.jpeg','.gif','.webp','.bmp','.mp4','.webm','.ogg','.mov','.avi','.mkv','.mp3','.wav','.opus','.m4a','.aac','.flac','.3gp','.amr','.wma']);
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    try {
      const mime = (file.mimetype || '').toLowerCase();
      const ext = path.extname(file.originalname || '').toLowerCase();
      if (mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/')) return cb(null, true);
      if (allowedMimes.includes(mime)) return cb(null, true);
      if (mime === 'application/octet-stream' && allowedExts.has(ext)) return cb(null, true);
      if (allowedExts.has(ext)) return cb(null, true);
      return cb(new Error(`不支持的文件类型: ${mime || 'unknown'} 扩展名: ${ext || 'unknown'}`));
    } catch (e) {
      return cb(new Error('文件类型检测失败'));
    }
  }
});


// Upload file
app.post('/api/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      logger.warn('No file uploaded', { userId: req.user.userId, ip: req.ip });
      return res.status(400).json({ message: '未选择文件' });
    }
    const filePath = `/Uploads/${file.filename}`;
    const uploadRecord = new Upload({
      userId: req.user.userId,
      filePath,
      desc: req.body.desc || '',
      timestamp: new Date()
    });
    await uploadRecord.save();
    logger.info('File uploaded', { userId: req.user.userId, file: file.filename, uploadId: uploadRecord._id, ip: req.ip });
    res.json({
      id: uploadRecord._id.toString(),
      filePath: uploadRecord.filePath,
      desc: uploadRecord.desc,
      timestamp: uploadRecord.timestamp
    });
  } catch (err) {
    logger.error('Upload file error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '文件上传失败：' + err.message });
  }
});

// Global error handler (captures multer fileFilter errors)
app.use((err, req, res, next) => {
  if (err) {
    const msg = err.message || '服务器错误';
    const isMulter = err.name === 'MulterError' || /不支持的文件类型/.test(msg);
    logger.error('Global error handler', { message: msg, stack: err.stack, ip: req.ip });
    return res.status(isMulter ? 400 : 500).json({ message: msg });
  }
  next();
});

// Get uploaded files
app.get('/api/uploads', authenticateToken, async (req, res) => {
  try {
    const uploads = await Upload.find({ userId: req.user.userId });
    logger.info('Uploads retrieved', { userId: req.user.userId, count: uploads.length, ip: req.ip });
    res.json(uploads.map(upload => ({
      id: upload._id.toString(),
      filePath: upload.filePath,
      desc: upload.desc,
      timestamp: upload.timestamp
    })));
  } catch (err) {
    logger.error('Get uploads error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '获取文件失败：' + err.message });
  }
});

// Get single uploaded file
app.get('/api/upload/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    logger.warn('Invalid upload ID', { uploadId: id, userId: req.user.userId, ip: req.ip });
    return res.status(400).json({ message: '无效的文件 ID' });
  }
  try {
    const upload = await Upload.findOne({ _id: id, userId: req.user.userId });
    if (!upload) {
      logger.warn('Upload not found', { uploadId: id, userId: req.user.userId, ip: req.ip });
      return res.status(404).json({ message: '文件不存在' });
    }
    logger.info('Upload retrieved', { uploadId: id, userId: req.user.userId, ip: req.ip });
    res.json({
      id: upload._id.toString(),
      filePath: upload.filePath,
      desc: upload.desc,
      timestamp: upload.timestamp
    });
  } catch (err) {
    logger.error('Get upload error', { error: err.message, uploadId: id, ip: req.ip });
    res.status(500).json({ message: '获取文件失败：' + err.message });
  }
});

// Delete uploaded file
app.delete('/api/upload/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    logger.warn('Invalid upload ID', { uploadId: id, userId: req.user.userId, ip: req.ip });
    return res.status(400).json({ message: '无效的文件 ID' });
  }
  try {
    const upload = await Upload.findOne({ _id: id, userId: req.user.userId });
    if (!upload) {
      logger.warn('Upload not found for deletion', { uploadId: id, userId: req.user.userId, ip: req.ip });
      return res.status(404).json({ message: '文件不存在' });
    }
    // 引用保护：若有 Note.sections.media.url 引用该文件，禁止删除
    const isReferenced = await Note.exists({ 'sections.media.url': upload.filePath });
    if (isReferenced) {
      logger.warn('Upload is referenced by notes, cannot delete', { filePath: upload.filePath, userId: req.user.userId, ip: req.ip });
      return res.status(409).json({ message: '该文件正在被传记引用，请先在传记中移除该媒体后再删除文件' });
    }
    await Upload.deleteOne({ _id: id, userId: req.user.userId });
    const filePath = path.join(__dirname, upload.filePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info('File deleted from disk', { filePath, uploadId: id, ip: req.ip });
    }
    logger.info('Upload deleted', { uploadId: id, userId: req.user.userId, ip: req.ip });
    res.json({ message: '文件删除成功' });
  } catch (err) {
    logger.error('Delete upload error', { error: err.message, uploadId: id, ip: req.ip });
    res.status(500).json({ message: '删除文件失败：' + err.message });
  }
});

// Add to favorites (only public biographies)
app.post('/api/favorite/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ message: '无效的传记 ID' });
  try {
    const note = await Note.findById(id).lean();
    if (!note) return res.status(404).json({ message: '传记不存在' });
    if (!(note.type === 'Biography' && note.isPublic === true && note.cloudStatus === 'Uploaded')) {
      return res.status(403).json({ message: '仅可收藏公开的传记' });
    }
    await Favorite.updateOne(
      { userId: req.user.userId, noteId: id },
      { $setOnInsert: { userId: req.user.userId, noteId: id, createdAt: new Date() } },
      { upsert: true }
    );
    return res.json({ message: '已收藏' });
  } catch (err) {
    logger.error('Add favorite error', { error: err.message, userId: req.user.userId, noteId: id, ip: req.ip });
    return res.status(500).json({ message: '收藏失败：' + err.message });
  }
});

// Remove from favorites
app.delete('/api/favorite/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ message: '无效的传记 ID' });
  try {
    await Favorite.deleteOne({ userId: req.user.userId, noteId: id });
    return res.json({ message: '已取消收藏' });
  } catch (err) {
    logger.error('Remove favorite error', { error: err.message, userId: req.user.userId, noteId: id, ip: req.ip });
    return res.status(500).json({ message: '取消收藏失败：' + err.message });
  }
});

// List my favorites
app.get('/api/favorites', authenticateToken, async (req, res) => {
  try {
    const items = await Favorite.find({ userId: req.user.userId }).lean();
    const noteIds = items.map(f => f.noteId);
    const notes = await Note.find({ _id: { $in: noteIds } }).populate('userId', 'username uid').lean();
    const map = new Map(notes.map(n => [String(n._id), n]));
    const result = items
      .map(f => {
        const n = map.get(String(f.noteId));
        if (!n) return null;
        return {
          id: n._id.toString(),
          title: n.title,
          content: n.content,
          sections: n.sections || [],
          isPublic: n.isPublic,
          cloudStatus: n.cloudStatus,
          type: n.type,
          timestamp: n.timestamp,
          likes: n.likes,
          url: n.url,
          username: n.userId?.username || 'unknown',
          uid: n.userId?.uid || '',
        };
      })
      .filter(Boolean);
    return res.json(result);
  } catch (err) {
    logger.error('List favorites error', { error: err.message, userId: req.user.userId, ip: req.ip });
    return res.status(500).json({ message: '获取收藏失败：' + err.message });
  }
});

// Upload note to cloud
app.post('/api/note/upload', authenticateToken, async (req, res) => {
  const { id, title, content } = req.body;
  if (!isValidObjectId(id)) {
    logger.warn('Invalid note ID for upload', { noteId: id, userId: req.user.userId, ip: req.ip });
    return res.status(400).json({ message: '无效的笔记 ID' });
  }
  try {
    const note = await Note.findOneAndUpdate(
      { _id: id, userId: req.user.userId },
      { title, content, cloudStatus: 'Uploaded', timestamp: new Date() },
      { new: true }
    );
    if (!note) {
      logger.warn('Note not found for upload', { noteId: id, userId: req.user.userId, ip: req.ip });
      return res.status(404).json({ message: '笔记不存在' });
    }
    logger.info('Note uploaded', { noteId: id, userId: req.user.userId, type: note.type, ip: req.ip });
    res.json({
      id: note._id.toString(),
      title: note.title,
      content: note.content,
      isPublic: note.isPublic,
      cloudStatus: note.cloudStatus,
      type: note.type,
      timestamp: note.timestamp,
      likes: note.likes,
      url: note.url
    });
  } catch (err) {
    logger.error('Upload note error', { error: err.message, noteId: id, ip: req.ip });
    res.status(500).json({ message: '上传笔记失败：' + err.message });
  }
});

// WebSocket server
const server = app.listen(process.env.PORT || 5002, () => {
  logger.info(`Server running on port ${process.env.PORT || 5002}`);
});
const wss = new WebSocket.Server({ server });
wss.on('connection', (ws, req) => {
  logger.info('WebSocket client connected', { ip: req.socket.remoteAddress });
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      logger.info('WebSocket message received', { data, ip: req.socket.remoteAddress });
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data));
        }
      });
    } catch (err) {
      logger.error('WebSocket message error', { error: err.message, ip: req.socket.remoteAddress });
      ws.send(JSON.stringify({ error: 'Invalid message format' }));
    }
  });
  ws.on('close', () => {
    logger.info('WebSocket client disconnected', { ip: req.socket.remoteAddress });
  });
});