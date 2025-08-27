import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import axios from 'axios';
import { AppContext } from '../context/AppContext';

// 轻量化“随手记”：文本/照片/视频/音频 + 标签，按时间线展示
const Memo = () => {
  const { isLoggedIn, setError, username, setMemos: setGlobalMemos } = useContext(AppContext);
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [text, setText] = useState('');
  const [tagsInput, setTagsInput] = useState(''); // 以空格或#分隔，回车添加
  const [tags, setTags] = useState(['当下']);
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [memos, setMemos] = useState([]);
  const subjectVersion = useMemo(() => { try { return Number(localStorage.getItem('subject_version') || '0') || 0; } catch(_) { return 0; } }, []);
  const [shareToFamily, setShareToFamily] = useState(false);
  const lifeStages = ['童年','少年','青年','成年','中年','当下','未来愿望'];
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef(null);

  // 登录校验
  useEffect(() => {
    if (!isLoggedIn) {
      setError('请登录以继续');
      navigate('/login');
    }
  }, [isLoggedIn, setError, navigate]);

  // 初始加载随手记（云端）
  useEffect(() => {
    const fetchMemos = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;
      try {
        const res = await axios.get('/api/memos', { headers: { Authorization: `Bearer ${token}` } });
        const list = Array.isArray(res.data) ? res.data : [];
        // 兜底：按时间倒序
        setMemos(list.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)));
      } catch (err) {
        // 若接口不存在，则容错为空
        console.warn('Fetch memos failed or not implemented:', err?.response?.status, err?.message);
      }
    };
    fetchMemos();
  }, []);

  // 本地预览
  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    setMediaFile(f || null);
    try { setMediaPreview(f ? URL.createObjectURL(f) : ''); } catch (_) {}
  };

  // 标签输入解析：支持 #旅行 #童年 或 旅行 童年（首个 # 自动补全显示）
  const parseTags = (s) => {
    return (s || '')
      .split(/[#\s]+/)
      .map(x => x.trim())
      .filter(Boolean)
      .slice(0, 5);
  };

  const addTagsFromInput = () => {
    const next = Array.from(new Set([ ...tags, ...parseTags(tagsInput) ])).slice(0, 8);
    setTags(next);
    setTagsInput('');
  };

  const removeTag = (t) => setTags(prev => prev.filter(x => x !== t));

  const canSubmit = useMemo(() => {
    return (text || '').trim().length > 0 || !!mediaFile;
  }, [text, mediaFile]);

  // 语音输入：直接把识别结果追加到文本框
  const handleVoiceInput = () => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      setMessage('当前浏览器不支持语音输入，请使用 Chrome/Edge 最新版');
      return;
    }
    if (isRecording) {
      try { recognitionRef.current && recognitionRef.current.stop(); } catch (_) {}
      setIsRecording(false);
      return;
    }
    try {
      const rec = new SpeechRec();
      recognitionRef.current = rec;
      rec.lang = 'zh-CN';
      rec.onresult = (e) => {
        const content = (e.results?.[0]?.[0]?.transcript || '').toString();
        setText(prev => (prev ? prev + ' ' + content : content));
      };
      rec.onerror = () => setMessage('语音识别失败，请检查麦克风或重试');
      rec.onend = () => setIsRecording(false);
      setIsRecording(true);
      rec.start();
    } catch (e) {
      setMessage('语音识别不可用');
    }
  };

  // 提交随手记
  const handleSubmit = async () => {
    if (!canSubmit || uploading) return;
    const token = localStorage.getItem('token');
    if (!token) { setMessage('请先登录'); navigate('/login'); return; }
    setUploading(true);
    try {
      let uploadedUrl = '';
      let mediaType = '';
      if (mediaFile) {
        const form = new FormData();
        form.append('file', mediaFile);
        form.append('desc', text.slice(0, 200));
        const res = await axios.post('/api/upload', form, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } });
        uploadedUrl = res.data?.filePath || '';
        const mt = (mediaFile.type || '').toLowerCase();
        if (mt.startsWith('image/')) mediaType = 'image';
        else if (mt.startsWith('video/')) mediaType = 'video';
        else if (mt.startsWith('audio/')) mediaType = 'audio';
        else mediaType = 'image';
      }

      // 后端保存随手记（若未实现则忽略错误并仅本地展示）
      let created = null;
      try {
        const resp = await axios.post('/api/memo', {
          text: text.trim(),
          tags,
          media: uploadedUrl ? [{ type: mediaType, url: uploadedUrl }] : [],
          shareToFamily: !!shareToFamily,
          subjectVersion: String(subjectVersion),
        }, { headers: { Authorization: `Bearer ${token}` } });
        created = resp.data;
      } catch (e) {
        // 容错：本地构造一条
        created = {
          id: `local-${Date.now()}`,
          username: username || (localStorage.getItem('username') || 'unknown'),
          text: text.trim(),
          tags,
          media: uploadedUrl ? [{ type: mediaType, url: uploadedUrl }] : [],
          timestamp: new Date().toISOString(),
          subjectVersion: String(subjectVersion),
        };
      }
      setMemos(prev => [ created, ...prev ]);
      try { setGlobalMemos && setGlobalMemos(prev => [ created, ...(Array.isArray(prev)?prev:[]) ]); } catch (_) {}
      setText(''); setTags([]); setTagsInput(''); setMediaFile(null); setMediaPreview('');
      setMessage('已记录');
      setTimeout(() => setMessage(''), 1500);
    } catch (err) {
      setMessage('提交失败：' + (err?.response?.data?.message || err?.message));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Helmet>
        <title>随手记 - 永念</title>
      </Helmet>
      <div className="max-w-3xl mx-auto">
        <div className="card p-4 sm:p-6">
          <h2 className="text-2xl font-bold mb-1 text-center">随手记</h2>
          <p className="text-sm text-center mb-4 text-gray-700">像发朋友圈一样，轻轻记下一个瞬间。</p>
          {message && (
            <div className={`mb-4 p-2 text-center rounded ${message.includes('失败') ? 'bg-red-700' : 'bg-green-700'}`} style={{ color: '#e7c36f' }}>{message}</div>
          )}

          <textarea
            className="input w-full mb-3"
            placeholder="此刻想说点什么……"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            rows={4}
          />

          <div className="flex flex-wrap gap-2 mb-3">
            <input
              type="text"
              className="input flex-1 min-w-[200px]"
              placeholder="添加标签，如 #旅行 #童年 或 旅行 童年"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTagsFromInput(); } }}
            />
            <button className="btn btn-secondary" onClick={addTagsFromInput}>添加标签</button>
          </div>
          {tags.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {tags.map(t => (
                <span key={t} className="px-2 py-1 rounded-full text-sm bg-blue-100 text-blue-800 border border-blue-200">
                  #{t}
                  <button className="ml-1 text-blue-700" onClick={() => removeTag(t)}>×</button>
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 mb-4">
            <label className="btn btn-secondary inline-flex items-center justify-center">
              添加图片/视频/音频
              <input type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={handleFileChange} />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-800">
              <input type="checkbox" checked={shareToFamily} onChange={(e) => setShareToFamily(e.target.checked)} />
              上传到家族档案
            </label>
            <button className="btn btn-tertiary" onClick={handleVoiceInput}>{isRecording ? '停止录音' : '语音输入'}</button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={!canSubmit || uploading}>{uploading ? '保存中…' : '保存'}</button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                try {
                  const raw = localStorage.getItem('dailyPasteboard');
                  const obj = raw ? JSON.parse(raw) : { items: [] };
                  (memos || []).forEach(m => {
                    const tags = Array.isArray(m.tags) ? m.tags : [];
                    // 每日回首：根据阶段标签落章
                    if (tags.includes('每日回首')) {
                      const idx = lifeStages.findIndex(s => tags.includes(s));
                      if (idx < 0) return;
                      const text = (m.text || '').toString();
                      let q = '', a = '';
                      const mq = text.match(/问题：([\s\S]*?)\n/);
                      if (mq) q = (mq[1] || '').trim();
                      const ma = text.match(/回答：([\s\S]*)/);
                      if (ma) a = (ma[1] || '').trim();
                      const line = `陪伴师：${q || '（每日回首）'}\n我：${a || ''}`;
                      obj.items.push({ stageIndex: idx, text: line });
                    } else {
                      // 普通随手记：第一个标签为阶段；默认当下
                      let stageIdx = lifeStages.indexOf(tags[0] || '当下');
                      if (stageIdx < 0) stageIdx = lifeStages.indexOf('当下');
                      const line = (m.text || '').toString();
                      const add = line ? `我：${line}` : '我：这是一条当下的记录。';
                      obj.items.push({ stageIndex: Math.max(0, stageIdx), text: add });
                    }
                  });
                  localStorage.setItem('dailyPasteboard', JSON.stringify(obj));
                  navigate('/create');
                } catch (_) {
                  navigate('/create');
                }
              }}
            >
              整理成回忆
            </button>
          </div>

          {mediaPreview && (
            <div className="mb-4">
              {mediaFile?.type?.startsWith('image/') ? (
                <img src={mediaPreview} alt="预览" className="w-full h-44 object-cover rounded" />
              ) : mediaFile?.type?.startsWith('video/') ? (
                <video src={mediaPreview} controls className="w-full h-44 object-cover rounded" />
              ) : (
                <audio src={mediaPreview} controls className="w-full" />
              )}
            </div>
          )}
        </div>

        {/* 时间线 */}
        <div className="mt-6 space-y-3">
          {memos.map((m) => (
            <div key={m.id || m._id} className="card p-4" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 60%)', borderColor: '#e5e7eb' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium text-gray-800">{m.username || username || '我'}</div>
                <div className="text-sm text-gray-600">{new Date(m.timestamp || Date.now()).toLocaleString('zh-CN')}</div>
              </div>
              {(m.tags || []).length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {m.tags.map((t) => (
                    <span key={t} className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800 border border-blue-200">#{t}</span>
                  ))}
                </div>
              )}
              {m.text && <p className="whitespace-pre-wrap text-gray-800 mb-2">{m.text}</p>}
              {Array.isArray(m.media) && m.media.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {m.media.map((mm, i) => (
                    <div key={i} className="border rounded overflow-hidden">
                      {mm.type === 'image' && <img src={mm.url} alt="" className="w-full h-32 object-cover" />}
                      {mm.type === 'video' && <video src={mm.url} className="w-full h-32 object-cover" controls />}
                      {mm.type === 'audio' && <audio src={mm.url} className="w-full" controls />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {memos.length === 0 && (
            <div className="text-center text-gray-600">还没有记录，从上面开始写下第一条吧。</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Memo;


