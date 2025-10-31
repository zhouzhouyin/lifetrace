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
  const { setPublicBiographies, isLoggedIn, setNotes, username, setFreeBiography } = useContext(AppContext);
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
  // 简介引导问题
  const [guidedName, setGuidedName] = useState('');
  const [guidedCareer, setGuidedCareer] = useState('');
  const [guidedInfluence, setGuidedInfluence] = useState('');
  const [guidedHobbiesBeliefs, setGuidedHobbiesBeliefs] = useState('');
  const [guidedFutureAdvice, setGuidedFutureAdvice] = useState('');
  const [guidedStepIndex, setGuidedStepIndex] = useState(0);
  const [editingNoteId, setEditingNoteId] = useState('');

  // 简介引导问题配置
  const guidedSteps = [
    { key: 'name', label: '你叫什么名字？', type: 'input', value: guidedName, set: setGuidedName, placeholder: '例如：张三', max: 50 },
    { key: 'career', label: '你的职业与事业？', type: 'input', value: guidedCareer, set: setGuidedCareer, placeholder: '例如：教师，从事基础教育二十余年', max: 120 },
    { key: 'influence', label: '对你影响最大的事情是什么？', type: 'textarea', value: guidedInfluence, set: setGuidedInfluence, placeholder: '简要描述一件影响你一生的事情', max: 200 },
    { key: 'hobbies', label: '你的兴趣爱好和人生信念是什么？', type: 'textarea', value: guidedHobbiesBeliefs, set: setGuidedHobbiesBeliefs, placeholder: '例如：热爱阅读与登山，始终相信勤勉与善良', max: 200 },
    { key: 'future', label: '你对未来的看法和忠告是什么？', type: 'textarea', value: guidedFutureAdvice, set: setGuidedFutureAdvice, placeholder: '给后人/亲友的一点观点或建议', max: 200 },
  ];
  const [materialsText, setMaterialsText] = useState('');
  const [familyShare, setFamilyShare] = useState(false);
  // 去掉独立“制作视频”功能
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  // 情感陪伴师访谈
  const [chatMessages, setChatMessages] = useState([]); // {role:'assistant'|'user', content:string}[]
  const [answerInput, setAnswerInput] = useState('');
  const [isInterviewing, setIsInterviewing] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const lifeStages = ['童年', '少年', '青年', '成年', '中年', '当下', '未来愿望'];
  const [stageIndex, setStageIndex] = useState(0);
  const [autoSpeakAssistant, setAutoSpeakAssistant] = useState(false);
  const [stageTurns, setStageTurns] = useState(Array(7).fill(0));
  const MAX_QUESTIONS_PER_STAGE = 8;
  const [shortContext, setShortContext] = useState(true); // 默认开启：仅带最近 3 轮
  const chatContainerRef = useRef(null);
  // 图文并茂篇章（每篇章：title + text + media[]）
  const [sections, setSections] = useState([{ title: '', text: '', media: [] }]);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0); // 用户主动选择的当前篇章
  // 访谈节流：防止用户过快连续提问
  const lastAskAtRef = useRef(0);
  const MIN_INTERVAL_MS = 3200;
  const throttleDelay = (ms) => new Promise(r => setTimeout(r, ms));
  const callSparkThrottled = async (payload, token) => {
    const now = Date.now();
    const diff = now - (lastAskAtRef.current || 0);
    if (diff < MIN_INTERVAL_MS) {
      setMessage('请求过快，正在缓冲…');
      await throttleDelay(MIN_INTERVAL_MS - diff);
    }
    lastAskAtRef.current = Date.now();
    setMessage('');
    return axios.post('/api/spark', payload, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
  };

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
        try {
          const polished = await polishTextWithAI(original, token);
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

  // 规范陪伴师输出：移除“下一个问题”标签，仅保留反馈与问题本身
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

  // 若缺少问号，则让模型补充一个“仅一句问题”
  const appendQuestionIfMissing = async (baseText, phaseIndex, history, token) => {
    let result = (baseText || '').toString().trim();
    if (hasQuestionMark(result)) return result;
    try {
      const systemAsk = '请仅输出一个自然口语化的问题句子，不要任何编号、前缀或额外解释。仅一句中文问题。';
      const userAsk = `基于当前阶段“${lifeStages[phaseIndex]}”与上述对话，请继续提出一个紧接上下文的下一个问题（仅一句）。`;
      const messages = [
        { role: 'system', content: systemAsk },
        ...history,
        { role: 'user', content: userAsk },
      ];
      const resp = await retry(() => callSparkThrottled({
        model: 'x1', messages, max_tokens: 100, temperature: 0.5,
        user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon')
      }, token));
      const q = (resp.data?.choices?.[0]?.message?.content || '').toString().trim();
      if (q) result = result ? `${result} ${q}` : q;
    } catch (_) {
      // 静默失败：保留原反馈
    }
    return result;
  };

  // 阶段兜底问题（确保每轮都有“下一个问题”）
  const getStageFallbackQuestion = (idx) => {
    const map = [
      '我们聊聊童年里一件让您记忆最深的小事？',
      '少年时期，有没有一段让您会心一笑的经历？',
      '青年阶段，是否有一个改变您人生方向的决定或相遇？',
      '成年后的这些年，您最骄傲的一件事是什么？',
      '中年后，您对家人或自我有哪些新的理解？',
      '请问您现在多大年纪了？方便说一下您最近的生活节奏和心情吗？',
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

  // 根据阶段生成篇章标题
  const stageTitleForIndex = (index) => `${lifeStages[index] || '阶段'}回忆`;

  // 确保存在对应阶段的篇章，并规范标题
  const ensureSectionForStage = (index) => {
    setSections((prev) => {
      const total = lifeStages.length;
      const next = Array.from({ length: total }, (_, i) => {
        const existing = prev[i] || { title: '', text: '', media: [] };
        return {
          title: existing.title || '',
          text: existing.text || '',
          media: Array.isArray(existing.media) ? existing.media : [],
        };
      });
      return next;
    });
  };

  // 初始化确保当前阶段篇章存在
  useEffect(() => {
    try { ensureSectionForStage(currentSectionIndex); } catch (_) {}
  }, []);

  const localPolish = (text) => {
    if (!text) return '';
    let t = text.toString();
    t = t.replace(/[ \t]+\n/g, '\n');
    t = t.replace(/\n{3,}/g, '\n\n');
    t = t.replace(/[ ,]+/g, ' ');
    t = t.replace(/[,，]\s*/g, '，');
    t = t.replace(/[.。]\s*/g, '。');
    t = t.replace(/!{2,}/g, '！');
    t = t.replace(/\?{2,}/g, '？');
    t = t.replace(/\s{2,}/g, ' ');
    return t;
  };

  // 将长文本分片后逐段润色并合并，避免模型上下文/长度限制
  const polishTextWithAI = async (rawText, token) => {
    const text = (rawText || '').toString();
    if (!text.trim()) return '';
    const chunkSize = 1500; // 字符粒度简化处理
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    const results = [];
    for (let i = 0; i < chunks.length; i++) {
      try {
        const system = '你是一位资深传记编辑。请以传记/回忆录的叙事思维，在不改动事实与时间线的前提下，润色用户提供的这段传记正文，使其更连贯、纪实、朴素而真挚；保持第一人称与个人记忆视角，尊重真实细节（姓名、地名、时间等）；不虚构、不添加新信息、不总结、不拟标题；仅输出润色后的正文。';
        const messages = [
          { role: 'system', content: system },
          { role: 'user', content: `请润色下面片段（第 ${i + 1}/${chunks.length} 段）：\n${chunks[i]}` },
        ];
        const resp = await retry(() => callSparkThrottled({ model: 'x1', messages, max_tokens: 1000, temperature: 0.5, user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') }, token));
        const polished = (resp.data?.choices?.[0]?.message?.content || '').toString().trim();
        results.push(polished || chunks[i]);
      } catch (e) {
        results.push(chunks[i]);
      }
    }
    const joined = results.join('');
    if (joined.trim() === text.trim()) {
      const fallback = localPolish(text);
      return fallback || text;
    }
    return joined;
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

  // 访谈：阶段开场
  const askStageKickoff = async (targetIndex, resetTurns = false) => {
    const token = localStorage.getItem('token');
    if (!token) {
      setMessage('请先登录');
      setTimeout(() => navigate('/login'), 1000);
      return;
    }
    setIsAsking(true);
    try {
      const systemPrompt = '你是一位温暖、耐心、幽默而得体的情感陪伴师。目标：引发生命共鸣，帮助用户记录其一生中值得纪念的人与事，从童年至今，再到对未来的期盼。请用自然口语化的方式回复，不要使用任何编号、序号或列表符号。先人性化反馈，再给出一个自然的后续问题，不要添加“下一个问题”字样。仅输出中文。';
      const kickoffUser = targetIndex === 5
        ? '我们先确认一下当下的基本情况：您现在多大年纪？可以简单描述下最近的生活节奏与心情吗？'
        : `请围绕阶段“${lifeStages[targetIndex]}”提出第一个暖心问题，先用一句简短话语表达共情与欢迎，然后给出问题。`;
      const history = chatMessages.slice(-5);
      const messages = [ { role: 'system', content: systemPrompt }, ...history, { role: 'user', content: kickoffUser } ];
      const resp = await retry(() => callSparkThrottled({ model: 'x1', messages, max_tokens: 300, temperature: 0.5, user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') }, token));
      const raw = resp.data?.choices?.[0]?.message?.content;
      const ai = normalizeAssistant(raw) || `我们来聊聊“${lifeStages[targetIndex]}”。可以先从一件让您记忆深刻的小事说起吗？`;
      setChatMessages(prev => [...prev, { role: 'assistant', content: ai }]);
      if (autoSpeakAssistant) speakText(ai);
      setStageIndex(targetIndex);
      ensureSectionForStage(targetIndex);
      setStageTurns(prev => {
        const copy = [...prev];
        if (resetTurns) copy[targetIndex] = 0; // 用户手动切换则清零
        copy[targetIndex] = (copy[targetIndex] || 0) + 1; // 计入开场问题
        return copy;
      });
    } catch (err) {
      // 短上下文重试
      try {
        const systemPrompt = '你是一位温暖、耐心、幽默而得体的情感陪伴师。目标：引发生命共鸣，帮助用户记录其一生中值得纪念的人与事，从童年至今，再到对未来的期盼。请用自然口语化的方式回复，不要使用任何编号、序号或列表符号。先简短反馈，再给出一个自然的后续问题，不要添加“下一个问题”字样。仅输出中文。';
        const kickoffUser = targetIndex === 5
          ? '我们先确认一下当下的基本情况：您现在多大年纪？可以简单描述下最近的生活节奏与心情吗？'
          : `请围绕阶段“${lifeStages[targetIndex]}”提出第一个暖心问题，先用一句简短话语表达共情与欢迎，然后给出问题。`;
        const messages = [ { role: 'system', content: systemPrompt }, { role: 'user', content: kickoffUser } ];
        setMessage('阶段提问失败，正以短上下文自动重试…');
        const resp2 = await callSparkThrottled({ model: 'x1', messages, max_tokens: 300, temperature: 0.5, user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') }, token);
        const raw2 = resp2.data?.choices?.[0]?.message?.content;
        const ai2 = normalizeAssistant(raw2) || `我们来聊聊“${lifeStages[targetIndex]}”。可以先从一件让您记忆深刻的小事说起吗？`;
        setChatMessages(prev => [...prev, { role: 'assistant', content: ai2 }]);
        if (autoSpeakAssistant) speakText(ai2);
        setStageIndex(targetIndex);
        ensureSectionForStage(targetIndex);
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
    }
  };

  const startInterview = () => {
    if (isInterviewing) return;
    setIsInterviewing(true);
    setStageIndex(0);
    setStageTurns(Array(lifeStages.length).fill(0));
    // 以基本资料为起点：姓名、性别、出生年月、年龄、祖籍、出生地、家庭情况/学习经历
    const first = '我们先从一些基本的资料开始吧。能请您介绍一下自己的姓名、性别、出生年月、年龄、祖籍和出生地吗？另外方便的话可以介绍一下您的家庭情况和学习经历吗？如果在当时的环境下没有机会接受教育的话，也可以分享一下您当时的生活经历。';
    setChatMessages([{ role: 'assistant', content: first }]);
    if (autoSpeakAssistant) speakText(first);
  };

  // 访谈：发送回答
  const sendAnswer = async () => {
    const trimmed = (answerInput || '').trim();
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
    // 把回答写入“当前篇章”（默认篇章1）；只有用户点击“新增篇章”并选择后才会写入后续篇章
    setSections(prev => {
      const list = prev.length === 0 ? [{ title: '', text: '', media: [] }] : prev;
      const target = Math.min(Math.max(currentSectionIndex, 0), list.length - 1);
      return list.map((s, i) => i === target ? { ...s, text: (s.text ? s.text + '\n' : '') + trimmed } : s);
    });
    // 同步到可编辑素材文本
    setMaterialsText(prev => (prev ? prev + '\n' + trimmed : trimmed));

    const systemPrompt = `你是一位温暖、耐心、幽默而得体的情感陪伴师。目标：引发生命共鸣，帮助用户记录其一生中值得记述的人与事，从童年至今，直到对未来的期盼。当前阶段：${lifeStages[stageIndex]}。请用自然口语化的方式回复，不要使用任何编号、序号或列表符号。先进行真诚简短的反馈，再给出一个自然的后续问题，不要添加“下一个问题”字样。仅输出中文。`;
    const MAX_TURNS = 12;
    const history = chatMessages.slice(-5);
    const messagesToSend = [ { role: 'system', content: systemPrompt }, ...history, { role: 'user', content: trimmed } ];
    setChatMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    setAnswerInput('');
    setIsAsking(true);
    try {
      const resp = await retry(() => callSparkThrottled({
        model: 'x1', messages: messagesToSend, max_tokens: 600, temperature: 0.5,
        user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon')
      }, token));
      const raw = resp.data?.choices?.[0]?.message?.content;
      let aiBase = normalizeAssistant(raw) || '谢谢您的分享。';
      const historyForAsk = chatMessages.slice(-5);
      const ai = await appendQuestionIfMissing(aiBase, stageIndex, historyForAsk, token);
      setChatMessages(prev => [...prev, { role: 'assistant', content: ai }]);
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
            const closing = '非常感谢您的真诚分享。我们的访谈到这里告一段落了。您可以点击“生成传记并预览”查看整理结果，或选择上方任一阶段按钮重新开始该阶段的对话。祝您生活温暖而明亮。';
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
            user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') }, token);
          const raw2 = resp2.data?.choices?.[0]?.message?.content;
          let ai2Base = normalizeAssistant(raw2) || '谢谢您的分享。';
          const ai2 = await appendQuestionIfMissing(ai2Base, stageIndex, chatMessages.slice(-5), token);
          setChatMessages(prev => [...prev, { role: 'assistant', content: ai2 }]);
          if (autoSpeakAssistant) speakText(ai2);
          setStageTurns(prev => {
            const copy = [...prev];
            copy[stageIndex] = (copy[stageIndex] || 0) + 1;
            if (copy[stageIndex] >= MAX_QUESTIONS_PER_STAGE) {
              if (stageIndex < lifeStages.length - 1) {
                setTimeout(() => askStageKickoff(stageIndex + 1, false), 200);
              } else {
                const closing = '非常感谢您的真诚分享。我们的访谈到这里告一段落了。您可以点击“生成传记并预览”查看整理结果，或选择上方任一阶段按钮重新开始该阶段的对话。祝您生活温暖而明亮。';
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

  // 篇章语音输入（语音转文字）：将识别结果追加到指定篇章正文
  const handleSectionSpeech = (sectionIndex) => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      setMessage('当前浏览器不支持语音输入，请使用 Chrome 或 Edge 最新版');
      return;
    }
    const recognition = new SpeechRec();
    recognition.lang = 'zh-CN';
    recognition.onresult = (event) => {
      const text = sanitizeInput(event.results[0][0].transcript);
      setSections((prev) => prev.map((s, i) => (
        i === sectionIndex
          ? { ...s, text: (s.text ? s.text + ' ' : '') + text }
          : s
      )));
    };
    recognition.onerror = () => setMessage('语音识别失败，请检查麦克风或重试');
    recognition.start();
  };

  // 分段编辑：文本与媒体
  const addSection = () => setSections(prev => {
    const next = [...prev, { title: '', text: '', media: [] }];
    // 新增篇章后，自动将其设为当前篇章（仅用户主动新增时才前进）
    setCurrentSectionIndex(next.length - 1);
    return next;
  });
  const removeSection = (index) => setSections(prev => prev.filter((_, i) => i !== index));
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
        // 优先使用服务端返回的 sections；否则将全文作为第1篇章
        if (Array.isArray(note.sections) && note.sections.length > 0) {
          setSections(note.sections.map(s => ({ title: s.title || '', text: s.text || '', media: Array.isArray(s.media) ? s.media : [] })));
        } else {
          const text = (note.content || '').toString();
          setSections([{ title: '', text, media: [] }]);
        }
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

  // 持久化问答到本地，便于“继续编辑”时恢复
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
          const resp = await retry(() => callSparkThrottled({ model: 'x1', messages, max_tokens: 1200, temperature: 0.5, user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') }, token));
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
          const respSum = await retry(() => callSparkThrottled({ model: 'x1', messages: messagesSum, max_tokens: 300, temperature: 0.5, user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') }, token));
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
      setShowPreview(true);
      setMessage('已生成预览（基于当前篇章内容）');
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
      // 将最近对话按“陪伴师问/我答”对组装成清晰的QA序列，供模型分章
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

      // 让模型基于问答对，生成“分章文本数组”，与现有章节数对齐；若生成数量不同，则就近截断/补空
      const system = '你是一位资深传记写作者。现在请把给定的问答对拆分整理为若干“章节正文”，每个章节是一段自然的第一人称叙述，不要列表/编号/标题，不编造事实，保留细节，风格朴素真挚。只输出JSON数组，每个元素是字符串，对应各章节正文。不要任何其它文字。';
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
      }, token));
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

      // 仅为“空白篇章”写入内容，不覆盖已有正文；若问答生成的数组比现有篇章更多，则将多出的内容忽略（不在此新增篇章）
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
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="card max-w-2xl w-full p-6">
        <Helmet>
          <title>我的一生 - 永念</title>
        </Helmet>
        <h2 className="text-2xl font-bold text-center mb-6">我的一生</h2>
        {message && (
          <div className={`mb-4 p-2 text-center text-white rounded ${message.includes('失败') || message.includes('违规') || message.includes('错误') ? 'bg-red-500' : 'bg-green-500'}`}>
            {message}
          </div>
        )}
        <div className="flex flex-col gap-6">
          
          {/* 情感陪伴师访谈 */}
          <div>
            <h3 className="text-lg font-semibold mb-2">情感陪伴师访谈</h3>
            <div className="flex items-center gap-2 mb-2">
              <button type="button" className="btn" onClick={startInterview} disabled={isInterviewing}>开始访谈</button>
              <button type="button" className="btn" onClick={readLatestAssistant} disabled={!((chatMessages||[]).some(m => m.role === 'assistant'))}>朗读最新回复</button>
            </div>
            {/* 清理上下文默认开启（仅带最近 5 轮），不提供开关 */}
            {chatMessages.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-auto border rounded p-2" ref={chatContainerRef}>
                {chatMessages.map((m, idx) => (
                  <div key={idx} className={m.role === 'assistant' ? 'text-blue-700' : 'text-gray-800'}>
                    <span className="font-medium">{m.role === 'assistant' ? '陪伴师' : '我'}：</span>{m.content}
                  </div>
                ))}
              </div>
            )}
            {isInterviewing && (
              <>
                <div className="mt-2 flex gap-2 flex-wrap">
                  {lifeStages.map((stg, idx) => (
                    <button key={stg} className={`btn ${idx === stageIndex ? 'bg-blue-600 hover:bg-blue-700' : ''}`} onClick={() => askStageKickoff(idx)} disabled={isAsking || isSaving || isUploading}>{stg}</button>
                  ))}
                </div>
                <p className="text-base text-gray-600 mt-1">提示：以上阶段按钮用于切换当前访谈主题，陪伴师会围绕所选阶段继续提问与引导。</p>
              </>
            )}
            {chatMessages.length > 0 && (
              <div className="mt-3 flex gap-2 flex-wrap">
                <input
                  className="input flex-1"
                  placeholder="请输入您的回答..."
                  value={answerInput}
                  onChange={(e) => setAnswerInput(sanitizeInput(e.target.value))}
                  disabled={isAsking || isSaving || isUploading}
                />
                <button className="btn" onClick={handleAnswerSpeech} disabled={isAsking || isSaving || isUploading}>语音输入</button>
                <button className="btn" onClick={readLatestAssistant} disabled={isAsking || isSaving || isUploading}>朗读最新回复</button>
                <button className="btn" onClick={sendAnswer} disabled={isAsking || isSaving || isUploading}>{isAsking ? '请稍候...' : '发送'}</button>
            </div>
            )}
            <p className="text-sm text-gray-500 mt-2">建议：每次回答后，点击“新增篇章”或在当前篇章继续补充，并可为该篇章添加图片/视频。</p>
          </div>
          {/* 阶段篇章：仅显示当前阶段，不再竖向陈列 */}
          <div>
            <h3 className="text-lg font-semibold mb-2">{`${lifeStages[currentSectionIndex]}阶段篇章`}</h3>
            <div className="space-y-4">
              <div className={`border rounded p-3 ring-2 ring-blue-400`}>
                <div className="flex justify-between items-center mb-2">
                  <div className="font-medium">{stageTitleForIndex(currentSectionIndex)}</div>
                </div>
                <input
                  type="text"
                  className="input w-full mb-2"
                  placeholder={stageTitleForIndex(currentSectionIndex)}
                  value={sections[currentSectionIndex]?.title ?? ''}
                  onChange={(e) => updateSectionTitle(currentSectionIndex, e.target.value)}
                  maxLength={200}
                  disabled={isSaving || isUploading}
                />
                <textarea
                  className="input h-24 w-full"
                  placeholder="在此输入该篇章的正文内容。回答完某个问题后，直接把内容写在这里；接着点击下方按钮可以给此篇章插入图片或视频。"
                  value={sections[currentSectionIndex]?.text || ''}
                  onChange={(e) => updateSectionText(currentSectionIndex, e.target.value)}
                  maxLength={5000}
                  disabled={isSaving || isUploading}
                />
                <div className="mt-2 flex gap-2 flex-wrap">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => handleSectionSpeech(currentSectionIndex)}
                    disabled={isSaving || isUploading}
                  >
                    语音输入本篇章
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={polishingSectionIndex === currentSectionIndex || isSaving || isUploading || !((sections[currentSectionIndex]?.text||'').trim())}
                    onClick={async () => {
                      const text = (sections[currentSectionIndex]?.text || '').trim();
                      if (!text) return;
                      setPolishingSectionIndex(currentSectionIndex);
                      try {
                        const token = localStorage.getItem('token');
                        if (!token) { setMessage('请先登录'); setPolishingSectionIndex(null); return; }
                        const polished = await polishTextWithAI(text, token);
                        if (polished) {
                          setSections(prev => prev.map((s, i) => i === currentSectionIndex ? { ...s, text: polished } : s));
                          setMessage('本阶段已润色');
                        }
                      } catch (e) {
                        setMessage('本阶段润色失败');
                      } finally {
                        setPolishingSectionIndex(null);
                      }
                    }}
                  >
                    {polishingSectionIndex === currentSectionIndex ? '润色中...' : '润色此篇章'}
                  </button>
                  <label className="btn">
                    为本篇章添加图片/视频/音频
                    <input type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleUploadMediaToSection(currentSectionIndex, e.target.files[0])} disabled={isSaving || isUploading} />
                  </label>
                </div>
                <p className="text-sm text-gray-500">当前字数: {sections[currentSectionIndex]?.text?.length || 0} / 5000</p>
                {Array.isArray(sections[currentSectionIndex]?.media) && sections[currentSectionIndex]?.media.length > 0 && (
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
            </div>
            <div className="mt-3 flex gap-2">
              <button
                className="btn"
                onClick={() => {
                  const next = Math.min(currentSectionIndex + 1, lifeStages.length - 1);
                  setCurrentSectionIndex(next);
                  ensureSectionForStage(next);
                }}
                disabled={isSaving || isUploading || currentSectionIndex >= lifeStages.length - 1}
              >
                下一个阶段
              </button>
              <button
                className="btn"
                onClick={() => {
                  const prev = Math.max(currentSectionIndex - 1, 0);
                  setCurrentSectionIndex(prev);
                  ensureSectionForStage(prev);
                }}
                disabled={isSaving || isUploading || currentSectionIndex <= 0}
              >
                上一个阶段
              </button>
            </div>
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
          {/* 标题与简介区域移动到操作按钮上方 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 mt-4">标题</label>
            <input
              type="text"
              className="input w-full"
              placeholder="请输入标题"
              value={bioTitle}
              onChange={(e) => setBioTitle(sanitizeInput(e.target.value))}
              maxLength={200}
              disabled={isSaving || isUploading}
            />
            <p className="text-sm text-gray-500">建议填写清晰的传记标题，便于在广场展示与检索</p>
            {/* 简介引导问题（逐步，仅展示问题） */}
            <div className="mt-3 space-y-2">
              {(() => {
                const step = guidedSteps[guidedStepIndex];
                if (!step) return null;
                return (
                  <div className="p-2 border rounded bg-gray-50">
                    <div className="text-sm text-gray-700 mb-1">引导问题</div>
                    <div className="text-gray-900">{step.label}</div>
                    <div className="mt-2 flex gap-2 flex-wrap">
                      {guidedStepIndex > 0 && (
                        <button type="button" className="btn" onClick={() => setGuidedStepIndex(guidedStepIndex - 1)}>上一个</button>
                      )}
                      {guidedStepIndex < guidedSteps.length - 1 && (
                        <button type="button" className="btn" onClick={() => setGuidedStepIndex(guidedStepIndex + 1)}>下一个</button>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">根据当前问题，直接在下方“传记简介”里填写即可</p>
                  </div>
                );
              })()}
            </div>
            <label className="block text-sm font-medium text-gray-700 mb-1 mt-3">传记简介</label>
            <div className="flex gap-2">
              <textarea
                className="input h-20 w-full"
                placeholder="请输入简要传记简介（优先展示在广场和家族传记卡片中）"
                value={bioSummary}
                onChange={(e) => setBioSummary(sanitizeInput(e.target.value.slice(0, 500)))}
                maxLength={500}
                disabled={isSaving || isUploading}
              />
              <button
                type="button"
                className="btn"
                title="语音输入简介"
                onClick={() => handleSpeech('bio-summary')}
                disabled={isSaving || isUploading}
              >
                语音
              </button>
            </div>
            <p className="text-sm text-gray-500">最多 500 字；更多内容请在正文中填写。点击【查看】后才展示完整传记</p>
            <div className="mt-2">
              <button
                type="button"
                className="btn"
                disabled={isSummaryPolishing || isSaving || isUploading || !(bioSummary||'').trim()}
                onClick={async () => {
                  if (!(bioSummary||'').trim()) return;
                  setIsSummaryPolishing(true);
                  try {
                    const token = localStorage.getItem('token');
                    const systemSum = '你是一位专业的编辑。请将以下传记简介润色，保持朴素真挚、简练清晰，不编造事实，输出不超过500字，仅输出润色后的简介文本。';
                    const messagesSum = [
                      { role: 'system', content: systemSum },
                      { role: 'user', content: `请润色这段传记简介：\n${bioSummary}` },
                    ];
                    const respSum = await retry(() => callSparkThrottled({ model: 'x1', messages: messagesSum, max_tokens: 300, temperature: 0.5, user: (localStorage.getItem('uid') || localStorage.getItem('username') || 'user_anon') }, token));
                    const polishedSum = (respSum.data?.choices?.[0]?.message?.content || '').toString().trim();
                    if (polishedSum) setBioSummary(polishedSum);
                    setMessage('简介已润色');
                  } catch (e) {
                    setMessage('简介润色失败');
                  } finally {
                    setIsSummaryPolishing(false);
                  }
                }}
              >
                {isSummaryPolishing ? '润色中...' : '润色简介'}
              </button>
            </div>
          </div>
          {/* 去掉“分享到家族传记”勾选区 */}
          <div className="flex gap-4 flex-wrap">
            {/* 批量润色与撤销：一个按钮负责首次和再次润色 */}
            <button
              type="button"
              className="btn"
              onClick={handleBatchPolishSections}
              disabled={isBatchPolishing || isSaving || isUploading}
            >
              {isBatchPolishing ? '润色中...' : (batchPolishBackup ? '重新润色' : '润色各个篇章')}
            </button>
            <button type="button" className="btn" onClick={handleUndoBatchPolish} disabled={!batchPolishBackup || isBatchPolishing || isSaving || isUploading}>撤销润色</button>

            <button type="button" className="btn" onClick={handlePreview} disabled={isPolishing || isSaving || isUploading}>生成传记并预览</button>
            <button type="button" className="btn bg-blue-600 hover:bg-blue-700" onClick={handleSaveAndUpload} disabled={isSaving || isUploading}>{isUploading ? '上传中...' : '保存并上传'}</button>
            {/** 分享到广场（公开）入口移到 My.js，这里仅保留上传与本地保存 */}
            <button
              type="button"
              className="btn bg-gray-500 hover:bg-gray-600"
              onClick={async () => {
                if (isSaving || isUploading) return;
                const hasContent = (bioTitle || '').trim() || (bioSummary || '').trim() || (sections || []).some(s => (s.text || '').trim() || (Array.isArray(s.media) && s.media.length > 0));
                if (hasContent) {
                  const confirmSave = window.confirm('检测到未保存内容，是否立即保存并上传？');
                  if (confirmSave) {
                    await handleSaveAndUpload();
                  } else {
                    navigate(-1);
                  }
                } else {
                  navigate(-1);
                }
              }}
              disabled={isSaving || isUploading}
            >
              返回
            </button>
          </div>


          {showPreview && (
            <div className="mt-6 border rounded p-4 bg-white">
              <h3 className="text-xl font-semibold mb-3">预览（不可编辑）</h3>
              {bioTitle && <h2 className="text-2xl font-bold mb-2">{bioTitle}</h2>}
              <div className="space-y-6">
                {sections.map((sec, idx) => (
                  <article key={idx} className="border-b pb-4">
                    {sec.title && <h4 className="text-lg font-semibold mb-2">{sec.title}</h4>}
                    {sec.text && <p className="whitespace-pre-wrap text-gray-800">{sec.text}</p>}
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