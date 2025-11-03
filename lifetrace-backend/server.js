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

// Serve Baidu verification file
app.get('/baidu_verify_codeva-t02Y7z0JWa.html', (req, res) => {
  res.type('text/html');
  res.send('4c23c167ea144daeeedc2dda3809c878');
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

// Time Capsule schema: 时光胶囊
const capsuleMediaSchema = new mongoose.Schema({
  type: { type: String, enum: ['image', 'video', 'audio'], required: true },
  url: { type: String, required: true },
  desc: { type: String, default: '' }
}, { _id: false });

const timeCapsuleSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipients: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
  title: { type: String, default: '' },
  content: { type: String, default: '' },
  media: { type: [capsuleMediaSchema], default: [] },
  scheduleAt: { type: Date, required: true },
  locked: { type: Boolean, default: true },
  delivered: { type: Boolean, default: false },
  deliveredAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
timeCapsuleSchema.index({ ownerId: 1, createdAt: -1 });
timeCapsuleSchema.index({ recipients: 1, scheduleAt: 1 });
timeCapsuleSchema.index({ delivered: 1, scheduleAt: 1 });
timeCapsuleSchema.pre('save', function(next) { this.updatedAt = new Date(); next(); });
const TimeCapsule = mongoose.model('TimeCapsule', timeCapsuleSchema);

// 访谈记录模型
const interviewRecordSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  noteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Note' }, // 关联的传记ID
  qaPairs: [{ 
    question: String, 
    answer: String 
  }],
  chatMessages: [{ 
    role: { type: String, enum: ['user', 'assistant'] }, 
    content: String 
  }],
  timestamp: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
const InterviewRecord = mongoose.model('InterviewRecord', interviewRecordSchema);

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

// Daily session schema: linear 10 Q per stage with QA history
const dailySessionQASchema = new mongoose.Schema({ q: String, a: { type: String, default: '' } }, { _id: false });
const dailySessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  stageIndex: { type: Number, required: true },
  qas: { type: [dailySessionQASchema], default: [] },
  currentIndex: { type: Number, default: 0 },
  completed: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now }
});
dailySessionSchema.index({ userId: 1, stageIndex: 1 }, { unique: true });
const DailySession = mongoose.model('DailySession', dailySessionSchema);

// Validate ObjectId
const isValidObjectId = (id) => mongoose.isValidObjectId(id);
// Warm-question filter to avoid abstract/awkward prompts
const isWarmQuestion = (q) => {
  try {
    const s = (q || '').toString().trim();
    if (!s) return false;
    const banned = ['力量', '意义', '内核', '本质', '价值观', '如何看待', '稳定的力量', '精神内核'];
    return !banned.some(k => s.includes(k)) && /[？?]$/.test(s);
  } catch (_) { return false; }
};

// Generate one warm question for a stage with relationship perspective
async function generateWarmStageQuestion(userId, stageIndex, qas) {
  const user = await User.findById(userId).lean();
  const subject = await RecordSubject.findOne({ userId }).lean();
  const mode = subject?.mode || (subject?.profile?.relation ? 'other' : 'self');
  const relation = subject?.profile?.relation || '';
  const profileHints = [subject?.profile?.name, subject?.profile?.gender, subject?.profile?.birth, subject?.profile?.origin, subject?.profile?.residence, relation].filter(Boolean).join('、');
  const lifeStagesArr = ['童年','少年','青年','成年','中年','当下','未来愿望'];
  const stage = lifeStagesArr[stageIndex] || '童年';
  const perspective = mode === 'other'
    ? `采用“关系视角”并使用第二人称“你”与写作者对话：问题聚焦“你与${relation || '这位亲人'}”的互动细节与影响（而非对方的自述）；`
    : '以第二人称与当事人对话；';
  const historyText = (Array.isArray(qas) ? qas : []).map((p,i)=>`Q${i+1}：${p.q}\nA${i+1}：${(p.a||'').toString().slice(0,300)}`).join('\n');
  const lastAnswer = Array.isArray(qas) && qas.length > 0 ? (qas[qas.length - 1].a || '') : '';
  const system = `你是一位温暖、耐心、尊重边界的情感访谈引导者。${perspective}当前阶段：“${stage}”。
目标：提出下一问前，先给出1-2句真诚、具体的共情反馈，再给出一个具象、给写作者温暖回忆的下一问。
硬性要求：
- 共情反馈需引用可感知的细节（声音/气味/动作/表情/氛围等），避免空泛词（如“意义/力量/内核”等）。
- 下一问必须具体、可回忆，指向人物与场景；仅一句中文且以问号结尾；不编号、不加前后缀。
输出格式：
第一行：简短共情反馈（1-2句）。
第二行：仅一行问题句（以问号结尾）。`;
  const userMsg = `若有历史问答，请延续上下文，不要重复：\n${historyText || '（无历史）'}\n上一轮回答摘要：${(lastAnswer || '（无）').toString().slice(0,200)}\n资料参考：${profileHints || '无'}\n请按“输出格式”生成。`;
  try {
    const resp = await axios.post(
      'https://spark-api-open.xf-yun.com/v2/chat/completions',
      { model: 'x1', messages: [ { role: 'system', content: system }, { role: 'user', content: userMsg } ], max_tokens: 200, temperature: 0.7 },
      { headers: { Authorization: `Bearer ${process.env.SPARK_API_PASSWORD}`, 'Content-Type': 'application/json' }, httpsAgent }
    );
    let text = (resp.data?.choices?.[0]?.message?.content || '').toString().trim();
    // 清洗编号、确保两行输出
    text = text.replace(/^\d+[\.、\)]\s*/gm, '').trim();
    let lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
    if (lines.length === 1) {
      // 缺少反馈行时，自动补一行反馈
      const qline = lines[0];
      const fb = lastAnswer ? '你刚刚提到的那一幕很动人，我能感到当时的呼吸与安静。' : '我们先从一个不着急的小片段开始，好吗？';
      lines = [fb, qline];
    }
    const combined = lines.slice(0,2).join('\n');
    // 校验问题行是否合规，若不合规则兜底
    const qOnly = lines[1] || '';
    if (!isWarmQuestion(qOnly)) {
      const fb = lastAnswer ? '我能从你的描述里听见那种稳稳的安定感。' : '别急，我们慢慢来。';
      const fallbacks = {
        0: `${fb}\n在你小的时候，有没有一次被他（她）悄悄照顾的瞬间？`,
        1: `${fb}\n读书那几年，你和谁一起在走廊里笑到停不下来？`,
        2: `${fb}\n青年时期，有一晚你们在街角停下脚步谈了很久吗？`,
        3: `${fb}\n工作或家庭里，谁的一句轻声安慰让你释怀？`,
        4: `${fb}\n这些年里，有没有一顿饭让你突然觉得心安？`,
        5: `${fb}\n今天哪一刻让你意识到被认真地在乎着？`,
        6: `${fb}\n想起未来时，你最想与谁共享一杯热汤？`,
      };
      return fallbacks[stageIndex] || `${fb}\n能回想一个让你变得柔软的瞬间吗？`;
    }
    return combined;
  } catch (err) {
    logger.error('generateWarmStageQuestion error', { error: err.message, userId, stageIndex });
    const fb = '我们先从一件不着急的小事开始。';
    return `${fb}\n能回想一个让你变得柔软的瞬间吗？`;
  }
}

// Daily session: get or create and return current question
app.get('/api/daily/session', authenticateToken, async (req, res) => {
  try {
    const stageIndex = Number(req.query.stage);
    if (!Number.isFinite(stageIndex) || stageIndex < 0 || stageIndex > 6) return res.status(400).json({ message: '无效的阶段' });
    let sess = await DailySession.findOne({ userId: req.user.userId, stageIndex });
    if (!sess) {
      sess = await DailySession.create({ userId: req.user.userId, stageIndex, qas: [], currentIndex: 0, completed: false, updatedAt: new Date() });
    }
    if (sess.completed) {
      return res.json({ stageIndex, currentIndex: 10, total: 10, completed: true, question: '' });
    }
    // Ensure current question exists
    if (sess.qas.length <= sess.currentIndex) {
      const q = await generateWarmStageQuestion(req.user.userId, stageIndex, sess.qas);
      sess.qas.push({ q, a: '' });
      sess.updatedAt = new Date();
      await sess.save();
    }
    const curr = sess.qas[sess.currentIndex] || { q: '' };
    res.json({ stageIndex, currentIndex: sess.currentIndex, total: 10, completed: false, question: curr.q });
  } catch (err) {
    logger.error('daily session get error', { error: err.message, userId: req.user.userId });
    res.status(500).json({ message: '获取每日回首会话失败：' + err.message });
  }
});

// Daily session: submit answer and advance
app.post('/api/daily/session/answer', authenticateToken, async (req, res) => {
  try {
    const { stage, answer } = req.body || {};
    const stageIndex = Number(stage);
    if (!Number.isFinite(stageIndex) || stageIndex < 0 || stageIndex > 6) return res.status(400).json({ message: '无效的阶段' });
    let sess = await DailySession.findOne({ userId: req.user.userId, stageIndex });
    if (!sess) return res.status(404).json({ message: '会话不存在，请先获取当前问题' });
    if (sess.completed) return res.json({ stageIndex, currentIndex: 10, total: 10, completed: true, question: '' });
    const idx = sess.currentIndex;
    if (!sess.qas[idx]) return res.status(400).json({ message: '无当前问题' });
    sess.qas[idx].a = String(answer || '（未填写）');
    sess.currentIndex = idx + 1;
    // If finished 10, mark completed
    if (sess.currentIndex >= 10) {
      sess.completed = true;
      sess.updatedAt = new Date();
      await sess.save();
      return res.json({ stageIndex, currentIndex: 10, total: 10, completed: true, question: '' });
    }
    // Otherwise, generate next question
    const q = await generateWarmStageQuestion(req.user.userId, stageIndex, sess.qas);
    sess.qas.push({ q, a: '' });
    sess.updatedAt = new Date();
    await sess.save();
    res.json({ stageIndex, currentIndex: sess.currentIndex, total: 10, completed: false, question: q });
  } catch (err) {
    logger.error('daily session answer error', { error: err.message, userId: req.user.userId });
    res.status(500).json({ message: '提交答案失败：' + err.message });
  }
});

// Daily session: move to next stage after completion; if last stage done, loop and indicate suggest
app.post('/api/daily/session/next', authenticateToken, async (req, res) => {
  try {
    const { stage } = req.body || {};
    const stageIndex = Number(stage);
    if (!Number.isFinite(stageIndex) || stageIndex < 0 || stageIndex > 6) return res.status(400).json({ message: '无效的阶段' });
    const lifeStagesArr = ['童年','少年','青年','成年','中年','当下','未来愿望'];
    const last = stageIndex >= lifeStagesArr.length - 1;
    const nextStageIndex = last ? 0 : (stageIndex + 1);
    // Optionally clear previous session to avoid growth
    await DailySession.deleteOne({ userId: req.user.userId, stageIndex });
    // Create/reset next session starter (question will be generated on GET)
    await DailySession.updateOne(
      { userId: req.user.userId, stageIndex: nextStageIndex },
      { $setOnInsert: { qas: [], currentIndex: 0, completed: false, updatedAt: new Date() } },
      { upsert: true }
    );
    res.json({ nextStageIndex, suggestGenerate: last });
  } catch (err) {
    logger.error('daily session next error', { error: err.message, userId: req.user.userId });
    res.status(500).json({ message: '切换阶段失败：' + err.message });
  }
});


// JWT authentication middleware (function declaration to allow hoisting)
function authenticateToken(req, res, next) {
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
}

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

// Time Capsules: create
app.post('/api/capsules', authenticateToken, async (req, res) => {
  try {
    const { title, content, media, recipientIds, scheduleAt } = req.body || {};
    const safeTitle = String(title || '').slice(0, 200);
    const safeContent = String(content || '');
    if (!safeContent && !(Array.isArray(media) && media.length > 0)) {
      return res.status(400).json({ message: '请填写内容或添加媒体' });
    }
    if (!scheduleAt) return res.status(400).json({ message: '缺少发送时间' });
    const when = new Date(scheduleAt);
    if (isNaN(when.getTime())) return res.status(400).json({ message: '无效的发送时间' });
    const now = new Date();
    if (when.getTime() < now.getTime() + 60 * 1000) {
      return res.status(400).json({ message: '发送时间需至少比当前时间晚 1 分钟' });
    }
    if (containsIllegalContent(safeTitle) || containsIllegalContent(safeContent)) {
      return res.status(400).json({ message: '内容包含不合规信息，请修改后再提交' });
    }
    // Validate recipients are family if provided
    let recips = Array.isArray(recipientIds) ? recipientIds.filter(id => isValidObjectId(id)) : [];
    if (recips.length > 0) {
      // ensure every recipient is in family with owner
      const rels = await Family.find({ $or: [
        { userAId: req.user.userId, userBId: { $in: recips } },
        { userAId: { $in: recips }, userBId: req.user.userId },
      ]}).lean();
      const okSet = new Set();
      for (const r of rels) {
        okSet.add(String(r.userAId) === String(req.user.userId) ? String(r.userBId) : String(r.userAId));
      }
      const allOk = recips.every(id => okSet.has(String(id)));
      if (!allOk) return res.status(403).json({ message: '仅可发送给已互认的家人（通过UID添加）' });
    }
    const mediaArr = Array.isArray(media) ? media.slice(0, 30).map(m => ({
      type: (m?.type || 'image'), url: String(m?.url || ''), desc: String(m?.desc || '')
    })) : [];
    const doc = await TimeCapsule.create({
      ownerId: req.user.userId,
      recipients: recips,
      title: safeTitle,
      content: safeContent,
      media: mediaArr,
      scheduleAt: when,
      locked: true,
      delivered: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    logger.info('Time capsule created', { userId: req.user.userId, capsuleId: doc._id });
    res.status(201).json({ id: doc._id.toString() });
  } catch (err) {
    logger.error('Create capsule error', { error: err.message, userId: req.user.userId });
    res.status(500).json({ message: '创建时光胶囊失败：' + err.message });
  }
});

// Time Capsules: list (sent or received)
app.get('/api/capsules', authenticateToken, async (req, res) => {
  try {
    const box = (req.query.box || 'sent').toString();
    const now = new Date();
    if (box === 'received') {
      const items = await TimeCapsule.find({ recipients: req.user.userId }).sort({ scheduleAt: -1 }).lean();
      const result = items.map(c => ({
        id: c._id.toString(),
        ownerId: c.ownerId?.toString?.() || '',
        title: c.title,
        scheduleAt: c.scheduleAt,
        delivered: c.delivered,
        deliveredAt: c.deliveredAt,
        isLocked: now < c.scheduleAt && !c.delivered,
        // 内容在锁定前不可见
        content: (now >= c.scheduleAt || c.delivered) ? (c.content || '') : '',
        media: (now >= c.scheduleAt || c.delivered) ? (c.media || []) : []
      }));
      return res.json(result);
    }
    // sent
    const items = await TimeCapsule.find({ ownerId: req.user.userId }).sort({ createdAt: -1 }).lean();
    const result = items.map(c => ({
      id: c._id.toString(),
      recipients: (c.recipients || []).map(r => r.toString()),
      title: c.title,
      scheduleAt: c.scheduleAt,
      delivered: c.delivered,
      deliveredAt: c.deliveredAt,
      locked: c.locked,
      createdAt: c.createdAt
    }));
    return res.json(result);
  } catch (err) {
    logger.error('List capsules error', { error: err.message, userId: req.user.userId });
    res.status(500).json({ message: '获取时光胶囊失败：' + err.message });
  }
});

// Time Capsules: detail (owner or recipient). Mask content if locked for recipient
app.get('/api/capsule/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: '无效的胶囊ID' });
    const c = await TimeCapsule.findById(id).lean();
    if (!c) return res.status(404).json({ message: '时光胶囊不存在' });
    const isOwner = String(c.ownerId) === String(req.user.userId);
    const isRecipient = (c.recipients || []).some(r => String(r) === String(req.user.userId));
    if (!isOwner && !isRecipient) return res.status(403).json({ message: '无权访问该时光胶囊' });
    const now = new Date();
    const lockedForRecipient = !isOwner && (now < c.scheduleAt && !c.delivered);
    res.json({
      id: c._id.toString(),
      ownerId: c.ownerId?.toString?.() || '',
      recipients: (c.recipients || []).map(r => r.toString()),
      title: c.title,
      content: lockedForRecipient ? '' : (c.content || ''),
      media: lockedForRecipient ? [] : (c.media || []),
      scheduleAt: c.scheduleAt,
      delivered: c.delivered,
      deliveredAt: c.deliveredAt,
      locked: c.locked,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      isLocked: lockedForRecipient
    });
  } catch (err) {
    logger.error('Get capsule detail error', { error: err.message, userId: req.user.userId, capsuleId: req.params.id });
    res.status(500).json({ message: '获取时光胶囊失败：' + err.message });
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
  if (containsIllegalContent(title) || containsIllegalContent(content)) {
    return res.status(400).json({ message: '内容包含不合规信息，请修改后再提交' });
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
      timestamp: m.timestamp,
      visibility: m.visibility || 'private',
      sharedWith: Array.isArray(m.sharedWith) ? m.sharedWith.map(v => v.toString()) : []
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
    if (containsIllegalContent(text)) {
      return res.status(400).json({ message: '内容包含不合规信息，请修改后再提交' });
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

// Delete memo (owner only)
app.delete('/api/memo/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: '无效的随手记 ID' });
    const memo = await Memo.findOne({ _id: id, userId: req.user.userId });
    if (!memo) return res.status(404).json({ message: '随手记不存在' });
    await Memo.deleteOne({ _id: id, userId: req.user.userId });
    return res.json({ message: '已删除' });
  } catch (err) {
    logger.error('Delete memo error', { error: err.message, ip: req.ip });
    res.status(500).json({ message: '删除随手记失败：' + err.message });
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
  if (containsIllegalContent(title) || containsIllegalContent(content)) {
    return res.status(400).json({ message: '内容包含不合规信息，请修改后再提交' });
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
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB per China-friendly default; larger files not supported
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

// Simple content moderation (keyword-based). This is a basic safeguard and should be
// replaced with a more robust service if needed.
const ILLEGAL_KEYWORDS = [
  '涉黄','淫秽','色情','招嫖','卖淫','迷奸','强奸','儿童色情','未成年性',
  '恐怖','暴恐','极端主义','恐袭','自杀教程','自残',
  '爆炸物','炸弹制作','枪支','弹药','军火','毒品','制毒',
  '赌博','博彩','私彩','六合彩',
  '诈骗','钓鱼网站','黑客教程','木马',
  '分裂国家','颠覆国家政权','煽动叛乱','邪教',
];
const containsIllegalContent = (text = '') => {
  try {
    const s = String(text || '').toLowerCase();
    return ILLEGAL_KEYWORDS.some(k => s.includes(String(k).toLowerCase()));
  } catch(_) { return false; }
};


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

// 保存访谈记录
app.post('/api/interview/save', authenticateToken, async (req, res) => {
  try {
    const { noteId, qaPairs, chatMessages } = req.body;
    if (!qaPairs || !Array.isArray(qaPairs)) {
      return res.status(400).json({ message: '问答对格式错误' });
    }
    
    const interviewRecord = new InterviewRecord({
      userId: req.user.userId,
      noteId: noteId || null,
      qaPairs: qaPairs.map(p => ({
        question: p.q || p.question || '',
        answer: p.a || p.answer || ''
      })),
      chatMessages: chatMessages || [],
      timestamp: new Date(),
      updatedAt: new Date()
    });
    
    await interviewRecord.save();
    logger.info('Interview record saved', { userId: req.user.userId, recordId: interviewRecord._id });
    res.json({ success: true, recordId: interviewRecord._id });
  } catch (err) {
    logger.error('Save interview record error', { error: err.message, userId: req.user.userId });
    res.status(500).json({ message: '保存访谈记录失败：' + err.message });
  }
});

// 根据访谈记录生成文章
app.post('/api/interview/generate', authenticateToken, aiLimiter, async (req, res) => {
  try {
    const { recordId, qaPairs, chapterIndex, selectedThemes } = req.body;
    
    if (!recordId && (!qaPairs || !Array.isArray(qaPairs) || qaPairs.length === 0)) {
      return res.status(400).json({ message: '请提供访谈记录ID或问答对' });
    }
    
    let qaText = '';
    if (recordId) {
      const record = await InterviewRecord.findOne({ _id: recordId, userId: req.user.userId });
      if (!record) {
        return res.status(404).json({ message: '访谈记录不存在' });
      }
      qaText = record.qaPairs.map((p, i) => `Q${i + 1}：${p.question}\nA${i + 1}：${p.answer}`).join('\n');
    } else {
      qaText = qaPairs.map((p, i) => `Q${i + 1}：${p.q || p.question}\nA${i + 1}：${p.a || p.answer}`).join('\n');
    }
    
    // 第一阶段：提取事实清单
    const stage1System = `你是一位严谨的事实提取专家。请从问答对话中提取用户回答里的事实信息。

关键规则：
1. **以主要问答对为准**，提取用户（"我"/"A"）的回答内容，完全忽略陪伴师/提问者的问题
2. 只提取明确提到的事实，不做任何推断或补充
3. 将用户的回答转换为第三人称客观事实陈述
4. 保留所有具体细节：人名、地点、时间、事件、对话、数字等
5. 按时间顺序或逻辑顺序组织
6. 用简洁的陈述句表达，每个事实一行
7. 输出格式为JSON对象：{"facts": ["事实1", "事实2", ...]}`;

    const stage1User = `【主要问答对】\n${qaText}\n\n请以主要问答对为准，提取用户回答中的事实，仅输出JSON格式的事实清单。`;
    
    const resp1 = await axios.post(
      'https://spark-api-open.xf-yun.com/v2/chat/completions',
      {
        model: 'x1',
        messages: [
          { role: 'system', content: stage1System },
          { role: 'user', content: stage1User }
        ],
        max_tokens: 1500,
        temperature: 0.2
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.SPARK_API_PASSWORD}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const raw1 = (resp1.data?.choices?.[0]?.message?.content || '').toString().trim();
    let factsList = [];
    try {
      const parsed = JSON.parse(raw1);
      if (Array.isArray(parsed.facts)) {
        factsList = parsed.facts;
      }
    } catch (_) {
      const start = raw1.indexOf('{');
      const end = raw1.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        try {
          const parsed = JSON.parse(raw1.slice(start, end + 1));
          if (Array.isArray(parsed.facts)) {
            factsList = parsed.facts;
          }
        } catch (_) {}
      }
    }
    
    if (factsList.length === 0) {
      return res.status(400).json({ message: '无法提取事实清单' });
    }
    
    // 第二阶段：根据事实清单生成文章
    const themeGuide = selectedThemes && selectedThemes.length > 0
      ? `\n\n本段重点主题/事件：${selectedThemes.join('、')}。请围绕这些主题或事件组织叙事，但要自然融入，不要生硬堆砌。`
      : '';
    
    const stage2System = `你是一位严谨的传记作家。请根据提供的事实清单，写一段第一人称的自传段落。

【核心要求】
1. 输出纯粹的第一人称叙述，完全去除问答痕迹
2. 不要出现"陪伴师""提问""回答""继而""随后询问"等字眼
3. 直接用"我"的视角自然叙述，就像在讲述自己的故事

【严格事实约束】
4. 只能根据事实清单中的内容生成，不得推测、想象、扩展或补全
5. 不得添加任何事实清单中没有的内容、细节、场景或情节
6. 若信息不足，可保持空白或使用'……'表示，不得自行编造
7. 严格依据问答记录中的事实，禁止任何形式的脑补或推断

【生成长度】
8. 根据问答内容的丰富程度和需要，自动决定生成长度
9. 如果问答内容丰富详细，可以生成较长的段落；如果内容简单，则生成简洁的段落
10. 不要为了凑字数而重复或扩展内容，也不要因为内容少而强行缩短
11. 以自然、流畅、完整地表达事实清单中的所有内容为准

【叙事重构】
12. 保留事实内容，但用场景化语言重构叙事
13. 将段落聚焦于一个核心情绪或主题
14. 避免简单的时间顺序罗列，改用情感主线或主题线索串联事件
15. 通过场景重现、细节刻画来展现情绪，但仅限于事实清单中的细节

【输出规范】
仅输出第一人称叙述段落，不要标题、编号、总结、过渡语${themeGuide}`;

    const factsText = factsList.map((f, i) => `${i + 1}. ${f}`).join('\n');
    const stage2User = `事实清单（主要内容）：\n${factsText}\n\n请基于以上事实清单，写一段自然流畅的第一人称自传段落。

【严格约束】
✗ 只能根据以上事实清单生成内容，不得推测、想象、扩展或补全
✗ 不得添加任何事实清单中没有的内容、细节、场景、对话或情节
✗ 若某个部分信息不足，使用'……'表示，不得自行编造
✗ 严格依据问答记录中的事实，禁止任何形式的脑补、推断或想象

【生成长度】
✓ 根据事实清单的内容丰富程度，自动决定合适的长度
✓ 如果事实清单内容丰富详细，可以生成较长的段落；如果内容简单，则生成简洁的段落
✓ 以完整、自然地表达所有事实内容为准，不要为了凑字数而重复或扩展
✓ 也不要因为内容少而强行缩短，保持自然流畅的表达`;
    
    const resp2 = await axios.post(
      'https://spark-api-open.xf-yun.com/v2/chat/completions',
      {
        model: 'x1',
        messages: [
          { role: 'system', content: stage2System },
          { role: 'user', content: stage2User }
        ],
        max_tokens: 8000, // 设置较大的上限，AI根据问答内容自动决定实际生成长度
        temperature: 0.4
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.SPARK_API_PASSWORD}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const generatedText = (resp2.data?.choices?.[0]?.message?.content || '').toString().trim();
    
    logger.info('Article generated from interview', { userId: req.user.userId, recordId });
    res.json({ success: true, text: generatedText, factsList });
  } catch (err) {
    logger.error('Generate article from interview error', { error: err.message, userId: req.user.userId });
    res.status(500).json({ message: '生成文章失败：' + (err.response?.data?.message || err.message) });
  }
});

// 验证生成内容是否与访谈记录相符
app.post('/api/interview/verify', authenticateToken, aiLimiter, async (req, res) => {
  try {
    const { recordId, qaPairs, generatedText } = req.body;
    
    if (!generatedText) {
      return res.status(400).json({ message: '请提供生成的内容' });
    }
    
    let qaText = '';
    if (recordId) {
      const record = await InterviewRecord.findOne({ _id: recordId, userId: req.user.userId });
      if (!record) {
        return res.status(404).json({ message: '访谈记录不存在' });
      }
      qaText = record.qaPairs.map((p, i) => `Q${i + 1}：${p.question}\nA${i + 1}：${p.answer}`).join('\n');
    } else if (qaPairs && Array.isArray(qaPairs)) {
      qaText = qaPairs.map((p, i) => `Q${i + 1}：${p.q || p.question}\nA${i + 1}：${p.a || p.answer}`).join('\n');
    } else {
      return res.status(400).json({ message: '请提供访谈记录ID或问答对' });
    }
    
    const verifySystem = `你是一位严谨的内容审核专家。请检查生成的文章内容是否与访谈记录相符。

【检查规则】
1. 生成的文章内容必须严格依据访谈记录中的问答对
2. 不得包含访谈记录中没有的事实、细节、场景或情节
3. 如果发现生成内容中有访谈记录中没有的信息，指出具体位置
4. 如果内容符合访谈记录，返回验证通过
5. 如果不符合，提供优化建议，确保严格依据事实`;

    const verifyUser = `【访谈记录】
${qaText}

【生成的文章内容】
${generatedText}

请检查生成的文章内容是否与访谈记录相符。如果发现不符合的地方，请指出并提供优化后的内容。`;
    
    const resp = await axios.post(
      'https://spark-api-open.xf-yun.com/v2/chat/completions',
      {
        model: 'x1',
        messages: [
          { role: 'system', content: verifySystem },
          { role: 'user', content: verifyUser }
        ],
        max_tokens: 2000,
        temperature: 0.3
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.SPARK_API_PASSWORD}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const verification = (resp.data?.choices?.[0]?.message?.content || '').toString().trim();
    const isValid = !verification.toLowerCase().includes('不符合') && !verification.toLowerCase().includes('错误');
    
    logger.info('Content verified', { userId: req.user.userId, recordId, isValid });
    res.json({ success: true, isValid, verification, optimizedText: isValid ? null : verification });
  } catch (err) {
    logger.error('Verify content error', { error: err.message, userId: req.user.userId });
    res.status(500).json({ message: '验证失败：' + (err.response?.data?.message || err.message) });
  }
});

// 获取用户的访谈记录列表
app.get('/api/interviews', authenticateToken, async (req, res) => {
  try {
    const interviews = await InterviewRecord.find({ userId: req.user.userId })
      .sort({ timestamp: -1 })
      .populate('noteId', 'title')
      .lean();
    
    const formatted = interviews.map(record => ({
      id: record._id.toString(),
      noteId: record.noteId ? (typeof record.noteId === 'object' ? record.noteId._id.toString() : record.noteId.toString()) : null,
      noteTitle: record.noteId && typeof record.noteId === 'object' ? record.noteId.title : null,
      qaPairs: record.qaPairs || [],
      chatMessages: record.chatMessages || [],
      timestamp: record.timestamp,
      updatedAt: record.updatedAt,
      qaCount: record.qaPairs ? record.qaPairs.length : 0
    }));
    
    logger.info('Interviews retrieved', { userId: req.user.userId, count: formatted.length });
    res.json(formatted);
  } catch (err) {
    logger.error('Get interviews error', { error: err.message, userId: req.user.userId });
    res.status(500).json({ message: '获取访谈记录失败：' + err.message });
  }
});

// 获取单个访谈记录详情
app.get('/api/interview/:id', authenticateToken, async (req, res) => {
  try {
    const record = await InterviewRecord.findOne({ 
      _id: req.params.id, 
      userId: req.user.userId 
    }).populate('noteId', 'title').lean();
    
    if (!record) {
      return res.status(404).json({ message: '访谈记录不存在' });
    }
    
    res.json({
      id: record._id.toString(),
      noteId: record.noteId ? (typeof record.noteId === 'object' ? record.noteId._id.toString() : record.noteId.toString()) : null,
      noteTitle: record.noteId && typeof record.noteId === 'object' ? record.noteId.title : null,
      qaPairs: record.qaPairs || [],
      chatMessages: record.chatMessages || [],
      timestamp: record.timestamp,
      updatedAt: record.updatedAt
    });
  } catch (err) {
    logger.error('Get interview detail error', { error: err.message, interviewId: req.params.id });
    res.status(500).json({ message: '获取访谈记录详情失败：' + err.message });
  }
});

// 将访谈记录上传到家族树（通过关联的传记）
app.post('/api/interview/:id/share-to-family', authenticateToken, async (req, res) => {
  try {
    const record = await InterviewRecord.findOne({ 
      _id: req.params.id, 
      userId: req.user.userId 
    });
    
    if (!record) {
      return res.status(404).json({ message: '访谈记录不存在' });
    }
    
    // 如果有关联的传记，将传记分享到家族
    if (record.noteId) {
      const note = await Note.findById(record.noteId);
      if (note && note.userId.toString() === req.user.userId.toString()) {
        note.sharedWithFamily = true;
        await note.save();
        logger.info('Interview shared to family via note', { userId: req.user.userId, interviewId: record._id, noteId: note._id });
        return res.json({ success: true, message: '已上传到家族树' });
      }
    }
    
    // 如果没有关联传记，返回提示
    res.status(400).json({ message: '该访谈记录未关联传记，无法上传到家族树。请先将访谈记录用于生成传记。' });
  } catch (err) {
    logger.error('Share interview to family error', { error: err.message, interviewId: req.params.id });
    res.status(500).json({ message: '上传到家族树失败：' + err.message });
  }
});

// 更新访谈记录（关联到传记）
app.put('/api/interview/:id', authenticateToken, async (req, res) => {
  try {
    const { noteId } = req.body;
    const record = await InterviewRecord.findOne({ 
      _id: req.params.id, 
      userId: req.user.userId 
    });
    
    if (!record) {
      return res.status(404).json({ message: '访谈记录不存在' });
    }
    
    if (noteId) {
      record.noteId = noteId;
    }
    record.updatedAt = new Date();
    await record.save();
    
    logger.info('Interview updated', { userId: req.user.userId, interviewId: req.params.id, noteId });
    res.json({ success: true, message: '访谈记录已更新' });
  } catch (err) {
    logger.error('Update interview error', { error: err.message, interviewId: req.params.id });
    res.status(500).json({ message: '更新访谈记录失败：' + err.message });
  }
});

// 删除访谈记录
app.delete('/api/interview/:id', authenticateToken, async (req, res) => {
  try {
    const record = await InterviewRecord.findOne({ 
      _id: req.params.id, 
      userId: req.user.userId 
    });
    
    if (!record) {
      return res.status(404).json({ message: '访谈记录不存在' });
    }
    
    await InterviewRecord.deleteOne({ _id: req.params.id });
    logger.info('Interview deleted', { userId: req.user.userId, interviewId: req.params.id });
    res.json({ success: true, message: '访谈记录已删除' });
  } catch (err) {
    logger.error('Delete interview error', { error: err.message, interviewId: req.params.id });
    res.status(500).json({ message: '删除访谈记录失败：' + err.message });
  }
});

// (payment endpoints removed)
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

// Time Capsule scheduler: every minute deliver due capsules
setInterval(async () => {
  try {
    const now = new Date();
    const due = await TimeCapsule.find({ delivered: false, scheduleAt: { $lte: now } }).limit(50);
    if (due.length === 0) return;
    for (const c of due) {
      c.delivered = true;
      c.deliveredAt = now;
      c.locked = false;
      await c.save();
      logger.info('Time capsule delivered', { capsuleId: c._id, ownerId: c.ownerId, recipients: (c.recipients || []).map(r=>r.toString()) });
      // Optional: notify via websocket broadcast (basic)
      try {
        const payload = { type: 'capsule_delivered', capsuleId: c._id.toString(), scheduleAt: c.scheduleAt, deliveredAt: c.deliveredAt };
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(payload));
          }
        });
      } catch(_) {}
    }
  } catch (err) {
    logger.error('Capsule scheduler error', { error: err.message });
  }
}, 60 * 1000);