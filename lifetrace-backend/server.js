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
const https = require('https');
const querystring = require('querystring');
const httpsAgent = new https.Agent({ keepAlive: false });
const compression = require('compression');
const morgan = require('morgan');
const crypto = require('crypto');
const { authLimiter, aiLimiter } = require('./middlewares/rateLimiters');

const app = express();
// Behind Render/other proxies; trust X-Forwarded-* for correct client IPs
app.set('trust proxy', 1);

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
// Helper: md5
const md5 = (str) => crypto.createHash('md5').update(str, 'utf8').digest('hex');


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
app.use(express.urlencoded({ extended: false, limit: '2mb' }));
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

// (moved below authenticateToken)
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
  createdAt: { type: Date, default: Date.now },
  firstLoginAt: { type: Date },
  lastLoginAt: { type: Date },
  loginCount: { type: Number, default: 0 }
});
userSchema.index({ createdAt: 1 });
userSchema.index({ lastLoginAt: 1 });
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
  shareToken: { type: String },
  sharedAt: { type: Date },
  contacts: { type: [{ name: String, phone: String, address: String, relation: String }], default: [] },
  retentionYears: { type: Number, default: 10 },
  eternalGuard: { type: Boolean, default: false },
});
noteSchema.index({ userId: 1 });
noteSchema.index({ type: 1, isPublic: 1, timestamp: -1 });
noteSchema.index({ shareToken: 1 }, { unique: true, sparse: true });
noteSchema.index({ eternalGuard: 1 });
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

// PaymentFailure schema: 记录支付失败
const paymentFailureSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  noteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Note' },
  message: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});
paymentFailureSchema.index({ createdAt: -1 });
const PaymentFailure = mongoose.model('PaymentFailure', paymentFailureSchema);

// Memo schema: 轻量随手记
const memoMediaSchema = new mongoose.Schema({
  type: { type: String, enum: ['image', 'video', 'audio'], required: true },
  url: { type: String, required: true },
  desc: { type: String, default: '' }
}, { _id: false });

const memoSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, default: '' },
  tags: { type: [String], default: [] },
  media: { type: [memoMediaSchema], default: [] },
  stage: { type: String, default: '' }, // 用于按生命阶段整理
  source: { type: String, default: '' }, // e.g. 'daily', 'manual'
  subjectVersion: { type: Number, default: 1 },
  timestamp: { type: Date, default: Date.now },
  visibility: { type: String, enum: ['private', 'family', 'public'], default: 'private' },
  sharedWith: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] }, // 空表示家族全部可见（当 visibility='family'）
  updatedAt: { type: Date, default: Date.now }
});
memoSchema.index({ userId: 1, subjectVersion: 1, timestamp: -1 });
memoSchema.index({ visibility: 1 });
const Memo = mongoose.model('Memo', memoSchema);

// RecordSubject schema: 记录对象（为自己/为他人）及其资料
const recordSubjectSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  mode: { type: String, enum: ['self', 'other'], required: true },
  profile: {
    name: { type: String, default: '' },
    gender: { type: String, default: '' },
    birth: { type: String, default: '' },
    origin: { type: String, default: '' },
    residence: { type: String, default: '' },
    relation: { type: String, default: '' }
  },
  subjectVersion: { type: Number, default: 1 },
  updatedAt: { type: Date, default: Date.now }
});
const RecordSubject = mongoose.model('RecordSubject', recordSubjectSchema);

// Daily pool schema: 每日回首的题库（按阶段）
const dailyPoolSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  stage: { type: String, required: true },
  list: { type: [String], default: [] },
  updatedAt: { type: Date, default: Date.now }
});
dailyPoolSchema.index({ userId: 1, stage: 1 }, { unique: true });
const DailyPool = mongoose.model('DailyPool', dailyPoolSchema);

// Daily asked schema: 已经问过的问题（按阶段）
const dailyAskedSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  stage: { type: String, required: true },
  askedIds: { type: [String], default: [] },
  updatedAt: { type: Date, default: Date.now }
});
dailyAskedSchema.index({ userId: 1, stage: 1 }, { unique: true });
const DailyAsked = mongoose.model('DailyAsked', dailyAskedSchema);

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

// Public biography by id (no auth)
app.get('/api/public/biography/:id', async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ message: '无效的传记 ID' });
  try {
    const n = await Note.findOne({ _id: id, type: 'Biography', isPublic: true, cloudStatus: 'Uploaded' }).populate('userId', 'username uid').lean();
    if (!n) return res.status(404).json({ message: '传记不存在或未公开' });
    res.json({
      id: n._id.toString(),
      title: n.title,
      content: n.content,
      sections: n.sections || [],
      timestamp: n.timestamp,
      username: n.userId?.username || 'unknown',
      uid: n.userId?.uid || ''
    });
  } catch (err) {
    logger.error('Get public biography error', { error: err.message, id, ip: req.ip });
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

// Server day-key for client to对齐“今天”
app.get('/api/day-key', (req, res) => {
  try {
    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    res.json({ dayKey });
  } catch (err) {
    logger.error('Get day-key error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '获取 day-key 失败：' + err.message });
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
    // update login stats
    try {
      const now = new Date();
      const updates = { lastLoginAt: now, $inc: { loginCount: 1 } };
      if (!user.firstLoginAt) updates.firstLoginAt = now;
      await User.updateOne({ _id: user._id }, updates);
    } catch(_) {}
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

// Admin stats (auth admin)
app.get('/api/admin/stats', authenticateToken, async (req, res) => {
  try {
    if ((req.user?.role || 'user') !== 'admin') return res.status(403).json({ message: '仅管理员可访问' });
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24*60*60*1000);
    const weekAgo = new Date(now.getTime() - 7*24*60*60*1000);
    const monthAgo = new Date(now.getTime() - 30*24*60*60*1000);
    const [totalUsers, newUsers7d, logins7d, dau, wau, totalBio, publicBio] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ createdAt: { $gte: weekAgo } }),
      User.countDocuments({ lastLoginAt: { $gte: weekAgo } }),
      User.countDocuments({ lastLoginAt: { $gte: dayAgo } }),
      User.countDocuments({ lastLoginAt: { $gte: weekAgo } }),
      Note.countDocuments({ type: 'Biography' }),
      Note.countDocuments({ type: 'Biography', isPublic: true, cloudStatus: 'Uploaded' })
    ]);
    res.json({ totalUsers, newUsers7d, logins7d, dau, wau, totalBio, publicBio });
  } catch (err) {
    logger.error('Admin stats error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '获取统计失败：' + err.message });
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

// Create or revoke share token for a biography (no need to set isPublic)
app.post('/api/note/:id/share', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { action } = req.body || {}; // 'create' | 'revoke'
  if (!isValidObjectId(id)) return res.status(400).json({ message: '无效的笔记 ID' });
  try {
    const note = await Note.findOne({ _id: id, userId: req.user.userId, type: 'Biography' });
    if (!note) return res.status(404).json({ message: '传记不存在' });
    if (action === 'revoke') {
      note.shareToken = undefined;
      note.sharedAt = undefined;
      await note.save();
      return res.json({ id: note._id.toString(), shareToken: '' });
    }
    // create
    const token = crypto.randomBytes(12).toString('hex');
    note.shareToken = token;
    note.sharedAt = new Date();
    await note.save();
    return res.json({ id: note._id.toString(), shareToken: token });
  } catch (err) {
    logger.error('Share token error', { error: err.message, noteId: id, ip: req.ip });
    res.status(500).json({ message: '生成分享链接失败：' + err.message });
  }
});

// Public view by share token (HTML for easy social share preview)
app.get('/share/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const n = await Note.findOne({ shareToken: token, type: 'Biography' }).lean();
    if (!n) return res.status(404).send('Not found');
    const safeTitle = (n.title || '无标题').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeContent = (n.content || '').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;').split('\n').slice(0, 8).join('<br/>');
    const html = `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${safeTitle}</title></head><body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; background:#f7f7f7; padding:16px;"><div style="max-width:720px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:8px;padding:16px;"><h1 style="font-size:22px;margin:0 0 12px;">${safeTitle}</h1><div style="color:#444;line-height:1.7;">${safeContent}</div></div></body></html>`;
    res.status(200).send(html);
  } catch (err) {
    logger.error('Share view error', { error: err.message, token, ip: req.ip });
    res.status(500).send('Server error');
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
  const { title, content, isPublic, cloudStatus, type, sharedWithFamily, sections, contacts, retentionYears, eternalGuard } = req.body;
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
      contacts: Array.isArray(contacts) ? contacts.slice(0, 10) : [],
      retentionYears: Number.isFinite(retentionYears) ? Math.max(1, Math.min(50, retentionYears)) : 10,
      eternalGuard: !!eternalGuard,
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

// Memos: list
app.get('/api/memos', authenticateToken, async (req, res) => {
  try {
    const { subjectVersion } = req.query;
    const query = { userId: req.user.userId };
    if (subjectVersion && Number(subjectVersion)) query.subjectVersion = Number(subjectVersion);
    const memos = await Memo.find(query).sort({ timestamp: -1 }).lean();
    res.json(memos.map(m => ({
      id: m._id.toString(),
      text: m.text || '',
      tags: Array.isArray(m.tags) ? m.tags : [],
      media: Array.isArray(m.media) ? m.media : [],
      stage: m.stage || '',
      source: m.source || '',
      subjectVersion: m.subjectVersion || 1,
      timestamp: m.timestamp
    })));
  } catch (err) {
    logger.error('Get memos error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '获取随手记失败：' + err.message });
  }
});

// Memos: create
app.post('/api/memo', authenticateToken, async (req, res) => {
  try {
    const { text, tags, media, stage, source, subjectVersion, shareToFamily } = req.body || {};
    if (!text && !(Array.isArray(media) && media.length > 0)) {
      return res.status(400).json({ message: '缺少内容' });
    }
    const memo = await Memo.create({
      userId: req.user.userId,
      text: String(text || ''),
      tags: Array.isArray(tags) ? tags.slice(0, 12).map(String) : [],
      media: Array.isArray(media) ? media.slice(0, 20).map(m => ({
        type: m?.type || 'image', url: m?.url || '', desc: m?.desc || ''
      })) : [],
      stage: String(stage || ''),
      source: String(source || ''),
      subjectVersion: Number(subjectVersion) || 1,
      timestamp: new Date(),
      visibility: shareToFamily ? 'family' : 'private',
      updatedAt: new Date()
    });
    logger.info('Memo created', { userId: req.user.userId, memoId: memo._id, ip: req.ip });
    res.status(201).json({ id: memo._id.toString(), visibility: memo.visibility });
  } catch (err) {
    logger.error('Create memo error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '保存随手记失败：' + err.message });
  }
});

// Update memo visibility and sharing list (owner only)
app.put('/api/memo/:id/visibility', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: '无效的随手记 ID' });
    const { visibility, sharedWith } = req.body || {};
    const vis = (visibility || '').toString();
    if (!['private', 'family', 'public'].includes(vis)) return res.status(400).json({ message: '无效的可见性' });
    let list = [];
    if (Array.isArray(sharedWith)) {
      list = sharedWith.filter(v => isValidObjectId(v)).slice(0, 50);
    }
    const memo = await Memo.findOne({ _id: id, userId: req.user.userId });
    if (!memo) return res.status(404).json({ message: '随手记不存在' });
    memo.visibility = vis;
    memo.sharedWith = vis === 'family' ? list : [];
    memo.updatedAt = new Date();
    await memo.save();
    res.json({ id: memo._id.toString(), visibility: memo.visibility, sharedWith: memo.sharedWith.map(v => v.toString()) });
  } catch (err) {
    logger.error('Update memo visibility error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '更新可见性失败：' + err.message });
  }
});

// Family memos visible to current user
app.get('/api/family/memos', authenticateToken, async (req, res) => {
  try {
    // find family peers
    const pairs = await Family.find({ $or: [{ userAId: req.user.userId }, { userBId: req.user.userId }] }).lean();
    const peerIds = pairs.map(p => String(p.userAId) === String(req.user.userId) ? p.userBId : p.userAId);
    // memos by peers with visibility rules, and my own memos with visibility 'family'
    const myId = req.user.userId;
    const allowFromPeer = { userId: { $in: peerIds }, visibility: 'family', $or: [ { sharedWith: { $size: 0 } }, { sharedWith: { $in: [ myId ] } } ] };
    const myShared = { userId: myId, visibility: 'family' };
    const docs = await Memo.find({ $or: [ allowFromPeer, myShared ] }).sort({ timestamp: -1 }).lean();
    res.json(docs.map(m => ({
      id: m._id.toString(),
      userId: m.userId?.toString?.() || '',
      text: m.text || '',
      tags: Array.isArray(m.tags) ? m.tags : [],
      media: Array.isArray(m.media) ? m.media : [],
      timestamp: m.timestamp,
      visibility: m.visibility || 'private',
      sharedWith: (m.sharedWith || []).map(v => v.toString()),
    })));
  } catch (err) {
    logger.error('Get family memos error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '获取家族随手记失败：' + err.message });
  }
});

// Record Subject: get
app.get('/api/record-subject', authenticateToken, async (req, res) => {
  try {
    const doc = await RecordSubject.findOne({ userId: req.user.userId }).lean();
    if (!doc) return res.json({ mode: '', profile: {}, subjectVersion: 0 });
    res.json({
      mode: doc.mode,
      profile: doc.profile || {},
      subjectVersion: doc.subjectVersion || 1,
      updatedAt: doc.updatedAt
    });
  } catch (err) {
    logger.error('Get record-subject error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '获取记录对象失败：' + err.message });
  }
});

// Record Subject: set/update
app.post('/api/record-subject', authenticateToken, async (req, res) => {
  try {
    const { mode, profile, bumpVersion, reset } = req.body || {};
    if (!mode || !['self', 'other'].includes(mode)) return res.status(400).json({ message: 'mode 需要为 self/other' });
    const safeProfile = {
      name: String(profile?.name || ''),
      gender: String(profile?.gender || ''),
      birth: String(profile?.birth || ''),
      origin: String(profile?.origin || ''),
      residence: String(profile?.residence || ''),
      relation: String(profile?.relation || '')
    };
    const existing = await RecordSubject.findOne({ userId: req.user.userId });
    if (!existing) {
      const created = await RecordSubject.create({ userId: req.user.userId, mode, profile: safeProfile, subjectVersion: 1, updatedAt: new Date() });
      return res.status(201).json({ mode: created.mode, profile: created.profile, subjectVersion: created.subjectVersion, updatedAt: created.updatedAt });
    }
    let subjectVersion = existing.subjectVersion || 1;
    if (reset === true || bumpVersion === true) subjectVersion += 1;
    const updated = await RecordSubject.findOneAndUpdate(
      { userId: req.user.userId },
      { mode, profile: safeProfile, subjectVersion, updatedAt: new Date() },
      { new: true }
    );
    res.json({ mode: updated.mode, profile: updated.profile, subjectVersion: updated.subjectVersion, updatedAt: updated.updatedAt });
  } catch (err) {
    logger.error('Set record-subject error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '保存记录对象失败：' + err.message });
  }
});

// Record Subject: delete (reset)
app.delete('/api/record-subject', authenticateToken, async (req, res) => {
  try {
    await RecordSubject.deleteOne({ userId: req.user.userId });
    res.json({ message: '已重置记录对象' });
  } catch (err) {
    logger.error('Delete record-subject error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '重置记录对象失败：' + err.message });
  }
});

// Daily pool: get
app.get('/api/daily/pool', authenticateToken, async (req, res) => {
  try {
    const { stage } = req.query;
    if (!stage) return res.status(400).json({ message: '缺少 stage' });
    const pool = await DailyPool.findOne({ userId: req.user.userId, stage }).lean();
    const asked = await DailyAsked.findOne({ userId: req.user.userId, stage }).lean();
    res.json({ list: pool?.list || [], askedIds: asked?.askedIds || [] });
  } catch (err) {
    logger.error('Get daily pool error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '获取每日回首题库失败：' + err.message });
  }
});

// Daily pool: set/replace
app.post('/api/daily/pool', authenticateToken, async (req, res) => {
  try {
    const { stage, list } = req.body || {};
    if (!stage || !Array.isArray(list)) return res.status(400).json({ message: 'stage/list 参数不正确' });
    const limited = list.slice(0, 50).map(String);
    const updated = await DailyPool.findOneAndUpdate(
      { userId: req.user.userId, stage },
      { list: limited, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ list: updated.list });
  } catch (err) {
    logger.error('Set daily pool error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '保存每日回首题库失败：' + err.message });
  }
});

// Daily asked: append
app.post('/api/daily/asked', authenticateToken, async (req, res) => {
  try {
    const { stage, qid } = req.body || {};
    if (!stage || !qid) return res.status(400).json({ message: '缺少 stage 或 qid' });
    const updated = await DailyAsked.findOneAndUpdate(
      { userId: req.user.userId, stage },
      { $addToSet: { askedIds: String(qid) }, $set: { updatedAt: new Date() } },
      { upsert: true, new: true }
    );
    res.json({ askedIds: updated.askedIds });
  } catch (err) {
    logger.error('Append daily asked error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '记录每日回首问过内容失败：' + err.message });
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
  const { title, content, isPublic, cloudStatus, type, sharedWithFamily, sections, contacts, retentionYears, eternalGuard } = req.body;
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
      { title, content, sections: Array.isArray(sections) ? sections : [], isPublic, cloudStatus, type, sharedWithFamily: !!sharedWithFamily, contacts: Array.isArray(contacts) ? contacts.slice(0, 10) : [], retentionYears: Number.isFinite(retentionYears) ? Math.max(1, Math.min(50, retentionYears)) : 10, eternalGuard: !!eternalGuard, timestamp: new Date() },
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

// Create order for Eternal Guard (Hupijiao/XunhuPay unified order)
app.post('/api/pay/eternal-order', authenticateToken, async (req, res) => {
  try {
    const { noteId } = req.body || {};
    if (!isValidObjectId(noteId)) return res.status(400).json({ message: '无效的传记 ID' });
    const note = await Note.findOne({ _id: noteId, userId: req.user.userId, type: 'Biography' });
    if (!note) return res.status(404).json({ message: '传记不存在' });
    if (note.eternalGuard === true) {
      return res.status(409).json({ message: '已加入永恒计划，无需重复支付' });
    }

    const appid = process.env.XUNHU_APPID || '';
    const appsecret = process.env.XUNHU_SECRET || '';
    const gateway = process.env.XUNHU_GATEWAY || 'https://api.xunhupay.com/payment/do.html';
    if (!appid || !appsecret) return res.status(500).json({ message: '支付未配置：缺少 APPID/SECRET' });

    const out_trade_no = `${Date.now()}_${Math.floor(Math.random()*1e6)}`;
    const publicBackend = (process.env.PUBLIC_BACKEND || process.env.PUBLIC_BASE || '').replace(/\/$/,'');
    const publicFrontend = (process.env.PUBLIC_FRONTEND || process.env.PUBLIC_BASE || '').replace(/\/$/,'');
    const notify_url = publicBackend ? `${publicBackend}/api/pay/eternal-notify` : '';
    const return_url = publicFrontend ? `${publicFrontend}/preview` : '';
    // 金额以字符串提交，避免浮点精度问题
    const amount = (process.env.XUNHU_PRICE || '500');
    const name = `永恒守护-传记(${note.title || '无标题'})`;
    const param = {
      appid,
      version: '1.1',
      trade_order_id: out_trade_no,
      total_fee: amount,
      title: name,
      time: Math.floor(Date.now()/1000),
      notify_url,
      return_url,
      nonce_str: Math.random().toString(36).slice(2),
      type: 'WAP',
      // attach 可带上 noteId 用于回调识别
      attach: JSON.stringify({ noteId: note._id.toString(), userId: req.user.userId })
    };
    const signStr = Object.keys(param).sort().map(k => `${k}=${param[k]}`).join('&') + `&key=${appsecret}`;
    const sign = md5(signStr).toUpperCase();
    let payload = { ...param, sign };
    // Use form-encoded to improve compatibility with gateway
    const body = querystring.stringify(payload);
    const r = await axios.post(
      gateway,
      body,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json, text/plain, */*', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', 'Connection': 'close' }, timeout: 25000, httpsAgent }
    );
    if (r && r.data && (r.data.url || r.data.pay_url)) {
      return res.json({ payUrl: r.data.url || r.data.pay_url, orderId: out_trade_no });
    }
    return res.status(500).json({ message: r?.data?.errMsg || r?.data?.message || '下单失败' });
  } catch (err) {
    let detail = err?.message;
    try {
      if (err?.response) {
        detail = `status=${err.response.status} data=${typeof err.response.data === 'string' ? err.response.data.slice(0,200) : JSON.stringify(err.response.data).slice(0,200)}`;
      }
    } catch (_) {}
    logger.error('Create eternal order error', { error: detail, ip: req.ip });
    try {
      await PaymentFailure.create({ userId: req.user.userId, noteId: req.body?.noteId, message: String(detail || err.message || 'error') });
    } catch (_) {}
    try {
      // Fallback: let client submit a form directly to gateway
      return res.json({ clientPost: true, postUrl: process.env.XUNHU_GATEWAY || 'https://api.xunhupay.com/payment/do.html', fields: payload || {} });
    } catch (_) {
      return res.status(500).json({ message: '创建订单失败：' + err.message });
    }
  }
});

// Admin: list payment failures (requires admin)
app.get('/api/admin/payment-failures', authenticateToken, async (req, res) => {
  try {
    if ((req.user?.role || 'user') !== 'admin') return res.status(403).json({ message: '仅管理员可访问' });
    const items = await PaymentFailure.find({}).sort({ createdAt: -1 }).limit(200).populate('userId','username uid').populate('noteId','title').lean();
    res.json(items.map(i => ({
      id: i._id.toString(), user: { id: i.userId?._id?.toString?.() || '', username: i.userId?.username || '', uid: i.userId?.uid || '' },
      note: { id: i.noteId?._id?.toString?.() || '', title: i.noteId?.title || '' }, message: i.message, createdAt: i.createdAt,
    })));
  } catch (err) {
    logger.error('List payment failures error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '获取支付失败记录失败：' + err.message });
  }
});

// Payment notify (XunhuPay)
app.post('/api/pay/eternal-notify', async (req, res) => {
  try {
    const appsecret = process.env.XUNHU_SECRET || '';
    const data = req.body || {};
    // 验签
    const sign = data.sign;
    const copy = { ...data };
    delete copy.sign;
    const signStr = Object.keys(copy).sort().map(k => `${k}=${copy[k]}`).join('&') + `&key=${appsecret}`;
    const mySign = md5(signStr).toUpperCase();
    if (mySign !== sign) {
      logger.warn('Notify invalid sign', { ip: req.ip });
      return res.status(400).send('sign error');
    }
    // 业务处理
    const attach = JSON.parse(data.attach || '{}');
    const noteId = attach.noteId;
    if (isValidObjectId(noteId)) {
      await Note.updateOne({ _id: noteId }, { $set: { eternalGuard: true, retentionYears: 20 } });
    }
    // 返回纯文本 success 给网关
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send('success');
  } catch (err) {
    logger.error('Eternal notify error', { error: err.message, ip: req.ip });
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.status(500).send('error');
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