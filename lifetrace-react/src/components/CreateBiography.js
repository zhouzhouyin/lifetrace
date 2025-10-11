import { useState, useEffect, useContext, useRef } from 'react';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { AppContext } from '../context/AppContext';
import DOMPurify from 'dompurify';

// 重试函数
const retry = async (fn, retries = 5, delay = 2000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if ((err.response?.status === 429 || err.response?.status === 403) && i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        continue;
      }
      throw err;
    }
  }
};

// 清理用户输入
const sanitizeInput = (input) => {
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
};

const CreateBiography = () => {
  const { setPublicBiographies, isLoggedIn, setNotes, username, setFreeBiography, t } = useContext(AppContext);
  const [polishedBiography, setPolishedBiography] = useState('');
  const polishedRef = useRef(null);
  const [isPolishing, setIsPolishing] = useState(false);
  const [isGeneratingChapters, setIsGeneratingChapters] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [publicBio, setPublicBio] = useState(false);
  const [shareToFamily, setShareToFamily] = useState(false);
  const [bioTitle, setBioTitle] = useState('');
  const [bioSummary, setBioSummary] = useState('');
  const [polishingSectionIndex, setPolishingSectionIndex] = useState(null);
  const [isSummaryPolishing, setIsSummaryPolishing] = useState(false);
  const [isBatchPolishing, setIsBatchPolishing] = useState(false);
  const [batchPolishBackup, setBatchPolishBackup] = useState(null);
  // 按问答分段生成功能已撤销
  const [editingNoteId, setEditingNoteId] = useState('');

  const [materialsText, setMaterialsText] = useState('');
  const [familyShare, setFamilyShare] = useState(false);
  // 去掉独立"制作视频"功能
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  // 永恒计划引导
  const [showEternalPrompt, setShowEternalPrompt] = useState(false);
  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [agreePolicies, setAgreePolicies] = useState(() => {
    try { return localStorage.getItem('agree_policies') === '1'; } catch (_) { return false; }
  });
  // 情感陪伴师访谈
  const [chatMessages, setChatMessages] = useState([]); // {role:'assistant'|'user', content:string}[]
  const [answerInput, setAnswerInput] = useState('');
  const [isInterviewing, setIsInterviewing] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isIatRecording, setIsIatRecording] = useState(false);
  const asrWsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const iatSnMapRef = useRef(new Map());
  const iatFullTextRef = useRef('');
  const answerBasePrefixRef = useRef('');
  // 语音设置（UI已移除，仅保留默认参数以兼容逻辑）
  const autoPunc = true;
  const accent = 'mandarin';
  const silenceMs = 800;
  const maxDurationSec = 60;
  const confirmBeforeWrite = false;
  const pendingTranscript = '';
  const setVuLevel = () => {};
  const setElapsedSec = () => {};
  const setPendingTranscript = () => {};
  const timerRef = useRef(null);
  const [isAsking, setIsAsking] = useState(false);
  const lifeStages = ['童年', '少年', '青年', '成年', '中年', '当下', '未来愿望'];
  const stageFeedbacks = [
    '恭喜您，童年的一页被温柔地翻开。那些最初的光，已被珍藏。',
    '恭喜您，又一段少年的热望被记录。愿勇气与纯真常在心间。',
    '恭喜您，青年的选择与相遇已被写下。这一路的热爱，值得回望。',
    '恭喜您，成年的责任与成就被铭记。您的坚持，让爱与生活更有方向。',
    '恭喜您，中年的沉淀化为精神财富。您的经验，会照亮家族的道路。',
    '恭喜您，此刻的思绪已被好好托付。当下的珍贵，会连接过去与未来。',
    '恭喜您，未来的心愿被郑重保留。愿期盼有回响，生命有延续。',
  ];
  const [stageIndex, setStageIndex] = useState(0);
  const [autoSpeakAssistant, setAutoSpeakAssistant] = useState(false);
  const [stageTurns, setStageTurns] = useState(Array(7).fill(0));
  const MAX_QUESTIONS_PER_STAGE = 8;
  const [shortContext, setShortContext] = useState(true); // 默认开启：仅带最近 3 轮
  const chatContainerRef = useRef(null);
  const sectionTextareaRef = useRef(null);
  const answerInputRef = useRef(null);
  const stageDecisionRef = useRef({ stageIndex: null, nextStageIndex: null });
  const closurePendingRef = useRef(null);
  const thresholdWarnedRef = useRef(new Set());
  const forcedClosedRef = useRef(new Set());
  const limitPromptShownRef = useRef(new Set());
  const allowBeyondLimitRef = useRef(new Set());
  // 首次"开始访谈"仅展示基础资料开场
  const [hasShownOpening, setHasShownOpening] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false); // 手机端专注模式
  const isSmallScreen = () => { try { return window.innerWidth < 640; } catch (_) { return false; } };
  
  // 用户自定义主题引导
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [currentThemeStageIndex, setCurrentThemeStageIndex] = useState(0);
  const [userThemes, setUserThemes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user_themes') || '{}'); } catch(_) { return {}; }
  });
  
  // 预设主题/事件库：每个阶段的重要主题和关键事件选项
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
    try { localStorage.setItem('user_themes', JSON.stringify(userThemes)); } catch(_){}
  }, [userThemes]);
  const focusContentRef = useRef(null);
  const [isFocusEditing, setIsFocusEditing] = useState(false);
  const stageScrollRef = useRef(null);
  const stageBtnsRef = useRef([]);
  const centerStageChip = (idx) => {
    try {
      const container = stageScrollRef.current;
      const el = stageBtnsRef.current[idx];
      if (!container || !el) return;
      const target = el.offsetLeft - (container.clientWidth / 2) + (el.clientWidth / 2);
      const maxScroll = container.scrollWidth - container.clientWidth;
      container.scrollTo({ left: Math.max(0, Math.min(target, maxScroll)), behavior: 'smooth' });
    } catch (_) {}
  };

  // 风格偏好（文风/严格/具体/长度/自定义文风）
  const [prefTone, setPrefTone] = useState(() => {
    try { return localStorage.getItem('ai_pref_tone') || 'warm'; } catch (_) { return 'warm'; }
  });
  const [prefStrict, setPrefStrict] = useState(() => {
    try { return localStorage.getItem('ai_pref_strict') || 'strict'; } catch (_) { return 'strict'; }
  });
  const [prefConcrete, setPrefConcrete] = useState(() => {
    try { return localStorage.getItem('ai_pref_concrete') || 'high'; } catch (_) { return 'high'; }
  });
  const [prefLength, setPrefLength] = useState(() => {
    try { return localStorage.getItem('ai_pref_length') || 'medium'; } catch (_) { return 'medium'; }
  });
  const [customTone, setCustomTone] = useState(() => {
    try { return localStorage.getItem('ai_custom_tone') || ''; } catch (_) { return ''; }
  });
  const [showStylePanel, setShowStylePanel] = useState(() => {
    try { return !(window && window.innerWidth < 640); } catch (_) { return true; }
  });

  // 保存到本地 & 同步后端（最佳努力）
  useEffect(() => {
    try {
      localStorage.setItem('ai_pref_tone', prefTone);
      localStorage.setItem('ai_pref_strict', prefStrict);
      localStorage.setItem('ai_pref_concrete', prefConcrete);
      localStorage.setItem('ai_pref_length', prefLength);
      localStorage.setItem('ai_custom_tone', customTone);
    } catch (_) {}
    // 同步后端
    (async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        await axios.post('/api/user/prefs', {
          tone: prefTone,
          strict: prefStrict,
          concreteness: prefConcrete,
          length: prefLength,
          customTone: customTone,
        }, { headers: { Authorization: `Bearer ${token}` } });
      } catch (_) {}
    })();
  }, [prefTone, prefStrict, prefConcrete, prefLength, customTone]);

  // 启动时尝试从后端拉取（覆盖本地默认）
  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const res = await axios.get('/api/user/prefs', { headers: { Authorization: `Bearer ${token}` } });
        const p = res.data || {};
        if (p.tone) setPrefTone(p.tone);
        if (p.strict) setPrefStrict(p.strict);
        if (p.concreteness) setPrefConcrete(p.concreteness);
        if (p.length) setPrefLength(p.length);
        if (p.customTone) setCustomTone(p.customTone);
      } catch (_) {}
    })();
  }, []);

  // 构建风格约束（提问/生成）
  const buildStyleRules = (kind = 'ask') => {
    // 文风（支持自定义）
    let styleText = '';
    if (customTone && customTone.trim()) {
      styleText = `文风${customTone.trim()}`;
    } else {
      styleText = (
      prefTone === 'warm' ? '文风温情内敛、细腻但不煽情' :
      prefTone === 'poetic' ? '文风诗意、比喻克制、意境自然' :
      prefTone === 'humorous' ? '文风幽默风趣但分寸得体' :
        prefTone === 'literary' ? '文风文学化、富有感染力但不过度修饰' :
        prefTone === 'plain' ? '文风平实客观、真实不加修饰' :
        '文风温情内敛、细腻但不煽情'
      );
    }
    
    // 严格度
    const strictText = prefStrict === 'strict' 
      ? '绝不脑补、不得新增或推断未出现的细节' 
      : prefStrict === 'moderate'
      ? '基于已知事实可适度推断合理细节，但需谨慎'
      : '可根据上下文适当补充场景细节';
    
    // 具体度
    const concreteText = prefConcrete === 'high'
      ? '强调具体人/事/时/地/物与动作细节，避免空泛与抽象词'
      : prefConcrete === 'medium'
      ? '注重具体细节，适当使用抽象概括'
      : '以抽象概括为主，细节为辅';
    
    // 长度
    const lenAsk = prefLength === 'long' ? '反馈≤50字，问题≤80字' : (prefLength === 'medium' ? '反馈≤40字，问题≤60字' : '反馈≤30字，问题≤40字');
    const lenGen = prefLength === 'long' ? '本段≤1200字' : (prefLength === 'medium' ? '本段≤800字' : '本段≤500字');
    
    const adapt = '如检测到悲伤/庄重情境（如离别、疾病、悼念等），自动将文风调为更克制与庄重，避免不合时宜的幽默或过度修辞。';
    
    // 根据严格度调整
    const noFill = prefStrict === 'strict' 
      ? '长度提升不得以新增事实为代价，禁止为凑长度而虚构或推断' 
      : prefStrict === 'moderate'
      ? '可适度推断合理细节以丰富叙述，但需谨慎'
      : '可根据上下文补充场景细节以增强可读性';
    
    const investigative = '侦查：围绕"谁/何时/何地/因果/动作/对话/证据"提问，但优先聚焦对人生有深远影响的关键时刻，避免抽象词与琐碎细节。';
    const strengths = '优势：刻画能力、选择、韧性与体察，克制不煽情。深挖关键决策背后的思考过程、艰难抉择中的内心挣扎。';
    const conflict = '冲突：时代与个人叙述不一致时，不下结论，给出可能区间/可能解释，提示核对。';
    const eraGuide = '时代：若时间模糊，请用当时的大事件作参照帮助定位时间范围；发现疑似错误时给出两个可能范围供选择。';
    const flowGuide = '流程：先让用户说本阶段最重要、最难忘的经历→补具体细节→再核对时间顺序与关系。避免停留在表层琐事。';
    const logicGuide = '逻辑：深入询问动机、触发点、权衡、替代方案、当时即时反应与后果，重点挖掘改变人生轨迹的关键节点。';
    if (kind === 'ask') return `${styleText}；${strictText}；${concreteText}；${investigative}；${strengths}；${conflict}；${eraGuide}；${flowGuide}；${logicGuide}；${adapt}；${lenAsk}`;
    return `${styleText}；${strictText}；${concreteText}；${investigative}；${strengths}；${conflict}；${eraGuide}；${flowGuide}；${logicGuide}；${adapt}；${noFill}；${lenGen}`;
  };

  const getGenMaxChars = () => {
    return prefLength === 'long' ? 1200 : (prefLength === 'medium' ? 800 : 500);
  };

  // 硬性约束：根据用户设置调整
  const buildHardConstraints = () => {
    if (prefStrict === 'strict') {
      return '只使用用户提供的信息；不要添加任何未提及或猜测性的细节、场景、情感或人物。信息不足时用中性过渡语，不脑补。发现时间节点疑似错误：给出"可能区间/两种可能解释"，提示用户核对，不得自定时间。遇到价值/选择冲突：中立呈现各方约束与考虑，提供温和的自我解释与关系建议，不评判。';
    } else if (prefStrict === 'moderate') {
      return '主要使用用户提供的信息，可基于已知事实适度推断合理细节。发现时间节点疑似错误：给出"可能区间/两种可能解释"，提示用户核对。遇到价值/选择冲突：中立呈现各方约束与考虑，提供温和的建议。';
    } else {
      return '基于用户提供的信息，可根据上下文适当补充场景细节以增强可读性。遇到冲突或疑问时，提供合理的解释和建议。';
    }
  };

  // 显示用阶段标签：统一为"xxx回忆"（未来愿望保持不变）
  const getStageLabelByIndex = (idx) => {
    const base = lifeStages[Math.max(0, Math.min(idx, lifeStages.length - 1))] || '';
    if (base === '未来愿望') return base;
    return `${base}回忆`;
  };

  // 从篇章文本抽取时间线索（年份/年代/年龄/学段等）用于自动锚定
  const extractTimeHintsFromText = (text) => {
    const s = (text || '').toString();
    const hints = [];
    const yearRe = /(19\d{2}|20\d{2})年?/g;
    const ageRe = /([一二三四五六七八九十\d]{1,3})岁/g;
    const stageRe = /(小学|初中|高中|大学|大一|大二|大三|研究生|工作初期|结婚|生子)/g;
    let m;
    while ((m = yearRe.exec(s)) !== null) hints.push({ type: 'year', value: m[1] });
    while ((m = ageRe.exec(s)) !== null) hints.push({ type: 'age', value: m[1] });
    let ms;
    while ((ms = stageRe.exec(s)) !== null) hints.push({ type: 'stage', value: ms[1] });
    return hints;
  };
  // 注意：自动锚定放在 sections 声明之后，避免 TDZ 报错

  // 时代锚点功能已移除，统一使用主题/事件选择

  // 篇章区域展示用标签：显示为"X篇"（不影响情感访谈师区域）
  const getSectionLabelByIndex = (idx) => {
    const base = lifeStages[Math.max(0, Math.min(idx, lifeStages.length - 1))] || '';
    return `${base}篇`;
  };

  // 检测语音输入支持
  useEffect(() => {
    try {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      setSpeechSupported(!!SR);
    } catch (_) {
      setSpeechSupported(false);
    }
  }, []);
  // 若未查看隐私/条款，强制清除同意并弹窗
  useEffect(() => {
    try {
      const vp = localStorage.getItem('viewed_privacy') === '1';
      const vt = localStorage.getItem('viewed_terms') === '1';
      if (!(vp && vt)) {
        try { localStorage.removeItem('agree_policies'); } catch(_){}
        setAgreePolicies(false);
        setPolicyModalOpen(true);
      }
    } catch (_) {}
  }, []);

  // 导入原始采访数据
  useEffect(() => {
    try {
      const importData = localStorage.getItem('importInterviewData');
      if (importData) {
        const data = JSON.parse(importData);
        if (data.title) {
          setBioTitle(data.title);
        }
        if (data.sections && Array.isArray(data.sections)) {
          setSections(data.sections);
        }
        if (data.themes) {
          setUserThemes(data.themes);
        }
        localStorage.removeItem('importInterviewData');
        setMessage('已导入原始采访记录，您可以重新生成传记内容');
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (err) {
      console.error('Import interview data error:', err);
    }
  }, []);

  // 每日回首粘贴板：从本地或路由 state 写入对应篇章
  useEffect(() => {
    try {
      // 1) 优先读取路由状态传来的 pasteItems（避免时序问题）
      const state = location.state || {};
      if (Array.isArray(state.pasteItems) && state.pasteItems.length > 0) {
        const items = state.pasteItems;
        let firstIdx = 0;
        try { firstIdx = Math.max(0, Math.min(...items.map(it => Number(it.stageIndex)||0))); } catch(_) { firstIdx = 0; }
        setSections(prev => {
          const next = [...prev];
          for (const it of items) {
            const idx = Math.max(0, Math.min(Number(it.stageIndex) || 0, next.length - 1));
            const base = (next[idx]?.text || '').toString();
            const addition = (it.text || '').toString();
            const merged = base ? (base + '\n' + addition) : addition;
            next[idx] = { ...next[idx], text: merged };
          }
          return next;
        });
        // 跳到首个涉及的篇章，便于立刻看到粘贴结果
        try {
          setCurrentSectionIndex(firstIdx);
          setStageIndex(firstIdx);
          setTimeout(() => centerStageChip(firstIdx), 0);
          setTimeout(() => {
            try {
              if (sectionTextareaRef.current) {
                sectionTextareaRef.current.scrollTop = sectionTextareaRef.current.scrollHeight;
              }
            } catch (_) {}
          }, 50);
        } catch(_) {}
        setMessage('已把选中的随手记粘贴到对应篇章');
        setTimeout(() => setMessage(''), 1200);
        return; // 已处理则不再读本地板
      }

      // 2) 读取本地板（兼容旧逻辑）
      const raw = localStorage.getItem('dailyPasteboard');
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (!obj || !Array.isArray(obj.items) || obj.items.length === 0) return;
      const items = obj.items;
      setSections(prev => {
        const next = [...prev];
        for (const it of items) {
          const idx = Math.max(0, Math.min(Number(it.stageIndex) || 0, next.length - 1));
          const base = (next[idx]?.text || '').toString();
          const addition = (it.text || '').toString();
          const merged = base ? (base + '\n' + addition) : addition;
          next[idx] = { ...next[idx], text: merged };
        }
        return next;
      });
      // 清空粘贴板
      localStorage.removeItem('dailyPasteboard');
      setMessage('已粘贴最新问答到对应篇章');
      setTimeout(() => setMessage(''), 1500);
    } catch (_) {}
  }, []);
  // 图文并茂篇章（每篇章：title + text + media[]）——固定为各阶段一一对应
  const [sections, setSections] = useState(Array.from({ length: lifeStages.length }, () => ({ title: '', text: '', media: [] })));
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0); // 用户主动选择的当前篇章
  // 访谈节流：防止用户过快连续提问
  const lastAskAtRef = useRef(0);
  const MIN_INTERVAL_MS = 3200;
  const throttleDelay = (ms) => new Promise(r => setTimeout(r, ms));
  const callSparkThrottled = async (payload, token, opts = {}) => {
    const now = Date.now();
    const diff = now - (lastAskAtRef.current || 0);
    if (diff < MIN_INTERVAL_MS) {
      if (!opts.silentThrottle) setMessage('请求过快，正在缓冲…');
      await throttleDelay(MIN_INTERVAL_MS - diff);
    }
    lastAskAtRef.current = Date.now();
    setMessage('');
    return axios.post('/api/spark', payload, { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 });
  };

  // 确保某阶段对应的篇章存在，并将其设为当前篇章
  const ensureSectionForStage = (stageIdx) => {
    // 固定阶段篇章已在初始化时生成，这里仅同步当前索引
    setCurrentSectionIndex(Math.max(0, Math.min(stageIdx, lifeStages.length - 1)));
  };

  // 若Q&A不足，先发起一次有针对性的追问再生成
  const maybeAskFollowUpBeforeGenerate = async (sectionIndex) => {
    try {
      const txt = (sections[sectionIndex]?.text || '').toString();
      const answers = (txt.match(/^我：/gm) || []).length;
      const plainLen = txt.replace(/^陪伴师：.*$/gm, '').length;
      if (answers >= 2 && plainLen >= 80) return false; // 足够生成
      const token = localStorage.getItem('token');
      if (!token) return false;
      const stageName = getStageLabelByIndex(sectionIndex);
      const perspectiveKick = (authorMode === 'other')
        ? `请用第二人称"你"，采用关系视角，面向写作者追问与"${authorRelation || profile?.relation || '这位亲人'}"相关的一个关键细节。`
        : '请用第二人称"您/你"提出一个关键细节问题。';
      const askRule = `目的：当前材料不足以顺畅成文，请先提出一个最关键、最具体的问题以补齐细节（仅一句）。${buildStyleRules('ask')}`;
      const system = `你是一位温暖而克制的引导者。当前阶段：${stageName}。${perspectiveKick} ${askRule}`;
      const snippet = txt.slice(-800);
      const messages = [
        { role: 'system', content: system },
        { role: 'user', content: `以下是已收集的部分问答片段：\n\n${snippet}\n\n请仅输出一个最关键的追问（仅一句），不要其它文字。` },
      ];
      const resp = await callSparkThrottled({ model: 'x1', messages, max_tokens: 120, temperature: 0.3,
        user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') }, token, { silentThrottle: true });
      const q = (resp.data?.choices?.[0]?.message?.content || '').toString().trim();
      if (q) {
        const out = finalizeAssistant(q);
        setChatMessages(prev => [...prev, { role: 'assistant', content: out }]);
        appendLineToSection(sectionIndex, `陪伴师：${out}`);
        setMessage('信息稍显不足，我已补充一个追问，请先回答再生成本篇回忆');
        setTimeout(() => setMessage(''), 1600);
        return true; // 已追问，暂不生成
      }
    } catch (_) {}
    return false;
  };

  // 将一行文本追加到指定篇章（自动换行）
  const appendLineToSection = (sectionIndex, line) => {
    if (sectionIndex == null || sectionIndex < 0) return;
    const safeLine = (line || '').toString();
    if (!safeLine) return;
    setSections(prev => prev.map((s, i) => (
      i === sectionIndex
        ? { ...s, text: (s.text ? s.text + '\n' : '') + safeLine }
        : s
    )));
    // 追加后滚动到篇章底部，展示最新一行
    try {
      setTimeout(() => {
        if (sectionTextareaRef.current) {
          sectionTextareaRef.current.scrollTop = sectionTextareaRef.current.scrollHeight;
        }
      }, 0);
    } catch (_) {}
  };

  // 最近用户是否表述"记不清/想不起来"等
  const lastUserSaysCantRecall = (sectionIndex) => {
    try {
      const txt = (sections[sectionIndex]?.text || '').toString();
      const lines = txt.split(/\r?\n/).reverse();
      for (const line of lines) {
        const s = (line || '').trim();
        if (!s) continue;
        if (s.startsWith('陪伴师：')) continue;
        if (s.startsWith('我：')) {
          const v = s.slice(2);
          return /(不记得|想不起来|记不清|不太确定|忘了)/.test(v);
        }
      }
    } catch (_) {}
    return false;
  };

  // 提取最近用户回答中的锚点词（原词片段，≥2字符），用于小结问题绑定上下文
  const getRecentUserAnchors = (sectionIndex, maxAnchors = 6) => {
    try {
      const txt = (sections[sectionIndex]?.text || '').toString();
      const lines = txt.split(/\r?\n/).reverse();
      const userLines = [];
      for (const line of lines) {
        const s = (line || '').trim();
        if (!s) continue;
        if (s.startsWith('我：')) {
          userLines.push(s.slice(2));
          if (userLines.length >= 8) break;
        }
        if (s.startsWith('陪伴师：')) continue;
      }
      const stopwords = new Set(['我','我们','当时','后来','然后','现在','那里','这里','那个','这个','就是','因为','所以','但是','而且','以及','还有','可能','觉得','有点','一点','比较','非常','特别']);
      const anchors = [];
      for (const ul of userLines) {
        const parts = (ul || '').split(/[\s,，。\.！？!？；;:：、\-\(\)\[\]【】"“”']/).filter(Boolean);
        for (const p of parts) {
          const token = p.trim();
          if (token.length >= 2 && !stopwords.has(token)) {
            if (!anchors.includes(token)) anchors.push(token);
            if (anchors.length >= maxAnchors) break;
          }
        }
        if (anchors.length >= maxAnchors) break;
      }
      return anchors;
    } catch(_) { return []; }
  };

  // 校验小结问题是否真正引用了上文且无引入新内容
  const validateClosureQuestion = (q, anchors) => {
    const s = (q || '').toString().trim();
    if (!s) return false;
    // 不允许诱导新增信息的词
    if (/(还有(什么|哪些)|有没有|能再|再说|更多|更详细|补充|别的|其他|其它|另一个|另一段|换一个|新的)/.test(s)) return false;
    // 必须包含至少一个锚点词（原词片段）
    if (anchors && anchors.length > 0) {
      const hit = anchors.some(a => a && s.includes(a));
      if (!hit) return false;
    }
    // 长度控制，保持一句话
    if (s.length > 50) return false;
    return true;
  };

  // 草稿恢复与自动保存（返回预览后不丢失）
  const draftRestoreRef = useRef(false);
  useEffect(() => {
    if (draftRestoreRef.current) return;
    try {
      const raw = localStorage.getItem('createDraft');
      if (raw) {
        const d = JSON.parse(raw);
        if (d && typeof d === 'object') {
          if (typeof d.bioTitle === 'string') setBioTitle(d.bioTitle);
          if (typeof d.bioSummary === 'string') setBioSummary(d.bioSummary);
          if (Array.isArray(d.sections)) {
            const normalized = d.sections.map((s = {}) => ({
              title: (s && s.title) || '',
              text: (s && s.text) || '',
              media: Array.isArray(s && s.media) ? s.media : [],
            }));
            // 合并草稿与现有（保留已存在文本，如来自随手记粘贴）
            setSections(prev => {
              const base = Array.isArray(prev) && prev.length === lifeStages.length ? prev : Array.from({ length: lifeStages.length }, () => ({ title: '', text: '', media: [] }));
              return base.map((p, i) => {
                const src = normalized[i] || { title: '', text: '', media: [] };
                const keepText = (p.text || '').trim().length > 0 ? p.text : src.text;
                const keepTitle = (p.title || '').trim().length > 0 ? p.title : src.title;
                const media = (p.media && p.media.length > 0) ? p.media : (src.media || []);
                return { title: keepTitle, text: keepText, media };
              });
            });
          }
        }
      }
    } catch (_) {}
    draftRestoreRef.current = true;
  }, []);
  // 首次进入强制同意隐私与条款
  useEffect(() => {
    try { if (!agreePolicies) setPolicyModalOpen(true); } catch(_){}
  }, []);
  useEffect(() => {
    try { if (!agreePolicies) setPolicyModalOpen(true); } catch(_){}
  }, [agreePolicies]);
  useEffect(() => {
    const tid = setTimeout(() => {
      try {
        const data = { bioTitle, bioSummary, sections };
        localStorage.setItem('createDraft', JSON.stringify(data));
      } catch (_) {}
    }, 300);
    return () => clearTimeout(tid);
  }, [bioTitle, bioSummary, sections]);


  // 批量润色各个篇章（不生成总传记、不改媒体）
  const handleBatchPolishSections = async () => {
    const nonEmptyCount = sections.filter(s => (s.text || '').trim().length > 0).length;
    if (nonEmptyCount === 0) {
      setMessage('暂无可润色内容，请先在某个篇章填写正文');
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) {
      setMessage('请先登录以使用 AI 润色');
      setTimeout(() => navigate('/login'), 1000);
      return;
    }
    setIsBatchPolishing(true);
    // 备份以便撤销
    const backup = JSON.parse(JSON.stringify(sections));
    setBatchPolishBackup(backup);
    try {
      for (let i = 0; i < sections.length; i++) {
        const original = (sections[i]?.text || '').trim();
        if (!original) continue;
        setMessage(`正在润色：第 ${i + 1}/${sections.length} 篇章…`);
        const system = '你是一位专业的文本润色助手。仅润色用户提供的这一章内容，使其更流畅、自然、朴素而真挚；保持第一人称与事实细节（姓名、地名、时间等）；不新增编造的事实；不添加总结或标题；仅输出润色后的正文；输出不超过5000字。请并用“追踪视角（谁/何时/何地/因果/动作/对话/证据）”与“优势视角（能力/选择/韧性/体察）”，遇到时间冲突仅提示可能区间与核对建议，禁止自定具体时间。';
        const messages = [
          { role: 'system', content: system },
          { role: 'user', content: `请润色这一章内容：\n${original}` },
        ];
        try {
          const resp = await retry(() => callSparkThrottled({ model: 'x1', messages, max_tokens: 1200, temperature: 0.5, user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') }, token, { silentThrottle: true }));
          const polished = (resp.data?.choices?.[0]?.message?.content || '').toString().trim();
          if (polished) {
            setSections(prev => prev.map((s, idx) => idx === i ? { ...s, text: polished } : s));
          }
        } catch (_) { /* 忽略该章错误，继续下一章 */ }
      }
      setMessage('各个篇章已完成润色');
    } catch (err) {
      console.error('Batch polish error:', err);
      setMessage('批量润色失败：' + (err.response?.data?.message || err.message));
    } finally {
      setIsBatchPolishing(false);
    }
  };

  const handleUndoBatchPolish = () => {
    if (!batchPolishBackup) {
      setMessage('没有可撤销的润色');
      return;
    }
    setSections(batchPolishBackup);
    setBatchPolishBackup(null);
    setMessage('已撤销上次润色');
  };

  // 规范陪伴师输出：移除"下一个问题"标签，仅保留反馈与问题本身
  const normalizeAssistant = (raw, { dropQuestion = false } = {}) => {
    const text = (raw || '').toString();
    const m = text.match(/下一个问题[:：]\s*([\s\S]+)/);
    let feedback = text.trim();
    let question = '';
    if (m) {
      feedback = text.slice(0, m.index).trim();
      question = (m[1] || '').trim();
      const cut = question.search(/[。！？?!]/);
      if (cut !== -1) question = question.slice(0, cut + 1);
    }
    if (dropQuestion) return feedback || '';
    if (!question) return feedback || '';
    return `${feedback ? feedback + ' ' : ''}${question}`.trim();
  };

  // 陪伴师输出后处理：降温、限长、关系称谓替换与问句规范
  const finalizeAssistant = (text) => {
    let s = (text || '').toString().trim();
    // 删除明显煽情/抽象词
    const banned = ['伟大', '崇高', '灵魂', '使命', '精神内核', '力量', '澎湃', '震撼', '永恒', '史诗', '注定', '宿命', '意义'];
    for (const w of banned) s = s.replace(new RegExp(w, 'g'), '');
    // 去掉"下一个问题"等提示词
    s = s.replace(/下一个问题[:：]?/g, '').trim();
    // 他/她 → 关系称谓（仅在为他人模式）
    try {
      if (authorMode === 'other' && (authorRelation || profile?.relation)) {
        const rel = authorRelation || profile?.relation || '这位亲人';
        s = s.replace(/(?<![你您])[他她]\b/g, rel);
      }
    } catch (_) {}
    // 限长：反馈+问题不宜过长
    if (s.length > 140) s = s.slice(0, 140);
    // 结尾若无问号且语气是提问，则补问号
    if (/[你您]/.test(s) && !/[?？]$/.test(s)) s = s.replace(/。?$/, '') + '？';
    return s.trim();
  };

  // 叙述后处理：
  // - 为他人模式时，将可能的"在他的/她的记忆…"改为"在我的记忆…"，
  // - 优先使用关系称谓替换含"他的/她的"的指代，
  // - 若全文缺少"我/我的"，补充一个"在我的记忆里，"作为开场以确保第一人称视角。
  const finalizeNarrative = (rawText) => {
    let s = (rawText || '').toString().trim();
    try {
      if (authorMode === 'other') {
        const rel = (authorRelation || profile?.relation || '这位亲人').toString();
        // 关系称谓优先，避免"他/她"的模糊指代（仅在所有格场景下替换）
        s = s.replace(/(?<![你您我])[他她]的/g, `${rel}的`);
        // 记忆/印象类常见短语统一改为"我的"
        s = s.replace(/在[他她]的记忆深处/g, '在我的记忆深处');
        s = s.replace(/在[他她]的记忆里/g, '在我的记忆里');
        s = s.replace(/在[他她]的记忆中/g, '在我的记忆中');
        s = s.replace(/在[他她]的印象里/g, '在我的印象里');
        s = s.replace(/在[他她]的印象中/g, '在我的印象中');
        // 诸如"他/她""她/他""他（她）""她（他）" → 关系称谓
        s = s.replace(/他\/她|她\/他|他（她）|她（他）|他\(她\)|她\(他\)/g, rel);
        // 若几乎没有第一人称痕迹，则补一个柔和的第一句前缀
        if (!/[\b我\b]|我的/.test(s)) {
          s = `在我的记忆里，${s}`;
        }
      }
    } catch (_) {}
    return s;
  };

  // 是否包含问号
  const hasQuestionMark = (text) => /[?？]/.test((text || '').toString());

  // 首轮温馨提示尾句（仅在每个阶段的第一个问题时追加一次）
  const withFirstQuestionTip = (text) => {
    try {
      let s = (text || '').toString().trim();
      if (!s) return s;
      const tip = '（温馨提示：每个问题都尽量多提供细节信息，如：当时的地点、在场的人、发生了什么，以及你的感受，提供后续整理出来更加准确的回忆）';
      // 避免重复添加
      if (s.includes('温馨提示：')) return s;
      return s + ' ' + tip;
    } catch (_) { return text; }
  };

  // 若缺少问号，则让模型补充一个"仅一句问题"
  const appendQuestionIfMissing = async (baseText, phaseIndex, history, token) => {
    let result = (baseText || '').toString().trim();
    // 去重：若生成的问题与最近一条陪伴师问题重复，则返回空以触发上层再生策略
    const recentAssistant = (chatMessages || []).slice(-6).reverse().find(m => m.role === 'assistant');
    if (recentAssistant) {
      const ra = (recentAssistant.content || '').toString().trim();
      if (ra && result && ra === result) {
        return '';
      }
    }
    if (hasQuestionMark(result)) return result;
    try {
      const systemAsk = '请仅输出一个自然口语化的问题句子，不要任何编号、前缀或额外解释。仅一句中文问题。优先询问重要、有深度的事件。';
      const userAsk = `基于当前阶段"${lifeStages[phaseIndex]}"与上述对话，请继续提出一个紧接上下文、有深度的重要问题（仅一句）。优先关注人生转折、关键决策或深刻影响，避免琐碎日常。`;
      const messages = [
        { role: 'system', content: systemAsk },
        ...history,
        { role: 'user', content: userAsk },
      ];
      const resp = await retry(() => callSparkThrottled({
        model: 'x1', messages, max_tokens: 100, temperature: 0.5,
        user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon')
      }, token, { silentThrottle: true }));
      const q = (resp.data?.choices?.[0]?.message?.content || '').toString().trim();
      if (q) result = result ? `${result} ${q}` : q;
    } catch (_) {
      // 静默失败：保留原反馈
    }
    return result;
  };

  // 阶段兜底问题（确保每轮都有"下一个问题"）
  const getStageFallbackQuestion = (idx) => {
    const map = [
      '童年时期，有没有一件事让您的人生观发生了改变？',
      '少年时期，有没有遇到过影响您一生的人或重要选择？',
      '青年阶段，有没有一个关键决定改变了您的人生轨迹？',
      '成年后，有没有经历过让您重新认识自己的重要时刻？',
      '中年时期，有没有做过一个艰难但重要的人生抉择？',
      '回顾人生，哪个时刻让您感受到自己真正成长了？',
      '对于未来，您最想实现的人生愿望是什么？为什么对您如此重要？',
    ];
    return map[idx] || '有没有一个改变您人生的重要时刻可以分享？';
  };

  // 阶段开场：按阶段定制不同首问（关系/本人两种措辞）
  const getStageKickoffQuestion = (idx, mode, relation) => {
    const rel = (mode === 'other') ? (relation || '这位亲人') : '';
    const detailTail = ' 能具体说说当时的地点、在场的人、发生了什么，以及你的感受吗？';
    const byIdx = [
      // 0 童年
      mode === 'other'
        ? `在你的童年记忆里，${rel}做过的哪件事对你的成长影响最深？`
        : '在你的童年里，有没有一件事让你开始理解这个世界？',
      // 1 少年
      mode === 'other'
        ? `在你的少年时期，${rel}对你做出过哪个重要决定或给过关键建议？`
        : '在你的少年时期，有没有遇到过影响你价值观的人或事？',
      // 2 青年
      mode === 'other'
        ? `在你的青年阶段，${rel}在你面临重大选择时给过你什么支持或启发？`
        : '在你的青年阶段，有没有一个关键决定改变了你的人生轨迹？',
      // 3 成年
      mode === 'other'
        ? `成年后，你与${rel}之间有没有经历过一次让你们关系发生改变的重要时刻？`
        : '成年后，有没有一个时刻让你重新认识了自己？',
      // 4 中年
      mode === 'other'
        ? `中年之后，你对${rel}有什么新的理解？有没有一次深刻的对话或顿悟时刻？`
        : '中年之后，有没有做过一个艰难但重要的人生抉择？',
      // 5 当下
      mode === 'other'
        ? `现在回望人生，${rel}给你留下的最重要的影响或教诲是什么？`
        : '现在回望人生，哪个时刻让你感受到自己真正成长了？',
      // 6 未来
      mode === 'other'
        ? `关于${rel}，你最想传承给后代的是什么精神或品质？为什么？`
        : '关于未来，你最想实现的人生愿望是什么？为什么对你如此重要？',
    ];
    const base = byIdx[idx] || (mode === 'other' ? `在你的回忆里，${rel}对你影响最深的一件事是什么？` : '有没有一个改变你人生的重要时刻？');
    return base + detailTail;
  };

  // 语音朗读通用方法
  const speakText = (text) => {
    if (!window.speechSynthesis) {
      setMessage('浏览器不支持语音朗读');
      return;
    }
    if (!text) return;
    try { window.speechSynthesis.cancel(); } catch (_) {}
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    window.speechSynthesis.speak(utterance);
  };

  // 朗读最近一条陪伴师回复
  const readLatestAssistant = () => {
    const latestAssistant = [...(chatMessages || [])].reverse().find(m => m.role === 'assistant');
    if (latestAssistant && latestAssistant.content) {
      speakText(latestAssistant.content);
    } else {
      setMessage('暂无可朗读的陪伴师回复');
    }
  };

  // 预览用：移除尚未被回答的"陪伴师："问题（仅影响预览，不改原文）
  const getPreviewText = (rawText) => {
    const lines = (rawText || '').toString().split(/\r?\n/);
    const cleaned = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^陪伴师：/.test(line.trim())) {
        // 向后查找在下一个"陪伴师："或文本结尾前，是否存在"我："行
        let j = i + 1;
        let answered = false;
        for (; j < lines.length; j++) {
          const l2 = (lines[j] || '').trim();
          if (/^陪伴师：/.test(l2)) break; // 下一个问题开始，视为未回答
          if (/^我：/.test(l2)) { answered = true; break; }
        }
        if (answered) cleaned.push(line); // 仅在已回答时保留该问题
      } else {
        cleaned.push(line);
      }
    }
    return cleaned.join('\n');
  };

  // 切换篇章时，滚动到末尾并将光标置于末尾（不在用户编辑过程中强制改变光标）
  useEffect(() => {
    const el = sectionTextareaRef.current;
    if (!el) return;
    try {
      setTimeout(() => {
        try {
          el.scrollTop = el.scrollHeight;
          const len = (el.value || '').length;
          if (typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number') {
            el.selectionStart = len;
            el.selectionEnd = len;
          }
        } catch (_) {}
      }, 0);
    } catch (_) {}
  }, [currentSectionIndex]);

  // 切换篇章时，优先聚焦回答输入框，提升可发现性
  useEffect(() => {
    try {
      if (answerInputRef.current && !isSmallScreen()) {
        answerInputRef.current.focus();
      }
    } catch (_) {}
  }, [currentSectionIndex]);

  const scrollAnswerIntoView = () => {
    try {
      const el = answerInputRef.current;
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (_) {}
  };

  // 完成首篇或上传一定数量媒体后，引导"永恒计划"
  useEffect(() => {
    try {
      if (localStorage.getItem('eternal_prompt_shown') === '1') return;
      const nonEmpty = (sections || []).filter(s => (s.text || '').trim().length > 0).length;
      const mediaCount = (sections || []).reduce((acc, s) => acc + ((s.media || []).length), 0);
      if (nonEmpty >= 1 || mediaCount >= 3) {
        setShowEternalPrompt(true);
      }
    } catch (_) {}
  }, [sections]);

  // 访谈：阶段开场
  const askStageKickoff = async (targetIndex, resetTurns = false) => {
    if (isSmallScreen()) {
      setIsFocusMode(true);
    }
    const token = localStorage.getItem('token');
    if (!token) {
      setMessage('请先登录');
      setTimeout(() => navigate('/login'), 1000);
      return;
    }
    // 若尚未选择"为谁创作"，优先引导身份设定
    if (!authorMode) {
      const q1 = '这次记录是为谁创作？请选择：1. 为我自己  2. 为他人（如父母/亲人）  3. 暂不确定（可稍后再选）。请仅回复 1/2/3 的编号。';
      setChatMessages(prev => [...prev, { role: 'assistant', content: q1 }]);
      appendLineToSection(targetIndex, `陪伴师：${q1}`);
      setCurrentSectionIndex(targetIndex);
      setIsInterviewing(true);
      setMessage('');
      scrollAnswerIntoView();
      return;
    }
    setIsAsking(true);
    setMessage('正在生成本阶段问题…');
    // 供主流程与重试共用的资料与规则
    const p = profile || {};
    const writerName = (localStorage.getItem('username') || username || '').toString();
    const writerGender = (localStorage.getItem('writer_gender') || localStorage.getItem('user_gender') || '（未填）').toString();
    const writerProfile = `写作者资料：姓名${writerName || '（未填）'}，性别${writerGender || '（未填）'}。`;
    const subjectProfile = `被记录者资料：姓名${p.name||'（未填）'}，性别${p.gender||'（未填）'}，出生${p.birth||'（未填）'}，祖籍${p.origin||'（未填）'}，现居${p.residence||'（未填）'}${authorMode==='other'?`，与写作者关系${authorRelation||p.relation||'（未填）'}`:''}${p.education?`，学历${p.education}`:''}${p.occupation?`，职业${p.occupation}`:''}${p.maritalStatus?`，婚姻${p.maritalStatus}`:''}${p.children?`，子女${p.children}`:''}${p.personality?`，性格${p.personality}`:''}${p.hobbies?`，爱好${p.hobbies}`:''}${p.achievements?`，成就${p.achievements}`:''}。`;
    const profileGuideFollow = '请在提问时参考被记录者的个人资料（祖籍、现居地、出生信息、教育背景、职业、家庭状况、性格特点、兴趣爱好等），从多维度切入并保持与已知事实一致，资料缺失时不要猜测。';
    const factRules = `${buildHardConstraints()}；反馈≤30字，问题≤40字；不要使用列表或编号。问题优先级：①人生重大转折（关键决策、重要选择、命运改变）②深刻影响（对人生观的塑造、重要关系的建立）③情感深度（内心冲突、成长顿悟、难忘时刻）。请从"追踪视角（谁/何时/何地/因果/动作/对话/证据）"与"优势视角（能力/选择/韧性/体察）"两条线并用，避免空泛与琐碎日常。优先询问有深远意义的事件，而非表面细节。`;
    try {
      const perspectiveKick = (authorMode === 'other')
        ? `请使用第二人称"你"，但采用"关系视角"提问：围绕你与"${authorRelation || '这位亲人'}"的互动、对你的影响与具体细节；避免第三人称与抽象化表达。`
        : '请使用第二人称"您/你"。';
      const toneKick = (authorMode === 'other')
        ? '你现在是"引导者/助手"，帮助记录者一起梳理对方的人生经历，强调"整理与梳理"。'
        : '你现在是"情感陪伴师"，与当事人交流，语气自然温和。';
      const profileGuideKick = '提问时请充分参考上述资料（如祖籍、现居地、出生年代、教育背景、职业、家庭状况、性格特点、兴趣爱好、重要成就等），在不引入新信息的前提下，从不同维度切入，避免重复维度；若某项资料为空，切勿猜测。';
      // 用户选择的主题引导
      const userSelectedThemes = userThemes[targetIndex] || [];
      const themeGuide = userSelectedThemes.length > 0 
        ? `用户特别关注的主题：${userSelectedThemes.join('、')}。请围绕这些主题提问，但要自然融入，不要生硬列举。` 
        : '';
      const systemPrompt = `你是一位温暖、耐心且得体的引导者。${toneKick} ${writerProfile} ${subjectProfile} ${profileGuideKick} ${themeGuide} 当前阶段：${lifeStages[targetIndex]}。${perspectiveKick} ${factRules} ${buildHardConstraints()} ${buildStyleRules('ask')} 回复需口语化；先简短共情，再给出一个自然的后续问题；不要出现"下一个问题"字样。仅输出中文。`;
      const themeHint = userSelectedThemes.length > 0 ? `特别关注：${userSelectedThemes.join('、')}。` : '';
      const kickoffUser = (authorMode === 'other')
        ? `请以关系视角面向写作者发问：聚焦"你与${authorRelation || '这位亲人'}"中最重要、最难忘的互动与影响，例如"在你的记忆里，${authorRelation || '这位亲人'}……"开头，给出一个本阶段最核心、最有深度的开场问题（仅一句）。${themeHint}优先询问人生转折、关键决策或深刻影响，避免琐碎日常。`
        : `请面向"您"提出本阶段最重要、最有深度的核心问题（仅一句）。${themeHint}优先询问人生转折、关键决策或难忘时刻，避免琐碎日常。`;
      const history = chatMessages.slice(-5);
      const messages = [ { role: 'system', content: systemPrompt }, ...history, { role: 'user', content: kickoffUser } ];
      const resp = await retry(() => callSparkThrottled({ model: 'x1', messages, max_tokens: 280, temperature: 0.3, user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') }, token, { silentThrottle: true }));
      const raw = resp.data?.choices?.[0]?.message?.content;
      // 引导更具体：环境/人物/动作/感受
      let ai = normalizeAssistant(raw);
      if (!ai || !ai.trim()) {
        ai = getStageKickoffQuestion(targetIndex, authorMode, authorRelation);
      }
      // 阶段首问：始终追加括号温馨提示
      ai = withFirstQuestionTip(ai);
      // 避免与最近一问重复：若与最近一条 assistant 内容完全相同，则改为兜底开场
      try {
        const lastA = [...(chatMessages||[])].reverse().find(m=>m.role==='assistant');
        if (lastA && (lastA.content||'').toString().trim() === (ai||'').toString().trim()) {
          ai = getStageKickoffQuestion(targetIndex, authorMode, authorRelation);
          ai = withFirstQuestionTip(ai);
        }
      } catch(_){}
      setChatMessages(prev => [...prev, { role: 'assistant', content: ai }]);
      // 阶段开场问题写入对应阶段篇章
      appendLineToSection(targetIndex, `陪伴师：${ai}`);
      if (autoSpeakAssistant) speakText(ai);
      setStageIndex(targetIndex);
      setCurrentSectionIndex(targetIndex);
      setStageTurns(prev => {
        const copy = [...prev];
        if (resetTurns) copy[targetIndex] = 0; // 用户手动切换则清零
        copy[targetIndex] = (copy[targetIndex] || 0) + 1; // 计入开场问题
        return copy;
      });
    } catch (err) {
      // 短上下文重试
      try {
        const perspectiveKick2 = (authorMode === 'other')
          ? `请使用第二人称"你"，但采用"关系视角"提问：围绕你与"${authorRelation || '这位亲人'}"的互动、对你的影响与具体细节；，避免过度煽情，要给写作者温暖的回忆，避免第三人称与抽象化表达。`
          : '请使用第二人称"您/你"。';
        const toneKick2 = (authorMode === 'other')
          ? '你现在是"引导者/助手"，帮助记录者一起梳理对方的人生经历，强调"整理与梳理"。'
          : '你现在是"情感陪伴师"，与当事人交流，语气自然温和。';
        // 重试块内单独构建资料字符串，避免作用域歧义
        const p2 = profile || {};
        const writerName2 = (localStorage.getItem('username') || username || '').toString();
        const writerGender2 = (localStorage.getItem('writer_gender') || localStorage.getItem('user_gender') || '（未填）').toString();
        const writerProfile2 = `写作者资料：姓名${writerName2 || '（未填）'}，性别${writerGender2 || '（未填）'}。`;
        const subjectProfile2 = `被记录者资料：姓名${p2.name||'（未填）'}，性别${p2.gender||'（未填）'}，出生${p2.birth||'（未填）'}，祖籍${p2.origin||'（未填）'}，现居${p2.residence||'（未填）'}${authorMode==='other'?`，与写作者关系${authorRelation||p2.relation||'（未填）'}`:''}${p2.education?`，学历${p2.education}`:''}${p2.occupation?`，职业${p2.occupation}`:''}${p2.maritalStatus?`，婚姻${p2.maritalStatus}`:''}${p2.children?`，子女${p2.children}`:''}${p2.personality?`，性格${p2.personality}`:''}${p2.hobbies?`，爱好${p2.hobbies}`:''}${p2.achievements?`，成就${p2.achievements}`:''}。`;
        const factRules2 = '严格事实：仅依据用户资料与已出现的问答事实，信息不足请先追问，禁止脑补与抽象词；反馈≤30字，问题≤40字；不要使用列表或编号。问题优先级：①人生重大转折（关键决策、重要选择、命运改变）②深刻影响（对人生观的塑造、重要关系的建立）③情感深度（内心冲突、成长顿悟、难忘时刻）。请并用"追踪视角（谁/何时/何地/因果/动作/对话/证据）"与"优势视角（能力/选择/韧性/体察）"。优先询问有深远意义的事件，而非表面细节。';
        // 用户选择的主题引导（重试块）
        const userSelectedThemes2 = userThemes[targetIndex] || [];
        const themeGuide2 = userSelectedThemes2.length > 0 
          ? `用户特别关注的主题：${userSelectedThemes2.join('、')}。请围绕这些主题提问，但要自然融入，不要生硬列举。` 
          : '';
        const systemPrompt = `你是一位温暖、耐心且得体的引导者。${toneKick2} ${writerProfile2} ${subjectProfile2} ${themeGuide2} 当前阶段：${lifeStages[targetIndex]}。${perspectiveKick2} ${factRules2} ${buildHardConstraints()} ${buildStyleRules('ask')} 回复需口语化；先简短共情，再给出一个自然的后续问题；不要出现"下一个问题"字样。仅输出中文。`;
        const themeHint2 = userSelectedThemes2.length > 0 ? `特别关注：${userSelectedThemes2.join('、')}。` : '';
        const kickoffUser = (authorMode === 'other')
          ? `请以关系视角面向写作者发问：聚焦"你与${authorRelation || '这位亲人'}"中最重要、最难忘的互动与影响，给出这个阶段最核心、最有深度的开场问题（仅一句）。${themeHint2}优先询问人生转折、关键决策或深刻影响，避免琐碎日常。`
          : `请面向"您"提出本阶段最重要、最有深度的核心问题（仅一句）。${themeHint2}优先询问人生转折、关键决策或难忘时刻，避免琐碎日常。`;
        const messages = [ { role: 'system', content: systemPrompt }, { role: 'user', content: kickoffUser } ];
        setMessage('阶段提问失败，正以短上下文自动重试…');
        const resp2 = await callSparkThrottled({ model: 'x1', messages, max_tokens: 280, temperature: 0.3, user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') }, token, { silentThrottle: true });
        const raw2 = resp2.data?.choices?.[0]?.message?.content;
        let ai2 = normalizeAssistant(raw2);
        if (!ai2 || !ai2.trim()) {
          ai2 = getStageKickoffQuestion(targetIndex, authorMode, authorRelation);
        }
        ai2 = withFirstQuestionTip(ai2);
        setChatMessages(prev => [...prev, { role: 'assistant', content: ai2 }]);
        appendLineToSection(targetIndex, `陪伴师：${ai2}`);
        if (autoSpeakAssistant) speakText(ai2);
        setStageIndex(targetIndex);
        setCurrentSectionIndex(targetIndex);
        setStageTurns(prev => {
          const copy = [...prev];
          if (resetTurns) copy[targetIndex] = 0;
          copy[targetIndex] = (copy[targetIndex] || 0) + 1;
          return copy;
        });
      } catch (e2) {
        console.error('Stage kickoff error:', err);
        setMessage('获取阶段问题失败');
      }
    } finally {
      setIsAsking(false);
      setIsInterviewing(true);
      // 清理"正在生成"提示
      setMessage('');
    }
  };

  // 发起阶段收尾追问（仅一句），等待用户回答
  const askStageClosureQuestion = async (stageIdx) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const stageName = getStageLabelByIndex(stageIdx);
      const anchors = getRecentUserAnchors(stageIdx, 6);
      const perspectiveKick = (authorMode === 'other')
        ? '请用第二人称"你"（关系视角）提出一个真正的总结性问题：只允许基于已出现的信息进行总结或收束，不得引入新话题或新信息，仅一句。'
        : '请用第二人称"您/你"提出一个真正的总结性问题：只允许基于已出现的信息进行总结或收束，不得引入新话题或新信息，仅一句。';
      const system = `你是一位克制的引导者。当前阶段：${stageName}。${perspectiveKick} ${buildHardConstraints()} 若可行，请在问题中自然包含上文关键词以建立对应关系。`;
      const messages = [
        { role: 'system', content: system },
        { role: 'user', content: `以下是上文关键词（原词片段）：${anchors.join('、') || '（无）'}。请仅输出一个用于收束本阶段的总结性提问（仅一句），不要任何额外文字。不得引入新的主题、人物、情节或信息。` },
      ];
      const tokenUid = (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon');
      const resp = await callSparkThrottled({ model: 'x1', messages, max_tokens: 120, temperature: 0.2, user: tokenUid }, token, { silentThrottle: true });
      const q = (resp.data?.choices?.[0]?.message?.content || '').toString().trim();
      let out = finalizeAssistant(q);
      // 校验：需引用上文关键词且不得诱导新增
      if (!validateClosureQuestion(out, anchors)) {
        const anchor = anchors[0] || '这段经历';
        out = finalizeAssistant(`关于「${anchor}」，这样总结是否准确，或你想补充哪个细节？`);
      }
      setChatMessages(prev => [...prev, { role: 'assistant', content: out }]);
      appendLineToSection(stageIdx, `陪伴师：${out}`);
      closurePendingRef.current = stageIdx;
    } catch (_) {}
  };

  // 访谈身份设定：本人/他人
  const [authorMode, setAuthorMode] = useState(() => {
    try { return localStorage.getItem('author_mode') || ''; } catch(_) { return ''; }
  }); // '' | 'self' | 'other'
  const [authorRelation, setAuthorRelation] = useState(() => {
    try { return localStorage.getItem('author_relation') || ''; } catch(_) { return ''; }
  }); // 如 父亲/母亲/爷爷 等
  const [profile, setProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem('record_profile') || '{}'); } catch(_) { return {}; }
  }); // { name, gender, birth, origin, residence, relation? }

  // 主题选择完成后的处理
  const handleThemeSelectionComplete = () => {
    setShowThemeSelector(false);
    const idx = currentThemeStageIndex;
    setStageIndex(idx);
    setCurrentSectionIndex(idx);
    setHasShownOpening(true);
    askStageKickoff(idx, true);
  };

  const startInterview = () => {
    const idx = Math.min(currentSectionIndex, lifeStages.length - 1);
    // 确保进入访谈状态并同步当前阶段
    if (!isInterviewing) {
    setIsInterviewing(true);
    setStageTurns(Array(lifeStages.length).fill(0));
    }
    if (isSmallScreen()) {
      setIsFocusMode(true);
    }
    // 不再在此询问身份与关系，统一由首页选择
    setStageIndex(idx);
    setCurrentSectionIndex(idx);
    try { if (isFocusEditing) setIsFocusEditing(false); } catch(_){}
    // 首次仅给基础资料开场，之后不再重复
    if (!hasShownOpening) {
      // 首次访谈：先显示主题选择界面
      if (!userThemes[idx] || userThemes[idx].length === 0) {
        setCurrentThemeStageIndex(idx);
        setShowThemeSelector(true);
        return;
      }
      // 已选择主题：直接进入阶段开场
      setHasShownOpening(true);
      askStageKickoff(idx, true);
      return;
    }
    // 非首次：若该阶段尚未开始则生成开场；否则若用户尚未回答，给出提示
    const sectionText = (sections[idx]?.text || '').toString();
    const hasAssistant = sectionText.includes('陪伴师：');
    if (!hasAssistant) {
      // 检查是否已选择主题，若未选择则显示主题选择
      if (!userThemes[idx] || userThemes[idx].length === 0) {
        setCurrentThemeStageIndex(idx);
        setShowThemeSelector(true);
        return;
      }
      askStageKickoff(idx, true);
      return;
    }
    const lastAssistantPos = sectionText.lastIndexOf('陪伴师：');
    const lastUserPos = sectionText.lastIndexOf('我：');
    if (lastUserPos <= lastAssistantPos) {
      setMessage('请先在下方输入框回答，然后我会继续提问');
      setTimeout(() => setMessage(''), 1500);
      if (!isSmallScreen()) scrollAnswerIntoView();
    }
  };

  // 访谈：发送回答
  const sendAnswer = async () => {
    // 读取 ref 中的即时值，规避中文输入法未确认导致的首次发送取值为空
    const rawVal = answerInputRef.current ? answerInputRef.current.value : answerInput;
    const trimmed = (rawVal || '').trim();
    if (!trimmed) {
      setMessage('请先输入您的回答');
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) {
      setMessage('请先登录');
      setTimeout(() => navigate('/login'), 1000);
      return;
    }

    // 阶段上限后的用户选择处理："小结" 或 "继续追忆"
    try {
      const decision = stageDecisionRef.current || {};
      if (decision && Number.isInteger(decision.stageIndex) && decision.stageIndex === stageIndex) {
        const norm = trimmed.replace(/\s/g, '');
        if (/(小结)/.test(norm)) {
          // 用户选择小结：发起小结问题
          appendLineToSection(currentSectionIndex, `我：${trimmed}`);
          setAnswerInput(''); if (answerInputRef.current) answerInputRef.current.value = '';
          await askStageClosureQuestion(stageIndex);
          return;
        }
        if (/(继续追忆|继续)/.test(norm)) {
          // 用户选择继续：允许本阶段继续提问（超越上限）
          stageDecisionRef.current = { stageIndex: null, nextStageIndex: decision.nextStageIndex };
          limitPromptShownRef.current.delete(stageIndex);
          allowBeyondLimitRef.current.add(stageIndex);
        }
      }

      // 若用户刚回答了小结问题（等待收尾回答）
      if (closurePendingRef.current === stageIndex) {
        appendLineToSection(currentSectionIndex, `我：${trimmed}`);
        setAnswerInput(''); if (answerInputRef.current) answerInputRef.current.value = '';
        // 小结已记录：不再生成进一步提示或问题；清除超限继续标记
        closurePendingRef.current = null;
        stageDecisionRef.current = { stageIndex: null, nextStageIndex: null };
        allowBeyondLimitRef.current.delete(stageIndex);
        return;
      }
    } catch (_) {}

    // 处理身份设定回答
    if (!authorMode) {
      const v = trimmed.replace(/\s/g,'');
      // 记录用户的初始选择到篇章
      appendLineToSection(currentSectionIndex, `我：${trimmed}`);
      if (v === '1' || /自己|本人|为我/.test(trimmed)) {
        setAuthorMode('self'); try{ localStorage.setItem('author_mode','self'); }catch(_){ }
        const tip = '我已记下：这次记录是为您本人。接下来，我将陪伴您一起整理人生故事。为了更完整地呈现，请先补充一些基础资料：姓名、性别、年龄、祖籍，以及家庭和教育经历。';
        setChatMessages(prev => [...prev, { role: 'assistant', content: tip }]);
        appendLineToSection(currentSectionIndex, `陪伴师：${tip}`);
        // 清空输入框
        setAnswerInput(''); if (answerInputRef.current) answerInputRef.current.value = '';
        return;
      }
      if (v === '2' || /他人|父母|亲人|为他/.test(trimmed)) {
        setAuthorMode('other'); try{ localStorage.setItem('author_mode','other'); }catch(_){ }
        const askRel = '请问与您记录的这位之间的关系是什么？例如：父亲/母亲/爷爷/奶奶/外公/外婆/妻子/丈夫/朋友等。（请直接回复关系称谓）';
        setChatMessages(prev => [...prev, { role: 'assistant', content: askRel }]);
        appendLineToSection(currentSectionIndex, `陪伴师：${askRel}`);
        setAnswerInput(''); if (answerInputRef.current) answerInputRef.current.value = '';
        return;
      }
      // 选择 3 或其他无效输入：提示仅回复 1/2/3
      const reprompt = '没关系，我们重新来一遍：请选择 1. 为我自己  2. 为他人（如父母/亲人）  3. 暂不确定（请仅回复 1/2/3 的编号）。';
      setChatMessages(prev => [...prev, { role: 'assistant', content: reprompt }]);
      appendLineToSection(currentSectionIndex, `陪伴师：${reprompt}`);
      setAnswerInput(''); if (answerInputRef.current) answerInputRef.current.value = '';
      return;
    }
    if (authorMode === 'other' && !authorRelation) {
      // 记录用户的关系回答到篇章
      appendLineToSection(currentSectionIndex, `我：${trimmed}`);
      setAuthorRelation(trimmed);
      try{ localStorage.setItem('author_relation', trimmed); }catch(_){ }
      const tip2 = `我已记下：您所记录的人是您的"${trimmed}"。接下来，我将陪伴您一起整理他/她的生命故事。为了更完整地展现他/她的一生，请您先提供一些基础资料：姓名、性别、年龄、祖籍，以及家庭和教育经历。`;
      setChatMessages(prev => [...prev, { role: 'assistant', content: tip2 }]);
      appendLineToSection(currentSectionIndex, `陪伴师：${tip2}`);
      setAnswerInput(''); if (answerInputRef.current) answerInputRef.current.value = '';
      return;
    }

    // 仅以"我：..."格式写入当前阶段篇章，避免重复
    // 同步素材文本可选，如不再使用素材区可注释
    // setMaterialsText(prev => (prev ? prev + '\n' + trimmed : trimmed));

    const perspective = (authorMode === 'other') ? `请使用第二人称"你"，并采用"关系视角"与写作者对话：围绕写作者与"${authorRelation || profile?.relation || '这位亲人'}"的互动细节与影响来提问；明确写作者与被记录者身份，不要过度煽情，不要使用第三人称。` : '请使用第二人称"您/你"，避免第三人称。';
    const tone = (authorMode === 'other') ? '你现在是"引导者/助手"，与记录者一起梳理被记录者的人生经历，强调"整理与梳理"，避免空泛与闲聊。' : '你现在是"情感陪伴师"，与当事人交流，语气自然温和。';
    const p = profile || {};
    const writerName = (localStorage.getItem('username') || username || '').toString();
    const writerGender = (localStorage.getItem('writer_gender') || localStorage.getItem('user_gender') || '（未填）').toString();
    const writerProfile = `写作者资料：姓名${writerName || '（未填）'}，性别${writerGender || '（未填）'}。`;
    const subjectProfile = `被记录者资料：姓名${p.name||'（未填）'}，性别${p.gender||'（未填）'}，出生${p.birth||'（未填）'}，祖籍${p.origin||'（未填）'}，现居${p.residence||'（未填）'}${authorMode==='other'?`，与写作者关系${authorRelation||p.relation||'（未填）'}`:''}${p.education?`，学历${p.education}`:''}${p.occupation?`，职业${p.occupation}`:''}${p.maritalStatus?`，婚姻${p.maritalStatus}`:''}${p.children?`，子女${p.children}`:''}${p.personality?`，性格${p.personality}`:''}${p.hobbies?`，爱好${p.hobbies}`:''}${p.achievements?`，成就${p.achievements}`:''}。`;
    const profileGuide = '请在提问时参考被记录者的个人资料（祖籍、现居地、出生信息、教育背景、职业、家庭状况、性格特点、兴趣爱好、重要成就等），从多维度切入并保持与已知事实一致，资料缺失时不要猜测。';
    const factRules = '严格事实：仅依据用户资料与已出现的问答事实，信息不足请先追问，禁止脑补与抽象词；反馈≤30字，问题≤40字；不要使用列表或编号。问题优先级：①人生重大转折（关键决策、重要选择、命运改变）②深刻影响（对人生观的塑造、重要关系的建立）③情感深度（内心冲突、成长顿悟、难忘时刻）。优先询问有深远意义的事件，而非表面细节与琐碎日常。';
    // 用户选择的主题引导
    const userSelectedThemes = userThemes[stageIndex] || [];
    const themeGuide = userSelectedThemes.length > 0 
      ? `用户特别关注的主题：${userSelectedThemes.join('、')}。请围绕这些主题深入提问，自然融入对话，不要生硬列举。` 
      : '';
    const systemPrompt = `你是一位温暖、耐心且得体的引导者。${tone} ${writerProfile} ${subjectProfile} ${profileGuide} ${themeGuide} 当前阶段：${lifeStages[stageIndex]}。${perspective} ${factRules} 请用自然口语化的方式回复；先进行真诚简短的反馈，再给出一个自然的后续问题，不要添加"下一个问题"字样。仅输出中文。`;
    const MAX_TURNS = 12;
    const history = chatMessages.slice(-5);
    const messagesToSend = [ { role: 'system', content: systemPrompt }, ...history, { role: 'user', content: trimmed } ];
    setChatMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    // 将用户答案写入当前阶段篇章
    appendLineToSection(currentSectionIndex, `我：${trimmed}`);
    // 立即清空输入框（视觉反馈），答案已写入篇章与对话
    setAnswerInput('');
    if (answerInputRef.current) answerInputRef.current.value = '';
    setIsAsking(true);
    try {
      // 若当前阶段已达到上限且尚未展示过上限提示，则仅记录选择，不再产生新的小结外问题
      const turnsBeforeAsk = (stageTurns[stageIndex] || 0);
      const reachedLimit = turnsBeforeAsk >= MAX_QUESTIONS_PER_STAGE;
      if (reachedLimit && !allowBeyondLimitRef.current.has(stageIndex)) {
        // 第一次触达上限，给出一次性选择提示；随后等待用户输入"继续追忆"或"小结"
        if (!limitPromptShownRef.current.has(stageIndex)) {
          const nextIdx = Math.min(lifeStages.length - 1, stageIndex + 1);
          const prompt = nextIdx !== stageIndex
            ? `本阶段已达到提问上限。要继续在"${getStageLabelByIndex(stageIndex)}"里深入追问，还是先回答一个小结后进入"${getStageLabelByIndex(nextIdx)}"？`
            : '本阶段已达到提问上限。要继续在此阶段深入，还是先做一个小结后结束？';
          setChatMessages(prevMsgs => [...prevMsgs, { role: 'assistant', content: finalizeAssistant(prompt) }]);
          appendLineToSection(currentSectionIndex, `陪伴师：${finalizeAssistant(prompt)}`);
          stageDecisionRef.current = { stageIndex, nextStageIndex: nextIdx };
          limitPromptShownRef.current.add(stageIndex);
        }
        setIsAsking(false);
        return;
      }
      const resp = await retry(() => callSparkThrottled({
        model: 'x1', messages: messagesToSend, max_tokens: 520, temperature: 0.3,
        user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon')
      }, token, { silentThrottle: true }));
      const raw = resp.data?.choices?.[0]?.message?.content;
      let aiBase = normalizeAssistant(raw) || '谢谢您的分享。';
      const historyForAsk = chatMessages.slice(-5);
      let ai = finalizeAssistant(await appendQuestionIfMissing(aiBase, stageIndex, historyForAsk, token));
      // 仅在每个阶段的首问追加温馨提示
      if ((stageTurns[stageIndex] || 0) === 0) {
        ai = withFirstQuestionTip(ai);
      }
      // 若检测为重复导致返回空，则使用兜底问题
      if (!ai || !ai.trim()) ai = finalizeAssistant(getStageFallbackQuestion(stageIndex));
      setChatMessages(prev => [...prev, { role: 'assistant', content: ai }]);
      // 将陪伴师问题写入当前阶段篇章（只保留反馈+问题的一行）
      appendLineToSection(currentSectionIndex, `陪伴师：${ai}`);
      if (autoSpeakAssistant) speakText(ai);
      // 已顺利产生下一问，可以清空输入框
      setAnswerInput('');
      if (answerInputRef.current) answerInputRef.current.value = '';
      // 统计轮数并自动推进
      setStageTurns(prev => {
        const copy = [...prev];
        copy[stageIndex] = (copy[stageIndex] || 0) + 1;
        // 不在提问时立即弹出上限提示；改为等待用户回答完这一问后再提示
        return copy;
      });
    } catch (err) {
      if (true) {
        try {
          setMessage('获取失败，正以短上下文自动重试…');
          const shortHistory = chatMessages.slice(-5);
          const messagesShort = [ { role: 'system', content: systemPrompt }, ...shortHistory, { role: 'user', content: trimmed } ];
          const resp2 = await callSparkThrottled({ model: 'x1', messages: messagesShort, max_tokens: 520, temperature: 0.3,
            user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') }, token, { silentThrottle: true });
          const raw2 = resp2.data?.choices?.[0]?.message?.content;
          let ai2Base = normalizeAssistant(raw2) || '谢谢您的分享。';
          let ai2 = finalizeAssistant(await appendQuestionIfMissing(ai2Base, stageIndex, chatMessages.slice(-5), token));
          if ((stageTurns[stageIndex] || 0) === 0) {
            ai2 = withFirstQuestionTip(ai2);
          }
          if (!ai2 || !ai2.trim()) ai2 = finalizeAssistant(getStageFallbackQuestion(stageIndex));
          setChatMessages(prev => [...prev, { role: 'assistant', content: ai2 }]);
          appendLineToSection(currentSectionIndex, `陪伴师：${ai2}`);
          if (autoSpeakAssistant) speakText(ai2);
          setAnswerInput('');
          if (answerInputRef.current) answerInputRef.current.value = '';
          setStageTurns(prev => {
            const copy = [...prev];
            copy[stageIndex] = (copy[stageIndex] || 0) + 1;
            // 字数阈值逻辑（8000引导收尾，9000强制收尾）
            try {
              const curText = (sections[currentSectionIndex]?.text || '').toString();
              const len = curText.length;
              if (len >= 9000 && !forcedClosedRef.current.has(stageIndex)) {
                forcedClosedRef.current.add(stageIndex);
                const nextIdx = Math.min(lifeStages.length - 1, stageIndex + 1);
                const forceMsg = `本阶段内容已达上限，我将为当前段落做收尾。请点击"${getStageLabelByIndex(nextIdx)}"继续访谈。`;
                setChatMessages(prevMsgs => [...prevMsgs, { role: 'assistant', content: finalizeAssistant(forceMsg) }]);
                appendLineToSection(currentSectionIndex, `陪伴师：${finalizeAssistant(forceMsg)}`);
                // 自动进入下一个阶段
                setTimeout(() => askStageKickoff(nextIdx, false), 300);
                return copy;
              }
              if (len >= 8000 && !thresholdWarnedRef.current.has(stageIndex)) {
                thresholdWarnedRef.current.add(stageIndex);
                const warn = '本阶段内容已较为充实，如需收尾，请回复"小结"；若想继续，请回复"继续追忆"。';
                setChatMessages(prevMsgs => [...prevMsgs, { role: 'assistant', content: finalizeAssistant(warn) }]);
                appendLineToSection(currentSectionIndex, `陪伴师：${finalizeAssistant(warn)}`);
              }
            } catch (_) {}
            // 同样，兜底路径也不在提问侧弹提示；改为回答完成后处理
            return copy;
          });
          return;
        } catch (_) { /* 继续兜底 */ }
      }
      console.error('Interview ask error:', err);
      const fallbackByStage = {
        0: '童年时期，有没有一件事让您开始理解这个世界或改变了您的想法？',
        1: '少年时期，有没有遇到过影响您价值观或人生观的重要事件？',
        2: '青年阶段，有没有一个关键决定改变了您的人生轨迹？',
        3: '成年后，有没有经历过让您重新认识自己的重要时刻？',
        4: '中年后，有没有做过一个艰难但重要的人生抉择？',
        5: '回顾人生，哪个时刻让您感受到自己真正成长了？',
        6: '关于未来，您最想实现的人生愿望是什么？为什么对您如此重要？'
      };
      const ai = finalizeAssistant(fallbackByStage[stageIndex] || '有没有一个改变您人生的重要时刻可以分享？');
      setChatMessages(prev => [...prev, { role: 'assistant', content: ai }]);
      appendLineToSection(currentSectionIndex, `陪伴师：${ai}`);
      if (autoSpeakAssistant) speakText(ai);
      setMessage(err.response?.data?.message || '获取下一问题失败，已使用兜底问题继续');
      setStageTurns(prev => {
        const copy = [...prev];
        copy[stageIndex] = (copy[stageIndex] || 0) + 1;
        if (copy[stageIndex] >= 3 && stageIndex < lifeStages.length - 1) setTimeout(() => askStageKickoff(stageIndex + 1), 200);
        return copy;
      });
    } finally {
      setIsAsking(false);
    }
  };

  // 访谈回答语音输入
  const handleAnswerSpeech = () => {
    if (!window.webkitSpeechRecognition) {
      setMessage('您的浏览器不支持语音输入，请使用 Chrome 或手动输入');
      return;
    }
    const recognition = new window.webkitSpeechRecognition();
    recognition.lang = accent === 'cantonese' ? 'zh-HK' : 'zh-CN';
    recognition.onresult = (event) => {
      const text = sanitizeInput(event.results[0][0].transcript);
      setAnswerInput(prev => (prev ? prev + ' ' + text : text));
    };
    recognition.onerror = () => setMessage('语音识别失败，请检查麦克风或重试');
    recognition.start();
  };

  // 语音输入：把识别内容写入"回答输入框"而非篇章正文
  const handleSectionSpeech = () => {
    // Prefer iFLYTEK streaming via signed ws; fallback to browser SpeechRecognition
    if (!isIatRecording) {
      // 将输入焦点定位到回答输入框，并把光标放到末尾
      if (answerInputRef.current) {
        try {
          const el = answerInputRef.current;
          el.focus();
          const len = (el.value || '').length;
          if (typeof el.setSelectionRange === 'function') el.setSelectionRange(len, len);
          setTimeout(() => { try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {} }, 0);
        } catch (_) {}
      }
      startIatRecording().catch((e) => {
        console.error('IAT start error:', e);
        setMessage('科大讯飞不可用，已切换为浏览器语音输入');
        fallbackBrowserSpeech();
      });
    } else {
      stopIatRecording()
        .then(() => setMessage('录音已停止'))
        .catch((e) => console.error('IAT stop error:', e));
    }
  };

  const fallbackBrowserSpeech = () => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      setMessage('当前浏览器不支持语音输入，请使用 Chrome 或 Edge 最新版');
      return;
    }
    try {
      // 聚焦并定位光标
      if (answerInputRef.current) {
        try {
          const el = answerInputRef.current;
          el.focus();
          const len = (el.value || '').length;
          if (typeof el.setSelectionRange === 'function') el.setSelectionRange(len, len);
        } catch (_) {}
      }
      // 记录当前前缀，避免清空后再次录音残留
      answerBasePrefixRef.current = (answerInputRef.current ? answerInputRef.current.value : answerInput) || '';
    const recognition = new SpeechRec();
      recognition.lang = accent === 'cantonese' ? 'zh-HK' : 'zh-CN';
    recognition.onresult = (event) => {
      const text = sanitizeInput(event.results[0][0].transcript);
        const next = (answerBasePrefixRef.current ? answerBasePrefixRef.current + ' ' : '') + text;
        if (answerInputRef.current) { answerInputRef.current.value = next; autoResizeAnswer(answerInputRef.current); }
        setAnswerInput(next);
    };
    recognition.onerror = () => setMessage('语音识别失败，请检查麦克风或重试');
    recognition.start();
    } catch (e) {
      setMessage('语音识别失败，请检查麦克风或重试');
    }
  };

  // iFLYTEK IAT streaming
  const startIatRecording = async () => {
    if (isIatRecording) return;
    const token = localStorage.getItem('token');
    if (!token) { setMessage('请先登录'); return; }
    // 新会话：清空增量缓存，并记录当前前缀
    try {
      iatSnMapRef.current = new Map();
      iatFullTextRef.current = '';
      answerBasePrefixRef.current = (answerInputRef.current ? answerInputRef.current.value : answerInput) || '';
    } catch (_) {}
    // 1) get signed ws url and appId
    const sign = await axios.get('/api/asr/sign', { headers: { Authorization: `Bearer ${token}` }});
    const { url, appId } = sign.data || {};
    if (!url || !appId) throw new Error('签名失败');
    // 2) open ws
    const ws = new WebSocket(url);
    asrWsRef.current = ws;
    ws.onopen = async () => {
      try {
        setMessage('正在录音，讲话后文字会自动出现…');
        // 3) send first frame
        const first = {
          common: { app_id: appId },
          business: { language: 'zh_cn', domain: 'iat', accent: accent === 'cantonese' ? 'cantonese' : 'mandarin', vad_eos: silenceMs, dwa: 'wpgs', ptt: autoPunc ? 1 : 0 },
          data: { status: 0, format: 'audio/L16;rate=16000', encoding: 'raw', audio: '' }
        };
        ws.send(JSON.stringify(first));
        // 4) init audio capture
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContextCtor();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;
        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const input = e.inputBuffer.getChannelData(0);
          // 简易 VU 电平
          try {
            let sum = 0;
            for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
            const rms = Math.sqrt(sum / input.length);
            setVuLevel(Math.min(1, rms * 2));
          } catch (_) {}
          const pcm16k = floatTo16kPCM(input, ctx.sampleRate);
          if (!pcm16k || pcm16k.length === 0) return;
          const audioB64 = arrayBufferToBase64(pcm16k.buffer);
          const frame = { data: { status: 1, format: 'audio/L16;rate=16000', encoding: 'raw', audio: audioB64 } };
          ws.send(JSON.stringify(frame));
        };
        source.connect(processor);
        processor.connect(ctx.destination);
        setIsIatRecording(true);
        // 计时器与超时自动停止
        try { if (timerRef.current) clearInterval(timerRef.current); } catch(_) {}
        setElapsedSec(0);
        timerRef.current = setInterval(() => setElapsedSec(prev => prev + 1), 1000);
        if (maxDurationSec > 0) {
          setTimeout(() => { try { stopIatRecording(); } catch(_) {} }, maxDurationSec * 1000);
        }
      } catch (e) {
        console.error('IAT init error:', e);
        cleanupIat();
        setMessage('麦克风不可用，已切换为浏览器语音输入');
        fallbackBrowserSpeech();
        return;
      }
    };
    ws.onmessage = (evt) => {
      try {
        const resp = JSON.parse(evt.data);
        if (!(resp && resp.code === 0 && resp.data)) return;
        const { result, status } = resp.data;
        if (!result) return;
        const segText = decodeIatResult(result);
        const sn = Number(result.sn);
        const pgs = result.pgs; // 'apd' or 'rpl'
        const rg = result.rg; // [start, end]
        if (pgs === 'rpl' && Array.isArray(rg) && rg.length === 2) {
          for (let k of Array.from(iatSnMapRef.current.keys())) {
            const kn = Number(k);
            if (kn >= rg[0] && kn <= rg[1]) iatSnMapRef.current.delete(kn);
          }
        }
        if (Number.isFinite(sn)) {
          iatSnMapRef.current.set(sn, segText || '');
        }
        const ordered = Array.from(iatSnMapRef.current.entries()).sort((a,b) => a[0]-b[0]).map(([,v]) => v).join('');
        iatFullTextRef.current = ordered;
        const nextValue = (answerBasePrefixRef.current || '') + (ordered || '');
        if (confirmBeforeWrite) {
          setPendingTranscript(nextValue);
        } else {
          if (answerInputRef.current) {
            answerInputRef.current.value = nextValue;
            setAnswerInput(nextValue);
            autoResizeAnswer(answerInputRef.current);
          } else {
            setAnswerInput(nextValue);
          }
        }
        if (status === 2) {
          // final
          setMessage('识别完成');
        }
      } catch (_) {}
    };
    ws.onerror = () => {
      setMessage('科大讯飞连接失败，已尝试切换为浏览器语音输入');
      cleanupIat();
      try { fallbackBrowserSpeech(); } catch (_) {}
    };
    ws.onclose = () => {
      cleanupIat();
    };
  };

  const stopIatRecording = async () => {
    // send last frame with status 2, then close
    try {
      if (asrWsRef.current && asrWsRef.current.readyState === WebSocket.OPEN) {
        const last = { data: { status: 2, format: 'audio/L16;rate=16000', encoding: 'raw', audio: '' } };
        asrWsRef.current.send(JSON.stringify(last));
      }
    } catch (_) {}
    cleanupIat();
  };

  const cleanupIat = () => {
    setIsIatRecording(false);
    try { if (processorRef.current) { processorRef.current.disconnect(); processorRef.current.onaudioprocess = null; } } catch (_) {}
    try { if (audioCtxRef.current) { audioCtxRef.current.close(); } } catch (_) {}
    try { if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(t => t.stop()); } } catch (_) {}
    try { if (asrWsRef.current && asrWsRef.current.readyState === WebSocket.OPEN) { asrWsRef.current.close(); } } catch (_) {}
    asrWsRef.current = null; audioCtxRef.current = null; mediaStreamRef.current = null; processorRef.current = null;
  };

  const floatTo16kPCM = (float32Array, inputSampleRate) => {
    if (!float32Array) return new Int16Array();
    const ratio = inputSampleRate / 16000;
    const newLength = Math.floor(float32Array.length / ratio);
    const result = new Int16Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.floor((offsetResult + 1) * ratio);
      let accum = 0, count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < float32Array.length; i++) {
        accum += float32Array[i];
        count++;
      }
      const value = Math.max(-1, Math.min(1, accum / count));
      result[offsetResult] = value < 0 ? value * 0x8000 : value * 0x7FFF;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  };

  const arrayBufferToBase64 = (buffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  const decodeIatResult = (result) => {
    // result.ws[].cw[].w 拼接
    try {
      const ws = result.ws || [];
      return ws.map(w => (w.cw && w.cw[0] && w.cw[0].w) || '').join('');
    } catch (_) { return ''; }
  };

  // 回答输入框自动增高，最多到3行
  const autoResizeAnswer = (el) => {
    if (!el) return;
    try {
      el.style.height = 'auto';
      const lineHeight = parseFloat(window.getComputedStyle(el).lineHeight || '24');
      const maxHeight = lineHeight * 3;
      const next = Math.min(el.scrollHeight, maxHeight);
      el.style.height = next + 'px';
      // 移动端平滑滚动（不强制显示滚动条）
      el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
      el.style.WebkitOverflowScrolling = 'touch';
    } catch (_) {}
  };

  // 基于问答抽取"事实关键词"，用于简单校验生成是否越界
  const extractFactTokens = (qaText) => {
    try {
      const src = (qaText || '').toString().replace(/陪伴师：|我：/g, '');
      const tokens = new Set();
      // 连续中文>=2
      const zh = src.match(/[\u4e00-\u9fa5]{2,}/g) || [];
      zh.forEach(w => tokens.add(w));
      // 数字/年份/日期
      const nums = src.match(/\d{2,4}[年月日号]?/g) || [];
      nums.forEach(w => tokens.add(w));
      return tokens;
    } catch (_) { return new Set(); }
  };

  const narrativeSeemsSupported = (text, factTokens) => {
    try {
      const sents = (text || '').toString().split(/[。！？!?]/).map(v => v.trim()).filter(Boolean);
      if (sents.length === 0) return true;
      let unsupported = 0;
      for (const s of sents) {
        let ok = false;
        for (const t of factTokens) { if (t && s.includes(t)) { ok = true; break; } }
        if (!ok) unsupported++;
      }
      // 允许少量过度概括，但不超过全部的三分之一
      return unsupported <= Math.floor(sents.length / 3);
    } catch (_) { return true; }
  };

  // 分段编辑：文本与媒体（固定阶段篇章，不允许新增/删除）
  const addSection = () => {};
  const removeSection = () => {};
  // 润色前过滤：去除身份设定/基础资料引导等元话术
  const filterPolishSource = (raw) => {
    const txt = (raw || '').toString();
    const lines = txt.split(/\r?\n/);
    const shouldDrop = (line) => {
      const s = (line || '').trim();
      if (!s) return false;
      const patterns = [
        '这次记录是为谁创作',
        '请选择：A. 为我自己 B. 为他人',
        '请问与您记录的这位之间的关系是什么',
        '我已记下：您所记录的人是您的',
        '我已记下：这次记录是为您本人',
        '为了更完整地展现他/她的一生，请您先提供一些基础资料',
        '为了更完整地呈现，请先补充一些基础资料',
        '让我们从一些基础资料开始'
      ];
      return patterns.some(p => s.includes(p));
    };
    return lines.filter(l => !shouldDrop(l)).join('\n');
  };
  const updateSectionTitle = (index, value) => setSections(prev => prev.map((s, i) => i === index ? { ...s, title: sanitizeInput(value) } : s));
  const updateSectionText = (index, value) => setSections(prev => prev.map((s, i) => i === index ? { ...s, text: value } : s));
  const removeMediaFromSection = (sectionIndex, mediaIndex) => setSections(prev => prev.map((s, i) => i === sectionIndex ? { ...s, media: s.media.filter((_, mi) => mi !== mediaIndex) } : s));
  const inferMediaType = (fileOrName) => {
    const file = typeof fileOrName === 'object' ? fileOrName : null;
    const mime = (file?.type || '').toLowerCase();
    const name = (file?.name || fileOrName || '').toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].some(ext => name.endsWith(ext));
    if (isImage) return 'image';
    const isVideo = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.ogv'].some(ext => name.endsWith(ext));
    if (isVideo) return 'video';
    const isAudio = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'].some(ext => name.endsWith(ext));
    if (isAudio) return 'audio';
    return 'image';
  };
  // 撤销：不再插入媒体占位符，统一添加到末尾
  const handleUploadMediaToSection = async (sectionIndex, file, desc = '') => {
    if (!file) return;
    try {
      const sizeMB = (file.size || 0) / (1024 * 1024);
      if (sizeMB > 25) {
        setMessage('当前版本不支持超过 25MB 的大文件上传。未来版本将提供大文件存储服务。');
        return;
      }
    } catch(_) {}
    const token = localStorage.getItem('token');
    if (!token) {
      setMessage('请先登录');
      setTimeout(() => navigate('/login'), 1000);
      return;
    }
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('desc', desc || '');
      const res = await axios.post('/api/upload', form, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      });
      const url = res.data?.filePath;
      const type = inferMediaType(file);
      setSections(prev => prev.map((s, i) => i === sectionIndex ? { ...s, media: [...s.media, { type, url, desc }] } : s));
      setMessage('媒体已添加到分段');
      // 在专注模式下，添加媒体后滚动到最底部，便于立即看到新媒体
      try {
        if (isFocusMode && focusContentRef.current) {
          setTimeout(() => { try { focusContentRef.current.scrollTop = focusContentRef.current.scrollHeight; } catch (_) {} }, 0);
        }
      } catch (_) {}
    } catch (err) {
      console.error('Upload media error:', err);
      setMessage('上传媒体失败：' + (err.response?.data?.message || err.message));
    }
  };

  // 章节导航：与阶段一一对应（翻页式，不自动新增篇章）
  const goToSectionByIndex = (targetIndex) => {
    if (targetIndex < 0 || sections.length === 0) return;
    const clamped = Math.max(0, Math.min(targetIndex, sections.length - 1));
    setCurrentSectionIndex(clamped);
    // 无论是否在访谈中，导航仅切换篇章与当前阶段索引，不自动触发AI提问
    const targetStage = Math.min(clamped, lifeStages.length - 1);
    setStageIndex(targetStage);
    // 若已在访谈流程里，并且该阶段从未出现过陪伴师的开场语，则轻提示引导点击"开始访谈"或直接输入
    if (isInterviewing) {
      const sectionText = (sections[targetStage]?.text || '').toString();
      if (!sectionText.includes('陪伴师：')) {
        setMessage('提示：此阶段尚未开始，点击"开始访谈"或直接输入您的想法');
        setTimeout(() => setMessage(''), 1500);
      }
    }
  };
  const goToPrevSection = () => {
    if (currentSectionIndex <= 0) return;
    const next = currentSectionIndex - 1;
    goToSectionByIndex(next);
    setTimeout(() => centerStageChip(next), 0);
  };
  const goToNextSection = () => {
    const nextIndex = currentSectionIndex + 1;
    if (nextIndex >= sections.length) return; // 翻页式：不自动新增篇章
    goToSectionByIndex(nextIndex);
    setTimeout(() => centerStageChip(nextIndex), 0);
  };
  const navigate = useNavigate();
  const location = useLocation();

  // 验证登录状态
  useEffect(() => {
    if (!isLoggedIn) {
      setMessage('请先登录以创建传记');
      setTimeout(() => navigate('/login'), 1000);
    }
  }, [isLoggedIn, navigate]);

  // 若从 My.js 传入 editNoteId，则加载并回填传记内容以便继续编辑
  useEffect(() => {
    const state = location.state || {};
    const editNoteId = state.editNoteId;
    if (!editNoteId) return;
    setEditingNoteId(editNoteId);
    const load = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        // 读取云端传记详情
        const res = await axios.get(`/api/note/${editNoteId}`, { headers: { Authorization: `Bearer ${token}` } });
        const note = res.data || {};
        setBioTitle(note.title || '');
        setBioSummary(note.summary || '');
        // 固定阶段篇章：对齐阶段数量，超出截断，不足补空
        const incoming = Array.isArray(note.sections) ? note.sections : [{ title: '', text: (note.content || '').toString(), media: [] }];
        const normalized = Array.from({ length: lifeStages.length }, (_, i) => {
          const src = incoming[i] || {};
          return { title: src.title || '', text: src.text || '', media: Array.isArray(src.media) ? src.media : [] };
        });
        setSections(normalized);
        setCurrentSectionIndex(0);
        // 恢复历史问答（若存在）
        try {
          const saved = localStorage.getItem(`chatMessages_${editNoteId}`);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setChatMessages(prev => (prev && prev.length > 0 ? prev : parsed));
            }
          }
        } catch (_) {}
        setMessage('已载入传记，可继续编辑');
      } catch (err) {
        console.error('Load biography for edit failed:', err);
      }
    };
    load();
  }, [location.state]);

  // 持久化问答到本地，便于"继续编辑"时恢复
  useEffect(() => {
    if (!editingNoteId) return;
    try {
      localStorage.setItem(`chatMessages_${editingNoteId}`, JSON.stringify(chatMessages.slice(-60)));
    } catch (_) {}
  }, [chatMessages, editingNoteId]);

  // 清除提示
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // 聊天内容更新后自动滚动到底部，始终展示最新一条
  useEffect(() => {
    if (chatContainerRef.current) {
      try {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      } catch (_) {}
    }
  }, [chatMessages]);

  // 回答输入内容变化时，确保自适应高度（包括程序性更新）
  useEffect(() => {
    if (answerInputRef.current) {
      autoResizeAnswer(answerInputRef.current);
    }
  }, [answerInput]);

  // 语音输入（语音转文字）：优先标准 SpeechRecognition，其次 webkit 前缀
  const handleSpeech = (targetId) => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      setMessage('当前浏览器不支持语音输入，请使用 Chrome 或 Edge 最新版');
      return;
    }
    const recognition = new SpeechRec();
    recognition.lang = 'zh-CN';
    recognition.onresult = (event) => {
      const text = sanitizeInput(event.results[0][0].transcript);
      if (targetId === 'polished-biography') {
        setPolishedBiography(polishedBiography ? `${polishedBiography}\n${text}` : text);
      } else if (targetId === 'bio-summary') {
        setBioSummary(prev => (prev ? prev + ' ' + text : text));
      } else {
        setMaterialsText(prev => (prev ? prev + '\n' + text : text));
      }
    };
    recognition.onerror = () => setMessage('语音识别失败，请检查麦克风或重试');
    recognition.start();
  };

  // no-op placeholder removed (素材区已移除)

  // 处理视频上传
  // 已移除视频制作上传入口（仍可在篇章内添加视频作为媒体）

  // 上传润色结果到后端
  const uploadPolishedBiography = async (polishedText) => {
    const token = localStorage.getItem('token');
    if (!token) {
      setMessage('请先登录以上传润色结果');
      setTimeout(() => navigate('/login'), 1000);
      return;
    }

    try {
      const response = await retry(() =>
        axios.post(
          '/api/note',
          {
            title: bioTitle || `我的一生 ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
            content: polishedText,
            summary: bioSummary,
            sections,
            author: username || (localStorage.getItem('username') || ''),
            isPublic: publicBio,
            sharedWithFamily: shareToFamily,
            cloudStatus: 'Uploaded',
            type: 'Biography',
            username: localStorage.getItem('username') || 'unknown',
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        )
      );

      const newBiography = {
        id: response.data.id,
        title: response.data.title,
        content: response.data.content,
        isPublic: response.data.isPublic,
        cloudStatus: response.data.cloudStatus,
        type: response.data.type,
        timestamp: response.data.timestamp,
        likes: response.data.likes || 0,
        username: localStorage.getItem('username') || 'unknown',
      };
      setNotes(prev => [...prev, newBiography]);
      if (publicBio) {
        setPublicBiographies(prev => [
          ...prev,
          {
            id: response.data.id,
            username: localStorage.getItem('username') || 'unknown',
            biography: polishedText,
            timestamp: new Date().toISOString(),
            likes: 0,
            type: 'Biography',
          },
        ]);
      }
      setMessage('润色结果已上传到服务器！');
    } catch (err) {
      console.error('Upload polished biography error:', err);
      setMessage('上传失败：' + (err.response?.data?.message || err.message));
    }
  };

  // 两阶段润色：第一阶段提取事实，第二阶段文学化表达（每日回首作为补充素材）
  const twoStagePolish = async (originalText, token, chapterIndex, selectedThemes = []) => {
    // 获取每日回首素材（仅作为参考）
    let dailyMaterialText = '';
    try {
      const res = await axios.get('/api/memos', { headers: { Authorization: `Bearer ${token}` } });
      const allMemos = Array.isArray(res.data) ? res.data : [];
      const dailyMemos = allMemos.filter(m => {
        const tags = Array.isArray(m.tags) ? m.tags : [];
        return tags.includes('每日回首') && tags.includes(lifeStages[chapterIndex]);
      });
      
      if (dailyMemos.length > 0) {
        const materials = dailyMemos.slice(0, 5).map(m => {
          const text = (m.text || '').toString();
          const ma = text.match(/回答：([\s\S]*)/);
          return ma ? (ma[1] || '').trim() : '';
        }).filter(Boolean);
        
        if (materials.length > 0) {
          dailyMaterialText = `\n\n【补充素材（来自每日回首，仅供参考）】\n${materials.join('\n')}`;
        }
      }
    } catch (_) {}
    
    // 第一阶段：从原文提取事实清单
    const extractionRule = prefStrict === 'strict'
      ? '只提取明确提到的事实，不做任何推断或补充'
      : prefStrict === 'moderate'
      ? '提取明确提到的事实，可基于上下文适度推断隐含的合理细节'
      : '提取事实并可根据上下文推断合理的场景细节';
    
    const stage1System = `你是一位${prefStrict === 'strict' ? '严谨' : '专业'}的事实提取专家。请从传记段落中提取事实信息，以结构化方式输出。

关键规则：
1. **以原文为准**，补充素材（如有）仅作为参考理解背景
2. ${extractionRule}
3. 如果原文包含问答形式，只提取回答者的内容，忽略提问
4. 保留所有具体细节：人名、地点、时间、事件、对话、数字等
5. 按时间顺序或逻辑顺序组织
6. 用简洁的陈述句表达，每个事实一行
7. 输出格式为JSON对象：{"facts": ["事实1", "事实2", ...]}
8. 去除"陪伴师""提问""回答"等问答痕迹`;

    const stage1User = `【原文（主要内容）】\n${originalText}${dailyMaterialText}\n\n请以原文为准提取事实（补充素材仅供理解背景），仅输出JSON格式的事实清单。`;
    
    setMessage(`第 ${chapterIndex + 1} 章：正在提取事实清单...`);
    
    const resp1 = await retry(() => callSparkThrottled({
      model: 'x1',
      messages: [
        { role: 'system', content: stage1System },
        { role: 'user', content: stage1User },
      ],
      max_tokens: 1500,
      temperature: 0.2,
      user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon')
    }, token, { silentThrottle: true }));
    
    const raw1 = (resp1.data?.choices?.[0]?.message?.content || '').toString().trim();
    
    // 解析事实清单
    let factsList = [];
    try {
      const parsed = JSON.parse(raw1);
      if (Array.isArray(parsed.facts)) {
        factsList = parsed.facts;
      }
    } catch (_) {
      // 容错：尝试提取JSON
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
      // 如果事实提取失败，返回原文
      return originalText;
    }
    
    // 第二阶段：文学化表达
    const themeGuidePolish = selectedThemes.length > 0 
      ? `\n\n本段重点主题/事件：${selectedThemes.join('、')}。请围绕这些主题或事件组织叙事，但要自然融入，不要生硬堆砌。`
      : '';
    
    // 获取用户风格设置
    const userStyleRulesPolish = buildStyleRules('gen');
      
    const stage2System = `你是一位优秀的传记作家。请根据提供的事实清单，写一段第一人称的自传段落。

【核心要求】
1. 输出纯粹的第一人称叙述，完全去除问答痕迹
2. 不要出现"陪伴师""提问""回答""继而""随后询问"等字眼
3. 直接用"我"的视角自然叙述，就像在讲述自己的故事

【叙事重构】
4. 保留事实内容，但用场景化语言重构叙事
5. 将段落聚焦于一个核心情绪或主题（如"温暖""成长""失落""坚持"等）
6. 避免简单的时间顺序罗列，改用情感主线或主题线索串联事件
7. 通过场景重现、细节刻画来展现情绪，而非直接陈述

【情感深度】
8. 使用第一人称回忆口吻，加入内心反思与当下的感悟
9. 让读者感受到时间沉淀后的思考和情感

【用户风格设置】
${userStyleRulesPolish}

【输出规范】
仅输出第一人称叙述段落，不要标题、编号、总结、过渡语${themeGuidePolish}`;

    const factsText = factsList.map((f, i) => `${i + 1}. ${f}`).join('\n');
    const hasMaterial = dailyMaterialText.length > 0;
    
    const stage2User = `事实清单（主要内容）：\n${factsText}${hasMaterial ? '\n\n💡 提示：您还有来自每日回首的补充素材，可以适当参考以丰富细节，但要以事实清单为主。' : ''}\n\n请基于以上事实清单，写一段自然流畅的第一人称自传段落。

关键要求：
✓ 直接用"我"的视角叙述，像讲述自己的故事
✓ 完全去除问答痕迹，不要出现"陪伴师""提问""回答"等字眼  
✓ 用情感或主题线索重构叙事，不要简单的时间罗列
✓ 加入回忆口吻和内心感悟
✓ 以事实清单为主，补充素材仅供理解背景和丰富细节
✗ 不得添加任何清单中没有的内容`;
    
    setMessage(`第 ${chapterIndex + 1} 章：正在进行文学化改写...`);
    
    const resp2 = await retry(() => callSparkThrottled({
      model: 'x1',
      messages: [
        { role: 'system', content: stage2System },
        { role: 'user', content: stage2User },
      ],
      max_tokens: 1500,
      temperature: 0.6,
      user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon')
    }, token, { silentThrottle: true }));
    
    const finalText = (resp2.data?.choices?.[0]?.message?.content || '').toString().trim();
    return finalText;
  };

  // 生成传记（AI润色）：逐章润色文本并生成预览 - 使用两阶段生成
  const handlePolishAI = async () => {
    setIsPolishing(true);
    const token = localStorage.getItem('token');
    if (!token) {
      setMessage('请先登录以使用 AI 润色');
      setTimeout(() => navigate('/login'), 1000);
      setIsPolishing(false);
      return;
    }
    const nonEmptyCount = sections.filter(s => (s.text || '').trim().length > 0).length;
    if (nonEmptyCount === 0) {
      setMessage('暂无可润色内容，请先在某个篇章填写正文');
      setIsPolishing(false);
      return;
    }

    try {
      for (let i = 0; i < sections.length; i++) {
        const original = (sections[i]?.text || '').trim();
        if (!original) continue;
        setMessage(`正在润色：第 ${i + 1}/${sections.length} 篇章（两阶段生成）…`);
        
        // 获取该章节用户选择的主题
        const chapterThemes = userThemes[i] || [];
        
        try {
          const polished = await twoStagePolish(original, token, i, chapterThemes);
          if (polished) {
            setSections(prev => prev.map((s, idx) => idx === i ? { ...s, text: polished } : s));
          }
        } catch (errOne) {
          console.error('Section polish failed:', errOne);
          // 忽略该章错误，继续下一章
        }
      }
      setShowPreview(true);
      setMessage('逐章润色完成（两阶段生成：事实提取+文学化表达），已生成下方预览');
      
      // 简介自动润色（可选）：仅当已有简介时尝试润色一遍
      if ((bioSummary || '').trim()) {
        try {
          const systemSum = '你是一位专业的编辑。请将以下传记简介润色，保持朴素真挚、简练清晰，不编造事实，输出不超过150字，仅输出润色后的简介文本。';
          const messagesSum = [
            { role: 'system', content: systemSum },
            { role: 'user', content: `请润色这段传记简介：\n${bioSummary}` },
          ];
          const respSum = await retry(() => callSparkThrottled({ model: 'x1', messages: messagesSum, max_tokens: 300, temperature: 0.5, user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') }, token, { silentThrottle: true }));
          const polishedSum = (respSum.data?.choices?.[0]?.message?.content || '').toString().trim();
          if (polishedSum) setBioSummary(polishedSum);
        } catch (_) { /* 忽略简介润色失败 */ }
      }
    } catch (err) {
      console.error('Polish by sections error:', err);
      setMessage('润色失败：' + (err.response?.data?.message || err.message));
    } finally {
      setIsPolishing(false);
    }
  };

  // 生成传记（不润色）：仅基于当前各篇章内容生成预览
  const handlePreview = async () => {
    setIsPolishing(true);
    try {
      const nonEmptyCount = sections.filter(s => (s.text || '').trim().length > 0).length;
      if (nonEmptyCount === 0) {
        setMessage('暂无内容，请先在某个篇章填写正文');
        return;
      }
      // 跳转到独立预览页（携带当前篇章索引，便于预览回写策略）
      navigate('/preview', { state: { bioTitle, bioSummary, sections, currentSectionIndex } });
      setMessage('已生成预览');
      // 若简介为空，后台异步生成一段简要简介
      try {
        if (!(bioSummary || '').trim()) {
          const token = localStorage.getItem('token');
          if (token) {
            const system = '你是一位严谨的传记内容编辑，请基于提供的正文材料，生成一段不超过150字的简介，语言朴素真诚，不使用列表与编号。仅输出简介正文。';
            const src = getPreviewText(sections.map(s => s.text || '').join('\n\n'));
            const userPayload = `以下是传记正文片段（已过滤未回答的提问）：\n\n${src}\n\n请输出一段不超过150字简介，仅正文。`;
            const messages = [ { role: 'system', content: system }, { role: 'user', content: userPayload } ];
            const resp = await retry(() => callSparkThrottled({ model: 'x1', messages, max_tokens: 220, temperature: 0.5, user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') }, token, { silentThrottle: true }));
            const text = (resp.data?.choices?.[0]?.message?.content || '').toString().trim();
            if (text) setBioSummary(text.slice(0, 150));
          }
        }
      } catch (_) {}
    } finally {
      setIsPolishing(false);
    }
  };

  // 两阶段生成：第一阶段提取事实，第二阶段文学化表达（每日回首作为补充素材）
  const twoStageGenerate = async (qaText, token, chapterIndex = null, selectedThemes = []) => {
    // 获取每日回首素材（仅作为参考，不作为主要内容）
    let dailyMaterialText = '';
    try {
      const res = await axios.get('/api/memos', { headers: { Authorization: `Bearer ${token}` } });
      const allMemos = Array.isArray(res.data) ? res.data : [];
      const dailyMemos = allMemos.filter(m => {
        const tags = Array.isArray(m.tags) ? m.tags : [];
        return tags.includes('每日回首') && (chapterIndex === null || tags.includes(lifeStages[chapterIndex]));
      });
      
      if (dailyMemos.length > 0) {
        const materials = dailyMemos.slice(0, 5).map(m => {
          const text = (m.text || '').toString();
          const ma = text.match(/回答：([\s\S]*)/);
          return ma ? (ma[1] || '').trim() : '';
        }).filter(Boolean);
        
        if (materials.length > 0) {
          dailyMaterialText = `\n\n【补充素材（来自每日回首，仅供参考）】\n${materials.join('\n')}`;
        }
      }
    } catch (_) {}
    
    // 第一阶段：提取事实清单
    const extractionRule = prefStrict === 'strict'
      ? '只提取明确提到的事实，不做任何推断或补充'
      : prefStrict === 'moderate'
      ? '提取明确提到的事实，可基于上下文适度推断隐含的合理细节'
      : '提取事实并可根据上下文推断合理的场景细节';
    
    const stage1System = `你是一位${prefStrict === 'strict' ? '严谨' : '专业'}的事实提取专家。请从问答对话中提取用户回答里的事实信息。

关键规则：
1. **以主要问答对为准**，提取用户（"我"/"A"）的回答内容，完全忽略陪伴师/提问者的问题
2. 补充素材（如有）仅作为参考，帮助理解上下文，不作为主要提取对象
3. 将用户的回答转换为第三人称客观事实陈述
4. ${extractionRule}
5. 保留所有具体细节：人名、地点、时间、事件、对话、数字等
6. 按时间顺序或逻辑顺序组织
7. 用简洁的陈述句表达，每个事实一行
8. 输出格式为JSON对象：{"facts": ["事实1", "事实2", ...]}

示例：
问答对：Q: 外婆为你做过什么？ A: 外婆常为我烹制美食，最怀念农忙时期的炒土豆片。
正确提取：{"facts": ["外婆常为我烹制美食", "最怀念的是农忙时期外婆炒的土豆片"]}
错误提取：{"facts": ["陪伴师询问外婆做过什么", "外婆常为我烹制美食"]} ❌ 不要包含提问`;

    const stage1User = `【主要问答对】\n${qaText}${dailyMaterialText}\n\n请以主要问答对为准，提取用户回答中的事实（补充素材仅供理解上下文），仅输出JSON格式的事实清单。`;
    
    setMessage(chapterIndex !== null ? `第 ${chapterIndex + 1} 章：正在提取事实清单...` : '正在提取事实清单...');
    
    const resp1 = await retry(() => callSparkThrottled({
      model: 'x1',
      messages: [
        { role: 'system', content: stage1System },
        { role: 'user', content: stage1User },
      ],
      max_tokens: 1500,
      temperature: 0.2, // 低温度，确保严格按事实
      user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon')
    }, token, { silentThrottle: true }));
    
    const raw1 = (resp1.data?.choices?.[0]?.message?.content || '').toString().trim();
    
    // 解析事实清单
    let factsList = [];
    try {
      const parsed = JSON.parse(raw1);
      if (Array.isArray(parsed.facts)) {
        factsList = parsed.facts;
      }
    } catch (_) {
      // 容错：尝试提取JSON
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
      throw new Error('无法提取事实清单');
    }
    
    // 第二阶段：文学化表达
    const themeGuide = selectedThemes.length > 0 
      ? `\n\n本段重点主题/事件：${selectedThemes.join('、')}。请围绕这些主题或事件组织叙事，但要自然融入，不要生硬堆砌。`
      : '';
    
    // 获取用户风格设置
    const userStyleRules = buildStyleRules('gen');
    
    const stage2System = `你是一位优秀的传记作家。请根据提供的事实清单，写一段第一人称的自传段落。

【核心要求】
1. 输出纯粹的第一人称叙述，完全去除问答痕迹
2. 不要出现"陪伴师""提问""回答""继而""随后询问"等字眼
3. 直接用"我"的视角自然叙述，就像在讲述自己的故事

【叙事重构】
4. 保留事实内容，但用场景化语言重构叙事
5. 将段落聚焦于一个核心情绪或主题（如"温暖""成长""失落""坚持"等）
6. 避免简单的时间顺序罗列，改用情感主线或主题线索串联事件
7. 通过场景重现、细节刻画来展现情绪，而非直接陈述

【情感深度】
8. 使用第一人称回忆口吻，加入内心反思与当下的感悟
9. 让读者感受到时间沉淀后的思考和情感

【用户风格设置】
${userStyleRules}

【输出规范】
仅输出第一人称叙述段落，不要标题、编号、总结、过渡语${themeGuide}`;

    const factsText = factsList.map((f, i) => `${i + 1}. ${f}`).join('\n');
    const supplementNote = dailyMaterialText 
      ? '\n\n【补充素材说明】上述事实清单已包含主要内容，补充素材仅供参考理解背景，不要重复使用。'
      : '';
    
    const stage2User = `事实清单（主要内容）：\n${factsText}${supplementNote}\n\n请基于以上事实清单，写一段自然流畅的第一人称自传段落。

关键要求：
✓ 直接用"我"的视角叙述，像讲述自己的故事
✓ 完全去除问答痕迹，不要出现"陪伴师""提问""回答"等字眼  
✓ 用情感或主题线索重构叙事，不要简单的时间罗列
✓ 加入回忆口吻和内心感悟
✓ 以事实清单为主，补充素材仅供理解背景
✗ 不得添加任何清单中没有的内容

示例转换：
事实：外婆常为我烹制美食；最怀念农忙时期的炒土豆片；外公、舅舅和姨姨一起进餐
错误写法：陪伴师询问...随后回答...继而追问... ❌
正确写法：外婆的手艺，是我童年最温暖的记忆。即便在农忙时节，她依然会为我们炒上一盘土豆片。那时候，外公、舅舅和姨姨都围坐在桌旁... ✓`;
    
    setMessage(chapterIndex !== null ? `第 ${chapterIndex + 1} 章：正在进行文学化改写...` : '正在进行文学化改写...');
    
    const resp2 = await retry(() => callSparkThrottled({
      model: 'x1',
      messages: [
        { role: 'system', content: stage2System },
        { role: 'user', content: stage2User },
      ],
      max_tokens: 1500,
      temperature: 0.6, // 适中温度，保持创造性表达
      user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon')
    }, token, { silentThrottle: true }));
    
    const finalText = (resp2.data?.choices?.[0]?.message?.content || '').toString().trim();
    return finalText;
  };


  // 基于问答生成各个篇章（按阶段/顺序拆分），不动媒体 - 使用两阶段生成
  const handleGenerateChaptersFromQA = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setMessage('请先登录以使用生成篇章');
      setTimeout(() => navigate('/login'), 1000);
      return;
    }
    if (!chatMessages || chatMessages.length === 0) {
      setMessage('暂无对话记录，无法生成篇章');
      return;
    }
    setIsGeneratingChapters(true);
    try {
      // 将最近对话按"陪伴师问/我答"对组装成清晰的QA序列，供模型分章
      const maxTurns = 60;
      const msgs = chatMessages.slice(-maxTurns);
      const qaPairs = [];
      let currentQ = '';
      for (const m of msgs) {
        if (m.role === 'assistant') {
          currentQ = m.content;
        } else if (m.role === 'user') {
          if (currentQ) qaPairs.push({ q: currentQ, a: m.content });
          currentQ = '';
        }
      }
      if (qaPairs.length === 0) {
        setMessage('未找到有效的问答对，无法生成篇章');
        setIsGeneratingChapters(false);
        return;
      }

      // 把现有章节媒体暂存，后续仅替换 text
      const mediaSnapshots = sections.map(s => s.media || []);

      // 先确定章节分组（按阶段或对话轮数分）
      const chapterQAs = [];
      const qaPairsPerChapter = Math.ceil(qaPairs.length / sections.length);
      for (let i = 0; i < sections.length; i++) {
        const start = i * qaPairsPerChapter;
        const end = Math.min(start + qaPairsPerChapter, qaPairs.length);
        const chapterPairs = qaPairs.slice(start, end);
        if (chapterPairs.length > 0) {
          chapterQAs.push(chapterPairs);
        }
      }

      // 逐章使用两阶段生成
      const generatedChapters = [];
      for (let i = 0; i < chapterQAs.length; i++) {
        const pairs = chapterQAs[i];
        const qaText = `问答对如下：\n${pairs.map((p, idx) => `Q${idx + 1}：${p.q}\nA${idx + 1}：${p.a}`).join('\n')}`;
        
        // 获取该章节用户选择的主题
        const chapterThemes = userThemes[i] || [];
        
        try {
          const chapterText = await twoStageGenerate(qaText, token, i, chapterThemes);
          generatedChapters.push(chapterText);
        } catch (err) {
          console.error(`Chapter ${i} generation failed:`, err);
          generatedChapters.push(''); // 失败章节留空
        }
      }

      if (generatedChapters.length === 0) {
        setMessage('生成篇章失败，请重试');
        setIsGeneratingChapters(false);
        return;
      }

      // 仅为"空白篇章"写入内容，不覆盖已有正文
      setSections(prev => prev.map((s, i) => {
        const isEmpty = !((s.text || '').toString().trim().length > 0);
        if (isEmpty && i < generatedChapters.length) {
          return { ...s, text: generatedChapters[i] || '', media: mediaSnapshots[i] || s.media || [] };
        }
        return s;
      }));
      setMessage('已根据问答填充空白篇章（两阶段生成，未覆盖已有内容）');
    } catch (err) {
      console.error('Generate chapters from QA error:', err);
      setMessage('生成篇章失败：' + (err.response?.data?.message || err.message));
    } finally {
      setIsGeneratingChapters(false);
    }
  };
  // 保存传记（本地）
  const handleSave = () => {
    setIsSaving(true);
    const bioText = polishedBiography || sections.map(s => s.text || '').filter(Boolean).join('\n');
    if (!bioText.trim()) {
      setMessage('请至少回答一个问题或输入自由传记内容');
      setIsSaving(false);
      return;
    }
    const localBiographies = JSON.parse(localStorage.getItem('localBiographies') || '[]');
    const newBiography = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: bioTitle || `我的一生 ${new Date().toLocaleString('zh-CN')}`,
      content: bioText,
      sections,
      isPublic: false,
      cloudStatus: 'Not Uploaded',
      type: 'Biography',
      timestamp: new Date().toISOString(),
      likes: 0,
      username: localStorage.getItem('username') || 'unknown',
    };
    localBiographies.push(newBiography);
    localStorage.setItem('localBiographies', JSON.stringify(localBiographies));
    // 不把本地草稿加入云端列表（My.js 只展示云端）
    setFreeBiography(bioText);
    setMessage('传记已保存到本地！');
    setIsSaving(false);
  };

  // 上传传记
  const handleUpload = async (interviewData = null) => {
    const token = localStorage.getItem('token');
    if (!token) {
      setMessage('请先登录');
      setTimeout(() => navigate('/login'), 1000);
      return;
    }
    const bioText = polishedBiography || sections.map(s => s.text || '').filter(Boolean).join('\n');
    if (!bioText.trim()) {
      setMessage('请至少回答一个问题或输入自由传记内容');
      return;
    }
    setIsUploading(true);
    try {
      const response = await retry(() =>
        axios.post(
          '/api/note',
          {
            title: bioTitle || `我的一生 ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
            content: bioText,
            summary: bioSummary,
            sections,
            interviewData: interviewData || sections.map((s, idx) => {
              const text = (s.text || '').toString();
              if (text.includes('陪伴师：') || text.includes('我：')) {
                return {
                  stage: lifeStages[idx],
                  title: s.title || '',
                  content: text,
                  themes: userThemes[idx] || []
                };
              }
              return null;
            }).filter(Boolean), // 自动生成采访数据
            author: username || (localStorage.getItem('username') || ''),
            isPublic: publicBio,
            cloudStatus: 'Uploaded',
            type: 'Biography',
            username: localStorage.getItem('username') || 'unknown',
            shareToFamily: false,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        )
      );
      const newBiography = {
        id: response.data.id,
        title: response.data.title,
        content: response.data.content,
        sections: response.data.sections || sections,
        isPublic: response.data.isPublic,
        cloudStatus: response.data.cloudStatus,
        type: response.data.type,
        timestamp: response.data.timestamp,
        likes: response.data.likes || 0,
        username: localStorage.getItem('username') || 'unknown',
      };
      // 上传成功才加入云端列表
      setNotes(prev => [...prev, newBiography]);
      if (publicBio) {
        setPublicBiographies(prev => [
          ...prev,
          {
            id: response.data.id,
            username: localStorage.getItem('username') || 'unknown',
            title: response.data.title,
            content: response.data.content,
            sections: response.data.sections || sections,
            timestamp: new Date().toISOString(),
            likes: 0,
            type: 'Biography',
          },
        ]);
      }
      setMessage('传记上传成功！');
    } catch (err) {
      console.error('Upload biography error:', err);
      if (err.response?.status === 401 || err.response?.status === 403) {
        setMessage('身份验证失败，请重新登录');
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        setTimeout(() => navigate('/login'), 1000);
      } else {
        setMessage('上传失败：' + (err.response?.data?.message || err.message));
      }
    } finally {
      setIsUploading(false);
    }
  };

  // 保存并上传（合并为一个按钮）：先本地保存草稿，再上传云端
  const handleSaveAndUpload = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setMessage('请先登录');
      setTimeout(() => navigate('/login'), 1000);
      return;
    }
    const bioText = polishedBiography || sections.map(s => s.text || '').filter(Boolean).join('\n');
    if (!bioText.trim()) {
      setMessage('请至少回答一个问题或输入自由传记内容');
      return;
    }
    
    // 保存原始问答对话作为采访记录（仅保存包含问答的章节）
    const interviewSections = sections.map((s, idx) => {
      const text = (s.text || '').toString();
      if (text.includes('陪伴师：') || text.includes('我：')) {
        return {
          stage: lifeStages[idx],
          title: s.title || '',
          content: text,
          themes: userThemes[idx] || []
        };
      }
      return null;
    }).filter(Boolean);
    
    // 1) 本地保存（静默，不把本地草稿加入云端列表）
    try {
      const localBiographies = JSON.parse(localStorage.getItem('localBiographies') || '[]');
      localBiographies.push({
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title: bioTitle || `我的一生 ${new Date().toLocaleString('zh-CN')}`,
        content: bioText,
        summary: bioSummary,
        sections,
        interviewData: interviewSections, // 保存原始采访数据
        isPublic: false,
        cloudStatus: 'Not Uploaded',
        type: 'Biography',
        timestamp: new Date().toISOString(),
        likes: 0,
        username: localStorage.getItem('username') || 'unknown',
      });
      localStorage.setItem('localBiographies', JSON.stringify(localBiographies));
    } catch (_) { /* ignore local save error */ }

    // 2) 上传云端（传递原始采访数据）
    await handleUpload(interviewSections);
  };

  // 若未同意且弹窗开启，优先渲染强制同意界面，屏蔽其它功能
  // 已迁移到注册页：不再在创建页拦截

  // 专注模式：自动滚动到最新内容
  useEffect(() => {
    if (isFocusMode && focusContentRef.current) {
      try {
        setTimeout(() => {
          try { focusContentRef.current.scrollTop = focusContentRef.current.scrollHeight; } catch (_) {}
        }, 0);
      } catch (_) {}
    }
  }, [sections, chatMessages, currentSectionIndex, isFocusMode]);

  const [centerToast, setCenterToast] = useState('');
  // 富文本模式：默认关闭（保留纯文本），开启后使用 contentEditable 简单富文本
  const [richTextMode, setRichTextMode] = useState(() => {
    try { return localStorage.getItem('richtext_mode') === '1'; } catch(_) { return false; }
  });
  const richDivRef = useRef(null);

  return (
    <div className="min-h-screen py-4 sm:py-6">
      {/* 主题选择模态框 */}
      {showThemeSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowThemeSelector(false); }}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="mb-4">
              <h2 className="text-xl font-bold text-gray-900 mb-2">选择您想重点记录的主题/事件</h2>
              <p className="text-sm text-gray-600">为「{getStageLabelByIndex(currentThemeStageIndex)}」阶段选择您认为重要的主题或关键事件，系统会据此提出更有针对性的问题。</p>
              <p className="text-xs text-gray-500 mt-1">建议选择 2-5 个主题/事件，也可以跳过直接开始。</p>
            </div>
            
            <div className="mb-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(STAGE_THEMES[currentThemeStageIndex] || []).map((theme) => {
                  const isSelected = (userThemes[currentThemeStageIndex] || []).includes(theme);
                  return (
                    <button
                      key={theme}
                      type="button"
                      onClick={() => {
                        setUserThemes(prev => {
                          const stageThemes = prev[currentThemeStageIndex] || [];
                          if (stageThemes.includes(theme)) {
                            return { ...prev, [currentThemeStageIndex]: stageThemes.filter(t => t !== theme) };
                          } else {
                            return { ...prev, [currentThemeStageIndex]: [...stageThemes, theme] };
                          }
                        });
                      }}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        isSelected 
                          ? 'bg-blue-600 border-blue-700 text-white' 
                          : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400 hover:bg-blue-50'
                      }`}
                    >
                      {theme}
                    </button>
                  );
                })}
              </div>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">自定义主题/事件（可选）</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="输入您的自定义主题或事件，然后点击添加"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.target.value.trim()) {
                      const custom = e.target.value.trim();
                      setUserThemes(prev => {
                        const stageThemes = prev[currentThemeStageIndex] || [];
                        if (!stageThemes.includes(custom)) {
                          return { ...prev, [currentThemeStageIndex]: [...stageThemes, custom] };
                        }
                        return prev;
                      });
                      e.target.value = '';
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    const input = e.target.previousElementSibling;
                    const custom = (input.value || '').trim();
                    if (custom) {
                      setUserThemes(prev => {
                        const stageThemes = prev[currentThemeStageIndex] || [];
                        if (!stageThemes.includes(custom)) {
                          return { ...prev, [currentThemeStageIndex]: [...stageThemes, custom] };
                        }
                        return prev;
                      });
                      input.value = '';
                    }
                  }}
                  className="px-4 py-2 bg-gray-100 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
                >
                  添加
                </button>
              </div>
            </div>
            
            {(userThemes[currentThemeStageIndex] || []).length > 0 && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm font-medium text-gray-700 mb-2">已选择的主题/事件：</p>
                <div className="flex flex-wrap gap-2">
                  {(userThemes[currentThemeStageIndex] || []).map((theme) => (
                    <span key={theme} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-600 text-white text-xs rounded-full">
                      {theme}
                      <button
                        type="button"
                        onClick={() => {
                          setUserThemes(prev => ({
                            ...prev,
                            [currentThemeStageIndex]: (prev[currentThemeStageIndex] || []).filter(t => t !== theme)
                          }));
                        }}
                        className="hover:bg-blue-700 rounded-full"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => {
                  // 跳过主题选择，使用默认问题
                  setUserThemes(prev => ({ ...prev, [currentThemeStageIndex]: [] }));
                  handleThemeSelectionComplete();
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                跳过
              </button>
              <button
                type="button"
                onClick={handleThemeSelectionComplete}
                disabled={(userThemes[currentThemeStageIndex] || []).length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                开始访谈
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="card max-w-4xl mx-auto w-full p-4 sm:p-6">
        <Helmet>
          <title>{(bioTitle || '我的一生') + ' - 永念'}</title>
        </Helmet>
        <div className="mb-4">
          <input
            type="text"
            className="input text-center text-2xl sm:text-3xl font-bold"
            placeholder={t ? t('titlePlaceholder') : '请输入主标题（如：我的一生）'}
            value={bioTitle}
            onChange={(e) => setBioTitle(sanitizeInput(e.target.value))}
            maxLength={200}
          />
        </div>
        {/* 温暖副标题提示 */}
        <p className="text-sm mb-4 text-gray-700">以温柔对话，慢慢整理一生的回忆。请点击"开始访谈"，在"请输入您的回答"中作答；生成后可在上方篇章里自由编辑与完善。点击最下方查看此生可以查看完整回忆。</p>
        {message && (
          <div className={`mb-4 p-2 text-center rounded ${message.includes('失败') || message.includes('违规') || message.includes('错误') ? 'bg-red-700' : 'bg-green-700'}`} style={{ color: '#e7c36f' }}>
            {message}
          </div>
        )}
        {centerToast && (
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="bg-black/80 text-white px-4 py-2 rounded shadow pointer-events-none">
              {centerToast}
            </div>
          </div>
        )}
        {/* 隐私条款弹窗已移除 */}
        <div className="flex flex-col gap-6">
          {/* 风格设置面板 */}
          <div className="-mx-4 sm:mx-0 px-4">
            <div className="border rounded bg-white border-gray-200 text-gray-900">
              <button type="button" className="w-full flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3" onClick={()=>setShowStylePanel(v=>!v)}>
                <span className="font-semibold">风格设置</span>
                <span className="text-sm text-gray-500">{showStylePanel ? '收起' : '展开'}</span>
              </button>
              {showStylePanel && (
                <div className="p-3 sm:p-4 border-t border-gray-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* 文风选择 */}
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700">文风风格</label>
                      <select className="input" value={prefTone} onChange={(e)=>setPrefTone(e.target.value)}>
                        <option value="warm">温情内敛</option>
                        <option value="plain">平实客观</option>
                        <option value="poetic">诗意浪漫</option>
                        <option value="literary">文学化</option>
                        <option value="humorous">幽默风趣</option>
                      </select>
            </div>
                    
                    {/* 严格度 */}
                  <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700">事实严格度</label>
                      <select className="input" value={prefStrict} onChange={(e)=>setPrefStrict(e.target.value)}>
                        <option value="strict">严格（仅用已提及事实）</option>
                        <option value="moderate">适中（可推断合理细节）</option>
                        <option value="flexible">灵活（可补充场景细节）</option>
                      </select>
                  </div>
                    
                    {/* 具体度 */}
                        <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700">叙述具体度</label>
                      <select className="input" value={prefConcrete} onChange={(e)=>setPrefConcrete(e.target.value)}>
                        <option value="high">高（强调细节）</option>
                        <option value="medium">中（细节+概括）</option>
                        <option value="low">低（以概括为主）</option>
                      </select>
                        </div>
                    
                    {/* 生成长度 */}
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700">生成长度</label>
                      <select className="input" value={prefLength} onChange={(e)=>setPrefLength(e.target.value)}>
                        <option value="short">简短（500字内）</option>
                        <option value="medium">适中（800字内）</option>
                        <option value="long">详细（1200字内）</option>
                          </select>
                        </div>
                    
                    {/* 自定义文风 */}
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium mb-1 text-gray-700">自定义文风（选填，将覆盖上方文风选项）</label>
                      <input 
                        className="input" 
                        placeholder="如：朴实无华、充满哲理、富有诗意、温暖治愈等" 
                        value={customTone} 
                        onChange={(e)=>setCustomTone(sanitizeInput(e.target.value))}
                        maxLength={50}
                      />
                      <p className="text-xs text-gray-500 mt-1">提示：输入您想要的文风描述，AI会根据您的描述调整生成风格</p>
                      </div>
                </div>
              </div>
              )}
            </div>
          </div>
          {/* 阶段面包屑（横向滚动） */}
          <div className="-mx-4 sm:mx-0 px-4 overflow-x-auto" ref={stageScrollRef}>
            <div className="flex gap-2 pb-2 min-w-max">
              {lifeStages.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => { goToSectionByIndex(idx); centerStageChip(idx); }}
                  className={`px-3 py-1 rounded-full border text-sm whitespace-nowrap ${idx === currentSectionIndex ? 'bg-blue-600 border-blue-700 text-white' : 'bg-blue-600/80 border-blue-700 text-white'}`}
                  aria-current={idx === currentSectionIndex ? 'page' : undefined}
                  ref={(el) => { stageBtnsRef.current[idx] = el; }}
                >
                  {getSectionLabelByIndex(idx)}
                </button>
                  ))}
                </div>
            </div>
          {/* 永恒计划引导：仅在用户点击"查看此生"后于预览页展示；此处不再弹出 */}
          
          {/* 情感陪伴师访谈（一体化：隐藏单独区域，所有问答只在篇章正文中体现） */}
          <div className="hidden" aria-hidden>
            {/* 保留逻辑挂载，但不展示列表/输入，避免与篇章区域重复显示 */}
          </div>
          {/* 新的篇章（可为每篇章添加标题/正文/媒体） */}
          <div>
            {/* 顶部标题与导航移除，导航按钮移动到输入框下方 */}
            <div className="space-y-4">
              {sections[currentSectionIndex] && (
                <div className={`border rounded p-3 sm:p-4 ring-2 bg-white border-gray-200 text-gray-900`}>
                  <div className="flex items-center justify-between gap-2 mb-2 flex-nowrap">
                    <div className="font-medium text-base sm:text-lg truncate text-gray-900">{getSectionLabelByIndex(currentSectionIndex)}</div>
                    <div className="shrink-0">
                      <button
                        type="button"
                        className="btn btn-primary inline-flex sm:hidden mr-2"
                        onClick={() => { setIsFocusMode(true); setTimeout(scrollAnswerIntoView, 0); }}
                        style={{ padding: '6px 10px', fontSize: '14px' }}
                      >
                        专注写作
                      </button>
                      {!(sections[currentSectionIndex]?.text || '').toString().includes('陪伴师：') && (
                        <button
                          className="btn btn-primary"
                          onClick={startInterview}
                          style={{ padding: '6px 10px', fontSize: '14px' }}
                        >
                          {t ? t('startInterview') : '开始访谈'}
                        </button>
                      )}
                  </div>
                  </div>
                  {/* 显示已选主题/事件 */}
                  {(userThemes[currentSectionIndex] || []).length > 0 && (
                    <div className="mb-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-medium text-blue-900">重点主题/事件：</span>
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentThemeStageIndex(currentSectionIndex);
                            setShowThemeSelector(true);
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800 underline"
                        >
                          重新选择
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {(userThemes[currentSectionIndex] || []).map((theme) => (
                          <span key={theme} className="inline-block px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                            {theme}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <input
                    type="text"
                    className="input w-full mb-2"
                    placeholder={t ? t('chapterTitlePlaceholder') : '篇章标题（可选）'}
                    value={sections[currentSectionIndex]?.title || ''}
                    onChange={(e) => updateSectionTitle(currentSectionIndex, e.target.value)}
                    maxLength={200}
                    disabled={isSaving || isUploading}
                  />
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs text-gray-500">{richTextMode ? '富文本模式（可粘贴粗体/分段）' : '纯文本模式'}</div>
                    <button type="button" className="btn btn-tertiary text-xs" onClick={()=>{ const v=!richTextMode; setRichTextMode(v); try{localStorage.setItem('richtext_mode', v?'1':'0');}catch(_){} }} disabled={isSaving||isUploading}>{richTextMode?'切换为纯文本':'切换为富文本'}</button>
                  </div>
                  {richTextMode ? (
                    <div
                      className="input w-full min-h-[40vh] sm:min-h-60 whitespace-pre-wrap"
                      contentEditable
                      suppressContentEditableWarning
                      ref={richDivRef}
                      onInput={(e)=>{
                        const html = (e.currentTarget.innerHTML || '').toString();
                        // 仅允许基本内联标签，去除脚本
                        const clean = DOMPurify.sanitize(html, { ALLOWED_TAGS: ['b','strong','i','em','u','br','p','span'], ALLOWED_ATTR: [] });
                        updateSectionText(currentSectionIndex, clean);
                      }}
                      dangerouslySetInnerHTML={{ __html: sections[currentSectionIndex]?.text || '' }}
                      style={{ minHeight: '40vh' }}
                    />
                  ) : (
                    <textarea
                      className="input w-full resize-y h-[40vh] sm:h-60"
                      placeholder={t ? t('chapterTextPlaceholder') : '在此输入该篇章的正文内容。回答完某个问题后，直接把内容写在这里；接着点击下方按钮可以给此篇章插入图片或视频。'}
                      value={sections[currentSectionIndex]?.text || ''}
                      onChange={(e) => updateSectionText(currentSectionIndex, e.target.value)}
                      maxLength={10000}
                      disabled={isSaving || isUploading}
                      ref={sectionTextareaRef}
                    />
                  )}
                  {/* 章节导航（移动到正文下方） */}
                  <div className="mt-2" />
                  {/* 一体化聊天控制：仅在篇章里进行问答 */}
                  <div className="mt-2 flex gap-2 flex-col sm:flex-row flex-wrap">
                    {/* 非全屏：移动端 上一/下一 导航（仅一组） */}
                    <div className={`flex gap-2 w-full sm:hidden ${isFocusMode ? 'hidden' : ''}`}>
                      <button type="button" className="btn btn-secondary flex-1" onClick={goToPrevSection} disabled={isSaving || isUploading || currentSectionIndex <= 0}>{t ? t('prev') : '上一篇'}</button>
                      <button type="button" className="btn btn-secondary flex-1" onClick={goToNextSection} disabled={isSaving || isUploading || currentSectionIndex >= sections.length - 1}>{t ? t('next') : '下一篇'}</button>
                    </div>
                    {/* 移动端：单独一行放置语音输入，避免挤占输入框空间 */}
                    <div className={`flex gap-2 w-full sm:hidden ${isFocusMode ? 'hidden' : ''}`}>
                      <button className="btn btn-tertiary flex-1" onClick={handleSectionSpeech} disabled={isSaving || isUploading} style={{ padding: '8px 10px', fontSize: '15px' }}>
                         {isIatRecording ? (t ? (t('stopRecording') || '停止录音') : '停止录音') : (t ? t('voiceInput') : '语音输入')}
                       </button>
                    </div>
                    <div className={`flex-1 flex gap-2 items-stretch ${isFocusMode ? 'hidden sm:flex' : ''}`}>
                      <textarea
                        className="input flex-1 min-h-[44px] resize-none"
                        placeholder={t ? t('answerPlaceholder') : '请输入您的回答...'}
                        value={answerInput}
                        onChange={(e) => { const v = sanitizeInput(e.target.value); setAnswerInput(v); autoResizeAnswer(e.target); }}
                        ref={answerInputRef}
                      disabled={isSaving || isUploading}
                        rows={1}
                        style={{ height: '44px', overflowY: 'hidden', WebkitOverflowScrolling: 'touch' }}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAnswer(); } }}
                      />
                      {/* 桌面端：与输入框并排显示语音输入 */}
                      <button className="btn btn-tertiary hidden sm:inline-flex" onClick={handleSectionSpeech} disabled={isSaving || isUploading} style={{ padding: '6px 10px', fontSize: '14px' }}>
                         {isIatRecording ? (t ? (t('stopRecording') || '停止录音') : '停止录音') : (t ? t('voiceInput') : '语音输入')}
                    </button>
                      <button className="btn btn-primary w-auto" onClick={sendAnswer} disabled={isAsking || isSaving || isUploading} style={{ padding: '6px 10px', fontSize: '14px' }}>
                        {isAsking ? '请稍候...' : (t ? t('send') : '发送')}
                      </button>
                    </div>
                    {/* 语音设置面板已移除 */}
                  </div>
                  {/* 添加媒体 / 生成回忆 行（顺序：先添加媒体，再生成回忆） */}
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <label className="btn btn-secondary w-full sm:w-auto inline-flex items-center justify-center">
                      {t ? t('addMedia') : '添加图片/视频/音频'}
                      <input type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleUploadMediaToSection(currentSectionIndex, e.target.files[0])} disabled={isSaving || isUploading} />
                    </label>
                    <button
                      type="button"
                      className="btn btn-primary w-full sm:w-auto"
                      disabled={polishingSectionIndex === currentSectionIndex || isSaving || isUploading || !((sections[currentSectionIndex]?.text)||'').trim()}
                      onClick={async () => {
                        const section = sections[currentSectionIndex] || {};
                        if (!((section.text || '').trim())) return;
                        const asked = await maybeAskFollowUpBeforeGenerate(currentSectionIndex);
                        if (asked) return;
                        setPolishingSectionIndex(currentSectionIndex);
                        try {
                          const token = localStorage.getItem('token');
                          if (!token) { setMessage('请先登录'); setPolishingSectionIndex(null); return; }
                          
                          // 使用两阶段生成，自动包含每日回首素材
                          const qaSourceRaw = (sections[currentSectionIndex]?.text || '').toString();
                          const qaSource = filterPolishSource(qaSourceRaw);
                          
                          // 将问答记录转换为标准格式
                          const lines = qaSource.split(/\n+/);
                          const qaPairs = [];
                          let currentQ = '';
                          for (const line of lines) {
                            if (/^陪伴师[：:]/.test(line)) {
                              currentQ = line.replace(/^陪伴师[：:]\s*/, '').trim();
                            } else if (/^我[：:]/.test(line)) {
                              const a = line.replace(/^我[：:]\s*/, '').trim();
                              if (currentQ && a) {
                                qaPairs.push({ q: currentQ, a });
                              }
                              currentQ = '';
                            }
                          }
                          
                          if (qaPairs.length === 0) {
                            setMessage('未找到有效的问答对，请先进行访谈');
                            setPolishingSectionIndex(null);
                            return;
                          }
                          
                          const qaText = `问答对如下：\n${qaPairs.map((p, idx) => `Q${idx + 1}：${p.q}\nA${idx + 1}：${p.a}`).join('\n')}`;
                          const chapterThemes = userThemes[currentSectionIndex] || [];
                          
                          const polished = await twoStageGenerate(qaText, token, currentSectionIndex, chapterThemes);
                          
                          if (polished) {
                            setSections(prev => prev.map((s, i) => i === currentSectionIndex ? { ...s, text: polished } : s));
                            // 中心提示：请核查并修改...
                            const tip = '已生成内容。请核查并修改任何与您记忆不符的内容。';
                            setCenterToast(tip);
                            setTimeout(() => setCenterToast(''), 2000);
                          }
                        } catch (e) {
                          console.error('Polish current section error:', e);
                          setMessage('当前阶段篇章生成失败：' + (e?.response?.data?.message || e?.message || '网络/鉴权错误'));
                        } finally {
                          setPolishingSectionIndex(null);
                        }
                      }}
                    >
                      {polishingSectionIndex === currentSectionIndex ? '生成中...' : (t ? t('generateSection') : '生成本篇回忆')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary w-full sm:w-auto"
                      disabled={isSaving || isUploading || !((sections[currentSectionIndex]?.text)||'').trim()}
                      onClick={async ()=>{
                        // 轻润色：仅书面化表达，绝不新增事实
                        try {
                          const token = localStorage.getItem('token');
                          if (!token) { setMessage('请先登录'); return; }
                          const src = (sections[currentSectionIndex]?.text || '').toString();
                          const system = '你是一位文本编辑，请将以下内容从口语化整理为更清晰的书面表达。不得新增任何事实或细节；不得改变人称与时间；避免煽情与夸饰；仅输出整理后的正文。';
                          const messages = [ { role: 'system', content: system }, { role: 'user', content: src } ];
                          const resp = await retry(()=>callSparkThrottled({ model:'x1', messages, max_tokens: 900, temperature: 0.2, user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') }, token, { silentThrottle:true }));
                          const out = (resp.data?.choices?.[0]?.message?.content || '').toString().trim();
                          if (out) {
                            setSections(prev => prev.map((s, i) => i === currentSectionIndex ? { ...s, text: out } : s));
                            setCenterToast('已完成润色（不新增事实）');
                            setTimeout(()=>setCenterToast(''), 1000);
                          }
                        } catch(e) {
                          console.error('light polish error', e);
                          setMessage('润色失败，请稍后再试');
                        }
                      }}
                    >润色</button>
                  </div>
                  <p className="text-sm text-gray-500">当前字数: {sections[currentSectionIndex]?.text?.length || 0} / 10000</p>
                  {(sections[currentSectionIndex]?.media?.length > 0) && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
                      {sections[currentSectionIndex].media.map((m, mi) => (
                        <div key={mi} className="relative border rounded overflow-hidden">
                          {m.type === 'image' && (
                            <img src={m.url} alt={m.desc || ''} className="w-full h-32 object-cover" />
                          )}
                          {m.type === 'video' && (
                            <video src={m.url} className="w-full h-32 object-cover" controls />
                          )}
                          {m.type === 'audio' && (
                            <audio src={m.url} className="w-full" controls />
                          )}
              <button
                            className="absolute top-1 right-1 bg-black/60 text-white text-xs px-2 py-1 rounded"
                            onClick={() => removeMediaFromSection(currentSectionIndex, mi)}
                disabled={isSaving || isUploading}
              >
                            删除
              </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* 固定阶段篇章：移除新增按钮 */}
          </div>
          
          
          {/* 生成传记预览区（可选编辑） */}
          {polishedBiography && (
            <div>
              <h3 className="text-lg font-semibold mb-2">生成传记预览</h3>
              <textarea
                className="input h-32 w-full resize-y"
                placeholder="此处为生成的传记预览（可编辑）"
                value={polishedBiography}
                onChange={(e) => setPolishedBiography(sanitizeInput(e.target.value))}
                disabled={isSaving || isUploading}
                maxLength={20000}
              />
              <p className="text-sm text-gray-500">当前字数: {polishedBiography?.length || 0} / 20000</p>
            </div>
          )}
          <div className="flex gap-4 flex-wrap">
            {/* 批量润色与撤销：一个按钮负责首次和再次润色 */}
            <button type="button" className="btn btn-secondary ring-1 ring-blue-400" onClick={handlePreview} disabled={isPolishing || isSaving || isUploading}>查看此生</button>
            <button type="button" className="btn btn-secondary ring-1 ring-blue-400" onClick={handleSaveAndUpload} disabled={isSaving || isUploading}>{isUploading ? '上传中...' : '保存并上传'}</button>
            {/* 去掉"生成分享链接"按钮，分享统一在预览页完成 */}
            {/** 分享到广场（公开）入口移到 My.js，这里仅保留上传与本地保存 */}
            <button
              type="button"
              className="btn btn-secondary ring-1 ring-blue-400 w-full sm:w-auto"
              onClick={() => navigate(-1)}
              disabled={isSaving || isUploading}
              style={{ padding: '12px 20px', minWidth: '220px', textAlign: 'center' }}
            >
              返回
            </button>
          </div>


          {showPreview && (
            <div className="mt-6 border rounded p-4 bg-white border-gray-200 text-gray-900">
              <h3 className="text-xl font-semibold mb-3">预览（不可编辑）</h3>
              {(bioTitle || '我的一生') && <h2 className="text-2xl font-bold mb-2">{bioTitle || '我的一生'}</h2>}
              <div className="space-y-6">
                {sections.map((sec, idx) => (
                  <article key={idx} className="border-b pb-4" style={{ borderColor: '#2a2a30' }}>
                    {sec.title && <h4 className="text-lg font-semibold mb-2">{sec.title}</h4>}
                    {sec.text && <p className="whitespace-pre-wrap">{getPreviewText(sec.text)}</p>}
                    {Array.isArray(sec.media) && sec.media.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
                        {sec.media.map((m, mi) => (
                          <div key={mi} className="border rounded overflow-hidden">
                            {m.type === 'image' && <img src={m.url} alt={m.desc || ''} className="w-full h-32 object-cover" />}
                            {m.type === 'video' && <video src={m.url} className="w-full h-32 object-cover" controls />}
                            {m.type === 'audio' && <audio src={m.url} className="w-full" controls />}
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {/* 手机端专注模式覆盖层 */}
      {isFocusMode && (
        <div className="fixed inset-0 sm:hidden z-50 bg-white text-gray-900">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-blue-600 text-white shadow">
            <button className="btn btn-secondary" onClick={() => setIsFocusMode(false)} style={{ padding: '6px 10px', fontSize: '12px' }}>返回</button>
            <div className="text-base font-semibold truncate">{getSectionLabelByIndex(currentSectionIndex)}</div>
            <div className="flex items-center gap-2">
              <button className="btn btn-secondary" onClick={goToPrevSection} disabled={currentSectionIndex <= 0} style={{ padding: '6px 10px', fontSize: '12px' }}>上一篇</button>
              <button className="btn btn-secondary" onClick={goToNextSection} disabled={currentSectionIndex >= sections.length - 1} style={{ padding: '6px 10px', fontSize: '12px' }}>下一篇</button>
              {!( (sections[currentSectionIndex]?.text || '').toString().includes('陪伴师：') ) && (
                <button className="btn btn-primary" onClick={() => { startInterview(); if (!isSmallScreen()) setTimeout(scrollAnswerIntoView, 0); }} style={{ padding: '6px 10px', fontSize: '12px' }}>开始访谈</button>
              )}
              <button className="btn btn-secondary" onClick={() => setIsFocusEditing(v => !v)} style={{ padding: '6px 10px', fontSize: '12px' }}>{isFocusEditing ? '完成编辑' : '编辑本篇'}</button>
            </div>
          </div>
          <div className="px-3 pt-2 text-xs text-gray-100 bg-blue-600/95">在下方输入框回答，我会继续温柔引导您。</div>
          <div
            className="px-3 pt-3 pb-24 overflow-y-auto"
            ref={focusContentRef}
            style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', maxHeight: 'calc(100vh - 120px - 180px)' }}
          >
            {/* 正文预览（可滚动） */}
            {(sections[currentSectionIndex]?.title || '').trim() && (
              <h4 className="text-lg font-semibold mb-2">{sections[currentSectionIndex]?.title}</h4>
            )}
            {isFocusEditing ? (
              <textarea
                className="input w-full min-h-[40vh] max-h-[60vh] resize-y"
                value={sections[currentSectionIndex]?.text || ''}
                onChange={(e) => updateSectionText(currentSectionIndex, e.target.value)}
                placeholder="编辑本篇正文..."
              />
            ) : ((sections[currentSectionIndex]?.text || '').trim() ? (
              <p className="whitespace-pre-wrap text-gray-800">{(sections[currentSectionIndex]?.text || '')}</p>
            ) : (
              <p className="text-gray-500">还没有内容，先在下方回答问题开始创作吧。</p>
            ))}
            {Array.isArray(sections[currentSectionIndex]?.media) && sections[currentSectionIndex].media.length > 0 && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                {sections[currentSectionIndex].media.map((m, mi) => (
                  <div key={mi} className="border rounded overflow-hidden bg-white border-gray-200">
                    {m.type === 'image' && <img src={m.url} alt={m.desc || ''} className="w-full h-28 object-cover" />}
                    {m.type === 'video' && <video src={m.url} className="w-full h-28 object-cover" controls />}
                    {m.type === 'audio' && <audio src={m.url} className="w-full" controls />}
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* 底部固定输入条 */}
          <div className="fixed left-0 right-0 bottom-0 bg-white border-t border-gray-200 p-2 shadow-lg">
            <div>
              <button className="btn btn-tertiary w-full sm:hidden" onClick={handleSectionSpeech} disabled={isSaving || isUploading} style={{ padding: '10px 12px', fontSize: '14px' }}>语音输入</button>
            </div>
            <div className="mt-2 flex items-center justify-center gap-2">
              <textarea
                className="input resize-none w-[75vw] sm:flex-1"
                placeholder={t ? t('answerPlaceholder') : '请输入您的回答...'}
                value={answerInput}
                onChange={(e) => { const v = sanitizeInput(e.target.value); setAnswerInput(v); autoResizeAnswer(e.target); }}
                ref={answerInputRef}
                disabled={isSaving || isUploading}
                rows={1}
                style={{ height: '44px', overflowY: 'hidden', WebkitOverflowScrolling: 'touch' }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAnswer(); } }}
              />
              <button className="btn btn-primary flex-shrink-0" onClick={sendAnswer} disabled={isAsking || isSaving || isUploading} style={{ padding: '8px 12px', fontSize: '14px' }}>
                {isAsking ? '请稍候...' : (t ? t('send') : '发送')}
              </button>
            </div>
            <div className="mt-2 flex flex-col gap-2">
              <label className="btn btn-secondary w-full inline-flex items-center justify-center ring-1 ring-blue-400" style={{ padding: '10px 12px' }}>
                {t ? t('addMedia') : '添加图片/视频/音频'}
                <input
                  type="file"
                  accept="image/*,video/*,audio/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleUploadMediaToSection(currentSectionIndex, e.target.files[0])}
                  disabled={isSaving || isUploading}
                />
              </label>
              <button
                className="btn btn-primary w-full ring-1 ring-blue-400"
                disabled={polishingSectionIndex === currentSectionIndex || isSaving || isUploading || !((sections[currentSectionIndex]?.text)||'').trim()}
                onClick={async () => {
                  const section = sections[currentSectionIndex] || {};
                  if (!((section.text || '').trim())) return;
                  setPolishingSectionIndex(currentSectionIndex);
                  try {
                    const token = localStorage.getItem('token');
                    if (!token) { setMessage('请先登录'); setPolishingSectionIndex(null); return; }
                    const perspectiveHint = (authorMode === 'other')
                      ? `请使用第一人称"我"的叙述，从写作者视角回忆与"${authorRelation || profile?.relation || '这位亲人'}"的互动；尽量使用关系称谓（如"${authorRelation || profile?.relation || '这位亲人'}"）而非"他/她"；避免出现"在他的记忆里/深处"等表达，若需表达记忆请用"在我的记忆里/深处"。`
                      : '请使用第一人称"我"的表述方式。';
                    const system = `你是一位资深传记写作者。${perspectiveHint} 请根据"问答对话记录"整理出一段自然流畅、朴素真挚的传记正文；保留事实细节（姓名、地名、时间等），严格依据对话内容，不编造事实；不使用列表/编号/标题，不加入总结或点评，仅输出正文。并用“追踪视角（谁/何时/何地/因果/动作/对话/证据）”与“优势视角（能力/选择/韧性/体察）”，遇到时间冲突仅提示可能区间与核对建议。不要包含身份设定与基础资料引导类语句。`;
                    const qaSourceRaw = (sections[currentSectionIndex]?.text || '').toString();
                    const qaSource = filterPolishSource(qaSourceRaw);
                    const userPayload = `以下是我与情感陪伴师在阶段「${getStageLabelByIndex(currentSectionIndex)}」的对话记录（按时间顺序，经清理元话术）：\\n\\n${qaSource}\\n\\n请据此输出一段该阶段的传记正文（第一人称、连续自然，不要标题与编号）。`;
                    const messages = [
                      { role: 'system', content: system },
                      { role: 'user', content: userPayload },
                    ];
                    const resp = await retry(() => callSparkThrottled({ model: 'x1', messages, max_tokens: 1200, temperature: 0.5, user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') }, token, { silentThrottle: true }));
                    const polishedRaw = (resp.data?.choices?.[0]?.message?.content || '').toString().trim();
                    const polished = finalizeNarrative(polishedRaw);
                    if (polished) {
                      setSections(prev => prev.map((s, i) => i === currentSectionIndex ? { ...s, text: polished } : s));
                      const fb = stageFeedbacks[currentSectionIndex] || '恭喜您，又一个生命的故事被铭记。您的行动，让爱和记忆永不消逝。';
                      setMessage(fb);
                      setTimeout(() => setMessage(''), 1000);
                    }
                  } catch (e) {
                    console.error('Polish current section error (focus-bottom-grid):', e);
                    setMessage('当前阶段篇章润色失败：' + (e?.response?.data?.message || e?.message || '网络/鉴权错误'));
                  } finally {
                    setPolishingSectionIndex(null);
                  }
                }}
                style={{ padding: '10px 12px' }}
              >
                {polishingSectionIndex === currentSectionIndex ? '生成中...' : (t ? t('generateSection') : '生成本篇回忆')}
              </button>
              <button
                className="btn btn-secondary w-full ring-1 ring-blue-400"
                disabled={isSaving || isUploading || !((sections[currentSectionIndex]?.text)||'').trim()}
                onClick={async ()=>{
                  try {
                    const token = localStorage.getItem('token');
                    if (!token) { setMessage('请先登录'); return; }
                    const src = (sections[currentSectionIndex]?.text || '').toString();
                    const system = '你是一位文本编辑，请将以下内容从口语化整理为更清晰的书面表达。不得新增任何事实或细节；不得改变人称与时间；避免煽情与夸饰；仅输出整理后的正文。';
                    const messages = [ { role: 'system', content: system }, { role: 'user', content: src } ];
                    const resp = await retry(()=>callSparkThrottled({ model:'x1', messages, max_tokens: 900, temperature: 0.2, user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') }, token, { silentThrottle:true }));
                    const out = (resp.data?.choices?.[0]?.message?.content || '').toString().trim();
                    if (out) {
                      setSections(prev => prev.map((s, i) => i === currentSectionIndex ? { ...s, text: out } : s));
                      setCenterToast('已完成润色（不新增事实）');
                      setTimeout(()=>setCenterToast(''), 1000);
                    }
                  } catch(e) {
                    console.error('light polish error (focus)', e);
                    setMessage('润色失败，请稍后再试');
                  }
                }}
              >润色</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateBiography;