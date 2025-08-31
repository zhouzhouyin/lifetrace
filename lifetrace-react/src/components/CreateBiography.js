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
  // 首次"开始访谈"仅展示基础资料开场
  const [hasShownOpening, setHasShownOpening] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false); // 手机端专注模式
  const isSmallScreen = () => { try { return window.innerWidth < 640; } catch (_) { return false; } };
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

  // 风格偏好（语气/严格/具体/长度）
  const [prefTone, setPrefTone] = useState(() => {
    try { return localStorage.getItem('ai_pref_tone') || 'cool'; } catch (_) { return 'cool'; }
  }); // 'cool' | 'balanced' | 'warm'
  const [prefStrict, setPrefStrict] = useState(() => {
    try { return localStorage.getItem('ai_pref_strict') || 'strict'; } catch (_) { return 'strict'; }
  }); // 'strict' | 'balanced'
  const [prefConcrete, setPrefConcrete] = useState(() => {
    try { return localStorage.getItem('ai_pref_concrete') || 'high'; } catch (_) { return 'high'; }
  }); // 'high' | 'balanced' | 'low'
  const [prefLength, setPrefLength] = useState(() => {
    try { return localStorage.getItem('ai_pref_length') || 'short'; } catch (_) { return 'short'; }
  }); // 'short' | 'medium' | 'long'

  // 保存到本地 & 同步后端（最佳努力）
  useEffect(() => {
    try {
      localStorage.setItem('ai_pref_tone', prefTone);
      localStorage.setItem('ai_pref_strict', prefStrict);
      localStorage.setItem('ai_pref_concrete', prefConcrete);
      localStorage.setItem('ai_pref_length', prefLength);
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
        }, { headers: { Authorization: `Bearer ${token}` } });
      } catch (_) {}
    })();
  }, [prefTone, prefStrict, prefConcrete, prefLength]);

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
      } catch (_) {}
    })();
  }, []);

  // 构建风格约束（提问/生成）
  const buildStyleRules = (kind = 'ask') => {
    const toneText = prefTone === 'warm' ? '语气温暖但不煽情' : (prefTone === 'balanced' ? '语气自然克制' : '语气克制、平实');
    const strictText = prefStrict === 'strict' ? '绝不脑补，信息不足先追问' : '尽量不脑补，必要时仅做极轻微补全（不新增事实）';
    const concreteText = prefConcrete === 'high' ? '要求给出具体人/事/时/地/物与动作细节，避免抽象词' : (prefConcrete === 'balanced' ? '优先具体细节，必要时可概括' : '允许更概括的表达');
    const lenAsk = prefLength === 'long' ? '反馈≤50字，问题≤80字' : (prefLength === 'medium' ? '反馈≤40字，问题≤60字' : '反馈≤30字，问题≤40字');
    const lenGen = prefLength === 'long' ? '本段≤1200字' : (prefLength === 'medium' ? '本段≤800字' : '本段≤500字');
    if (kind === 'ask') return `${toneText}；${strictText}；${concreteText}；${lenAsk}`;
    return `${toneText}；${strictText}；${concreteText}；${lenGen}`;
  };

  const getGenMaxChars = () => {
    return prefLength === 'long' ? 1200 : (prefLength === 'medium' ? 800 : 500);
  };

  // 显示用阶段标签：统一为"xxx回忆"（未来愿望保持不变）
  const getStageLabelByIndex = (idx) => {
    const base = lifeStages[Math.max(0, Math.min(idx, lifeStages.length - 1))] || '';
    if (base === '未来愿望') return base;
    return `${base}回忆`;
  };

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
      setMessage('已从“每日回首”粘贴最新问答到对应篇章');
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
        const system = '你是一位专业的文本润色助手。仅润色用户提供的这一章内容，使其更流畅、自然、朴素而真挚；保持第一人称与事实细节（姓名、地名、时间等）；不新增编造的事实；不添加总结或标题；仅输出润色后的正文；输出不超过5000字。';
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
    // 去掉“下一个问题”等提示词
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
  // - 为他人模式时，将可能的“在他的/她的记忆…”改为“在我的记忆…”，
  // - 优先使用关系称谓替换含“他的/她的”的指代，
  // - 若全文缺少“我/我的”，补充一个“在我的记忆里，”作为开场以确保第一人称视角。
  const finalizeNarrative = (rawText) => {
    let s = (rawText || '').toString().trim();
    try {
      if (authorMode === 'other') {
        const rel = (authorRelation || profile?.relation || '这位亲人').toString();
        // 关系称谓优先，避免“他/她”的模糊指代（仅在所有格场景下替换）
        s = s.replace(/(?<![你您我])[他她]的/g, `${rel}的`);
        // 记忆/印象类常见短语统一改为“我的”
        s = s.replace(/在[他她]的记忆深处/g, '在我的记忆深处');
        s = s.replace(/在[他她]的记忆里/g, '在我的记忆里');
        s = s.replace(/在[他她]的记忆中/g, '在我的记忆中');
        s = s.replace(/在[他她]的印象里/g, '在我的印象里');
        s = s.replace(/在[他她]的印象中/g, '在我的印象中');
        // 诸如“他/她”“她/他”“他（她）”“她（他）” → 关系称谓
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

  // 若缺少问号，则让模型补充一个"仅一句问题"
  const appendQuestionIfMissing = async (baseText, phaseIndex, history, token) => {
    let result = (baseText || '').toString().trim();
    if (hasQuestionMark(result)) return result;
    try {
      const systemAsk = '请仅输出一个自然口语化的问题句子，不要任何编号、前缀或额外解释。仅一句中文问题。';
      const userAsk = `基于当前阶段"${lifeStages[phaseIndex]}"与上述对话，请继续提出一个紧接上下文的下一个问题（仅一句）。`;
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
      '我们聊聊童年里一件让您记忆最深的小事？',
      '少年时期，有没有一段让您会心一笑的经历？',
      '青年阶段，是否有一个改变您人生方向的决定或相遇？',
      '成年后的这些年，您最骄傲的一件事是什么？',
      '中年后，您对家人或自我有哪些新的理解？',
      '当下的您，最想感谢的人是谁？为什么？',
      '对于未来，您最想留下或实现的一件愿望是什么？',
    ];
    return map[idx] || '有没有一段让您心里柔软起来的回忆可以分享？';
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

  // 当前篇章文本变更后，自动滚动到末尾并将光标置于末尾，便于查看最新内容
  useEffect(() => {
    const el = sectionTextareaRef.current;
    if (!el) return;
    try {
      // 需要等待 DOM 更新完成
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
  }, [currentSectionIndex, sections]);

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
    const subjectProfile = `被记录者资料：姓名${p.name||'（未填）'}，性别${p.gender||'（未填）'}，出生${p.birth||'（未填）'}，祖籍${p.origin||'（未填）'}，现居${p.residence||'（未填）'}${authorMode==='other'?`，与写作者关系${authorRelation||p.relation||'（未填）'}`:''}。`;
    const factRules = '严格事实：仅依据用户资料与已出现的问答事实，信息不足请先追问，禁止脑补与抽象词；反馈≤30字，问题≤40字；不要使用列表或编号。';
    try {
      const perspectiveKick = (authorMode === 'other')
        ? `请使用第二人称“你”，但采用“关系视角”提问：围绕你与“${authorRelation || '这位亲人'}”的互动、对你的影响与具体细节；避免第三人称与抽象化表达。`
        : '请使用第二人称“您/你”。';
      const toneKick = (authorMode === 'other')
        ? '你现在是"引导者/助手"，帮助记录者一起梳理对方的人生经历，强调"整理与梳理"。'
        : '你现在是"情感陪伴师"，与当事人交流，语气自然温和。';
      const systemPrompt = `你是一位温暖、耐心且得体的引导者。${toneKick} ${writerProfile} ${subjectProfile} 当前阶段：${lifeStages[targetIndex]}。${perspectiveKick} ${factRules} ${buildStyleRules('ask')} 回复需口语化；先简短共情，再给出一个自然的后续问题；不要出现“下一个问题”字样。仅输出中文。`;
      const kickoffUser = (authorMode === 'other')
        ? `请以关系视角面向写作者发问：聚焦“你与${authorRelation || '这位亲人'}”的互动细节与影响，例如“在你的记忆里，${authorRelation || '这位亲人'}……”开头，给出一个本阶段的第一个暖心问题（仅一句）。`
        : `请面向“您”提出本阶段的第一个暖心问题（仅一句）。`;
      const history = chatMessages.slice(-5);
      const messages = [ { role: 'system', content: systemPrompt }, ...history, { role: 'user', content: kickoffUser } ];
      const resp = await retry(() => callSparkThrottled({ model: 'x1', messages, max_tokens: 280, temperature: 0.3, user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') }, token, { silentThrottle: true }));
      const raw = resp.data?.choices?.[0]?.message?.content;
      const ai = normalizeAssistant(raw) || (
        authorMode === 'other'
          ? `让我们开始"${lifeStages[targetIndex]}"。请${authorRelation || '他/她'}回忆一件最难忘的小事。`
          : `我们来聊聊"${lifeStages[targetIndex]}"。可以先从一件让您记忆深刻的小事说起吗？`
      );
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
          ? `请使用第二人称“你”，但采用“关系视角”提问：围绕你与“${authorRelation || '这位亲人'}”的互动、对你的影响与具体细节；，避免过度煽情，要给写作者温暖的回忆，避免第三人称与抽象化表达。`
          : '请使用第二人称“您/你”。';
        const toneKick2 = (authorMode === 'other')
          ? '你现在是"引导者/助手"，帮助记录者一起梳理对方的人生经历，强调"整理与梳理"。'
          : '你现在是"情感陪伴师"，与当事人交流，语气自然温和。';
        // 重试块内单独构建资料字符串，避免作用域歧义
        const p2 = profile || {};
        const writerName2 = (localStorage.getItem('username') || username || '').toString();
        const writerGender2 = (localStorage.getItem('writer_gender') || localStorage.getItem('user_gender') || '（未填）').toString();
        const writerProfile2 = `写作者资料：姓名${writerName2 || '（未填）'}，性别${writerGender2 || '（未填）'}。`;
        const subjectProfile2 = `被记录者资料：姓名${p2.name||'（未填）'}，性别${p2.gender||'（未填）'}，出生${p2.birth||'（未填）'}，祖籍${p2.origin||'（未填）'}，现居${p2.residence||'（未填）'}${authorMode==='other'?`，与写作者关系${authorRelation||p2.relation||'（未填）'}`:''}。`;
        const factRules2 = '严格事实：仅依据用户资料与已出现的问答事实，信息不足请先追问，禁止脑补与抽象词；反馈≤30字，问题≤40字；不要使用列表或编号。';
        const systemPrompt = `你是一位温暖、耐心且得体的引导者。${toneKick2} ${writerProfile2} ${subjectProfile2} 当前阶段：${lifeStages[targetIndex]}。${perspectiveKick2} ${factRules2} ${buildStyleRules('ask')} 回复需口语化；先简短共情，再给出一个自然的后续问题；不要出现“下一个问题”字样。仅输出中文。`;
        const kickoffUser = (authorMode === 'other')
          ? `请以关系视角面向写作者发问：聚焦“你与${authorRelation || '这位亲人'}”的互动细节与影响，给出这个阶段的第一个暖心问题（仅一句）。`
          : `请面向“您”提出本阶段的第一个暖心问题（仅一句）。`;
        const messages = [ { role: 'system', content: systemPrompt }, { role: 'user', content: kickoffUser } ];
        setMessage('阶段提问失败，正以短上下文自动重试…');
        const resp2 = await callSparkThrottled({ model: 'x1', messages, max_tokens: 280, temperature: 0.3, user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') }, token, { silentThrottle: true });
        const raw2 = resp2.data?.choices?.[0]?.message?.content;
        const ai2 = normalizeAssistant(raw2) || (
          authorMode === 'other'
            ? `让我们开始"${lifeStages[targetIndex]}"。请${authorRelation || '他/她'}回忆一件最难忘的小事。`
            : `我们来聊聊"${lifeStages[targetIndex]}"。可以先从一件让您记忆深刻的小事说起吗？`
        );
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
      // 身份与关系已在首页设定，不再重复
      // 已具备身份与（如需）关系信息：直接进入阶段开场，不再询问基础资料
      setHasShownOpening(true);
      askStageKickoff(idx, true);
      return;
    }
    // 非首次：若该阶段尚未开始则生成开场；否则若用户尚未回答，给出提示
    const sectionText = (sections[idx]?.text || '').toString();
    const hasAssistant = sectionText.includes('陪伴师：');
    if (!hasAssistant) {
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

    const perspective = (authorMode === 'other') ? `请使用第二人称“你”，并采用“关系视角”与写作者对话：围绕写作者与“${authorRelation || profile?.relation || '这位亲人'}”的互动细节与影响来提问；明确写作者与被记录者身份，不要过度煽情，不要使用第三人称。` : '请使用第二人称“您/你”，避免第三人称。';
    const tone = (authorMode === 'other') ? '你现在是“引导者/助手”，与记录者一起梳理被记录者的人生经历，强调“整理与梳理”，避免空泛与闲聊。' : '你现在是“情感陪伴师”，与当事人交流，语气自然温和。';
    const p = profile || {};
    const writerName = (localStorage.getItem('username') || username || '').toString();
    const writerGender = (localStorage.getItem('writer_gender') || localStorage.getItem('user_gender') || '（未填）').toString();
    const writerProfile = `写作者资料：姓名${writerName || '（未填）'}，性别${writerGender || '（未填）'}。`;
    const subjectProfile = `被记录者资料：姓名${p.name||'（未填）'}，性别${p.gender||'（未填）'}，出生${p.birth||'（未填）'}，祖籍${p.origin||'（未填）'}，现居${p.residence||'（未填）'}${authorMode==='other'?`，与写作者关系${authorRelation||p.relation||'（未填）'}`:''}。`;
    const factRules = '严格事实：仅依据用户资料与已出现的问答事实，信息不足请先追问，禁止脑补与抽象词；反馈≤30字，问题≤40字；不要使用列表或编号。';
    const systemPrompt = `你是一位温暖、耐心且得体的引导者。${tone} ${writerProfile} ${subjectProfile} 当前阶段：${lifeStages[stageIndex]}。${perspective} ${factRules} 请用自然口语化的方式回复；先进行真诚简短的反馈，再给出一个自然的后续问题，不要添加“下一个问题”字样。仅输出中文。`;
    const MAX_TURNS = 12;
    const history = chatMessages.slice(-5);
    const messagesToSend = [ { role: 'system', content: systemPrompt }, ...history, { role: 'user', content: trimmed } ];
    setChatMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    // 将用户答案写入当前阶段篇章
    appendLineToSection(currentSectionIndex, `我：${trimmed}`);
    setAnswerInput('');
    if (answerInputRef.current) answerInputRef.current.value = '';
    setIsAsking(true);
    try {
      const resp = await retry(() => callSparkThrottled({
        model: 'x1', messages: messagesToSend, max_tokens: 520, temperature: 0.3,
        user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon')
      }, token, { silentThrottle: true }));
      const raw = resp.data?.choices?.[0]?.message?.content;
      let aiBase = normalizeAssistant(raw) || '谢谢您的分享。';
      const historyForAsk = chatMessages.slice(-5);
      const ai = finalizeAssistant(await appendQuestionIfMissing(aiBase, stageIndex, historyForAsk, token));
      setChatMessages(prev => [...prev, { role: 'assistant', content: ai }]);
      // 将陪伴师问题写入当前阶段篇章（只保留反馈+问题的一行）
      appendLineToSection(currentSectionIndex, `陪伴师：${ai}`);
      if (autoSpeakAssistant) speakText(ai);
      // 统计轮数并自动推进
      setStageTurns(prev => {
        const copy = [...prev];
        copy[stageIndex] = (copy[stageIndex] || 0) + 1;
        if (copy[stageIndex] >= MAX_QUESTIONS_PER_STAGE) {
          if (stageIndex < lifeStages.length - 1) {
            setTimeout(() => askStageKickoff(stageIndex + 1, false), 200);
          } else {
            // 最后一阶段完成，温暖结束
            const closing = '非常感谢您的真诚分享。我们的访谈到这里告一段落了。您可以点击"生成传记并预览"查看整理结果，或选择上方任一阶段按钮重新开始该阶段的对话。祝您生活温暖而明亮。';
            setChatMessages(prevMsgs => [...prevMsgs, { role: 'assistant', content: closing }]);
            setIsInterviewing(false);
          }
        }
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
          const ai2 = finalizeAssistant(await appendQuestionIfMissing(ai2Base, stageIndex, chatMessages.slice(-5), token));
          setChatMessages(prev => [...prev, { role: 'assistant', content: ai2 }]);
          appendLineToSection(currentSectionIndex, `陪伴师：${ai2}`);
          if (autoSpeakAssistant) speakText(ai2);
          setStageTurns(prev => {
            const copy = [...prev];
            copy[stageIndex] = (copy[stageIndex] || 0) + 1;
            if (copy[stageIndex] >= MAX_QUESTIONS_PER_STAGE) {
              if (stageIndex < lifeStages.length - 1) {
                setTimeout(() => askStageKickoff(stageIndex + 1, false), 200);
              } else {
                const closing = '非常感谢您的真诚分享。我们的访谈到这里告一段落了。您可以点击"生成传记并预览"查看整理结果，或选择上方任一阶段按钮重新开始该阶段的对话。祝您生活温暖而明亮。';
                setChatMessages(prevMsgs => [...prevMsgs, { role: 'assistant', content: closing }]);
                setIsInterviewing(false);
              }
            }
            return copy;
          });
          return;
        } catch (_) { /* 继续兜底 */ }
      }
      console.error('Interview ask error:', err);
      const fallbackByStage = {
        0: '我们聊聊童年里一件让您记忆最深的小事吧？当时发生了什么？',
        1: '少年时期，您最喜欢的人或事是什么？有没有一段让您会心一笑的经历？',
        2: '青年阶段，是否有一个改变您人生方向的决定或相遇？',
        3: '成年的这些年，您做过最让自己骄傲的一件事是什么？',
        4: '中年后，您对家人、事业或自我有过哪些新的理解？',
        5: '现在的您，最想感谢的人是谁？原因是什么？',
        6: '对于未来，您最想留下或实现的一件愿望是什么？'
      };
      const ai = finalizeAssistant(fallbackByStage[stageIndex] || '我们换个角度聊聊：有没有一段让您心里柔软起来的回忆？');
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
  const updateSectionText = (index, value) => setSections(prev => prev.map((s, i) => i === index ? { ...s, text: sanitizeInput(value) } : s));
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

  // 生成传记（AI润色）：逐章润色文本并生成预览
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
        setMessage(`正在润色：第 ${i + 1}/${sections.length} 篇章…`);
        const system = '你是一位专业的文本润色助手。仅润色用户提供的这一章内容，使其更流畅、自然、朴素而真挚；保持第一人称与事实细节（姓名、地名、时间等）；不新增编造的事实；不添加总结或标题；仅输出润色后的正文；输出不超过5000字。';
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
        } catch (errOne) {
          console.error('Section polish failed:', errOne);
          // 忽略该章错误，继续下一章
        }
      }
      setShowPreview(true);
      setMessage('逐章润色完成，已生成下方预览（图文并茂，不可编辑）');
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

  // 基于问答生成各个篇章（按阶段/顺序拆分），不动媒体
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

      // 让模型基于问答对，生成"分章文本数组"，与现有章节数对齐；若生成数量不同，则就近截断/补空
      const system = '你是一位资深传记写作者。现在请把给定的问答对拆分整理为若干"章节正文"，每个章节是一段自然的第一人称叙述，不要列表/编号/标题，不编造事实，保留细节，风格朴素真挚。只输出JSON数组，每个元素是字符串，对应各章节正文。不要任何其它文字。';
      const userMsg = `问答对如下：\n${qaPairs.map((p,i)=>`Q${i+1}：${p.q}\nA${i+1}：${p.a}`).join('\n')}\n\n请输出JSON数组（每个元素是一章的正文）。`;
      const resp = await retry(() => callSparkThrottled({
        model: 'x1',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMsg },
        ],
        max_tokens: 1800,
        temperature: 0.4,
        user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon')
      }, token, { silentThrottle: true }));
      const raw = (resp.data?.choices?.[0]?.message?.content || '').toString().trim();
      let arr = [];
      // 容错解析：截取首尾中括号尝试解析
      const tryParseArray = (text) => {
        try { return JSON.parse(text); } catch (_) {}
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');
        if (start !== -1 && end !== -1 && end > start) {
          const sub = text.slice(start, end + 1);
          try { return JSON.parse(sub); } catch (_) {}
        }
        return null;
      };
      const parsed = tryParseArray(raw);
      if (Array.isArray(parsed)) arr = parsed; 
      if (!Array.isArray(arr) || arr.length === 0) {
        setMessage('生成篇章失败，请重试');
        setIsGeneratingChapters(false);
        return;
      }

      // 仅为"空白篇章"写入内容，不覆盖已有正文；若问答生成的数组比现有篇章更多，则将多出的内容忽略（不在此新增篇章）
      setSections(prev => prev.map((s, i) => {
        const isEmpty = !((s.text || '').toString().trim().length > 0);
        if (isEmpty && i < arr.length) {
          return { ...s, text: (arr[i] || '').toString().trim(), media: mediaSnapshots[i] || s.media || [] };
        }
        return s;
      }));
      setMessage('已根据问答填充空白篇章（未覆盖已有内容）');
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
  const handleUpload = async () => {
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
    // 1) 本地保存（静默，不把本地草稿加入云端列表）
    try {
      const localBiographies = JSON.parse(localStorage.getItem('localBiographies') || '[]');
      localBiographies.push({
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title: bioTitle || `我的一生 ${new Date().toLocaleString('zh-CN')}`,
        content: bioText,
        summary: bioSummary,
        sections,
        isPublic: false,
        cloudStatus: 'Not Uploaded',
        type: 'Biography',
        timestamp: new Date().toISOString(),
        likes: 0,
        username: localStorage.getItem('username') || 'unknown',
      });
      localStorage.setItem('localBiographies', JSON.stringify(localBiographies));
    } catch (_) { /* ignore local save error */ }

    // 2) 上传云端
    await handleUpload();
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

  return (
    <div className="min-h-screen py-4 sm:py-6">
      <div className="card max-w-4xl mx-auto w-full p-4 sm:p-6">
        <Helmet>
          <title>{(bioTitle || '我的一生') + ' - 永念'}</title>
        </Helmet>
        {/* 记录对象基本信息表单（首页已填写，此处隐藏） */}
        <div className="mb-4 border rounded p-3 sm:p-4 bg-white border-gray-200 text-gray-900 hidden">
          <h3 className="text-lg font-semibold mb-2">记录对象信息</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className="input" placeholder="姓名" value={profile.name||''} onChange={e=>{ const v=sanitizeInput(e.target.value); setProfile(p=>{ const n={...(p||{}), name:v}; try{localStorage.setItem('record_profile', JSON.stringify(n));}catch(_){ } return n; }); }} />
            <input className="input" placeholder="性别" value={profile.gender||''} onChange={e=>{ const v=sanitizeInput(e.target.value); setProfile(p=>{ const n={...(p||{}), gender:v}; try{localStorage.setItem('record_profile', JSON.stringify(n));}catch(_){ } return n; }); }} />
            <input className="input" placeholder="出生年月（如 1950-06）" value={profile.birth||''} onChange={e=>{ const v=sanitizeInput(e.target.value); setProfile(p=>{ const n={...(p||{}), birth:v}; try{localStorage.setItem('record_profile', JSON.stringify(n));}catch(_){ } return n; }); }} />
            <input className="input" placeholder="祖籍" value={profile.origin||''} onChange={e=>{ const v=sanitizeInput(e.target.value); setProfile(p=>{ const n={...(p||{}), origin:v}; try{localStorage.setItem('record_profile', JSON.stringify(n));}catch(_){ } return n; }); }} />
            <input className="input" placeholder="现居住地" value={profile.residence||''} onChange={e=>{ const v=sanitizeInput(e.target.value); setProfile(p=>{ const n={...(p||{}), residence:v}; try{localStorage.setItem('record_profile', JSON.stringify(n));}catch(_){ } return n; }); }} />
            {authorMode==='other' && (
              <input className="input" placeholder="与被记录人的关系（如 母亲）" value={authorRelation||profile.relation||''} onChange={e=>{ const v=sanitizeInput(e.target.value); setAuthorRelation(v); setProfile(p=>{ const n={...(p||{}), relation:v}; try{localStorage.setItem('record_profile', JSON.stringify(n)); localStorage.setItem('author_relation', v);}catch(_){ } return n; }); }} />
            )}
          </div>
        </div>
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
        {/* 隐私条款弹窗已移除 */}
        <div className="flex flex-col gap-6">
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
                  <input
                    type="text"
                    className="input w-full mb-2"
                    placeholder={t ? t('chapterTitlePlaceholder') : '篇章标题（可选）'}
                    value={sections[currentSectionIndex]?.title || ''}
                    onChange={(e) => updateSectionTitle(currentSectionIndex, e.target.value)}
                    maxLength={200}
                    disabled={isSaving || isUploading}
                  />
            <textarea
                    className="input w-full resize-y h-[40vh] sm:h-60"
                    placeholder={t ? t('chapterTextPlaceholder') : '在此输入该篇章的正文内容。回答完某个问题后，直接把内容写在这里；接着点击下方按钮可以给此篇章插入图片或视频。'}
                    value={sections[currentSectionIndex]?.text || ''}
                    onChange={(e) => updateSectionText(currentSectionIndex, e.target.value)}
                    maxLength={5000}
              disabled={isSaving || isUploading}
                    ref={sectionTextareaRef}
                  />
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
                        setPolishingSectionIndex(currentSectionIndex);
                        try {
                          const token = localStorage.getItem('token');
                          if (!token) { setMessage('请先登录'); setPolishingSectionIndex(null); return; }
                          const perspectiveHint = (authorMode === 'other')
                            ? `请使用第一人称“我”的叙述，从写作者视角回忆与“${authorRelation || profile?.relation || '这位亲人'}”的互动；尽量使用关系称谓（如“${authorRelation || profile?.relation || '这位亲人'}”）而非“他/她”；避免出现“在他的记忆里/深处”等表达，若需表达记忆请用“在我的记忆里/深处”。`
                            : '请使用第一人称“我”的表述方式。';
                          const system = `你是一位资深传记写作者。${perspectiveHint} 请根据"问答对话记录"整理出一段自然流畅、朴素真挚的传记正文；保留事实细节（姓名、地名、时间等），严格依据对话内容，不编造事实；不使用列表/编号/标题，不加入总结或点评，仅输出正文。不要包含身份设定与基础资料引导类语句。${buildStyleRules('gen')}`;
                          const qaSourceRaw = (sections[currentSectionIndex]?.text || '').toString();
                          const qaSource = filterPolishSource(qaSourceRaw);
                          const userPayload = `以下是我与情感陪伴师在阶段「${getStageLabelByIndex(currentSectionIndex)}」的对话记录（按时间顺序，经清理元话术）：\n\n${qaSource}\n\n请据此输出一段该阶段的传记正文（第一人称、连续自然，不要标题与编号）。`;
                          const messages = [
                            { role: 'system', content: system },
                            { role: 'user', content: userPayload },
                          ];
                          const resp = await retry(() => callSparkThrottled({ model: 'x1', messages, max_tokens: 1200, temperature: 0.5, user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') }, token, { silentThrottle: true }));
                          let polishedRaw = (resp.data?.choices?.[0]?.message?.content || '').toString().trim();
                          const maxChars = getGenMaxChars();
                          if (polishedRaw.length > maxChars) polishedRaw = polishedRaw.slice(0, maxChars);
                          const polished = finalizeNarrative(polishedRaw);
                          if (polished) {
                            setSections(prev => prev.map((s, i) => i === currentSectionIndex ? { ...s, text: polished } : s));
                            const fb = stageFeedbacks[currentSectionIndex] || '恭喜您，又一个生命的故事被铭记。您的行动，让爱和记忆永不消逝。';
                            setMessage(fb);
                            setTimeout(() => setMessage(''), 1000);
                          }
                        } catch (e) {
                          console.error('Polish current section error:', e);
                          setMessage('当前阶段篇章润色失败：' + (e?.response?.data?.message || e?.message || '网络/鉴权错误'));
                        } finally {
                          setPolishingSectionIndex(null);
                        }
                      }}
                    >
                      {polishingSectionIndex === currentSectionIndex ? '生成中...' : (t ? t('generateSection') : '生成本篇回忆')}
                    </button>
                  </div>
                  <p className="text-sm text-gray-500">当前字数: {sections[currentSectionIndex]?.text?.length || 0} / 5000</p>
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
                      ? `请使用第一人称“我”的叙述，从写作者视角回忆与“${authorRelation || profile?.relation || '这位亲人'}”的互动；尽量使用关系称谓（如“${authorRelation || profile?.relation || '这位亲人'}”）而非“他/她”；避免出现“在他的记忆里/深处”等表达，若需表达记忆请用“在我的记忆里/深处”。`
                      : '请使用第一人称“我”的表述方式。';
                    const system = `你是一位资深传记写作者。${perspectiveHint} 请根据"问答对话记录"整理出一段自然流畅、朴素真挚的传记正文；保留事实细节（姓名、地名、时间等），严格依据对话内容，不编造事实；不使用列表/编号/标题，不加入总结或点评，仅输出正文。不要包含身份设定与基础资料引导类语句。`;
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateBiography;