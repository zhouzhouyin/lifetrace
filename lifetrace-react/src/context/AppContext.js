import { createContext, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

export const AppContext = createContext();

const API_BASE = (
  process.env.REACT_APP_API_BASE ||
  ((typeof window !== 'undefined' && window.location && window.location.origin)
    ? window.location.origin
    : 'http://localhost:5002')
).replace(/\/$/, '');
axios.defaults.baseURL = API_BASE;
axios.defaults.withCredentials = true;
axios.defaults.timeout = 8000; // 避免请求挂起导致 authLoading 一直为 true

export const AppContextProvider = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [userId, setUserId] = useState(localStorage.getItem('userId') || '');
  const [uid, setUid] = useState(localStorage.getItem('uid') || '');
  const [role, setRole] = useState(localStorage.getItem('role') || 'user');
  const [notes, setNotes] = useState([]);
  const [uploads, setUploads] = useState([]); // cloudNotes
  const [files, setFiles] = useState([]); // 存储 /api/uploads 数据
  const [publicNotes, setPublicNotes] = useState([]);
  const [publicBiographies, setPublicBiographies] = useState([]);
  const [memos, setMemos] = useState([]); // 轻量化随手记
  const [familyMembers, setFamilyMembers] = useState([]); // 已认证家人
  const [familyRequests, setFamilyRequests] = useState([]); // 待处理的家人请求
  const [error, setError] = useState('');
  const [questions, setQuestions] = useState([
    '您人生中最难忘的时刻是什么？',
    '您最引以为傲的成就是什么？',
    '您希望后人记住您的哪些价值观？',
  ]);
  const [answers, setAnswers] = useState(['', '', '']);
  const [freeBiography, setFreeBiography] = useState('');

  // i18n: language and translations
  const [lang, setLang] = useState(localStorage.getItem('lang') || 'zh');
  const translations = {
    zh: {
      titlePlaceholder: '请输入传记主标题（例如：我的一生）',
      startInterview: '开始访谈',
      voiceInput: '语音输入',
      stopRecording: '停止录音',
      voiceSettings: '语音设置',
      autoPunctuation: '自动标点',
      accent: '口音',
      accentMandarin: '普通话',
      accentCantonese: '粤语',
      silenceMs: '静音判停(ms)',
      maxDurationSec: '最长录音(s)',
      confirmBeforeWrite: '识别后确认再写入',
      confirmWrite: '确认写入',
      clear: '清空',
      recording: '录音中',
      elapsed: '已用时',
      vuLevel: '音量',
      undo: '撤销生成',
      showDiff: '显示差异',
      hideDiff: '隐藏差异',
      estimate: '预计',
      send: '发送',
      prev: '上一篇',
      next: '下一篇',
      generateSection: '生成本篇回忆',
      addMedia: '添加图片/视频/音频',
      generatePreview: '生成传记并预览',
      saveUpload: '保存并上传',
      shareFamily: '分享到家族',
      shareSquare: '分享到广场',
      edit: '编辑',
      doneEdit: '完成编辑',
      back: '返回',
      noTitle: '无标题',
      summaryPlaceholder: '简介（可选）',
      answerPlaceholder: '请输入您的回答...',
      chapterTitlePlaceholder: '篇章标题（可选）',
      chapterTextPlaceholder: '在此输入该篇章的正文内容。回答完某个问题后，直接把内容写在这里；接着点击下方按钮可以给此篇章插入图片或视频。点击“生成本篇回忆”，即可获得基于问答生成的这一阶段的专属回忆。',
      fullTextPlaceholder: '在此编辑整篇传记正文...'
    },
    en: {
      titlePlaceholder: 'Enter biography title (e.g., My Life)',
      startInterview: 'Start Interview',
      voiceInput: 'Voice Input',
      stopRecording: 'Stop Recording',
      voiceSettings: 'Voice Settings',
      autoPunctuation: 'Auto punctuation',
      accent: 'Accent',
      accentMandarin: 'Mandarin',
      accentCantonese: 'Cantonese',
      silenceMs: 'Silence VAD (ms)',
      maxDurationSec: 'Max duration (s)',
      confirmBeforeWrite: 'Confirm before write',
      confirmWrite: 'Confirm Write',
      clear: 'Clear',
      recording: 'Recording',
      elapsed: 'Elapsed',
      vuLevel: 'Level',
      undo: 'Undo',
      showDiff: 'Show Diff',
      hideDiff: 'Hide Diff',
      estimate: 'Estimate',
      send: 'Send',
      prev: 'Previous',
      next: 'Next',
      generateSection: 'Generate This Chapter',
      addMedia: 'Add Image/Video/Audio',
      generatePreview: 'Generate & Preview',
      saveUpload: 'Save & Upload',
      shareFamily: 'Share to Family',
      shareSquare: 'Share to Square',
      edit: 'Edit',
      doneEdit: 'Done',
      back: 'Back',
      noTitle: 'Untitled',
      summaryPlaceholder: 'Summary (optional)',
      answerPlaceholder: 'Enter your answer...',
      chapterTitlePlaceholder: 'Chapter Title (optional)',
      chapterTextPlaceholder: 'Write chapter content here. After answering, continue writing and add media below. Then click “Generate This Chapter” to get a stage-specific memory based on your Q&A.',
      fullTextPlaceholder: 'Edit the full biography text here...'
    },
    ko: {
      titlePlaceholder: '전기 제목을 입력하세요 (예: 나의 삶)',
      startInterview: '인터뷰 시작',
      voiceInput: '음성 입력',
      send: '보내기',
      prev: '이전',
      next: '다음',
      generateSection: '이번 편 생성',
      addMedia: '이미지/영상/오디오 추가',
      generatePreview: '전기 생성 및 미리보기',
      saveUpload: '저장 및 업로드',
      shareFamily: '가족에게 공유',
      shareSquare: '광장에 공유',
      edit: '편집',
      doneEdit: '완료',
      back: '뒤로',
      noTitle: '제목 없음',
      summaryPlaceholder: '소개 (선택 사항)',
      answerPlaceholder: '답변을 입력하세요...',
      chapterTitlePlaceholder: '편 제목 (선택 사항)',
      chapterTextPlaceholder: '여기에 편 내용을 작성하세요. 답변 후 이어서 작성하고 아래에서 미디어를 추가하세요.',
      fullTextPlaceholder: '여기서 전체 전기 텍스트를 편집하세요...'
    },
    ja: {
      titlePlaceholder: '伝記のタイトル（例：私の一生）を入力',
      startInterview: 'インタビュー開始',
      voiceInput: '音声入力',
      send: '送信',
      prev: '前へ',
      next: '次へ',
      generateSection: '本章を生成',
      addMedia: '画像/動画/音声を追加',
      generatePreview: '伝記を生成してプレビュー',
      saveUpload: '保存してアップロード',
      shareFamily: '家族に共有',
      shareSquare: 'スクエアに共有',
      edit: '編集',
      doneEdit: '完了',
      back: '戻る',
      noTitle: '無題',
      summaryPlaceholder: '概要（任意）',
      answerPlaceholder: '回答を入力してください...',
      chapterTitlePlaceholder: '章のタイトル（任意）',
      chapterTextPlaceholder: 'ここに章の本文を書いてください。回答後、続けて記入し、下でメディアを追加できます。',
      fullTextPlaceholder: 'ここで伝記全文を編集...'
    },
    de: {
      titlePlaceholder: 'Biografietitel eingeben (z. B. Mein Leben)',
      startInterview: 'Interview starten',
      voiceInput: 'Spracheingabe',
      send: 'Senden',
      prev: 'Zurück',
      next: 'Weiter',
      generateSection: 'Dieses Kapitel generieren',
      addMedia: 'Bild/Video/Audio hinzufügen',
      generatePreview: 'Biografie erstellen & Vorschau',
      saveUpload: 'Speichern & Hochladen',
      shareFamily: 'Mit Familie teilen',
      shareSquare: 'Im Platz teilen',
      edit: 'Bearbeiten',
      doneEdit: 'Fertig',
      back: 'Zurück',
      noTitle: 'Ohne Titel',
      summaryPlaceholder: 'Zusammenfassung (optional)',
      answerPlaceholder: 'Geben Sie Ihre Antwort ein...',
      chapterTitlePlaceholder: 'Kapiteltitel (optional)',
      chapterTextPlaceholder: 'Kapitelinhalt hier schreiben. Nach der Antwort weiterschreiben und unten Medien hinzufügen.',
      fullTextPlaceholder: 'Gesamten Biografietext hier bearbeiten...'
    },
    ru: {
      titlePlaceholder: 'Введите заголовок биографии (например, Моя жизнь)',
      startInterview: 'Начать интервью',
      voiceInput: 'Голосовой ввод',
      send: 'Отправить',
      prev: 'Назад',
      next: 'Вперед',
      generateSection: 'Сгенерировать эту главу',
      addMedia: 'Добавить изображение/видео/аудио',
      generatePreview: 'Сгенерировать и просмотреть',
      saveUpload: 'Сохранить и загрузить',
      shareFamily: 'Поделиться с семьей',
      shareSquare: 'Поделиться на площади',
      edit: 'Редактировать',
      doneEdit: 'Готово',
      back: 'Назад',
      noTitle: 'Без названия',
      summaryPlaceholder: 'Краткое описание (необязательно)',
      answerPlaceholder: 'Введите ваш ответ...',
      chapterTitlePlaceholder: 'Название главы (необязательно)',
      chapterTextPlaceholder: 'Напишите здесь текст главы. После ответа продолжайте писать и добавляйте медиа ниже.',
      fullTextPlaceholder: 'Редактируйте полный текст биографии здесь...'
    },
    fr: {
      titlePlaceholder: 'Entrez le titre de la biographie (ex. : Ma vie)',
      startInterview: 'Commencer l\'entretien',
      voiceInput: 'Saisie vocale',
      send: 'Envoyer',
      prev: 'Précédent',
      next: 'Suivant',
      generateSection: 'Générer ce chapitre',
      addMedia: 'Ajouter image/vidéo/audio',
      generatePreview: 'Générer & Aperçu',
      saveUpload: 'Enregistrer & Télécharger',
      shareFamily: 'Partager à la famille',
      shareSquare: 'Partager sur la place',
      edit: 'Éditer',
      doneEdit: 'Terminer',
      back: 'Retour',
      noTitle: 'Sans titre',
      summaryPlaceholder: 'Résumé (optionnel)',
      answerPlaceholder: 'Entrez votre réponse...',
      chapterTitlePlaceholder: 'Titre du chapitre (optionnel)',
      chapterTextPlaceholder: 'Écrivez le contenu du chapitre ici. Après la réponse, continuez à écrire et ajoutez des médias ci-dessous.',
      fullTextPlaceholder: 'Modifiez le texte complet de la biographie ici...'
    }
  };
  const t = (key) => (translations[lang] && translations[lang][key]) || translations.zh[key] || key;
  useEffect(() => { try { localStorage.setItem('lang', lang); } catch (_) {} }, [lang]);

  useEffect(() => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const getUserWithRetry = async (storedToken) => {
      const timeouts = [12000, 18000, 25000];
      let lastErr;
      for (let i = 0; i < timeouts.length; i++) {
        try {
          return await axios.get('/api/user', {
            headers: { Authorization: `Bearer ${storedToken}` },
            timeout: timeouts[i],
          });
        } catch (err) {
          lastErr = err;
          if (!err.response || err.code === 'ECONNABORTED') {
            await sleep(500 * (i + 1));
            continue;
          }
          throw err;
        }
      }
      throw lastErr;
    };

    const verifyToken = async () => {
      setAuthLoading(true);
      const storedToken = localStorage.getItem('token');
      console.log('AppContext: Verifying token:', storedToken);
      if (storedToken) {
        // 预设为已登录，后续仅在明确 401/403 时再降级为未登录
        setIsLoggedIn(true);
        setToken(storedToken);
        try {
          const response = await getUserWithRetry(storedToken);
          console.log('AppContext: Token verification successful:', response.data);
          setUsername(response.data.username || localStorage.getItem('username') || '');
          if (response.data.role) {
            setRole(response.data.role);
            localStorage.setItem('role', response.data.role);
          }
          if (response.data.uid) {
            setUid(response.data.uid);
            localStorage.setItem('uid', response.data.uid);
          }
          if (response.data.userId) {
            setUserId(response.data.userId);
            localStorage.setItem('userId', response.data.userId);
          }
          // 后台异步拉取公共内容与家人数据（不阻塞鉴权完成）
          (async () => {
            try {
              const [pubBioRes, pubNoteRes, familyRes, familyReqRes] = await Promise.allSettled([
                axios.get('/api/public/biographies'),
                axios.get('/api/public/notes'),
                axios.get('/api/family', { headers: { Authorization: `Bearer ${storedToken}` } }),
                axios.get('/api/family/requests', { headers: { Authorization: `Bearer ${storedToken}` } }),
              ]);
              if (pubBioRes.status === 'fulfilled') setPublicBiographies(Array.isArray(pubBioRes.value.data) ? pubBioRes.value.data : []);
              if (pubNoteRes.status === 'fulfilled') setPublicNotes(Array.isArray(pubNoteRes.value.data) ? pubNoteRes.value.data : []);
              if (familyRes.status === 'fulfilled') setFamilyMembers(Array.isArray(familyRes.value.data) ? familyRes.value.data : []);
              if (familyReqRes.status === 'fulfilled') setFamilyRequests(Array.isArray(familyReqRes.value.data) ? familyReqRes.value.data : []);
            } catch (_) { /* ignore */ }
          })();
        } catch (err) {
          console.error('AppContext: Token verification failed:', err);
          if (err.response?.status === 403 && err.response?.data?.error === 'jwt expired') {
            try {
              const refreshResponse = await axios.post(
                '/api/refresh-token',
                {},
                {
                  headers: { Authorization: `Bearer ${storedToken}` },
                  timeout: 8000,
                }
              );
              const newToken = refreshResponse.data.token;
              localStorage.setItem('token', newToken);
              setToken(newToken);
              setIsLoggedIn(true);
              const userResponse = await axios.get('/api/user', {
                headers: { Authorization: `Bearer ${newToken}` },
                timeout: 8000,
              });
              setUsername(userResponse.data.username || localStorage.getItem('username') || '');
              if (userResponse.data.role) {
                setRole(userResponse.data.role);
                localStorage.setItem('role', userResponse.data.role);
              }
              if (userResponse.data.uid) {
                setUid(userResponse.data.uid);
                localStorage.setItem('uid', userResponse.data.uid);
              }
              if (userResponse.data.userId) {
                setUserId(userResponse.data.userId);
                localStorage.setItem('userId', userResponse.data.userId);
              }
              console.log('AppContext: Token refreshed successfully');
            } catch (refreshErr) {
              console.error('AppContext: Token refresh failed:', refreshErr);
              setIsLoggedIn(false);
              setToken('');
              setUsername('');
              setUserId('');
              localStorage.removeItem('token');
              localStorage.removeItem('username');
              localStorage.removeItem('userId');
              localStorage.removeItem('uid');
              const publicRoutes = ['/login', '/register', '/square'];
              if (!publicRoutes.includes(location.pathname)) {
                navigate('/login', { replace: true });
              }
            }
          } else if (err.response?.status === 401 || err.response?.status === 403) {
            // 明确鉴权失败，才清除并跳转
            setIsLoggedIn(false);
            setToken('');
            setUsername('');
            setUserId('');
            setUid('');
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            localStorage.removeItem('userId');
            localStorage.removeItem('role');
            localStorage.removeItem('role');
            localStorage.removeItem('uid');
            const publicRoutes = ['/login', '/register', '/square'];
            if (!publicRoutes.includes(location.pathname)) {
              navigate('/login', { replace: true });
            }
          } else {
            // 网络或 5xx 等非鉴权错误：保留登录状态与 token，不做跳转
            console.warn('AppContext: Non-auth error during verification, keeping session.');
          }
        }
      } else {
        setIsLoggedIn(false);
        const publicRoutes = ['/login', '/register', '/square'];
        if (!publicRoutes.includes(location.pathname)) {
          navigate('/login', { replace: true });
        }
      }
      setAuthLoading(false);
    };

    verifyToken();
  }, [location.pathname, navigate]);

  // 全局注入/清理 Authorization 头，确保刷新后也能携带 token
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  return (
    <AppContext.Provider
      value={{
        isLoggedIn,
        setIsLoggedIn,
        authLoading,
        token,
        setToken,
        username,
        setUsername,
        userId,
        setUserId,
        uid,
        setUid,
        notes,
        setNotes,
        uploads,
        setUploads,
        files,
        setFiles,
        publicNotes,
        setPublicNotes,
        publicBiographies,
        setPublicBiographies,
        memos,
        setMemos,
        familyMembers,
        setFamilyMembers,
        familyRequests,
        setFamilyRequests,
        error,
        setError,
        questions,
        setQuestions,
        answers,
        setAnswers,
        freeBiography,
        setFreeBiography,
        lang,
        setLang,
        t,
        role,
        setRole,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};