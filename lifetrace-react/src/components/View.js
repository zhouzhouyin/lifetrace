import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { AppContext } from '../context/AppContext';

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

// 清理用户输入，防止 XSS
const sanitizeInput = (input) => {
  return input.replace(/[<>"'&]/g, '');
};

const View = () => {
  const { isLoggedIn, setIsLoggedIn, notes, setNotes, setError, username } = useContext(AppContext);
  const { id } = useParams();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [sections, setSections] = useState([]);
  const [summary, setSummary] = useState('');
  const [readOnly, setReadOnly] = useState(true);
  const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5002';
  const [mediaFallbackSrc, setMediaFallbackSrc] = useState({}); // key: `${idx}-${mi}` -> blobUrl

  const withBase = (url) => {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('/Uploads/') || url.startsWith('/uploads/')) return `${API_BASE}${url}`;
    return url;
  };

  const loadWithAuthAsBlob = async (relativeOrAbsoluteUrl) => {
    try {
      const token = localStorage.getItem('token');
      const isAbsolute = /^https?:\/\//i.test(relativeOrAbsoluteUrl);
      const url = isAbsolute ? relativeOrAbsoluteUrl : `${API_BASE}${relativeOrAbsoluteUrl}`;
      const resp = await axios.get(url, { responseType: 'blob', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      return URL.createObjectURL(resp.data);
    } catch (e) {
      return '';
    }
  };
  const [isPublic, setIsPublic] = useState(false);
  const [noteType, setNoteType] = useState('Note');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // 验证登录状态和加载笔记
  useEffect(() => {
    if (!isLoggedIn) {
      setMessage('请先登录以查看或编辑内容');
      setError('请登录以继续');
      setTimeout(() => navigate('/login'), 1000);
      return;
    }
    if (!id || (!/^[0-9a-fA-F]{24}$/.test(id) && !id.startsWith('local-'))) {
      setMessage('无效的笔记 ID');
      setIsLoading(false);
      return;
    }

    const loadNote = async () => {
      setIsLoading(true);
      try {
        if (id.startsWith('local-')) {
          const localBiographies = JSON.parse(localStorage.getItem('localBiographies') || '[]');
          const note = localBiographies.find(n => n.id === id);
          if (note) {
            setTitle(note.title || '');
            setContent(note.content || '');
            setIsPublic(note.isPublic || false);
            setNoteType(note.type || 'Note');
            setMessage(`${note.type === 'Biography' ? '传记' : '随笔'}已从本地加载`);
          } else {
            setMessage(`本地${noteType === 'Biography' ? '传记' : '随笔'}不存在`);
          }
        } else {
          const token = localStorage.getItem('token');
          let noteData = null;
          try {
            const response = await retry(() => axios.get(`/api/note/${id}`, { headers: { Authorization: `Bearer ${token}` } }));
            noteData = response.data;
          } catch (e) {
            if (e.response?.status === 404 || e.response?.status === 403) {
              // 尝试家族只读访问
              const response2 = await retry(() => axios.get(`/api/family/note/${id}`, { headers: { Authorization: `Bearer ${token}` } }));
              noteData = response2.data;
              setReadOnly(true);
            } else throw e;
          }
          setTitle(noteData.title || '');
          setContent(noteData.content || '');
          setSections(Array.isArray(noteData.sections) ? noteData.sections : []);
          setSummary(noteData.summary || '');
          setIsPublic(noteData.isPublic || false);
          setNoteType(noteData.type || 'Note');
          setMessage(`${noteData.type === 'Biography' ? '传记' : '随笔'}已从云端加载`);
        }
      } catch (err) {
        console.error('Fetch note error:', err);
        if (err.response?.status === 404) {
          const note = notes.find(n => n.id === id);
          if (note) {
            setTitle(note.title || '');
            setContent(note.content || '');
            setIsPublic(note.isPublic || false);
            setNoteType(note.type || 'Note');
            setMessage(`${note.type === 'Biography' ? '传记' : '随笔'}不存在，已从本地加载`);
          } else {
            setMessage(`${noteType === 'Biography' ? '传记' : '随笔'}不存在`);
          }
        } else if (err.response?.status === 401 || err.response?.status === 403) {
          setMessage('身份验证失败，请重新登录');
          setError('身份验证失败，请重新登录');
          localStorage.removeItem('token');
          localStorage.removeItem('username');
          setIsLoggedIn(false);
          setTimeout(() => navigate('/login'), 1000);
        } else {
          setMessage(`加载${noteType === 'Biography' ? '传记' : '随笔'}失败：${err.response?.data?.message || err.message}`);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadNote();
  }, [id, isLoggedIn, setIsLoggedIn, setError, navigate, notes, noteType]);

  // 清除提示
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // 保存笔记（按章节结构）
  const handleSave = async () => {
    if (!title.trim()) {
      setMessage('标题不能为空');
      return;
    }
    setIsSaving(true);
    try {
      if (id.startsWith('local-')) {
        const localBiographies = JSON.parse(localStorage.getItem('localBiographies') || '[]');
        const updatedBiographies = localBiographies.map(n =>
          n.id === id
            ? { ...n, title: sanitizeInput(title), content: sanitizeInput(content), sections, isPublic, type: noteType, username }
            : n
        );
        localStorage.setItem('localBiographies', JSON.stringify(updatedBiographies));
        setNotes(prev =>
          prev.map(n =>
            n.id === id
              ? { ...n, title: sanitizeInput(title), content: sanitizeInput(content), sections, isPublic, type: noteType, username }
              : n
          )
        );
        setMessage('本地传记已更新');
      } else {
        const token = localStorage.getItem('token');
        await retry(() =>
          axios.put(
            `/api/note/${id}`,
            {
              title: sanitizeInput(title),
              content: sanitizeInput(content),
              sections,
              isPublic,
              type: noteType,
              username,
            },
            { headers: { Authorization: `Bearer ${token}` } }
          )
        );
        setNotes(prev =>
          prev.map(n =>
            n.id === id
              ? { ...n, title: sanitizeInput(title), content: sanitizeInput(content), sections, isPublic, type: noteType, username }
              : n
          )
        );
        setMessage('云端传记已更新');
      }
    } catch (err) {
      console.error('Save note error:', err);
      if (err.response?.status === 401 || err.response?.status === 403) {
        setMessage('身份验证失败，请重新登录');
        setError('身份验证失败，请重新登录');
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        setIsLoggedIn(false);
        setTimeout(() => navigate('/login'), 1000);
      } else {
        setMessage(`保存${noteType === 'Biography' ? '传记' : '随笔'}失败：${err.response?.data?.message || err.message}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="card max-w-2xl w-full p-6">
        <Helmet>
          <title>{readOnly ? '查看' : '编辑'}{noteType === 'Biography' ? '传记' : '随笔'} - 永念</title>
        </Helmet>
        <h2 className="text-2xl font-bold text-center mb-6">{readOnly ? '查看' : '编辑'}{noteType === 'Biography' ? '传记' : '随笔'}</h2>
        {message && (
          <div className={`mb-4 p-2 text-center text-white rounded ${message.includes('失败') || message.includes('不存在') || message.includes('无效') ? 'bg-red-500' : 'bg-green-500'}`}>
            {message}
          </div>
        )}
        {isLoading ? (
          <div className="text-center">加载中...</div>
        ) : (
          <div className="space-y-4">
            {/* 顶部操作 */}
            <div className="flex justify-between items-center">
              <input
                type="text"
                className="input w-2/3"
                value={title}
                onChange={(e) => setTitle(sanitizeInput(e.target.value))}
                disabled={readOnly || isSaving}
                placeholder="请输入标题"
              />
              <div className="flex gap-2">
                {!readOnly ? (
                  <button className="btn bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={isSaving}>{isSaving ? '保存中...' : '保存'}</button>
                ) : (
                  <>
                    <button className="btn" onClick={() => setReadOnly(false)}>编辑</button>
                    <button className="btn" onClick={() => navigate('/create', { state: { editNoteId: id } })}>在创建页继续编辑</button>
                  </>
                )}
                <button className="btn bg-gray-500 hover:bg-gray-600" onClick={() => navigate(-1)} disabled={isSaving}>返回</button>
              </div>
            </div>

            {/* 预览样式（图文并茂，禁止编辑） */}
            {readOnly ? (
              <div className="space-y-6">
                {summary && (
                  <div className="border-b pb-4">
                    <h4 className="text-lg font-semibold mb-2">传记简介</h4>
                    <p className="whitespace-pre-wrap text-gray-800">{summary}</p>
                  </div>
                )}
                {Array.isArray(sections) && sections.length > 0 ? (
                  sections.map((sec, idx) => (
                    <article key={idx} className="border-b pb-4">
                      {sec.title && <h4 className="text-lg font-semibold mb-2">{sec.title}</h4>}
                      {sec.text && <p className="whitespace-pre-wrap text-gray-800">{sec.text}</p>}
                      {Array.isArray(sec.media) && sec.media.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
                          {sec.media.map((m, mi) => (
                            <div key={mi} className="border rounded overflow-hidden">
                              {m.type === 'image' && (
                                <img
                                  src={mediaFallbackSrc[`${idx}-${mi}`] || withBase(m.url)}
                                  alt={m.desc || ''}
                                  className="w-full h-32 object-cover"
                                  onError={async () => {
                                    if (!mediaFallbackSrc[`${idx}-${mi}`]) {
                                      const blob = await loadWithAuthAsBlob(m.url);
                                      if (blob) setMediaFallbackSrc(prev => ({ ...prev, [`${idx}-${mi}`]: blob }));
                                    }
                                  }}
                                />
                              )}
                              {m.type === 'video' && (
                                <video
                                  src={mediaFallbackSrc[`${idx}-${mi}`] || withBase(m.url)}
                                  className="w-full h-32 object-cover"
                                  controls
                                  onError={async () => {
                                    if (!mediaFallbackSrc[`${idx}-${mi}`]) {
                                      const blob = await loadWithAuthAsBlob(m.url);
                                      if (blob) setMediaFallbackSrc(prev => ({ ...prev, [`${idx}-${mi}`]: blob }));
                                    }
                                  }}
                                />
                              )}
                              {m.type === 'audio' && (
                                <audio
                                  src={mediaFallbackSrc[`${idx}-${mi}`] || withBase(m.url)}
                                  className="w-full"
                                  controls
                                  onError={async () => {
                                    if (!mediaFallbackSrc[`${idx}-${mi}`]) {
                                      const blob = await loadWithAuthAsBlob(m.url);
                                      if (blob) setMediaFallbackSrc(prev => ({ ...prev, [`${idx}-${mi}`]: blob }));
                                    }
                                  }}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  ))
                ) : (
                  content && <p className="whitespace-pre-wrap text-gray-800">{content}</p>
                )}
              </div>
            ) : (
              // 简易编辑模式：仅编辑各章文本（媒体编辑可回到创建页）
              <div className="space-y-4">
                {sections.map((sec, idx) => (
                  <div key={idx} className="border rounded p-3">
                    <input className="input w-full mb-2" value={sec.title || ''} onChange={(e) => setSections(prev => prev.map((s,i)=> i===idx ? { ...s, title: sanitizeInput(e.target.value) } : s))} placeholder={`篇章${idx+1} 标题（可选）`} />
                    <textarea className="input h-24 w-full" value={sec.text || ''} onChange={(e) => setSections(prev => prev.map((s,i)=> i===idx ? { ...s, text: sanitizeInput(e.target.value) } : s))} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default View;