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
  
  // 每日回首：阶段和主题选择
  const [showStageThemeSelector, setShowStageThemeSelector] = useState(false);
  const [selectedDailyStage, setSelectedDailyStage] = useState(() => {
    try { return Number(localStorage.getItem('daily_selected_stage') || '0') || 0; } catch(_) { return 0; }
  });
  const [dailyThemes, setDailyThemes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('daily_themes') || '{}'); } catch(_) { return {}; }
  });
  
  // 主题库（与CreateBiography保持一致）
  const STAGE_THEMES = {
    0: ['家庭关系', '童年玩伴', '启蒙教育', '第一次经历', '性格形成', '兴趣萌芽', '家庭变故', '难忘趣事', '童年创伤', '祖辈故事', '兄弟姐妹', '搬家经历'],
    1: ['学业经历', '友情故事', '师生关系', '青春期变化', '初恋', '叛逆与成长', '兴趣爱好', '价值观形成', '重要选择', '转折事件', '成长困惑', '理想萌芽'],
    2: ['升学就业', '恋爱婚姻', '职业选择', '人生目标', '重大决策', '迷茫与探索', '重要相遇', '独立成长', '北漂/打拼', '创业经历', '失败挫折', '突破时刻'],
    3: ['事业发展', '婚姻家庭', '子女教育', '经济状况', '人际关系', '挫折与突破', '成就与荣誉', '责任担当', '工作转变', '置业安家', '职场经历', '角色转换'],
    4: ['家庭变化', '事业转型', '健康危机', '人生顿悟', '子女独立', '婚姻关系', '财务规划', '精神追求', '中年危机', '父母养老', '重新出发', '生活平衡'],
    5: ['生活状态', '家庭关系', '健康养生', '兴趣爱好', '社会参与', '代际关系', '内心感悟', '遗憾与满足', '退休生活', '天伦之乐', '回忆往事', '生活智慧'],
    6: ['人生愿望', '家族传承', '未竟之事', '后代期望', '精神寄托', '人生总结', '遗愿', '生命意义', '想说的话', '未来憧憬', '临终关怀', '精神遗产']
  };
  
  useEffect(() => {
    try { localStorage.setItem('daily_themes', JSON.stringify(dailyThemes)); } catch(_){}
  }, [dailyThemes]);
  
  useEffect(() => {
    try { localStorage.setItem('daily_selected_stage', String(selectedDailyStage)); } catch(_){}
  }, [selectedDailyStage]);
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
    setAnswer('');
    // 先显示阶段和主题选择界面
    setShowStageThemeSelector(true);
  };
  
  // 阶段和主题选择完成后开始提问
  const startDailyWithStageTheme = async () => {
    setShowStageThemeSelector(false);
    setShowDailyCard(true);
    setCurrentStageIndex(selectedDailyStage);
    await generateLinearQuestion(selectedDailyStage);
  };
  
  // 基于历史问答生成下一个线性问题
  const generateLinearQuestion = async (stageIdx) => {
    setIsLoadingQ(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) { 
        setIsLoadingQ(false);
        return; 
      }
      
      // 从后端获取该阶段的历史问答
      let historyQA = [];
      try {
        const historyRes = await axios.get(`/api/daily/history?stage=${stageIdx}`, { 
          headers: { Authorization: `Bearer ${token}` } 
        });
        historyQA = Array.isArray(historyRes.data) ? historyRes.data : [];
      } catch (_) {}
      
      // 获取用户选择的主题
      const selectedThemes = dailyThemes[stageIdx] || [];
      const themeGuide = selectedThemes.length > 0 
        ? `用户特别关注的主题/事件：${selectedThemes.join('、')}。请围绕这些主题提问，但要自然融入对话。`
        : '';
      
      // 获取用户画像
      let profileInfo = {};
      try { profileInfo = JSON.parse(localStorage.getItem('record_profile') || '{}'); } catch(_) {}
      const authorMode = localStorage.getItem('author_mode') || 'self';
      const authorRelation = localStorage.getItem('author_relation') || '';
      
      const writerName = localStorage.getItem('username') || '';
      const writerGender = localStorage.getItem('writer_gender') || '';
      const writerProfile = `写作者资料：姓名${writerName || '（未填）'}，性别${writerGender || '（未填）'}。`;
      const subjectProfile = `被记录者资料：姓名${profileInfo.name||'（未填）'}，性别${profileInfo.gender||'（未填）'}，出生${profileInfo.birth||'（未填）'}，祖籍${profileInfo.origin||'（未填）'}，现居${profileInfo.residence||'（未填）'}${authorMode==='other'?`，与写作者关系${authorRelation||profileInfo.relation||'（未填）'}`:''}${profileInfo.education?`，学历${profileInfo.education}`:''}${profileInfo.occupation?`，职业${profileInfo.occupation}`:''}。`;
      
      const perspective = authorMode === 'other'
        ? `采用"关系视角"并使用第二人称"你"与写作者对话：问题聚焦"你与${authorRelation || '这位亲人'}"的互动细节与影响；`
        : '以第二人称"您/你"与当事人对话；';
      
      // 构建历史对话上下文
      const historyContext = historyQA.length > 0
        ? `\n\n历史问答（用于保持线性逻辑）：\n${historyQA.slice(-5).map((h, i) => `Q${i+1}: ${h.question}\nA${i+1}: ${h.answer}`).join('\n\n')}`
        : '';
      
      const system = `你是一位温暖、耐心的情感访谈引导者。${perspective}${writerProfile} ${subjectProfile} ${themeGuide}

当前阶段：${lifeStages[stageIdx]}

要求：
- 基于历史问答继续线性提问，保持逻辑连贯性和递进关系
- 问题优先级：①人生重大转折 ②深刻影响 ③情感深度
- 具体可回忆，有画面感（谁/何时/在哪/当时感觉/细节）
- 触及情绪与关系，不做空泛哲思
- 单句≤40字；仅输出一个问题，不要编号、前缀
- 如果是第一个问题，请开门见山直接询问本阶段最重要的经历或事件`;
      
      const userMsg = `当前阶段：${lifeStages[stageIdx]}${historyContext}

请基于上述历史对话（如有），提出下一个有深度、有逻辑连贯性的问题。`;
      
      const resp = await axios.post('/api/spark', { 
        model: 'x1', 
        messages: [ 
          { role: 'system', content: system }, 
          { role: 'user', content: userMsg } 
        ], 
        max_tokens: 150, 
        temperature: 0.4, 
        user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') 
      }, { headers: { Authorization: `Bearer ${token}` } });
      
      const question = (resp.data?.choices?.[0]?.message?.content || '').toString().trim();
      setCurrentQuestion(question);
      setCurrentQuestionId(historyQA.length + 1);
    } catch (err) {
      console.error('Generate linear question failed:', err);
      // 使用兜底问题
      const fallbackQuestions = {
        0: '童年时期，有没有一件事让您开始理解这个世界？',
        1: '少年时期，有没有遇到过影响您价值观的重要事件？',
        2: '青年阶段，有没有一个关键决定改变了您的人生轨迹？',
        3: '成年后，有没有经历过让您重新认识自己的重要时刻？',
        4: '中年时期，有没有做过一个艰难但重要的人生抉择？',
        5: '回顾人生，哪个时刻让您感受到自己真正成长了？',
        6: '关于未来，您最想实现的人生愿望是什么？'
      };
      setCurrentQuestion(fallbackQuestions[stageIdx] || '有没有一个改变您人生的重要时刻？');
      setCurrentQuestionId(1);
    } finally {
      setIsLoadingQ(false);
    }
  };

  // 保存每日回首答案（同时保存到后端历史和随手记）
  const saveDailyAnswer = async () => {
    const token = localStorage.getItem('token');
    if (!token) { navigate('/login'); return; }
    
    if (!answer.trim()) {
      alert('请先输入您的回答');
      return;
    }
    
    try {
      // 1. 保存到后端每日回首历史（用于AI线性提问）
      await axios.post('/api/daily/save-answer', {
        stage: currentStageIndex,
        question: currentQuestion,
        answer: answer,
        questionId: currentQuestionId
      }, { headers: { Authorization: `Bearer ${token}` } });
      
      // 2. 同时保存到随手记（打上"每日回首"标签）
      const authorMode = (localStorage.getItem('author_mode') || 'self');
      let relation = '';
      try { relation = (JSON.parse(localStorage.getItem('record_profile')||'{}')?.relation || '').trim(); } catch(_) {}
      const baseTags = ['每日回首', lifeStages[currentStageIndex]];
      const tags = (authorMode === 'other' && relation) ? [...baseTags, relation] : baseTags;
      const subjectVersion = localStorage.getItem('subject_version') || '';
      
      const content = `阶段：${lifeStages[currentStageIndex]}\n问题：${currentQuestion}\n回答：${answer}`;
      
      const memoResp = await axios.post('/api/memo', { 
        text: content, 
        tags, 
        media: [], 
        subjectVersion 
      }, { headers: { Authorization: `Bearer ${token}` } });
      
      const created = {
        id: memoResp.data?.id || `local-${Date.now()}`,
        text: content,
        tags,
        media: [],
        timestamp: memoResp.data?.timestamp || new Date().toISOString(),
        subjectVersion,
      };
      setMemosHome(prev => [created, ...(Array.isArray(prev)?prev:[])]);
      try { setMemosCtx && setMemosCtx(prev => [created, ...(Array.isArray(prev)?prev:[])]); } catch(_) {}
      
      // 3. 生成下一个问题
      setAnswer('');
      await generateLinearQuestion(currentStageIndex);
      
    } catch (err) {
      console.error('Save daily answer failed:', err);
      alert('保存失败，请重试');
    }
  };
  
  // 非线性旧方法已不使用；保留名称以免引用报错
  const handleSwap = async () => { await pickAndStoreQuestion(); };
  const handleSkip = async () => {
    setShowDailyCard(false); 
    setAnswer('');
  };

  // 新增：线性10问流程（使用后端 daily/session 接口）
  const [linearMode, setLinearMode] = useState(true);
  const [linearProgress, setLinearProgress] = useState(() => {
    let stageIndex = 0;
    try { stageIndex = Number(localStorage.getItem('daily_stage_idx') || '0') || 0; } catch(_) {}
    return { idx: 0, total: 10, stageIndex, completed: false };
  });
  const startLinear = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) { navigate('/login'); return; }
      const persistedStage = (()=>{ try{ return Number(localStorage.getItem('daily_stage_idx')||linearProgress.stageIndex)||0 }catch(_){ return linearProgress.stageIndex } })();
      const res = await axios.get(`/api/daily/session?stage=${persistedStage}`, { headers: { Authorization: `Bearer ${token}` } });
      const { currentIndex, total, completed, question } = res.data || {};
      setLinearProgress({ idx: currentIndex || 0, total: total || 10, stageIndex: persistedStage, completed: !!completed });
      try { localStorage.setItem('daily_stage_idx', String(persistedStage)); } catch(_) {}
      if (!completed) {
        setCurrentStageIndex(persistedStage);
        setCurrentQuestion(question || '...');
        setCurrentQuestionId((currentIndex || 0) + 1);
        setAnswer('');
        setShowDailyCard(true);
      }
    } catch (_) {
      // 保持线性模式，提示稍后再试
      setShowDailyCard(false);
    }
  };
  const answerAndNext = async () => {
    try {
      // 先保存当前答案，再立即清空输入，避免残留
      const prevAnswer = answer;
      setAnswer('');
      const token = localStorage.getItem('token');
      if (!token) { navigate('/login'); return; }
      const persistedStage = (()=>{ try{ return Number(localStorage.getItem('daily_stage_idx')||linearProgress.stageIndex)||0 }catch(_){ return linearProgress.stageIndex } })();
      const res = await axios.post('/api/daily/session/answer', { stage: persistedStage, answer: prevAnswer }, { headers: { Authorization: `Bearer ${token}` } });
      const { currentIndex, total, completed, question } = res.data || {};
      setLinearProgress({ idx: currentIndex || 0, total: total || 10, stageIndex: persistedStage, completed: !!completed });
      try { localStorage.setItem('daily_stage_idx', String(persistedStage)); } catch(_) {}
      if (completed) {
        // 切到下一阶段
        const next = await axios.post('/api/daily/session/next', { stage: persistedStage }, { headers: { Authorization: `Bearer ${token}` } });
        const nextStageIndex = next.data?.nextStageIndex ?? ((persistedStage + 1) % lifeStages.length);
        const suggest = !!next.data?.suggestGenerate;
        if (suggest) setShowSuggestCard(true);
        setLinearProgress({ idx: 0, total: 10, stageIndex: nextStageIndex, completed: false });
        try { localStorage.setItem('daily_stage_idx', String(nextStageIndex)); } catch(_) {}
        setShowDailyCard(false);
      } else {
        setCurrentStageIndex(persistedStage);
        setCurrentQuestion(question || '...');
        setCurrentQuestionId((currentIndex || 0) + 1);
      }
    } catch (_) {
      // 保持线性模式，避免跳段
    }
  };

  // 非线性备用：换题时清空答案（合并至同名函数）
  // 注意：线性模式下不调用此函数
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
      
      {/* 阶段和主题选择模态框 */}
      {showStageThemeSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowStageThemeSelector(false)} />
          <div className="relative z-10 bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">选择今天要回忆的阶段和主题</h2>
            <p className="text-sm text-gray-600 mb-4">选择一个人生阶段和您想重点记录的主题/事件</p>
            
            {/* 阶段选择 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">选择人生阶段</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {lifeStages.map((stage, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedDailyStage(idx)}
                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      selectedDailyStage === idx
                        ? 'bg-blue-600 border-blue-700 text-white'
                        : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400 hover:bg-blue-50'
                    }`}
                  >
                    {stage}
                  </button>
                ))}
              </div>
            </div>
            
            {/* 主题选择 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">选择重点主题/事件（可选，建议2-5个）</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto p-2 border rounded">
                {(STAGE_THEMES[selectedDailyStage] || []).map((theme) => {
                  const isSelected = (dailyThemes[selectedDailyStage] || []).includes(theme);
                  return (
                    <button
                      key={theme}
                      type="button"
                      onClick={() => {
                        setDailyThemes(prev => {
                          const stageThemes = prev[selectedDailyStage] || [];
                          if (stageThemes.includes(theme)) {
                            return { ...prev, [selectedDailyStage]: stageThemes.filter(t => t !== theme) };
                          } else {
                            return { ...prev, [selectedDailyStage]: [...stageThemes, theme] };
                          }
                        });
                      }}
                      className={`px-2 py-1.5 rounded border text-xs font-medium transition-colors ${
                        isSelected 
                          ? 'bg-blue-600 border-blue-700 text-white' 
                          : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400'
                      }`}
                    >
                      {theme}
                    </button>
                  );
                })}
              </div>
            </div>
            
            {(dailyThemes[selectedDailyStage] || []).length > 0 && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm font-medium text-gray-700 mb-2">已选择的主题/事件：</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {(dailyThemes[selectedDailyStage] || []).map((theme) => (
                    <span key={theme} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-600 text-white text-xs rounded-full">
                      {theme}
                      <button
                        type="button"
                        onClick={() => {
                          setDailyThemes(prev => ({
                            ...prev,
                            [selectedDailyStage]: (prev[selectedDailyStage] || []).filter(t => t !== theme)
                          }));
                        }}
                        className="hover:bg-blue-700 rounded-full"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <p className="text-xs text-blue-700">
                  💡 提示：建议与"创作传记"中{lifeStages[selectedDailyStage]}阶段的主题保持一致
                </p>
              </div>
            )}
            
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowStageThemeSelector(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={startDailyWithStageTheme}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                开始每日回首
              </button>
            </div>
          </div>
        </div>
      )}
      
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
              <span>📝</span>
              <span className="font-medium">{lang === 'zh' ? '每日回首' : 'Daily Reflection'}</span>
            </button>
          </div>
          <p className="mt-4 text-base sm:text-lg text-gray-700">
            {slogans[sloganIndex] || (lang === 'zh' ? '让记忆延续，让精神成为家族的财富' : 'Memories continue, love is passed on')}
          </p>
          
          {/* 每日回首弹窗 */}
          {showDailyCard && (
            <div className="fixed inset-0 z-40 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
              <div className="relative z-50 card w-11/12 max-w-xl text-left p-4 sm:p-5" role="dialog" aria-modal="true" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 60%)', borderColor: '#e5e7eb' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm text-gray-600">每日回首 · {lifeStages[currentStageIndex]}</div>
                  <button 
                    type="button"
                    onClick={() => setShowStageThemeSelector(true)}
                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    更换阶段/主题
                  </button>
                </div>
                {(dailyThemes[currentStageIndex] || []).length > 0 && (
                  <div className="mb-2">
                    <div className="flex flex-wrap gap-1 mb-1">
                      <span className="text-xs text-gray-600">关注：</span>
                      {(dailyThemes[currentStageIndex] || []).map((theme) => (
                        <span key={theme} className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                          {theme}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-blue-600">
                      💡 建议与"创作传记"中的主题保持一致，生成效果更好
                    </p>
                  </div>
                )}
                <div className="text-lg font-semibold text-gray-900 mb-3">{isLoadingQ ? '正在生成问题…' : (currentQuestion || '...')}</div>
                <textarea
                  className="input w-full mb-3"
                  placeholder={lang === 'zh' ? '在这里写下您的回答…' : 'Write your answer...'}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={4}
                  maxLength={1000}
                />
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-secondary" onClick={handleSkip}>稍后再答</button>
                  <button className="btn btn-primary" onClick={saveDailyAnswer} disabled={!answer.trim()}>
                    提交并继续
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">💡 提示：答案会自动保存到随手记（带"每日回首"标签），最终可一键生成完整传记</p>
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
              aria-label={lang === 'zh' ? '家族树' : 'Family Tree'}
              onClick={() => navigate(isLoggedIn ? '/family' : '/login')}
              className="text-left p-4 rounded-lg transition shadow-sm border ring-1 ring-blue-200 bg-gradient-to-br from-blue-200 to-blue-300 text-slate-900 border-blue-200 hover:from-blue-300 hover:to-blue-400"
            >
              <div className="text-2xl mb-1">🌳</div>
              <h3 className="font-semibold text-lg text-slate-900">{lang === 'zh' ? '家族树' : 'Family Tree'}</h3>
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