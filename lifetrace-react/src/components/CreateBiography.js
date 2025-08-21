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
  // 情感陪伴师访谈
  const [chatMessages, setChatMessages] = useState([]); // {role:'assistant'|'user', content:string}[]
  const [answerInput, setAnswerInput] = useState('');
  const [isInterviewing, setIsInterviewing] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const lifeStages = ['童年', '少年', '青年', '成年', '中年', '当下', '未来愿望'];
  const [stageIndex, setStageIndex] = useState(0);
  const [autoSpeakAssistant, setAutoSpeakAssistant] = useState(false);
  const [stageTurns, setStageTurns] = useState(Array(7).fill(0));
  const MAX_QUESTIONS_PER_STAGE = 8;
  const [shortContext, setShortContext] = useState(true); // 默认开启：仅带最近 3 轮
  const chatContainerRef = useRef(null);
  const sectionTextareaRef = useRef(null);
  const answerInputRef = useRef(null);
  // 首次“开始访谈”仅展示基础资料开场
  const [hasShownOpening, setHasShownOpening] = useState(false);
  
  // 显示用阶段标签：统一为“xxx回忆”（未来愿望保持不变）
  const getStageLabelByIndex = (idx) => {
    const base = lifeStages[Math.max(0, Math.min(idx, lifeStages.length - 1))] || '';
    if (base === '未来愿望') return base;
    return `${base}回忆`;
  };

  // 篇章区域展示用标签：显示为“X篇”（不影响情感访谈师区域）
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
            setSections(d.sections.map((s = {}) => ({
              title: (s && s.title) || '',
              text: (s && s.text) || '',
              media: Array.isArray(s && s.media) ? s.media : [],
            })));
          }
        }
      }
    } catch (_) {}
    draftRestoreRef.current = true;
  }, []);
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

  // 预览用：移除尚未被回答的“陪伴师：”问题（仅影响预览，不改原文）
  const getPreviewText = (rawText) => {
    const lines = (rawText || '').toString().split(/\r?\n/);
    const cleaned = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^陪伴师：/.test(line.trim())) {
        // 向后查找在下一个“陪伴师：”或文本结尾前，是否存在“我：”行
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

  // 访谈：阶段开场
  const askStageKickoff = async (targetIndex, resetTurns = false) => {
    const token = localStorage.getItem('token');
    if (!token) {
      setMessage('请先登录');
      setTimeout(() => navigate('/login'), 1000);
      return;
    }
    setIsAsking(true);
    setMessage('正在生成本阶段问题…');
    try {
      const systemPrompt = '你是一位温暖、耐心、幽默而得体的情感陪伴师。目标：引发生命共鸣，帮助用户记录其一生中值得纪念的人与事，从童年至今，再到对未来的期盼。请用自然口语化的方式回复，不要使用任何编号、序号或列表符号。先人性化反馈，再给出一个自然的后续问题，不要添加"下一个问题"字样。仅输出中文。';
      const kickoffUser = `请围绕阶段“${lifeStages[targetIndex]}”提出第一个暖心问题，先用一句简短话语表达共情与欢迎，然后给出问题。`;
      const history = chatMessages.slice(-5);
      const messages = [ { role: 'system', content: systemPrompt }, ...history, { role: 'user', content: kickoffUser } ];
      const resp = await retry(() => callSparkThrottled({ model: 'x1', messages, max_tokens: 300, temperature: 0.5, user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') }, token, { silentThrottle: true }));
      const raw = resp.data?.choices?.[0]?.message?.content;
      const ai = normalizeAssistant(raw) || `我们来聊聊“${lifeStages[targetIndex]}”。可以先从一件让您记忆深刻的小事说起吗？`;
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
        const systemPrompt = '你是一位温暖、耐心、幽默而得体的情感陪伴师。目标：引发生命共鸣，帮助用户记录其一生中值得纪念的人与事，从童年至今，再到对未来的期盼。请用自然口语化的方式回复，不要使用任何编号、序号或列表符号。先简短反馈，再给出一个自然的后续问题，不要添加"下一个问题"字样。仅输出中文。';
        const kickoffUser = `请围绕阶段“${lifeStages[targetIndex]}”提出第一个暖心问题，先用一句简短话语表达共情与欢迎，然后给出问题。`;
        const messages = [ { role: 'system', content: systemPrompt }, { role: 'user', content: kickoffUser } ];
        setMessage('阶段提问失败，正以短上下文自动重试…');
        const resp2 = await callSparkThrottled({ model: 'x1', messages, max_tokens: 300, temperature: 0.5, user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') }, token, { silentThrottle: true });
        const raw2 = resp2.data?.choices?.[0]?.message?.content;
        const ai2 = normalizeAssistant(raw2) || `我们来聊聊“${lifeStages[targetIndex]}”。可以先从一件让您记忆深刻的小事说起吗？`;
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
      // 清理“正在生成”提示
      setMessage('');
    }
  };

  const startInterview = () => {
    const idx = Math.min(currentSectionIndex, lifeStages.length - 1);
    // 确保进入访谈状态并同步当前阶段
    if (!isInterviewing) {
    setIsInterviewing(true);
    setStageTurns(Array(lifeStages.length).fill(0));
    }
    setStageIndex(idx);
    setCurrentSectionIndex(idx);
    // 首次仅给基础资料开场，等待用户先回答
    if (!hasShownOpening) {
      const opening = '我们先从一些基础资料聊起吧：您怎么称呼？性别是什么？今年多大了？祖籍在哪里？如果方便，也请简单介绍一下您的家庭情况和教育经历。';
      setChatMessages(prev => [...prev, { role: 'assistant', content: opening }]);
      try { appendLineToSection(idx, `陪伴师：${opening}`); } catch (_) {}
      if (autoSpeakAssistant) speakText(opening);
      setHasShownOpening(true);
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
    // 仅以“我：...”格式写入当前阶段篇章，避免重复
    // 同步素材文本可选，如不再使用素材区可注释
    // setMaterialsText(prev => (prev ? prev + '\n' + trimmed : trimmed));

    const systemPrompt = `你是一位温暖、耐心、幽默而得体的情感陪伴师。目标：引发生命共鸣，帮助用户记录其一生中值得记述的人与事，从童年至今，直到对未来的期盼。当前阶段：${lifeStages[stageIndex]}。请用自然口语化的方式回复，不要使用任何编号、序号或列表符号。先进行真诚简短的反馈，再给出一个自然的后续问题，不要添加“下一个问题”字样。仅输出中文。`;
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
        model: 'x1', messages: messagesToSend, max_tokens: 600, temperature: 0.5,
        user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon')
      }, token, { silentThrottle: true }));
      const raw = resp.data?.choices?.[0]?.message?.content;
      let aiBase = normalizeAssistant(raw) || '谢谢您的分享。';
      const historyForAsk = chatMessages.slice(-5);
      const ai = await appendQuestionIfMissing(aiBase, stageIndex, historyForAsk, token);
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
          const resp2 = await callSparkThrottled({ model: 'x1', messages: messagesShort, max_tokens: 600, temperature: 0.5,
            user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') }, token, { silentThrottle: true });
          const raw2 = resp2.data?.choices?.[0]?.message?.content;
          let ai2Base = normalizeAssistant(raw2) || '谢谢您的分享。';
          const ai2 = await appendQuestionIfMissing(ai2Base, stageIndex, chatMessages.slice(-5), token);
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
      const ai = (fallbackByStage[stageIndex] || '我们换个角度聊聊：有没有一段让您心里柔软起来的回忆？');
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
    recognition.lang = 'zh-CN';
    recognition.onresult = (event) => {
      const text = sanitizeInput(event.results[0][0].transcript);
      setAnswerInput(prev => (prev ? prev + ' ' + text : text));
    };
    recognition.onerror = () => setMessage('语音识别失败，请检查麦克风或重试');
    recognition.start();
  };

  // 语音输入：把识别内容写入“回答输入框”而非篇章正文
  const handleSectionSpeech = () => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      setMessage('当前浏览器不支持语音输入，请使用 Chrome 或 Edge 最新版');
      return;
    }
    const recognition = new SpeechRec();
    recognition.lang = 'zh-CN';
    recognition.onresult = (event) => {
      const text = sanitizeInput(event.results[0][0].transcript);
      setAnswerInput(prev => (prev ? prev + ' ' + text : text));
      if (answerInputRef.current) {
        const merged = (answerInputRef.current.value || '');
        answerInputRef.current.value = (merged ? merged + ' ' : '') + text;
      }
    };
    recognition.onerror = () => setMessage('语音识别失败，请检查麦克风或重试');
    recognition.start();
  };

  // 分段编辑：文本与媒体（固定阶段篇章，不允许新增/删除）
  const addSection = () => {};
  const removeSection = () => {};
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
    // 若已在访谈流程里，并且该阶段从未出现过陪伴师的开场语，则轻提示引导点击“开始访谈”或直接输入
    if (isInterviewing) {
      const sectionText = (sections[targetStage]?.text || '').toString();
      if (!sectionText.includes('陪伴师：')) {
        setMessage('提示：此阶段尚未开始，点击“开始访谈”或直接输入您的想法');
        setTimeout(() => setMessage(''), 1500);
      }
    }
  };
  const goToPrevSection = () => {
    if (currentSectionIndex <= 0) return;
    goToSectionByIndex(currentSectionIndex - 1);
  };
  const goToNextSection = () => {
    const nextIndex = currentSectionIndex + 1;
    if (nextIndex >= sections.length) return; // 翻页式：不自动新增篇章
    goToSectionByIndex(nextIndex);
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

  return (
    <div className="min-h-screen bg-gray-100 py-4 sm:py-6">
      <div className="card max-w-4xl mx-auto w-full p-4 sm:p-6">
        <Helmet>
          <title>{(bioTitle || '我的一生') + ' - 永念'}</title>
        </Helmet>
        <div className="mb-4">
          <input
            type="text"
            className="input text-center text-2xl sm:text-3xl font-bold"
            placeholder={t ? t('titlePlaceholder') : '请输入传记主标题（例如：我的一生）'}
            value={bioTitle}
            onChange={(e) => setBioTitle(sanitizeInput(e.target.value))}
            maxLength={200}
          />
        </div>
        {message && (
          <div className={`mb-4 p-2 text-center text-white rounded ${message.includes('失败') || message.includes('违规') || message.includes('错误') ? 'bg-red-500' : 'bg-green-500'}`}>
            {message}
          </div>
        )}
        <div className="flex flex-col gap-6">
          
          {/* 情感陪伴师访谈（一体化：隐藏单独区域，所有问答只在篇章正文中体现） */}
          <div className="hidden" aria-hidden>
            {/* 保留逻辑挂载，但不展示列表/输入，避免与篇章区域重复显示 */}
          </div>
          {/* 新的篇章（可为每篇章添加标题/正文/媒体） */}
          <div>
            {/* 顶部标题与导航移除，导航按钮移动到输入框下方 */}
            <div className="space-y-4">
              {sections[currentSectionIndex] && (
                <div className={`border rounded p-3 sm:p-4 ring-2 ring-blue-400`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="font-medium">{getSectionLabelByIndex(currentSectionIndex)}</div>
                    <div className="flex gap-2">
                      <button type="button" className="btn px-3 py-1 text-sm sm:text-base" onClick={goToPrevSection} disabled={isSaving || isUploading || currentSectionIndex <= 0}>{t ? t('prev') : '上一篇'}</button>
                      <button type="button" className="btn px-3 py-1 text-sm sm:text-base" onClick={goToNextSection} disabled={isSaving || isUploading || currentSectionIndex >= sections.length - 1}>{t ? t('next') : '下一篇'}</button>
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
                  {/* 一体化聊天控制：仅在篇章里进行问答 */}
                  <div className="mt-2 flex gap-2 flex-col sm:flex-row flex-wrap">
                    <button className="btn w-full sm:w-auto" onClick={startInterview}>{t ? t('startInterview') : '开始访谈'}</button>
                    {/* 移动端：单独一行放置语音输入，避免挤占输入框空间 */}
                    {speechSupported ? (
                      <button className="btn w-full sm:hidden" onClick={handleSectionSpeech} disabled={isSaving || isUploading}>{t ? t('voiceInput') : '语音输入'}</button>
                    ) : (
                      <p className="text-xs text-gray-500 sm:hidden">提示：当前浏览器不支持语音输入，可使用系统键盘的麦克风进行语音输入</p>
                    )}
                    <div className="flex-1 flex gap-2 items-stretch">
                      <input
                        className="input flex-1 min-h-[44px]"
                        placeholder={t ? t('answerPlaceholder') : '请输入您的回答...'}
                        value={answerInput}
                        onChange={(e) => setAnswerInput(sanitizeInput(e.target.value))}
                        ref={answerInputRef}
                        disabled={isAsking || isSaving || isUploading}
                      />
                      {/* 桌面端：与输入框并排显示语音输入 */}
                      {speechSupported && (
                        <button className="btn hidden sm:inline-flex" onClick={handleSectionSpeech} disabled={isSaving || isUploading}>{t ? t('voiceInput') : '语音输入'}</button>
                      )}
                      <button className="btn w-auto" onClick={sendAnswer} disabled={isAsking || isSaving || isUploading}>{isAsking ? '请稍候...' : (t ? t('send') : '发送')}</button>
                    </div>
                  </div>
                  {/* 生成回忆/添加媒体 行 */}
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      className="btn w-full sm:w-auto"
                      disabled={polishingSectionIndex === currentSectionIndex || isSaving || isUploading || !((sections[currentSectionIndex]?.text)||'').trim()}
                      onClick={async () => {
                        const section = sections[currentSectionIndex] || {};
                        if (!((section.text || '').trim())) return;
                        setPolishingSectionIndex(currentSectionIndex);
                        try {
                          const token = localStorage.getItem('token');
                          if (!token) { setMessage('请先登录'); setPolishingSectionIndex(null); return; }
                          const system = '你是一位资深传记写作者。请根据“问答对话记录”整理出一段自然流畅、第一人称、朴素真挚的传记正文；保留事实细节（姓名、地名、时间等），不编造事实，不使用列表/编号/标题，不加入总结或点评，仅输出润色后的正文。';
                          const qaSource = (sections[currentSectionIndex]?.text || '').toString();
                          const userPayload = `以下是我与情感陪伴师在阶段「${getStageLabelByIndex(currentSectionIndex)}」的对话记录（按时间顺序）：\n\n${qaSource}\n\n请据此输出一段该阶段的传记正文（第一人称、连续自然，不要标题与编号）。`;
                          const messages = [
                            { role: 'system', content: system },
                            { role: 'user', content: userPayload },
                          ];
                          const resp = await retry(() => callSparkThrottled({ model: 'x1', messages, max_tokens: 1200, temperature: 0.5, user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') }, token, { silentThrottle: true }));
                          const polished = (resp.data?.choices?.[0]?.message?.content || '').toString().trim();
                          if (polished) {
                            setSections(prev => prev.map((s, i) => i === currentSectionIndex ? { ...s, text: polished } : s));
                            setMessage(`当前阶段篇章已润色`);
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
                    <label className="btn w-full sm:w-auto">
                      {t ? t('addMedia') : '添加图片/视频/音频'}
                      <input type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleUploadMediaToSection(currentSectionIndex, e.target.files[0])} disabled={isSaving || isUploading} />
                    </label>
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
          {/* 简介与引导问题移除；在预览页或保存时按需自动生成简介 */}
          {/* 去掉"分享到家族传记"勾选区 */}
          <div className="flex gap-4 flex-wrap">
            {/* 批量润色与撤销：一个按钮负责首次和再次润色 */}
            <button type="button" className="btn" onClick={handlePreview} disabled={isPolishing || isSaving || isUploading}>生成传记并预览</button>
            <button type="button" className="btn bg-blue-600 hover:bg-blue-700" onClick={handleSaveAndUpload} disabled={isSaving || isUploading}>{isUploading ? '上传中...' : '保存并上传'}</button>
            {/** 分享到广场（公开）入口移到 My.js，这里仅保留上传与本地保存 */}
            <button
              type="button"
              className="btn bg-gray-500 hover:bg-gray-600"
              onClick={() => navigate(-1)}
              disabled={isSaving || isUploading}
            >
              返回
            </button>
          </div>


          {showPreview && (
            <div className="mt-6 border rounded p-4 bg-white">
              <h3 className="text-xl font-semibold mb-3">预览（不可编辑）</h3>
              {(bioTitle || '我的一生') && <h2 className="text-2xl font-bold mb-2">{bioTitle || '我的一生'}</h2>}
              <div className="space-y-6">
                {sections.map((sec, idx) => (
                  <article key={idx} className="border-b pb-4">
                    {sec.title && <h4 className="text-lg font-semibold mb-2">{sec.title}</h4>}
                    {sec.text && <p className="whitespace-pre-wrap text-gray-800">{getPreviewText(sec.text)}</p>}
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
    </div>
  );
};

export default CreateBiography;