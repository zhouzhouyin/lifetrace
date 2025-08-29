import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { AppContext } from '../context/AppContext';
import axios from 'axios';

const Home = () => {
  const { isLoggedIn, t, lang, role, setIsLoggedIn, memos: memosCtx, setMemos: setMemosCtx } = useContext(AppContext);
  const navigate = useNavigate();
  // 每日回首：改为手动触发
  const [showDailyCard, setShowDailyCard] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [currentQuestionId, setCurrentQuestionId] = useState(0);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [saveToMemoChecked, setSaveToMemoChecked] = useState(true);
  const [isLoadingQ, setIsLoadingQ] = useState(false);
  const lastShownRef = useRef('');
  const lifeStages = ['童年','少年','青年','成年','中年','当下','未来愿望'];
  // 生成回忆建议
  const [showSuggestCard, setShowSuggestCard] = useState(false);
  const [stageStats, setStageStats] = useState({});
  const STAGE_THRESHOLD = 5;
  const snoozeUntilRef = useRef('');
  const [memosHome, setMemosHome] = useState([]);
  // 题库版本：当提示词策略升级时，强制刷新本地池与历史
  const POOL_VERSION = '3';
  // 首次强制选择记录对象
  const [needAuthorSelect, setNeedAuthorSelect] = useState(() => {
    try { return !(localStorage.getItem('author_mode')); } catch (_) { return true; }
  });
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [profile, setProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem('record_profile') || '{}'); } catch(_) { return {}; }
  });

  const isProfileComplete = (mode, p) => {
    const baseOk = !!(p && p.name && p.gender && p.birth && p.origin && p.residence);
    if (!baseOk) return false;
    if ((mode || localStorage.getItem('author_mode')) === 'other') {
      return !!(p && (p.relation || '').trim());
    }
    return true;
  };

  

  // 确保每阶段存在5题的池（带全局编号），并按历史ID去重
  const ensureStagePool = async (idx) => {
    // 版本校验：若版本变更，清理旧池与历史
    try {
      const ver = localStorage.getItem('daily_pool_version');
      if (ver !== POOL_VERSION) {
        localStorage.removeItem('daily_pool_v2');
        localStorage.removeItem('daily_history_ids_v2');
        localStorage.setItem('daily_pool_version', POOL_VERSION);
      }
    } catch (_) {}

    const isWarmQuestion = (q) => {
      const s = (q || '').toString().trim();
      if (!s) return false;
      // 拒绝抽象/空泛措辞，偏向具体可回忆
      const banned = ['力量', '意义', '内核', '本质', '价值观', '如何看待', '稳定的力量', '精神内核'];
      return !banned.some(k => s.includes(k)) && /[？?]$/.test(s);
    };
    const key = String(idx);
    const poolRaw = localStorage.getItem('daily_pool_v2');
    const pool = poolRaw ? JSON.parse(poolRaw) : {};
    let list = Array.isArray(pool[key]) ? pool[key] : [];
    const historyRaw = localStorage.getItem('daily_history_ids_v2');
    const history = historyRaw ? JSON.parse(historyRaw) : {};
    const askedIds = new Set(Array.isArray(history[key]) ? history[key] : []);
    const remaining = list.filter(it => !askedIds.has(it.id));
    if (remaining.length >= 1) return { list, remaining };
    // 新生成5题（优先后端），剔除历史文本，赋予连续编号（后端优先）
    const counterRaw = localStorage.getItem('daily_counter');
    let counter = Number.isFinite(Number(counterRaw)) ? Number(counterRaw) : 1000;
    const token = localStorage.getItem('token');
    let newList = [];
    try {
      // 1) 尝试从后端获取现有池子
      try {
        const poolRes = await axios.get(`/api/daily/pool?stage=${idx}`, { headers: { Authorization: `Bearer ${token}` } });
        const serverList = Array.isArray(poolRes.data?.list) ? poolRes.data.list : [];
        if (serverList.length >= 1) {
          // 后端仅返回字符串问题，前端为其分配连续本地ID，便于去重标记
          newList = serverList
            .map(q => ({ id: ++counter, q }))
            .filter(it => isWarmQuestion(it.q));
        }
      } catch (_) { /* ignore */ }

      // 2) 若无则AI生成并请求后端登记，返回统一编号
      if (newList.length === 0) {
        const usedTexts = [];
        Object.values(pool).forEach(arr => { (arr || []).forEach(x => usedTexts.push(x.q)); });
        let authorMode = (localStorage.getItem('author_mode') || '');
        const profileRaw = localStorage.getItem('record_profile');
        let relation = '';
        try { relation = (JSON.parse(profileRaw || '{}')?.relation || '').trim(); } catch(_) {}
        if (!authorMode) authorMode = relation ? 'other' : 'self';
        const perspective = authorMode === 'other'
          ? `采用“关系视角”并使用第二人称“你”与写作者对话：问题聚焦“你与${relation || '这位亲人'}”的互动细节与影响（而非对方的自述）；`
          : '以第二人称与当事人对话；';
        const system = `你是一位温暖、耐心、尊重边界的情感访谈引导者。${perspective}为给定阶段生成5个问题：
要求：
- 具体可回忆，有画面感（谁/何时/在哪/当时感觉/细节）
- 触及情绪与关系，不做空泛哲思，不用抽象词（如“内核”“力量来源”）
- 避免“为什么重要/意义是什么”等宏大哲学
- 单句≤28字；每题一行；不编号；不加前后缀
- 结合已知基础资料（若有），但不重复历史问题
输出：仅5行问题文本。`;
        const stage = lifeStages[idx] || '童年';
        const profileShort = (() => { try { return JSON.parse(localStorage.getItem('record_profile')||'{}'); } catch(_) { return {}; } })();
        const profileHints = [profileShort.name, profileShort.gender, profileShort.birth, profileShort.origin, profileShort.residence, profileShort.relation].filter(Boolean).join('、');
        const user = `阶段：${stage}
已用问题（避免重复）：${usedTexts.join(' / ') || '无'}
可参考资料：${profileHints || '无'}
请生成5个全新且更具温度的问题。`;
        const resp = await axios.post('/api/spark', { model: 'x1', messages: [ { role: 'system', content: system }, { role: 'user', content: user } ], max_tokens: 320, temperature: 0.75, user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') }, { headers: { Authorization: `Bearer ${token}` } });
        const text = (resp.data?.choices?.[0]?.message?.content || '').toString();
        let arr = text.split(/\n+/).map(s => s.replace(/^\d+[\.、\)]\s*/, '').trim()).filter(Boolean).slice(0,5);
        arr = arr.filter(isWarmQuestion);
        try {
          const saveRes = await axios.post('/api/daily/pool', { stage: idx, list: arr }, { headers: { Authorization: `Bearer ${token}` } });
          const serverList = Array.isArray(saveRes.data?.list) ? saveRes.data.list : [];
          if (serverList.length >= 1) {
            newList = serverList.map(q => ({ id: ++counter, q })).filter(it => isWarmQuestion(it.q));
          } else {
            newList = arr.map(q => ({ id: ++counter, q })).filter(it => isWarmQuestion(it.q));
          }
        } catch (_) {
          newList = arr.map(q => ({ id: ++counter, q })).filter(it => isWarmQuestion(it.q));
        }
      }
    } catch (_) {
      const fallback = {
        0: ['小时候谁常带你玩？在哪里？','记得一次雨后的玩耍吗？当时多开心？','家里第一件让你着迷的小玩具？','被夸奖的一刻，谁说了什么？','冬天最想念的一道家常菜？'],
        1: ['和同桌一起做过的“小坏事”？','运动会那天，你最想起的画面？','放学路上常去的那家店是什么味？','那时有让你安静下来的歌吗？','一次觉得被理解的瞬间？'],
        2: ['第一次独自出远门的站台与心跳？','你们常去的那家小店，现在还在吗？','最难的一个决定，当时谁在身边？','深夜赶路时，你在想谁？','改变你的书或电影是哪一部？'],
        3: ['一顿匆忙却温暖的晚饭，谁在？','第一次被叫“爸爸/妈妈”的那天呢？','工作里被善意照亮的细节？','你照顾家人的一个小习惯？','搬家那晚，你最舍不得的是什么？'],
        4: ['孩子说过一句让你心软的话？','与父母的一次和解，是何时何地？','你开始学会慢下来的那个瞬间？','一次与老友久别重逢的画面？','厨房里你最拿手的那道菜？'],
        5: ['今天哪一刻让你突然松了口气？','你想对谁道一声“辛苦了”？','散步看到的风景里，有谁的影子？','此刻桌上有什么味道与声音？','今天最想留住的一张小照片是什么？'],
        6: ['你想和谁一起去的地方？','想给未来的他/她一句怎样的叮嘱？','有一段关系，你想温柔地修复吗？','五年后，家里的晚饭会是什么样？','未来某天，你希望被怎样记起？'],
      };
      const arr = fallback[idx] || fallback[0];
      newList = arr.map(q => ({ id: ++counter, q }));
    }
    list = newList;
    pool[key] = list;
    localStorage.setItem('daily_pool_v2', JSON.stringify(pool));
    localStorage.setItem('daily_counter', String(counter));
    const askedIds2 = new Set(Array.isArray(history[key]) ? history[key] : []);
    const remaining2 = list.filter(it => !askedIds2.has(it.id));
    return { list, remaining: remaining2 };
  };

  const pickAndStoreQuestion = async () => {
    setIsLoadingQ(true);
    try {
      // 顺序尝试单个阶段，避免一次加载所有阶段导致等待
      let order = [...lifeStages.keys()].map(i => i);
      const start = Math.floor(Math.random() * lifeStages.length);
      order = order.slice(start).concat(order.slice(0, start));
      let pick = null;
      for (const i of order) {
        const pool = await ensureStagePool(i);
        const remaining = pool?.remaining || [];
        if (remaining.length > 0) {
          const it = remaining[Math.floor(Math.random() * remaining.length)];
          pick = { stageIndex: i, ...it };
          break;
        }
      }
      if (!pick) { setShowDailyCard(false); setIsLoadingQ(false); return; }
      setCurrentStageIndex(pick.stageIndex);
      setCurrentQuestion(pick.q);
      setCurrentQuestionId(pick.id);
      const historyRaw = localStorage.getItem('daily_history_ids_v2');
      const history = historyRaw ? JSON.parse(historyRaw) : {};
      history[String(pick.stageIndex)] = Array.isArray(history[String(pick.stageIndex)]) ? history[String(pick.stageIndex)] : [];
      if (!history[String(pick.stageIndex)].includes(pick.id)) history[String(pick.stageIndex)].push(pick.id);
      localStorage.setItem('daily_history_ids_v2', JSON.stringify(history));
      // 后端记录“已问”，用于跨设备去重
      try {
        const token = localStorage.getItem('token');
        // 用问题文本作为 qid，便于服务端跨设备去重
        await axios.post('/api/daily/asked', { stage: pick.stageIndex, qid: pick.q }, { headers: { Authorization: `Bearer ${token}` } });
      } catch (_) {}
    } finally {
      setIsLoadingQ(false);
    }
  };

  // 每日00:00或当日重新登录时，仅刷新“已问”记录（不自动弹出卡片）
  useEffect(() => {
    const scope = (localStorage.getItem('uid') || localStorage.getItem('username') || 'anon');
    const today = new Date().toISOString().slice(0,10);
    const lastReset = localStorage.getItem(`daily_last_reset_${scope}`) || '';
    const lastLogin = localStorage.getItem(`last_login_at_${scope}`) || '';
    const lastLoginDay = lastLogin ? new Date(lastLogin).toISOString().slice(0,10) : '';
    const needReset = (!lastReset || lastReset !== today || lastLoginDay === today);
    if (needReset) {
      try { localStorage.removeItem('daily_history_ids_v2'); } catch(_) {}
      try { localStorage.setItem(`daily_last_reset_${scope}`, today); } catch(_) {}
    }
    // 若未设定记录对象，引导先设定
    const needPick = !localStorage.getItem('author_mode');
    if (needPick) { setNeedAuthorSelect(true); setShowProfileForm(false); }
  }, [lang]);

  // 预热：后台先为随机阶段准备题库一小份，减少点击后的等待
  useEffect(() => {
    const rnd = Math.floor(Math.random() * lifeStages.length);
    ensureStagePool(rnd).catch(()=>{});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenDaily = async () => {
    setShowDailyCard(true);
    await pickAndStoreQuestion();
  };

  const handleSwap = async () => { await pickAndStoreQuestion(); };
  const handleSkip = async () => {
    // 跳过前，将当前问题（若有回答）按每日回首保存为随手记，便于连续回首形成轨迹
    try {
      if ((currentQuestion || '').trim()) {
        const token = localStorage.getItem('token');
        if (token) {
          const label = currentQuestionId ? `Q${currentQuestionId}` : '';
          const content = `阶段：${lifeStages[currentStageIndex]}\n问题：${label ? (label + ' ') : ''}${currentQuestion}\n回答：${answer || '（未填写）'}`;
          const authorMode = (localStorage.getItem('author_mode') || 'self');
          let relation = '';
          try { relation = (JSON.parse(localStorage.getItem('record_profile')||'{}')?.relation || '').trim(); } catch(_) {}
          const baseTags = ['每日回首', lifeStages[currentStageIndex]];
          const tags = (authorMode === 'other' && relation) ? [...baseTags, relation] : baseTags;
          const subjectVersion = localStorage.getItem('subject_version') || '';
          await axios.post('/api/memo', { text: content, tags, media: [], subjectVersion }, { headers: { Authorization: `Bearer ${token}` } }).catch(()=>{});
        }
      }
    } catch (_) {}
    setShowDailyCard(false); setAnswer('');
  };

  // 新增：线性10问流程（使用后端 daily/session 接口）
  const [linearMode, setLinearMode] = useState(true);
  const [linearProgress, setLinearProgress] = useState({ idx: 0, total: 10, stageIndex: 0, completed: false });
  const startLinear = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) { navigate('/login'); return; }
      const res = await axios.get(`/api/daily/session?stage=${linearProgress.stageIndex}`, { headers: { Authorization: `Bearer ${token}` } });
      const { stageIndex, currentIndex, total, completed, question } = res.data || {};
      setLinearProgress({ idx: currentIndex || 0, total: total || 10, stageIndex: stageIndex || 0, completed: !!completed });
      if (!completed) {
        setCurrentStageIndex(stageIndex || 0);
        setCurrentQuestion(question || '...');
        setCurrentQuestionId((currentIndex || 0) + 1);
        setShowDailyCard(true);
      }
    } catch (_) {
      // 回退到旧模式
      setLinearMode(false);
      handleOpenDaily();
    }
  };
  const answerAndNext = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) { navigate('/login'); return; }
      const res = await axios.post('/api/daily/session/answer', { stage: linearProgress.stageIndex, answer }, { headers: { Authorization: `Bearer ${token}` } });
      const { stageIndex, currentIndex, total, completed, question } = res.data || {};
      setLinearProgress({ idx: currentIndex || 0, total: total || 10, stageIndex: stageIndex || 0, completed: !!completed });
      if (completed) {
        // 切到下一阶段
        const next = await axios.post('/api/daily/session/next', { stage: stageIndex }, { headers: { Authorization: `Bearer ${token}` } });
        const nextStageIndex = next.data?.nextStageIndex ?? ((stageIndex + 1) % lifeStages.length);
        const suggest = !!next.data?.suggestGenerate;
        if (suggest) setShowSuggestCard(true);
        setLinearProgress({ idx: 0, total: 10, stageIndex: nextStageIndex, completed: false });
        setShowDailyCard(false);
        setAnswer('');
      } else {
        setCurrentStageIndex(stageIndex || 0);
        setCurrentQuestion(question || '...');
        setCurrentQuestionId((currentIndex || 0) + 1);
        setAnswer('');
      }
    } catch (_) {
      // 回退单步刷新
      await pickAndStoreQuestion();
    }
  };
  const handleSaveToMemo = async () => {
    if (!saveToMemoChecked) { setShowDailyCard(false); setAnswer(''); return; }
    const token = localStorage.getItem('token');
    if (!token) { navigate('/login'); return; }
    const label = currentQuestionId ? `Q${currentQuestionId}` : '';
    const content = `阶段：${lifeStages[currentStageIndex]}\n问题：${label ? (label + ' ') : ''}${currentQuestion}\n回答：${answer || '（未填写）'}`;
    const authorMode = (localStorage.getItem('author_mode') || 'self');
    let relation = '';
    try { relation = (JSON.parse(localStorage.getItem('record_profile')||'{}')?.relation || '').trim(); } catch(_) {}
    const baseTags = ['每日回首', lifeStages[currentStageIndex]];
    const tags = (authorMode === 'other' && relation) ? [...baseTags, relation] : baseTags;
    const subjectVersion = localStorage.getItem('subject_version') || '';
    try {
      const resp = await axios.post('/api/memo', { text: content, tags, media: [], subjectVersion }, { headers: { Authorization: `Bearer ${token}` } });
      const created = {
        id: resp.data?.id || `local-${Date.now()}`,
        text: content,
        tags,
        media: [],
        timestamp: resp.data?.timestamp || new Date().toISOString(),
        subjectVersion,
      };
      setMemosHome(prev => [created, ...(Array.isArray(prev)?prev:[])]);
      try { setMemosCtx && setMemosCtx(prev => [created, ...(Array.isArray(prev)?prev:[])]); } catch(_) {}
    } catch (_) {
      const created = {
        id: `local-${Date.now()}`,
        text: content,
        tags,
        media: [],
        timestamp: new Date().toISOString(),
        subjectVersion,
      };
      setMemosHome(prev => [created, ...(Array.isArray(prev)?prev:[])]);
      try { setMemosCtx && setMemosCtx(prev => [created, ...(Array.isArray(prev)?prev:[])]); } catch(_) {}
    }
    setShowDailyCard(false); setAnswer('');
  };
  const handlePasteToCreate = () => {
    try {
      const raw = localStorage.getItem('dailyPasteboard');
      const obj = raw ? JSON.parse(raw) : { items: [] };
      const label = currentQuestionId ? `Q${currentQuestionId}` : '';
      obj.items.push({ stageIndex: currentStageIndex, text: `陪伴师：${label ? (label + ' ') : ''}${currentQuestion}\n我：${answer || ''}` });
      localStorage.setItem('dailyPasteboard', JSON.stringify(obj));
      setShowDailyCard(false); setAnswer('');
    } catch (_) { setShowDailyCard(false); }
  };

  // 加载随手记并统计“每日回首”数量
  useEffect(() => {
    const loadMemos = async () => {
      if (!isLoggedIn) return;
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/memos?todayKey=1', { headers: { Authorization: `Bearer ${token}` } });
        const list = Array.isArray(res.data) ? res.data : [];
        const authorMode = (localStorage.getItem('author_mode') || 'self');
        let relation = '';
        try { relation = (JSON.parse(localStorage.getItem('record_profile')||'{}')?.relation || '').trim(); } catch(_) {}
        const mapped = list.map(m => {
          if (authorMode === 'other' && relation && Array.isArray(m.tags) && m.tags.includes('每日回首') && !m.tags.includes(relation)) {
            return { ...m, tags: [...m.tags, relation] };
          }
          return m;
        });
        setMemosHome(mapped);
      } catch (_) {}
    };
    loadMemos();
  }, [isLoggedIn]);

  useEffect(() => {
    const counts = {};
    lifeStages.forEach((_, i) => { counts[i] = 0; });
    (memosHome || []).forEach(m => {
      const tags = Array.isArray(m.tags) ? m.tags : [];
      if (!tags.includes('每日回首')) return;
      const idx = lifeStages.findIndex(s => tags.includes(s));
      if (idx >= 0) counts[idx] = (counts[idx] || 0) + 1;
    });
    setStageStats(counts);
    const scope = (localStorage.getItem('uid') || localStorage.getItem('username') || 'anon');
    try { snoozeUntilRef.current = localStorage.getItem(`daily_generate_snooze_until_${scope}`) || ''; } catch (_) {}
    const snoozed = snoozeUntilRef.current && new Date(snoozeUntilRef.current) > new Date();
    const shouldShow = Object.values(counts).some(v => (v || 0) >= STAGE_THRESHOLD) && !snoozed;
    setShowSuggestCard(shouldShow);
  }, [memosHome]);

  const remindLater = () => {
    const dt = new Date();
    dt.setDate(dt.getDate() + 10);
    const scope = (localStorage.getItem('uid') || localStorage.getItem('username') || 'anon');
    localStorage.setItem(`daily_generate_snooze_until_${scope}`, dt.toISOString());
    setShowSuggestCard(false);
  };

  const generateNow = async () => {
    try {
      const raw = localStorage.getItem('dailyPasteboard');
      const obj = raw ? JSON.parse(raw) : { items: [] };
      (memosHome || []).forEach(m => {
        const tags = Array.isArray(m.tags) ? m.tags : [];
        if (!tags.includes('每日回首')) return;
        const stageIdx = lifeStages.findIndex(s => tags.includes(s));
        if (stageIdx < 0) return;
        const text = (m.text || '').toString();
        let q = '', a = '';
        const mq = text.match(/问题：([\s\S]*?)\n/);
        if (mq) q = (mq[1] || '').trim();
        const ma = text.match(/回答：([\s\S]*)/);
        if (ma) a = (ma[1] || '').trim();
        const line = `陪伴师：${q || '（每日回首）'}\n我：${a || ''}`;
        obj.items.push({ stageIndex: stageIdx, text: line });
      });
      localStorage.setItem('dailyPasteboard', JSON.stringify(obj));
      navigate('/create');
    } catch (_) {
      navigate('/create');
    }
  };

  const handleAuthorPick = (mode) => {
    try { localStorage.setItem('author_mode', mode); } catch (_) {}
    setShowProfileForm(true);
  };

  const handleProfileSave = () => {
    const mode = localStorage.getItem('author_mode') || 'self';
    if (!isProfileComplete(mode, profile)) {
      alert('请完整填写姓名、性别、出生年月、祖籍、现居住地' + (mode==='other' ? '，以及与被记录人的关系' : ''));
      return;
    }
    try {
      localStorage.setItem('record_profile', JSON.stringify(profile));
      if (mode === 'other' && profile.relation) localStorage.setItem('author_relation', profile.relation);
    } catch (_) {}
    // 同步到后端，防止本地清理丢失
    try {
      const token = localStorage.getItem('token');
      axios.post('/api/record-subject', { mode, profile }, { headers: { Authorization: `Bearer ${token}` } }).catch(()=>{});
    } catch (_) {}
    setShowProfileForm(false);
    setNeedAuthorSelect(false);
  };

  // 自动从后端同步记录对象（跨设备保持一致）
  useEffect(() => {
    const syncSubject = async () => {
      if (!isLoggedIn) return;
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/record-subject', { headers: { Authorization: `Bearer ${token}` } });
        const mode = res.data?.mode;
        const prof = res.data?.profile || {};
        if (mode) {
          try { localStorage.setItem('author_mode', mode); } catch (_) {}
        }
        try { localStorage.setItem('record_profile', JSON.stringify(prof)); } catch (_) {}
        if (mode === 'other' && prof.relation) {
          try { localStorage.setItem('author_relation', prof.relation); } catch (_) {}
        }
        if (mode) setNeedAuthorSelect(false);
        if (prof && Object.keys(prof).length > 0) setProfile(prof);
      } catch (_) { /* ignore */ }
    };
    syncSubject();
  }, [isLoggedIn]);
  const zhSlogans = [
    '生而不灭于遗忘，生命故事永有人可读',
    '写下人生的故事，给未来的孩子一盏可以回望的灯',
    '记录一段人生，让回忆成为家族永恒的财富',
    '每一段人生，都值得被留存成最美的故事',
    '从童年至暮年，人生的每一刻都值得被珍藏',
    '当他们想起你，这里有你留下的声音与文字',
    '用技术对抗遗忘，让生命温柔长存',
	'跨越世代的对话，从一本故事集开始',
	'让爱与故事，在家族中温柔延续',
  ];
  const enSlogans = [
    'Reunite with memories, stay connected with family. Let time gently keep your story.',
    'Your memories are not only the past. LifeTrace helps love be seen and passed on.',
    'Write this moment together, and gift it to future family.',
    'Here, years have names, and family has echoes.',
    'Connect bloodlines with stories, continue love with memories.',
    'Memories never age, family never fades. Write your life for those who care.',
    'Let the past be heard, and the future be lit.',
    'Turn memories into a gift for the next generation.',
    'Every chapter of your life deserves to be recorded with care.',
    'LifeTrace: gently keeping the stories of a lifetime with you.',
  ];
  const slogans = lang === 'zh' ? zhSlogans : enSlogans;
  const [sloganIndex, setSloganIndex] = useState(0);
  useEffect(() => {
    setSloganIndex(0);
    const id = setInterval(() => {
      setSloganIndex((i) => (i + 1) % slogans.length);
    }, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const handleMobileLogout = () => {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('username');
    } catch (_) {}
    setIsLoggedIn(false);
    navigate('/login');
  };

  return (
    <div className="min-h-screen">
      <Helmet>
        <title>{lang === 'zh' ? '首页 - 永念' : 'Home - LifeTrace'}</title>
      </Helmet>
      {/* Hero */}
      <section className="container mx-auto px-4 pt-10 pb-8 sm:pt-16 sm:pb-12">
        <div className="max-w-5xl mx-auto text-center">
          {needAuthorSelect && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
              <div className="relative z-10 card w-11/12 max-w-xl p-4 sm:p-5" role="dialog" aria-modal="true" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 60%)', borderColor: '#e5e7eb' }}>
              <div className="text-lg font-semibold text-gray-900 mb-2">请选择记录对象</div>
              <p className="text-sm text-gray-700 mb-3">为谁记录，会影响后续的问题风格与标签管理</p>
              <div className="flex gap-2 justify-center flex-wrap">
                <button className="btn btn-primary" onClick={() => handleAuthorPick('self')}>为自己记录</button>
                <button className="btn btn-secondary" onClick={() => handleAuthorPick('other')}>为他人记录</button>
              </div>
              {showProfileForm && (
                <div className="mt-4 text-left">
                  <h4 className="font-semibold mb-2">请先填写基本资料</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input className="input" placeholder="姓名" value={profile.name||''} onChange={e=>setProfile(p=>({...(p||{}), name:e.target.value}))} />
                    <input className="input" placeholder="性别" value={profile.gender||''} onChange={e=>setProfile(p=>({...(p||{}), gender:e.target.value}))} />
                    <input className="input" placeholder="出生年月（如 1950-06）" value={profile.birth||''} onChange={e=>setProfile(p=>({...(p||{}), birth:e.target.value}))} />
                    <input className="input" placeholder="祖籍" value={profile.origin||''} onChange={e=>setProfile(p=>({...(p||{}), origin:e.target.value}))} />
                    <input className="input" placeholder="现居住地" value={profile.residence||''} onChange={e=>setProfile(p=>({...(p||{}), residence:e.target.value}))} />
                    {(localStorage.getItem('author_mode')||'self')==='other' && (
                      <input className="input" placeholder="与被记录人的关系（如 母亲）" value={profile.relation||''} onChange={e=>setProfile(p=>({...(p||{}), relation:e.target.value}))} />
                    )}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button className="btn btn-primary" onClick={handleProfileSave}>保存</button>
                  </div>
                </div>
              )}
              </div>
            </div>
          )}
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-gray-900">
            {lang === 'zh' ? '把一生好好写下，温柔地交给时间' : 'Write a life, gently handed to time'}
          </h1>
          {/* 每日回首：按钮触发 */}
          <div className="mt-3 flex items-center justify-center">
            <button
              onClick={() => (linearMode ? startLinear() : handleOpenDaily())}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg shadow-sm border ring-1 ring-blue-200 bg-gradient-to-br from-blue-200 to-blue-300 text-slate-900 border-blue-200 hover:from-blue-300 hover:to-blue-400"
            >
              <span>🕯️</span>
              <span className="font-medium">{lang === 'zh' ? '每日回首' : 'Daily Reflection'}</span>
            </button>
          </div>
          <p className="mt-4 text-base sm:text-lg text-gray-700">
            {slogans[sloganIndex] || (lang === 'zh' ? '让记忆延续，让精神成为家族的财富' : 'Memories continue, love is passed on')}
          </p>
          {/* 每日回首弹窗（默认弹出，可跳过当天） */}
          {showDailyCard && (
            <div className="fixed inset-0 z-40 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
              <div className="relative z-50 card w-11/12 max-w-xl text-left p-4 sm:p-5" role="dialog" aria-modal="true" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 60%)', borderColor: '#e5e7eb' }}>
                <div className="text-sm text-gray-600 mb-1">每日回首 · {lifeStages[currentStageIndex]} {linearMode ? `（${Math.min(linearProgress.idx+1, linearProgress.total)}/${linearProgress.total}）` : ''}</div>
                <div className="text-lg font-semibold text-gray-900 mb-2">{isLoadingQ ? '加载中…' : (currentQuestion || '...')}</div>
                <textarea
                  className="input w-full mb-3"
                  placeholder={lang === 'zh' ? '在这里写下你的回答（可选）' : 'Write your brief answer (optional)'}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={3}
                  maxLength={500}
                />
                <label className="flex items-center gap-2 text-sm text-gray-800 mb-2">
                  <input type="checkbox" checked={saveToMemoChecked} onChange={(e)=>setSaveToMemoChecked(e.target.checked)} />
                  记为随手记
                </label>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-secondary" onClick={handleSkip}>返回</button>
                  <button className="btn btn-secondary" onClick={linearMode ? answerAndNext : handleSwap}>{linearMode ? '提交并继续' : '继续回首'}</button>
                  <button className="btn btn-primary" onClick={handlePasteToCreate}>粘贴到记录</button>
                  <button className="btn" onClick={handleSaveToMemo} disabled={!saveToMemoChecked}>保存</button>
                </div>
              </div>
            </div>
          )}
          {showSuggestCard && (
            <div className="mt-4 card text-left p-4 sm:p-5" style={{ background: 'linear-gradient(135deg, #dbeafe 0%, #ffffff 60%)', borderColor: '#e5e7eb' }}>
              <div className="text-lg font-semibold text-gray-900 mb-1">或许是个整理回忆的好时机</div>
              <p className="text-sm text-gray-700 mb-3">部分阶段的“每日回首”已累计到 {STAGE_THRESHOLD}+ 条。是否现在生成一篇更完整的回忆？</p>
              <div className="flex gap-2 flex-wrap">
                <button className="btn btn-primary" onClick={generateNow}>现在生成</button>
                <button className="btn btn-secondary" onClick={remindLater}>以后提醒（10天）</button>
              </div>
            </div>
          )}
          {/* CTA cards with copy (mobile-first) */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4">
            <button
              aria-label={lang === 'zh' ? '开始记录' : 'Start Now'}
              onClick={() => navigate(isLoggedIn ? '/create' : '/login')}
              className="text-left p-4 rounded-lg transition shadow-sm border ring-1 ring-blue-200 bg-gradient-to-br from-blue-200 to-blue-300 text-slate-900 border-blue-200 hover:from-blue-300 hover:to-blue-400"
            >
              <div className="text-2xl mb-1">✍️</div>
              <h3 className="font-semibold text-lg text-slate-900">{lang === 'zh' ? '开始记录' : 'Start Now'}</h3>
              <p className="text-sm opacity-90 mt-1 text-slate-900">
                {lang === 'zh' ? '用温和的引导问答，从童年至当下，一步步写下。' : 'Gentle prompts to capture a lifetime, step by step.'}
              </p>
            </button>
            <button
              aria-label={lang === 'zh' ? '随手记' : 'Memo'}
              onClick={() => navigate(isLoggedIn ? '/memo' : '/login')}
              className="text-left p-4 rounded-lg transition shadow-sm border ring-1 ring-blue-200 bg-gradient-to-br from-blue-200 to-blue-300 text-slate-900 border-blue-200 hover:from-blue-300 hover:to-blue-400"
            >
              <div className="text-2xl mb-1">📒</div>
              <h3 className="font-semibold text-lg text-slate-900">{lang === 'zh' ? '随手记' : 'Memo'}</h3>
              <p className="text-sm opacity-90 mt-1 text-slate-900">
                {lang === 'zh' ? '几句话、一张照片或一段语音，记录一个瞬间。' : 'A few words, a photo or voice to capture the moment.'}
              </p>
        </button>
            <button
              aria-label={lang === 'zh' ? '家族档案' : 'Family Archive'}
              onClick={() => navigate(isLoggedIn ? '/family' : '/login')}
              className="text-left p-4 rounded-lg transition shadow-sm border ring-1 ring-blue-200 bg-gradient-to-br from-blue-200 to-blue-300 text-slate-900 border-blue-200 hover:from-blue-300 hover:to-blue-400"
            >
              <div className="text-2xl mb-1">👪</div>
              <h3 className="font-semibold text-lg text-slate-900">{lang === 'zh' ? '家族档案' : 'Family Archive'}</h3>
              <p className="text-sm mt-1 text-slate-900">
                {lang === 'zh' ? '只与家人私密共享，随时补充与回看。' : 'Private with family, add and revisit anytime.'}
              </p>
        </button>
            <button
              aria-label={lang === 'zh' ? '我的' : 'My'}
              onClick={() => navigate(isLoggedIn ? '/my' : '/login')}
              className="text-left p-4 rounded-lg transition shadow-sm border ring-1 ring-blue-200 bg-gradient-to-br from-blue-200 to-blue-300 text-slate-900 border-blue-200 hover:from-blue-300 hover:to-blue-400"
            >
              <div className="text-2xl mb-1">✨</div>
              <h3 className="font-semibold text-lg text-slate-900">{lang === 'zh' ? '我的' : 'My'}</h3>
              <p className="text-sm mt-1 text-slate-900">
                {lang === 'zh' ? '管理我已记录的篇章与媒体素材。' : 'Manage your chapters and media.'}
              </p>
        </button>
          </div>
          {isLoggedIn && (
            <div className="mt-3 sm:hidden">
              <button className="btn w-full" onClick={handleMobileLogout}>
                {lang === 'zh' ? '登出' : 'Logout'}
        </button>
      </div>
          )}
          {isLoggedIn && role === 'admin' && (
            <div className="mt-3 flex gap-3 justify-center">
              <button className="btn" onClick={() => navigate('/admin/reports')}>{lang === 'zh' ? '举报管理' : 'Report Management'}</button>
              <button className="btn" onClick={() => navigate('/admin/stats')}>{lang === 'zh' ? '后台统计' : 'Admin Stats'}</button>
            </div>
          )}
        </div>
      </section>

      {/* Features removed per request */}

      {/* Quote removed per request to avoid large block on desktop */}
    </div>
  );
};

export default Home;