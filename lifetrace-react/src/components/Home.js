import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { AppContext } from '../context/AppContext';
import axios from 'axios';

const Home = () => {
  const { isLoggedIn, t, lang, role, setIsLoggedIn } = useContext(AppContext);
  const navigate = useNavigate();
  // 每日回首设置
  const [dailyEnabled, setDailyEnabled] = useState(() => {
    try {
      const scope = (localStorage.getItem('uid') || localStorage.getItem('username') || 'anon');
      const v = localStorage.getItem(`daily_reflection_enabled_${scope}`);
      return v == null ? true : v !== '0';
    } catch (_) { return true; }
  });
  const [showDailyCard, setShowDailyCard] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [currentQuestionId, setCurrentQuestionId] = useState(0);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [isLoadingQ, setIsLoadingQ] = useState(false);
  const lastShownRef = useRef('');
  const lifeStages = ['童年','少年','青年','成年','中年','当下','未来愿望'];
  // 生成回忆建议
  const [showSuggestCard, setShowSuggestCard] = useState(false);
  const [stageStats, setStageStats] = useState({});
  const STAGE_THRESHOLD = 5;
  const snoozeUntilRef = useRef('');
  const [memosHome, setMemosHome] = useState([]);
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

  const saveEnabled = (v) => {
    setDailyEnabled(v);
    try {
      const scope = (localStorage.getItem('uid') || localStorage.getItem('username') || 'anon');
      localStorage.setItem(`daily_reflection_enabled_${scope}`, v ? '1' : '0');
    } catch (_) {}
  };

  // 确保每阶段存在5题的池（带全局编号），并按历史ID去重
  const ensureStagePool = async (idx) => {
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
          newList = serverList.map(it => ({ id: it.id, q: it.q }));
        }
      } catch (_) { /* ignore */ }

      // 2) 若无则AI生成并请求后端登记，返回统一编号
      if (newList.length === 0) {
        const usedTexts = [];
        Object.values(pool).forEach(arr => { (arr || []).forEach(x => usedTexts.push(x.q)); });
        const authorMode = (localStorage.getItem('author_mode') || 'self');
        const profileRaw = localStorage.getItem('record_profile');
        let relation = '';
        try { relation = (JSON.parse(profileRaw || '{}')?.relation || '').trim(); } catch(_) {}
        const perspective = authorMode === 'other' ? `请使用第三人称，并结合关系（如：${relation || '家人'}）进行提问；` : '请使用第二人称与当事人对话；';
        const system = `你是一位温柔且专业的回忆引导者。${perspective}为给定阶段生成5个触及人心的中文问题（不超过30字），口语化自然、真诚具体，无编号，仅以换行分隔问题。不要与已用问题重复。`;
        const stage = lifeStages[idx] || '童年';
        const user = `阶段：${stage}\n已用问题（不要重复）：${usedTexts.join(' / ') || '无'}\n请生成5个全新的问题。`;
        const resp = await axios.post('/api/spark', { model: 'x1', messages: [ { role: 'system', content: system }, { role: 'user', content: user } ], max_tokens: 300, temperature: 0.5, user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') }, { headers: { Authorization: `Bearer ${token}` } });
        const text = (resp.data?.choices?.[0]?.message?.content || '').toString();
        const arr = text.split(/\n+/).map(s => s.replace(/^\d+[\.、\)]\s*/, '').trim()).filter(Boolean).slice(0,5);
        try {
          const saveRes = await axios.post('/api/daily/pool', { stage: idx, questions: arr }, { headers: { Authorization: `Bearer ${token}` } });
          const serverList = Array.isArray(saveRes.data?.list) ? saveRes.data.list : [];
          if (serverList.length >= 1) {
            newList = serverList.map(it => ({ id: it.id, q: it.q }));
          } else {
            newList = arr.map(q => ({ id: ++counter, q }));
          }
        } catch (_) {
          newList = arr.map(q => ({ id: ++counter, q }));
        }
      }
    } catch (_) {
      const fallback = {
        0: ['儿时最好的玩伴是谁？','童年让你会心一笑的瞬间？','当时最爱的玩具或游戏？','第一次被鼓励的记忆？','童年最暖的一顿饭？'],
        1: ['少年时代最勇敢的一次？','和同学最难忘的小事？','那时最喜欢的歌或书？','你偷偷在意过的一句话？','最常去的地方？'],
        2: ['青年时期改变你的决定？','第一次独立完成的一件事？','谈谈一段友情或爱情？','你坚持下来的热爱？','你学到的最重要的道理？'],
        3: ['成年后最骄傲的时刻？','一次重要的选择？','你如何照顾家人与自己？','工作里被理解的瞬间？','最稳定的力量来自哪里？'],
        4: ['中年后对家人的新理解？','你给孩子或晚辈的一句话？','你如何与自己和解？','最近一次被感动？','你想留住的日常？'],
        5: ['当下最想感谢的人？为什么？','今天最令你微笑的小事？','你最近在学习什么？','让你安心的一件事？','现在的你最想对谁说句话？'],
        6: ['未来你最想留下的是什么？','想去的地方和原因？','有想修复的关系吗？','你期待怎样的晚年？','给未来的家人一句话？'],
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
      const pools = await Promise.all(lifeStages.map((_, i) => ensureStagePool(i)));
      let items = [];
      pools.forEach((p, i) => { (p.remaining || []).forEach(it => items.push({ stageIndex: i, ...it })); });
      if (items.length === 0) {
        localStorage.removeItem('daily_history_ids_v2');
        const pools2 = await Promise.all(lifeStages.map((_, i) => ensureStagePool(i)));
        items = [];
        pools2.forEach((p, i) => { (p.remaining || []).forEach(it => items.push({ stageIndex: i, ...it })); });
        if (items.length === 0) { setShowDailyCard(false); setIsLoadingQ(false); return; }
      }
      const pick = items[Math.floor(Math.random() * items.length)];
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
        await axios.post('/api/daily/asked', { stage: pick.stageIndex, id: pick.id }, { headers: { Authorization: `Bearer ${token}` } });
      } catch (_) {}
    } finally {
      setIsLoadingQ(false);
    }
  };

  // 每天首次进入展示 + 首次用户引导
  useEffect(() => {
    const scope = (localStorage.getItem('uid') || localStorage.getItem('username') || 'anon');
    try { lastShownRef.current = localStorage.getItem(`daily_last_shown_${scope}`) || ''; } catch (_) {}
    try { snoozeUntilRef.current = localStorage.getItem(`daily_generate_snooze_until_${scope}`) || ''; } catch (_) {}
    const today = new Date().toISOString().slice(0,10);
    const snoozed = snoozeUntilRef.current && new Date(snoozeUntilRef.current) > new Date();
    // 首次注册/登录后如无 author_mode，优先触发身份选择与资料卡
    const needPick = !localStorage.getItem('author_mode');
    if (needPick) {
      setNeedAuthorSelect(true);
      setShowProfileForm(false);
    }
    // 触发条件：1) 今天第一次进入 2) 或检测到刚登录（last_login_at_scope 是今日）
    let shouldShow = false;
    if (dailyEnabled && !snoozed) {
      if (lastShownRef.current !== today) {
        shouldShow = true;
      } else {
        try {
          const lastLogin = localStorage.getItem(`last_login_at_${scope}`) || '';
          if (lastLogin) {
            const d = new Date(lastLogin).toISOString().slice(0,10);
            if (d === today) shouldShow = true;
          }
        } catch (_) {}
      }
    }
    if (shouldShow) {
      setShowDailyCard(true);
      pickAndStoreQuestion();
      try { localStorage.setItem(`daily_last_shown_${scope}`, today); } catch (_) {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyEnabled, lang]);

  const handleSwap = async () => { await pickAndStoreQuestion(); };
  const handleSkip = () => { setShowDailyCard(false); setAnswer(''); };
  const handleSaveToMemo = async () => {
    const token = localStorage.getItem('token');
    if (!token) { navigate('/login'); return; }
    const label = currentQuestionId ? `Q${currentQuestionId}` : '';
    const content = `阶段：${lifeStages[currentStageIndex]}\n问题：${label ? (label + ' ') : ''}${currentQuestion}\n回答：${answer || '（未填写）'}`;
    try {
      await axios.post('/api/memo', { text: content, tags: ['每日回首', lifeStages[currentStageIndex]], media: [] }, { headers: { Authorization: `Bearer ${token}` } });
    } catch (_) {
      // 容错：忽略失败
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
        const res = await axios.get('/api/memos', { headers: { Authorization: `Bearer ${token}` } });
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
            <div className="card p-4 sm:p-5 mb-4" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 60%)', borderColor: '#e5e7eb' }}>
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
                    <button className="btn btn-secondary" onClick={()=>{ setShowProfileForm(false); try{ localStorage.removeItem('author_mode'); }catch(_){ } }}>返回</button>
                  </div>
                </div>
              )}
            </div>
          )}
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-gray-900">
            {lang === 'zh' ? '把一生好好写下，温柔地交给时间' : 'Write a life, gently handed to time'}
          </h1>
          {/* 每日回首：开关 */}
          <div className="mt-3 flex items-center justify-center gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={dailyEnabled} onChange={(e) => saveEnabled(e.target.checked)} />
              {lang === 'zh' ? '每日回首' : 'Daily Reflection'}
            </label>
          </div>
          <p className="mt-4 text-base sm:text-lg text-gray-700">
            {slogans[sloganIndex] || (lang === 'zh' ? '让记忆延续，让精神成为家族的财富' : 'Memories continue, love is passed on')}
          </p>
          {/* 每日回首卡片 */}
          {showDailyCard && (
            <div className="mt-6 card text-left p-4 sm:p-5" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 60%)', borderColor: '#e5e7eb' }}>
              <div className="text-sm text-gray-600 mb-1">每日回首 · {lifeStages[currentStageIndex]}</div>
              <div className="text-lg font-semibold text-gray-900 mb-2">{isLoadingQ ? '加载中…' : (currentQuestion || '...')}</div>
              <textarea
                className="input w-full mb-3"
                placeholder={lang === 'zh' ? '在这里写下你的回答（可选）' : 'Write your brief answer (optional)'}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={3}
                maxLength={500}
              />
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-secondary" onClick={handleSwap}>换一个</button>
                <button className="btn btn-secondary" onClick={handleSkip}>跳过</button>
                <button className="btn btn-primary" onClick={handlePasteToCreate}>粘贴到记录</button>
                <button className="btn" onClick={handleSaveToMemo}>记为随手记</button>
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