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
  const getStageIndicesFromTags = (tagList = []) => {
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
    const found = new Set();
    for (let i = 0; i < stages.length; i++) {
      if (tags.includes(stages[i])) found.add(i);
    }
    for (let i = 0; i < synonyms.length; i++) {
      if (synonyms[i].some(s => tags.some(t => t.includes(s)))) found.add(i);
    }
    if (found.size === 0) found.add(stages.indexOf('当下'));
    return Array.from(found.values()).sort((a,b)=>a-b);
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
        const sv = String(localStorage.getItem('subject_version') || '0');
        const resMemos = await retry(() =>
          axios.get('/api/memos', { headers: { Authorization: `Bearer ${token2}` }, params: { subjectVersion: sv }, timeout: 15000 })
        );
        const serverList = Array.isArray(resMemos.data) ? resMemos.data : [];
        let offline = [];
        try {
          const scope = (localStorage.getItem('uid') || localStorage.getItem('username') || 'anon');
          const subj = sv;
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
    const ok = window.confirm('重要提示：重置记录对象后，之前的随手记将被"隔离"（仅可查看与删除，无法再落章）。\n\n您可以在首页重新选择"为自己记录"或"为他人记录"，并填写新的对象信息。\n\n是否继续？');
    if (!ok) return;
    try {
      const oldVersion = Number(localStorage.getItem('subject_version') || '0') || 0;
      try { localStorage.setItem('subject_version', String(oldVersion + 1)); } catch(_) {}
      localStorage.removeItem('author_mode');
      localStorage.removeItem('author_relation');
      localStorage.removeItem('record_profile');
      // 后端同步重置
      try { const token = localStorage.getItem('token'); axios.delete('/api/record-subject', { headers: { Authorization: `Bearer ${token}` } }).catch(()=>{}); } catch (_) {}
      setMessage('已重置记录对象。正在跳转到首页...');
      setTimeout(() => navigate('/'), 1000);
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

  // Tabs, pagination, and batch selection states
  const [activeTab, setActiveTab] = useState('overview'); // overview | memos | biographies | interviews | photos | videos | audios | settings
  const [pageMemos, setPageMemos] = useState(1);
  const [sizeMemos, setSizeMemos] = useState(20);
  const [pageBios, setPageBios] = useState(1);
  const [sizeBios, setSizeBios] = useState(20);
  const [pageInterviews, setPageInterviews] = useState(1);
  const [sizeInterviews, setSizeInterviews] = useState(20);
  const [pagePhotos, setPagePhotos] = useState(1);
  const [sizePhotos, setSizePhotos] = useState(20);
  const [pageVideos, setPageVideos] = useState(1);
  const [sizeVideos, setSizeVideos] = useState(20);
  const [pageAudios, setPageAudios] = useState(1);
  const [sizeAudios, setSizeAudios] = useState(20);
  const [selectedMemos, setSelectedMemos] = useState(new Set());
  const [selectedBios, setSelectedBios] = useState(new Set());
  const [selectedInterviews, setSelectedInterviews] = useState(new Set());
  const [selectedPhotos, setSelectedPhotos] = useState(new Set());
  const [selectedVideos, setSelectedVideos] = useState(new Set());
  const [selectedAudios, setSelectedAudios] = useState(new Set());

  const paginate = (list, page, size) => {
    const total = Array.isArray(list) ? list.length : 0;
    const totalPages = Math.max(1, Math.ceil(total / size));
    const clampedPage = Math.max(1, Math.min(page, totalPages));
    const start = (clampedPage - 1) * size;
    const end = start + size;
    return { items: (list || []).slice(start, end), totalPages, page: clampedPage };
  };

  const Pagination = ({ page, totalPages, onPrev, onNext, size, onSize }) => (
    <div className="flex items-center justify-between mt-3">
      <div className="flex items-center gap-2">
        <button className="btn btn-secondary" onClick={onPrev} disabled={page <= 1}>上一页</button>
        <span className="text-sm text-gray-700">{page} / {totalPages}</span>
        <button className="btn btn-secondary" onClick={onNext} disabled={page >= totalPages}>下一页</button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-700">每页</span>
        <select className="input w-24" value={size} onChange={(e) => onSize(Number(e.target.value))}>
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
        </select>
      </div>
    </div>
  );

  // Batch actions
  const batchUploadMemosToFamily = async () => {
    try {
      const token = localStorage.getItem('token');
      const ids = Array.from(selectedMemos);
      await Promise.all(ids.map(id => axios.put(`/api/memo/${id}/visibility`, { visibility: 'family' }, { headers: { Authorization: `Bearer ${token}` } })));
      setMemos(prev => prev.map(x => ids.includes(x.id||x._id) ? { ...x, visibility: 'family' } : x));
      setSelectedMemos(new Set());
      setMessage('已批量上传到家族档案');
      setTimeout(()=>setMessage(''), 1200);
    } catch (e) {
      setMessage('批量上传失败：' + (e?.response?.data?.message || e?.message));
    }
  };
  const batchDeleteMemos = async () => {
    try {
      const token = localStorage.getItem('token');
      const ids = Array.from(selectedMemos);
      await Promise.all(ids.map(id => axios.delete(`/api/memo/${id}`, { headers: { Authorization: `Bearer ${token}` } })));
      setMemos(prev => prev.filter(x => !ids.includes(x.id||x._id)));
      try {
        const scope = (localStorage.getItem('uid') || localStorage.getItem('username') || 'anon');
        const subj = localStorage.getItem('subject_version') || '0';
        const curr = JSON.parse(localStorage.getItem(`memos_offline_${scope}_${subj}`) || '[]');
        const next = (Array.isArray(curr)?curr:[]).filter(x => !ids.includes(x.id||x._id));
        localStorage.setItem(`memos_offline_${scope}_${subj}`, JSON.stringify(next));
      } catch(_) {}
      setSelectedMemos(new Set());
      setMessage('已批量删除随手记');
      setTimeout(()=>setMessage(''), 1200);
    } catch (e) {
      setMessage('批量删除失败：' + (e?.response?.data?.message || e?.message));
    }
  };
  const batchFallMemos = () => {
    const ids = Array.from(selectedMemos);
    const chosen = (memos || []).filter(m => ids.includes(m.id||m._id));
    // 复用现有落章逻辑：按标签映射阶段、按时间排序
    try {
      const items = [];
      chosen.forEach(m => {
        const tags = Array.isArray(m.tags) ? m.tags : [];
        const stageIdxList = getStageIndicesFromTags(tags);
        const ts = new Date(m.timestamp || Date.now()).getTime();
        if (tags.includes('每日回首')) {
          const text = (m.text || '').toString();
          let q = '', a = '';
          const mq = text.match(/问题：([\s\S]*?)\n/);
          if (mq) q = (mq[1] || '').trim();
          const ma = text.match(/回答：([\s\S]*)/);
          if (ma) a = (ma[1] || '').trim();
          const line = `陪伴师：${q || '（每日回首）'}\n我：${a || ''}`;
          stageIdxList.forEach(si => items.push({ stageIndex: Math.max(0, si), text: line, ts }));
        } else {
          const line = (m.text || '').toString();
          const add = line ? `我：${line}` : '我：这是一条当下的记录。';
          stageIdxList.forEach(si => items.push({ stageIndex: Math.max(0, si), text: add, ts }));
        }
      });
      items.sort((a,b)=>(a.ts||0)-(b.ts||0));
      const clean = items.map(({stageIndex,text})=>({stageIndex,text}));
      setSelectedMemos(new Set());
      navigate('/create', { state: { pasteItems: clean } });
    } catch (_) { navigate('/create'); }
  };

  const batchShareBios = async (shared) => {
    try {
      const token = localStorage.getItem('token');
      const ids = Array.from(selectedBios);
      await Promise.all(ids.map(id => axios.put(`/api/note/${id}/family-share`, { shared }, { headers: { Authorization: `Bearer ${token}` } })));
      setCloudNotes(prev => prev.map(n => ids.includes(n.id) ? { ...n, sharedWithFamily: !!shared } : n));
      setSelectedBios(new Set());
      setMessage(shared ? '已批量上传到家族档案' : '已批量从家族撤销');
      setTimeout(()=>setMessage(''), 1200);
    } catch (e) {
      setMessage('批量操作失败：' + (e?.response?.data?.message || e?.message));
    }
  };
  const batchDeleteBios = async () => {
    try {
      const token = localStorage.getItem('token');
      const ids = Array.from(selectedBios);
      await Promise.all(ids.map(id => axios.delete(`/api/note/${id}`, { headers: { Authorization: `Bearer ${token}` } })));
      setCloudNotes(prev => prev.filter(n => !ids.includes(n.id)));
      setSelectedBios(new Set());
      setMessage('已批量删除传记');
      setTimeout(()=>setMessage(''), 1200);
    } catch (e) {
      setMessage('批量删除失败：' + (e?.response?.data?.message || e?.message));
    }
  };
  const batchDeleteFiles = async (which) => {
    try {
      const token = localStorage.getItem('token');
      const map = { photos: selectedPhotos, videos: selectedVideos, audios: selectedAudios };
      const setMap = { photos: setSelectedPhotos, videos: setSelectedVideos, audios: setSelectedAudios };
      const ids = Array.from(map[which] || new Set());
      await Promise.all(ids.map(id => axios.delete(`/api/upload/${id}`, { headers: { Authorization: `Bearer ${token}` } })));
      if (which === 'photos') setFiles(prev => prev.filter(f => !(/\.(jpeg|jpg|png|gif)$/i).test(f.filePath) || !ids.includes(f.id)));
      if (which === 'videos') setFiles(prev => prev.filter(f => !(/\.(mp4|webm|ogg)$/i).test(f.filePath) || !ids.includes(f.id)));
      if (which === 'audios') setFiles(prev => prev.filter(f => !(/\.(mp3|wav|ogg|m4a|aac|flac)$/i).test(f.filePath) || !ids.includes(f.id)));
      setMap[which](new Set());
      setMessage('已批量删除');
      setTimeout(()=>setMessage(''), 1200);
    } catch (e) {
      setMessage('批量删除失败：' + (e?.response?.data?.message || e?.message));
    }
  };

  const renderTabs = () => (
    <div className="tabs mb-4">
      {[
        ['overview','总览'],
        ['memos','随手记'],
        ['biographies','我的记录'],
        ['interviews','原始采访'],
        ['photos','照片'],
        ['videos','视频'],
        ['audios','音频'],
      ].map(([key,label]) => (
        <button key={key} className={`tab ${activeTab===key?'tab-active':''}`} onClick={()=>setActiveTab(key)}>{label}</button>
      ))}
    </div>
  );

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="card p-4" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 60%)', borderColor: '#e5e7eb' }}>
        <h3 className="text-xl font-semibold mb-2">快速查看</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <button className="btn btn-secondary" onClick={()=>setActiveTab('memos')}>随手记（{memos.length}）</button>
          <button className="btn btn-secondary" onClick={()=>setActiveTab('biographies')}>我的记录（{biographies.length}）</button>
          <button className="btn btn-secondary" onClick={()=>setActiveTab('photos')}>照片（{photos.length}）</button>
          <button className="btn btn-secondary" onClick={()=>setActiveTab('videos')}>视频（{videos.length}）</button>
          <button className="btn btn-secondary" onClick={()=>setActiveTab('audios')}>音频（{audios.length}）</button>
        </div>
      </div>
      <div className="card p-4" style={{ background: 'linear-gradient(135deg, #dbeafe 0%, #ffffff 50%)', borderColor: '#e5e7eb' }}>
        <h3 className="text-xl font-semibold mb-2">永恒印记</h3>
        <p className="text-sm text-gray-700 mb-3">需要帮助把资料整理成册、影集或时光胶囊？联系我协助您完成“永恒印记”。</p>
        <button className="btn btn-primary" onClick={()=>navigate('/contact')}>联系与服务说明</button>
      </div>
    </div>
  );

  const renderMemos = () => {
    const { items, totalPages, page } = paginate(memos, pageMemos, sizeMemos);
    const toggle = (id) => setSelectedMemos(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });
    return (
      <div>
        {selectedMemos.size > 0 && (
          <div className="toolbar mb-3">
            <button className="btn btn-primary" onClick={batchUploadMemosToFamily}>批量上传到家族</button>
            <button className="btn btn-secondary" onClick={batchFallMemos}>批量落到篇章</button>
            <button className="btn" style={{ backgroundColor: '#ef4444', borderColor: '#ef4444', color: '#fff' }} onClick={batchDeleteMemos}>批量删除</button>
          </div>
        )}
        {items.length === 0 ? <p>暂无随手记</p> : items.map((m) => {
          const vis = (m.visibility || 'private');
          const badge = vis==='public' ? '公开' : (vis==='family' ? '家族' : '仅自己');
          const badgeCls = vis==='public' ? 'bg-green-100 text-green-800 border-green-200' : (vis==='family' ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-gray-100 text-gray-800 border-gray-200');
          return (
            <div key={m.id || m._id} className="card p-4 mb-3" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 60%)', borderColor: '#e5e7eb' }}>
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-2 text-gray-800">
                  <input type="checkbox" checked={selectedMemos.has(m.id||m._id)} onChange={()=>toggle(m.id||m._id)} />
                  <span className={`px-2 py-1 rounded-full text-xs border ${badgeCls}`}>{badge}</span>
                </label>
                <div className="text-sm text-gray-600">{new Date(m.timestamp || Date.now()).toLocaleString('zh-CN')}</div>
              </div>
              {m.text && <p className="whitespace-pre-wrap text-gray-800 truncate-3">{m.text}</p>}
            </div>
          );
        })}
        <Pagination
          page={page}
          totalPages={totalPages}
          onPrev={()=> setPageMemos(p => Math.max(1, p-1))}
          onNext={()=> setPageMemos(p => Math.min(totalPages, p+1))}
          size={sizeMemos}
          onSize={(s)=> { setSizeMemos(s); setPageMemos(1); }}
        />
      </div>
    );
  };

  const renderBios = () => {
    const { items, totalPages, page } = paginate(biographies, pageBios, sizeBios);
    const toggle = (id) => setSelectedBios(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });
    return (
      <div>
        {selectedBios.size > 0 && (
          <div className="toolbar mb-3">
            <button className="btn btn-primary" onClick={()=>batchShareBios(true)}>批量上传到家族</button>
            <button className="btn btn-secondary" onClick={()=>batchShareBios(false)}>批量撤销家族</button>
            <button className="btn" style={{ backgroundColor: '#ef4444', borderColor: '#ef4444', color: '#fff' }} onClick={batchDeleteBios}>批量删除</button>
          </div>
        )}
        {items.length === 0 ? <p>暂无我的记录</p> : items.map(item => (
          <div key={item.id} className="card p-4 mb-3" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 60%)', borderColor: '#e5e7eb' }}>
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 text-gray-800">
                <input type="checkbox" checked={selectedBios.has(item.id)} onChange={()=>toggle(item.id)} />
                <span className="text-sm text-gray-700">{new Date(item.timestamp).toLocaleString('zh-CN')}</span>
              </label>
              <div className="flex gap-2">
                <button className="btn btn-secondary" onClick={()=>handleViewNote(item.id, item.type)} disabled={isLoading}>查看</button>
              </div>
            </div>
            <div className="font-semibold">{item.title || '(无标题)'}</div>
            <p className="whitespace-pre-wrap text-gray-800 line-clamp-3">{(item.summary || item.content || '').substring(0, 150)}{(item.summary || item.content || '').length>150?'...':''}</p>
          </div>
        ))}
        <Pagination
          page={page}
          totalPages={totalPages}
          onPrev={()=> setPageBios(p => Math.max(1, p-1))}
          onNext={()=> setPageBios(p => Math.min(totalPages, p+1))}
          size={sizeBios}
          onSize={(s)=> { setSizeBios(s); setPageBios(1); }}
        />
      </div>
    );
  };

  const lifeStages = ['童年', '少年', '青年', '中年', '壮年', '老年', '晚年'];

  const renderInterviews = () => {
    // 获取所有包含采访数据的传记
    const interviewBios = biographies.filter(bio => bio.interviewData && bio.interviewData.length > 0);
    const { items, totalPages, page } = paginate(interviewBios, pageInterviews, sizeInterviews);
    
    return (
      <div>
        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-gray-700">
            这里保存了您与情感陪伴师的原始对话记录，是您珍贵的采访素材。您可以随时将这些素材重新导入到创作传记中生成新的内容。
          </p>
        </div>
        
        {items.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            暂无原始采访记录
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((bio) => (
              <div key={bio.id || bio._id} className="card p-4 bg-white border border-gray-200">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-lg">{bio.title}</h4>
                    <p className="text-sm text-gray-500">
                      {new Date(bio.createdAt || bio.timestamp).toLocaleString('zh-CN')}
                      {bio.interviewData && ` · ${bio.interviewData.length} 个阶段采访`}
                    </p>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      // 将采访数据导入到CreateBiography
                      const importData = {
                        title: bio.title,
                        sections: Array.from({ length: lifeStages.length }, (_, idx) => {
                          const interviewForStage = bio.interviewData.find(i => i.stage === lifeStages[idx]);
                          return interviewForStage ? {
                            title: interviewForStage.title || '',
                            text: interviewForStage.content || '',
                            media: []
                          } : { title: '', text: '', media: [] };
                        }),
                        themes: bio.interviewData.reduce((acc, interview) => {
                          const stageIndex = lifeStages.indexOf(interview.stage);
                          if (stageIndex >= 0) {
                            acc[stageIndex] = interview.themes || [];
                          }
                          return acc;
                        }, {})
                      };
                      localStorage.setItem('importInterviewData', JSON.stringify(importData));
                      navigate('/create');
                    }}
                  >
                    导入创作
                  </button>
                </div>
                
                {/* 显示各阶段采访概要 */}
                {bio.interviewData && bio.interviewData.length > 0 && (
                  <div className="space-y-2">
                    {bio.interviewData.slice(0, 3).map((interview, idx) => (
                      <div key={idx} className="text-sm">
                        <span className="font-medium text-gray-700">{interview.stage}：</span>
                        <span className="text-gray-600">
                          {interview.content.substring(0, 50)}...
                        </span>
                        {interview.themes && interview.themes.length > 0 && (
                          <span className="ml-2">
                            {interview.themes.map(theme => (
                              <span key={theme} className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full mr-1">
                                {theme}
                              </span>
                            ))}
                          </span>
                        )}
                      </div>
                    ))}
                    {bio.interviewData.length > 3 && (
                      <p className="text-xs text-gray-500">还有 {bio.interviewData.length - 3} 个阶段...</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        
        {totalPages > 1 && (
          <div className="pagination">
            <button onClick={() => setPageInterviews(p => Math.max(p - 1, 1))} disabled={page <= 1}>上一页</button>
            <span>{page} / {totalPages}</span>
            <button onClick={() => setPageInterviews(p => Math.min(p + 1, totalPages))} disabled={page >= totalPages}>下一页</button>
          </div>
        )}
      </div>
    );
  };

  const renderFiles = (which, list, pageState, sizeState, setPageState, setSizeState, selectedSet, setSelectedSet) => {
    const { items, totalPages, page } = paginate(list, pageState, sizeState);
    const toggle = (id) => setSelectedSet(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });
    return (
      <div>
        {selectedSet.size > 0 && (
          <div className="toolbar mb-3">
            <button className="btn" style={{ backgroundColor: '#ef4444', borderColor: '#ef4444', color: '#fff' }} onClick={()=>batchDeleteFiles(which)}>批量删除</button>
          </div>
        )}
        {items.length === 0 ? <p>暂无</p> : items.map(file => (
          <div key={file.id} className="card p-4 mb-3" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 60%)', borderColor: '#e5e7eb' }}>
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 text-gray-800">
                <input type="checkbox" checked={selectedSet.has(file.id)} onChange={()=>toggle(file.id)} />
                <span className="text-sm text-gray-700">{new Date(file.timestamp).toLocaleString('zh-CN')}</span>
              </label>
              <div className="flex gap-2">
                <button className="btn btn-secondary" onClick={()=>handleViewFile(file.id)} disabled={isLoading}>查看</button>
              </div>
            </div>
            <p className="text-gray-800">{file.desc || '无描述'}</p>
          </div>
        ))}
        <Pagination
          page={page}
          totalPages={totalPages}
          onPrev={()=> setPageState(p => Math.max(1, p-1))}
          onNext={()=> setPageState(p => Math.min(totalPages, p+1))}
          size={sizeState}
          onSize={(s)=> { setSizeState(s); setPageState(1); }}
        />
      </div>
    );
  };

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
            {renderTabs()}
            <div className="card p-4" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 60%)', borderColor: '#e5e7eb' }}>
              <h3 className="text-xl font-semibold mb-2">记录对象</h3>
              <p className="text-sm text-gray-700 mb-2">若要为另一位亲人记录，请先完成当前回忆整理，再重置以避免内容混淆。</p>
              <button className="btn btn-secondary" onClick={handleResetSubject}>重置记录对象</button>
            </div>
            {activeTab === 'overview' && renderOverview()}
            {activeTab === 'memos' && renderMemos()}
            {activeTab === 'biographies' && renderBios()}
            {activeTab === 'interviews' && renderInterviews()}
            {activeTab === 'photos' && renderFiles('photos', photos, pagePhotos, sizePhotos, setPagePhotos, setSizePhotos, selectedPhotos, setSelectedPhotos)}
            {activeTab === 'videos' && renderFiles('videos', videos, pageVideos, sizeVideos, setPageVideos, setSizeVideos, selectedVideos, setSelectedVideos)}
            {activeTab === 'audios' && renderFiles('audios', audios, pageAudios, sizeAudios, setPageAudios, setSizeAudios, selectedAudios, setSelectedAudios)}
            <div className="flex gap-4">
              <button className="btn btn-secondary" onClick={() => navigate('/')}>返回首页</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default My;