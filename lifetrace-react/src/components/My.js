import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { AppContext } from '../context/AppContext';

// 防抖函数
const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

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

const My = () => {
  const {
    isLoggedIn,
    setIsLoggedIn,
    uploads: cloudNotes,
    setUploads: setCloudNotes,
    files,
    setFiles,
    notes: localNotes,
    setNotes: setLocalNotes,
    setError,
    username,
    memos,
    setMemos,
  } = useContext(AppContext);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const navigate = useNavigate();

  const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5002';
  const [mediaFallbackSrc, setMediaFallbackSrc] = useState({}); // id -> blob url
  const withBase = (url) => {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('/Uploads/') || url.startsWith('/uploads/')) return `${API_BASE}${url}`;
    return url;
  };

  const loadWithAuthAsBlob = async (relativePath) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE}${relativePath}`, {
        responseType: 'blob',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const blobUrl = URL.createObjectURL(response.data);
      return blobUrl;
    } catch (error) {
      console.error('My.js: loadWithAuthAsBlob failed:', error);
      return '';
    }
  };

  // 验证登录状态
  useEffect(() => {
    if (!isLoggedIn) {
      setMessage('请先登录以查看您的内容');
      setError('请登录以继续');
      setTimeout(() => navigate('/login'), 1000);
    }
  }, [isLoggedIn, setError, navigate]);

  // 标签到阶段解析（与 Memo.js 保持一致，含同义词）
  const resolveStageIndexFromTags = (tagList = []) => {
    const stages = ['童年','少年','青年','成年','中年','当下','未来愿望'];
    const tags = (Array.isArray(tagList) ? tagList : []).map(String);
    const synonyms = [
      ['童年','小时候','孩提','童年时代','小学','幼年'],
      ['少年','中学','初中','高中','少时','少年的'],
      ['青年','大学','恋爱','工作初期','求职','毕业'],
      ['成年','成家','婚后','事业','职场','为人父母','婚姻'],
      ['中年','孩子成长','转折','中年的'],
      ['当下','今天','此刻','现在','近期','每日回首'],
      ['未来愿望','愿望','未来','目标','计划','心愿']
    ];
    for (let i = 0; i < stages.length; i++) {
      if (tags.includes(stages[i])) return i;
    }
    for (let i = 0; i < synonyms.length; i++) {
      if (synonyms[i].some(s => tags.some(t => t.includes(s)))) return i;
    }
    return stages.indexOf('当下');
  };

  // 获取用户笔记、传记和上传文件
  useEffect(() => {
    const fetchData = debounce(async () => {
      if (!isLoggedIn) return;
      setIsLoading(true);

      const token = localStorage.getItem('token');
      if (!token) {
        setMessage('未找到登录令牌，请重新登录');
        setIsLoading(false);
        setTimeout(() => navigate('/login'), 1000);
        return;
      }

      // 获取本地传记
      const localBiographies = JSON.parse(localStorage.getItem('localBiographies') || '[]').map(
        bio => ({
          ...bio,
          username: localStorage.getItem('username') || 'unknown',
        })
      );
      const validLocalBiographies = localBiographies.filter(
        bio => bio.id && bio.type === 'Biography' && bio.cloudStatus === 'Not Uploaded'
      );
      console.log('My.js: Local biographies:', validLocalBiographies);
      setLocalNotes(validLocalBiographies);

      // 获取云端笔记/传记
      try {
        const response = await retry(() =>
          axios.get('/api/notes', {
            headers: { Authorization: `Bearer ${token}` },
          })
        );
        const fetchedNotes = response.data
          .filter(note => note.id && /^[0-9a-fA-F]{24}$/.test(note.id))
          .map(note => ({
            ...note,
            cloudStatus: 'Uploaded',
            username: note.username || localStorage.getItem('username') || 'unknown',
          }));
        console.log('My.js: Raw API response for notes:', response.data);
        console.log('My.js: Fetched notes:', fetchedNotes);
        setCloudNotes(fetchedNotes.filter(note => note.type === 'Biography' || note.type === 'Note'));
        if (fetchedNotes.length === 0 && validLocalBiographies.length === 0) {
          setMessage('暂无笔记或传记');
        }
      } catch (err) {
        console.error('My.js: Fetch notes error:', err);
        if (err.response?.status === 401 || err.response?.status === 403) {
          setMessage('身份验证失败，请重新登录');
          setError('身份验证失败，请重新登录');
          localStorage.removeItem('token');
          localStorage.removeItem('username');
          setIsLoggedIn(false);
          setTimeout(() => navigate('/login'), 1000);
        } else {
          setMessage('加载笔记失败：' + (err.response?.data?.message || err.message));
          setError(err.response?.data?.message || err.message);
        }
      }

      // 获取我的收藏
      try {
        const favRes = await retry(() =>
          axios.get('/api/favorites', { headers: { Authorization: `Bearer ${token}` } })
        );
        const favs = (favRes.data || []).filter(n => n && n.id);
        setFavorites(favs);
      } catch (err) {
        console.error('My.js: Fetch favorites error:', err);
      }

      // 获取上传文件
      // 获取我的随手记（云端优先，合并离线，避免返回后“清空”）
      try {
        const token2 = localStorage.getItem('token');
        const resMemos = await retry(() =>
          axios.get('/api/memos', { headers: { Authorization: `Bearer ${token2}` } })
        );
        const serverList = Array.isArray(resMemos.data) ? resMemos.data : [];
        let offline = [];
        try {
          const scope = (localStorage.getItem('uid') || localStorage.getItem('username') || 'anon');
          const subj = localStorage.getItem('subject_version') || '0';
          offline = JSON.parse(localStorage.getItem(`memos_offline_${scope}_${subj}`) || '[]');
        } catch(_) {}
        const merged = [
          ...serverList,
          ...offline.filter(o => !serverList.find(s => (s.id||s._id) === (o.id||o._id)))
        ].sort((a,b) => new Date(b.timestamp||0) - new Date(a.timestamp||0));
        setMemos(merged);
      } catch (err) {
        console.error('My.js: Fetch memos error:', err);
        // 回退离线
        try {
          const scope = (localStorage.getItem('uid') || localStorage.getItem('username') || 'anon');
          const subj = localStorage.getItem('subject_version') || '0';
          const offline = JSON.parse(localStorage.getItem(`memos_offline_${scope}_${subj}`) || '[]');
          if (Array.isArray(offline)) setMemos(offline);
        } catch(_) {}
      }
      try {
        const response = await retry(() =>
          axios.get('/api/uploads', {
            headers: { Authorization: `Bearer ${token}` },
          })
        );
        const fetchedFiles = response.data
          .filter(file => file.id && /^[0-9a-fA-F]{24}$/.test(file.id))
          .map(file => ({
            ...file,
            filePath: file.filePath.startsWith('/Uploads/') 
              ? file.filePath 
              : `/Uploads/${file.filePath.replace(/^\/?Uploads\//, '')}`
          }));
        console.log('My.js: Raw API response for uploads:', response.data);
        console.log('My.js: Fetched uploads:', fetchedFiles);
        setFiles(fetchedFiles);
        if (fetchedFiles.length === 0) {
          setMessage('暂无上传文件');
        }
      } catch (err) {
        console.error('My.js: Fetch uploads error:', err);
        if (err.response?.status === 401 || err.response?.status === 403) {
          setMessage('身份验证失败，请重新登录');
          setError('身份验证失败，请重新登录');
          localStorage.removeItem('token');
          localStorage.removeItem('username');
          setIsLoggedIn(false);
          setTimeout(() => navigate('/login'), 1000);
        } else {
          setMessage('加载文件失败：' + (err.response?.data?.message || err.message));
          setError(err.response?.data?.message || err.message);
        }
      } finally {
        setIsLoading(false);
      }
    }, 1000);

    fetchData();
  }, [isLoggedIn, setCloudNotes, setLocalNotes, setFiles, setError, setIsLoggedIn, navigate]);

  // 清除提示
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // 处理生成永恒印记
  const handleGenerateMark = () => {
    setMessage('联系我们帮助您生成永恒印记，包括生成实体书、实体影集、时光胶囊、实体电子墓碑等');
    setTimeout(() => navigate('/contact'), 1000);
  };

  // 重置记录对象（防错提示）
  const handleResetSubject = () => {
    const ok = window.confirm('重要提示：重置记录对象后，之前的随手记将被“隔离”（仅可查看与删除，无法再落章）。请先完成当前对象的回忆整理，再开始新的对象。是否继续？');
    if (!ok) return;
    try {
      const oldVersion = Number(localStorage.getItem('subject_version') || '0') || 0;
      try { localStorage.setItem('subject_version', String(oldVersion + 1)); } catch(_) {}
      localStorage.removeItem('author_mode');
      localStorage.removeItem('author_relation');
      localStorage.removeItem('record_profile');
      // 后端同步重置
      try { const token = localStorage.getItem('token'); axios.delete('/api/record-subject', { headers: { Authorization: `Bearer ${token}` } }).catch(()=>{}); } catch (_) {}
      setMessage('已重置记录对象。请返回首页重新选择。');
      setTimeout(() => setMessage(''), 1600);
    } catch (_) {}
  };

  // 删除笔记
  const handleDeleteNote = async (noteId) => {
    if (!noteId || (!/^[0-9a-fA-F]{24}$/.test(noteId) && !noteId.startsWith('local-'))) {
      setMessage('无效的笔记 ID');
      return;
    }
    setIsLoading(true);
    try {
      if (noteId.startsWith('local-')) {
        const localBiographies = JSON.parse(localStorage.getItem('localBiographies') || '[]');
        const updatedBiographies = localBiographies.filter(bio => bio.id !== noteId);
        localStorage.setItem('localBiographies', JSON.stringify(updatedBiographies));
        setLocalNotes(prev => prev.filter(note => note.id !== noteId));
        setMessage('本地传记删除成功');
      } else {
        const token = localStorage.getItem('token');
        await retry(() =>
          axios.delete(`/api/note/${noteId}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
        );
        setCloudNotes(prev => prev.filter(note => note.id !== noteId));
        setMessage('云端传记删除成功');
      }
    } catch (err) {
      console.error('My.js: Delete note error:', err);
      if (err.response?.status === 401 || err.response?.status === 403) {
        setMessage('身份验证失败，请重新登录');
        setError('身份验证失败，请重新登录');
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        setIsLoggedIn(false);
        setTimeout(() => navigate('/login'), 1000);
      } else {
        setMessage('删除失败：' + (err.response?.data?.message || err.message));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 删除文件
  const handleDeleteFile = async (fileId) => {
    if (!fileId || !/^[0-9a-fA-F]{24}$/.test(fileId)) {
      setMessage('无效的文件 ID');
      return;
    }
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      console.log('My.js: Deleting file with ID:', fileId);
      await retry(() =>
        axios.delete(`/api/upload/${fileId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      );
      setFiles(prev => prev.filter(file => file.id !== fileId));
      setMessage('文件删除成功');
    } catch (err) {
      console.error('My.js: Delete file error:', err);
      if (err.response?.status === 401 || err.response?.status === 403) {
        setMessage('身份验证失败，请重新登录');
        setError('身份验证失败，请重新登录');
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        setIsLoggedIn(false);
        setTimeout(() => navigate('/login'), 1000);
      } else if (err.response?.status === 409) {
        setMessage('删除文件失败：' + (err.response?.data?.message || '该文件正在被传记引用，请先在传记中移除该媒体后再删除'));
      } else {
        setMessage('删除文件失败：' + (err.response?.data?.message || err.message));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 查看笔记
  const handleViewNote = (noteId, type) => {
    if (!noteId || (!/^[0-9a-fA-F]{24}$/.test(noteId) && !noteId.startsWith('local-'))) {
      setMessage(`无效的${type === 'Biography' ? '传记' : '随笔'} ID`);
      return;
    }
    console.log('My.js: Navigating to view note with ID:', noteId);
    navigate(`/view/${noteId}`);
  };

  // 查看文件
  const handleViewFile = (fileId) => {
    if (!fileId || !/^[0-9a-fA-F]{24}$/.test(fileId)) {
      setMessage('无效的文件 ID');
      return;
    }
    console.log('My.js: Navigating to view file with ID:', fileId);
    navigate(`/view-file/${fileId}`);
  };

  // 编辑笔记
  const handleEditNote = (noteId, type) => {
    if (!noteId || (!/^[0-9a-fA-F]{24}$/.test(noteId) && !noteId.startsWith('local-'))) {
      setMessage(`无效的${type === 'Biography' ? '传记' : '随笔'} ID`);
      return;
    }
    console.log('My.js: Navigating to re-edit biography with ID:', noteId);
    navigate('/create', { state: { editNoteId: noteId } });
  };

  // 分组文件
  const photos = files.filter(file => file.filePath && file.filePath.match(/\.(jpeg|jpg|png|gif)$/i));
  const videos = files.filter(file => file.filePath && file.filePath.match(/\.(mp4|webm|ogg)$/i));
  const audios = files.filter(file => file.filePath && file.filePath.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/i));
  const biographies = cloudNotes.filter(
    note => note.type === 'Biography' && note.username === username
  );
  // 已移除“我的随笔”展示

  return (
    <div className="flex flex-col items-center min-h-screen p-4">
      <div className="card max-w-2xl w-full p-6" style={{ background: 'linear-gradient(135deg, #dbeafe 0%, #ffffff 40%)', borderColor: '#e5e7eb' }}>
        <Helmet>
          <title>我的主页 - 永念</title>
        </Helmet>
        <h2 className="text-2xl font-bold text-center mb-1">我的主页</h2>
        <p className="text-sm text-center mb-5 text-gray-700">将散落的点滴收在一处，留给未来的人。</p>
        {message && (
          <div className={`mb-4 p-2 text-center rounded ${message.includes('失败') || message.includes('无效') ? 'bg-red-700' : 'bg-green-700'}`} style={{ color: '#e7c36f' }}>
            {message}
          </div>
        )}
        {isLoading ? (
          <div className="text-center">加载中...</div>
        ) : (
          <div className="space-y-6">
            <div className="card p-4" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 60%)', borderColor: '#e5e7eb' }}>
              <h3 className="text-xl font-semibold mb-2">记录对象</h3>
              <p className="text-sm text-gray-700 mb-2">若要为另一位亲人记录，请先完成当前回忆整理，再重置以避免内容混淆。</p>
              <button className="btn btn-secondary" onClick={handleResetSubject}>重置记录对象</button>
            </div>
            {/* 我的随手记 */}
            <div>
              <h3 className="text-xl font-semibold mb-2">我的随手记</h3>
              {Array.isArray(memos) && memos.length > 0 ? (
                memos.map((m) => (
                  <div key={m.id || m._id} className="card p-4" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 60%)', borderColor: '#e5e7eb' }}>
                    <p className="text-gray-800 whitespace-pre-wrap">{m.text || ''}</p>
                    {(Array.isArray(m.tags) && m.tags.length > 0) && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {m.tags.map((t) => (
                          <span key={t} className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800 border border-blue-200">#{t}</span>
                        ))}
                      </div>
                    )}
                    {Array.isArray(m.media) && m.media.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
                        {m.media.map((mm, i) => (
                          <div key={i} className="border rounded overflow-hidden">
                            {mm.type === 'image' && <img src={mm.url} alt="" className="w-full h-32 object-cover" />}
                            {mm.type === 'video' && <video src={mm.url} className="w-full h-32 object-cover" controls />}
                            {mm.type === 'audio' && <audio src={mm.url} className="w-full" controls />}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-sm text-gray-600">{new Date(m.timestamp || Date.now()).toLocaleString('zh-CN')}</p>
                      {(() => {
                        const currentVersion = Number(localStorage.getItem('subject_version') || '0') || 0;
                        const memoVersion = Number(m.subjectVersion || '0') || 0;
                        const isolated = memoVersion !== currentVersion; // 版本不一致则隔离
                        if (isolated) return (
                          <span className="text-xs text-gray-500">（已隔离，无法落章）</span>
                        );
                        if (Array.isArray(m.tags) && m.tags.includes('每日回首')) return (
                        <button
                          className="btn btn-secondary"
                          onClick={() => {
                            try {
                              const tags = Array.isArray(m.tags) ? m.tags : [];
                              const stageIdx = resolveStageIndexFromTags(tags);
                              const text = (m.text || '').toString();
                              let q = '', a = '';
                              const mq = text.match(/问题：([\s\S]*?)\n/);
                              if (mq) q = (mq[1] || '').trim();
                              const ma = text.match(/回答：([\s\S]*)/);
                              if (ma) a = (ma[1] || '').trim();
                              const line = `陪伴师：${q || '（每日回首）'}\n我：${a || ''}`;
                              navigate('/create', { state: { pasteItems: [{ stageIndex: Math.max(0, stageIdx), text: line }] } });
                            } catch (_) {}
                          }}
                        >
                          加入回忆
                        </button>
                        );
                        // 非每日回首：以第一个标签作为目标阶段；默认“当下”
                        return (
                          <button
                            className="btn btn-secondary"
                            onClick={() => {
                              try {
                                const tags = Array.isArray(m.tags) ? m.tags : [];
                                const stageIdx = resolveStageIndexFromTags(tags);
                                const line = (m.text || '').toString();
                                const add = line ? `我：${line}` : '我：这是一条当下的记录。';
                                navigate('/create', { state: { pasteItems: [{ stageIndex: Math.max(0, stageIdx), text: add }] } });
                              } catch(_) {}
                            }}
                          >
                            落到篇章
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                ))
              ) : (
                <p>暂无随手记</p>
              )}
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2">我的传记</h3>
              {biographies.length > 0 ? (
                biographies.map((item) => (
                  <div key={item.id} className="card p-4" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 60%)', borderColor: '#e5e7eb' }}>
                    <h4 className="font-semibold">{item.title}</h4>
                    <p className="whitespace-pre-wrap text-gray-800">{(item.summary || item.content || '').substring(0, 150)}{(item.summary || item.content || '').length>150?'...':''}</p>
                    <p className="text-sm text-gray-600">
                      {item.username} | {new Date(item.timestamp).toLocaleString('zh-CN')} | {item.isPublic ? '(公开)' : '(私有)'} | {item.cloudStatus === 'Not Uploaded' ? '(本地)' : '(云端)'}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleViewNote(item.id, item.type)}
                        disabled={isLoading}
                      >
                        查看
                      </button>
                      {item.isPublic ? (
                        <button
                          className="btn btn-secondary"
                          onClick={async () => {
                            try {
                              const token = localStorage.getItem('token');
                              await axios.put(`/api/note/${item.id}/public`, { isPublic: false }, { headers: { Authorization: `Bearer ${token}` } });
                              setCloudNotes(prev => prev.map(n => n.id === item.id ? { ...n, isPublic: false } : n));
                              setMessage('已从广场撤销');
                            } catch (e) {
                              setMessage('撤销失败：' + (e.response?.data?.message || e.message));
                            }
                          }}
                          disabled={isLoading}
                        >
                          {/* 从广场撤销（隐藏） */}
                        </button>
                      ) : (
                        <button
                          className="btn btn-secondary"
                          onClick={async () => {
                            try {
                              const token = localStorage.getItem('token');
                              await axios.put(`/api/note/${item.id}/public`, { isPublic: true }, { headers: { Authorization: `Bearer ${token}` } });
                              setCloudNotes(prev => prev.map(n => n.id === item.id ? { ...n, isPublic: true } : n));
                              /* setMessage('已分享到广场'); */
                            } catch (e) {
                              setMessage('分享失败：' + (e.response?.data?.message || e.message));
                            }
                          }}
                          disabled={isLoading}
                        >
                          {/* 分享到广场（隐藏） */}
                        </button>
                      )}
                      {item.sharedWithFamily ? (
                        <button
                          className="btn btn-secondary"
                          onClick={async () => {
                            try {
                              const token = localStorage.getItem('token');
                              await axios.put(`/api/note/${item.id}/family-share`, { shared: false }, { headers: { Authorization: `Bearer ${token}` } });
                              setCloudNotes(prev => prev.map(n => n.id === item.id ? { ...n, sharedWithFamily: false } : n));
                              setMessage('已从家族撤销');
                            } catch (e) {
                              setMessage('撤销失败：' + (e.response?.data?.message || e.message));
                            }
                          }}
                          disabled={isLoading}
                        >
                          从家族档案撤销
                        </button>
                      ) : (
                        <button
                          className="btn btn-secondary"
                          onClick={async () => {
                            try {
                              const token = localStorage.getItem('token');
                              await axios.put(`/api/note/${item.id}/family-share`, { shared: true }, { headers: { Authorization: `Bearer ${token}` } });
                              setCloudNotes(prev => prev.map(n => n.id === item.id ? { ...n, sharedWithFamily: true } : n));
                              setMessage('已上传到家族档案');
                            } catch (e) {
                              setMessage('分享失败：' + (e.response?.data?.message || e.message));
                            }
                          }}
                          disabled={isLoading}
                        >
                          上传到家族档案
                        </button>
                      )}
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleEditNote(item.id, item.type)}
                        disabled={isLoading}
                      >
                        编辑
                      </button>
                      {/* 生成分享链接（在“我的”页隐藏，改在预览页进行） */}
                      <button
                        className="btn"
                        onClick={() => handleDeleteNote(item.id)}
                        disabled={isLoading}
                        style={{ backgroundColor: '#ef4444', borderColor: '#ef4444', color: '#fff' }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p>暂无传记</p>
              )}
            </div>
            {/* 我的收藏（隐藏） */}
            {/** “我的随笔”模块已移除 */}
            <div>
              <h3 className="text-xl font-semibold mb-2">我的相册</h3>
              {photos.length > 0 ? (
                photos.map(file => (
                  <div key={file.id} className="card p-4" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 60%)', borderColor: '#e5e7eb' }}>
                    <p>{file.desc || '无描述'}</p>
                    <p className="text-sm text-gray-600">
                      {new Date(file.timestamp).toLocaleString('zh-CN')}
                    </p>
                    <img
                      src={mediaFallbackSrc[file.id] || file.filePath}
                      alt={file.desc || '文件'}
                      className="w-full h-32 object-cover rounded mt-2"
                      onError={async () => {
                        if (!mediaFallbackSrc[file.id]) {
                          const blobUrl = await loadWithAuthAsBlob(file.filePath);
                          if (blobUrl) {
                            setMediaFallbackSrc((prev) => ({ ...prev, [file.id]: blobUrl }));
                            return;
                          }
                        }
                        setMessage('图片加载失败，请检查文件路径');
                      }}
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleViewFile(file.id)}
                        disabled={isLoading}
                      >
                        查看
                      </button>
                      <button
                        className="btn"
                        onClick={() => handleDeleteFile(file.id)}
                        disabled={isLoading}
                        style={{ backgroundColor: '#ef4444', borderColor: '#ef4444', color: '#fff' }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p>暂无相册</p>
              )}
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2">我的视频</h3>
              {videos.length > 0 ? (
                videos.map(file => (
                  <div key={file.id} className="card p-4" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 60%)', borderColor: '#e5e7eb' }}>
                    <p>{file.desc || '无描述'}</p>
                    <p className="text-sm text-gray-600">
                      {new Date(file.timestamp).toLocaleString('zh-CN')}
                    </p>
                    <video
                      src={mediaFallbackSrc[file.id] || file.filePath}
                      controls
                      className="w-full h-32 object-cover rounded mt-2"
                      onError={async () => {
                        if (!mediaFallbackSrc[file.id]) {
                          const blobUrl = await loadWithAuthAsBlob(file.filePath);
                          if (blobUrl) {
                            setMediaFallbackSrc((prev) => ({ ...prev, [file.id]: blobUrl }));
                            return;
                          }
                        }
                      }}
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleViewFile(file.id)}
                        disabled={isLoading}
                      >
                        查看
                      </button>
                      <button
                        className="btn"
                        onClick={() => handleDeleteFile(file.id)}
                        disabled={isLoading}
                        style={{ backgroundColor: '#ef4444', borderColor: '#ef4444', color: '#fff' }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p>暂无视频</p>
              )}
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2">我的音频</h3>
              {audios.length > 0 ? (
                audios.map(file => (
                  <div key={file.id} className="card p-4" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 60%)', borderColor: '#e5e7eb' }}>
                    <p>{file.desc || '无描述'}</p>
                    <p className="text-sm" style={{ color: '#bfa366' }}>
                      {new Date(file.timestamp).toLocaleString('zh-CN')}
                    </p>
                    <audio
                      src={mediaFallbackSrc[file.id] || file.filePath}
                      controls
                      className="w-full mt-2"
                      onError={async () => {
                        if (!mediaFallbackSrc[file.id]) {
                          const blobUrl = await loadWithAuthAsBlob(file.filePath);
                          if (blobUrl) {
                            setMediaFallbackSrc((prev) => ({ ...prev, [file.id]: blobUrl }));
                            return;
                          }
                        }
                      }}
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        className="btn bg-blue-600 hover:bg-blue-700"
                        onClick={() => handleViewFile(file.id)}
                        disabled={isLoading}
                      >
                        查看
                      </button>
                      <button
                        className="btn"
                        onClick={() => handleDeleteFile(file.id)}
                        disabled={isLoading}
                        style={{ backgroundColor: '#ef4444', borderColor: '#ef4444', color: '#fff' }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p>暂无音频</p>
              )}
            </div>
            <div className="flex gap-4">
              <button
                className="btn btn-primary"
                onClick={handleGenerateMark}
                disabled={isLoading}
              >
                生成永恒印记
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => navigate('/')}
                disabled={isLoading}
              >
                返回
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default My;