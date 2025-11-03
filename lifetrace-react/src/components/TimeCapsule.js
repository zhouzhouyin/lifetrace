import { useState, useEffect, useContext } from 'react';
import { Helmet } from 'react-helmet-async';
import axios from 'axios';
import { AppContext } from '../context/AppContext';

const TimeCapsule = ({ embedded = false }) => {
  const { isLoggedIn, familyMembers, setFamilyMembers, lang } = useContext(AppContext);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [media, setMedia] = useState([]); // {type,url,desc}
  const [recipientsMode, setRecipientsMode] = useState('self'); // 'self' | 'family'
  const [selectedRecipients, setSelectedRecipients] = useState([]); // userId[]
  const [scheduleAt, setScheduleAt] = useState(() => {
    const dt = new Date(Date.now() + 60 * 60 * 1000); // +1h
    const pad = (n) => String(n).padStart(2, '0');
    const s = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    return s;
  });
  const [tab, setTab] = useState('compose'); // compose | sent | received
  const [sentList, setSentList] = useState([]);
  const [recvList, setRecvList] = useState([]);
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!Array.isArray(familyMembers) || familyMembers.length === 0) {
      const token = localStorage.getItem('token');
      if (token) {
        axios.get('/api/family', { headers: { Authorization: `Bearer ${token}` } }).then(res => {
          setFamilyMembers(Array.isArray(res.data) ? res.data : []);
        }).catch(() => {});
      }
    }
  }, [familyMembers, setFamilyMembers]);

  const pickType = (file) => {
    const name = (file?.name || '').toLowerCase();
    if (/\.(png|jpg|jpeg|gif|webp|bmp)$/.test(name)) return 'image';
    if (/\.(mp4|webm|ogg|mov|avi|mkv)$/.test(name)) return 'video';
    if (/\.(mp3|wav|opus|m4a|aac|flac|3gp|amr|wma)$/.test(name)) return 'audio';
    const mime = (file?.type || '').toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    return 'image';
  };

  const handleUploadFile = async (file) => {
    try {
      setUploading(true);
      const token = localStorage.getItem('token');
      if (!token) { setMessage('请先登录'); return; }
      const form = new FormData();
      form.append('file', file);
      const res = await axios.post('/api/upload', form, { headers: { Authorization: `Bearer ${token}` } });
      const url = res.data.filePath;
      const type = pickType(file);
      setMedia(prev => [...prev, { type, url, desc: '' }]);
      setMessage('上传成功');
      setTimeout(() => setMessage(''), 800);
    } catch (err) {
      setMessage('上传失败：' + (err.response?.data?.message || err.message));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      const token = localStorage.getItem('token');
      if (!token) { setMessage('请先登录'); return; }
      const recipients = recipientsMode === 'self' ? [] : selectedRecipients;
      const iso = new Date(scheduleAt).toISOString();
      const payload = { title, content, media, recipientIds: recipients, scheduleAt: iso };
      await axios.post('/api/capsules', payload, { headers: { Authorization: `Bearer ${token}` } });
      setMessage('已创建并锁定到发送时间');
      setTitle(''); setContent(''); setMedia([]); setSelectedRecipients([]);
      await refreshLists();
      setTab('sent');
    } catch (err) {
      setMessage('创建失败：' + (err.response?.data?.message || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const refreshLists = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const [a, b] = await Promise.all([
        axios.get('/api/capsules?box=sent', { headers: { Authorization: `Bearer ${token}` } }),
        axios.get('/api/capsules?box=received', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setSentList(Array.isArray(a.data) ? a.data : []);
      setRecvList(Array.isArray(b.data) ? b.data : []);
    } catch (_) {}
  };

  useEffect(() => { refreshLists(); const t = setInterval(refreshLists, 60000); return () => clearInterval(t); }, []);

  const nowMs = Date.now();
  const countdown = (ts) => {
    try {
      const ms = new Date(ts).getTime() - nowMs;
      if (ms <= 0) return '已开启';
      const hh = Math.floor(ms / 3600000);
      const mm = Math.floor((ms % 3600000) / 60000);
      return `${hh}小时${mm}分钟`;
    } catch { return ''; }
  };

  return (
    <div className={embedded ? "py-6" : "min-h-screen py-6"}>
      {!embedded && (
        <Helmet>
          <title>时光胶囊</title>
        </Helmet>
      )}
      <div className="max-w-4xl mx-auto px-4">
        {message && (
          <div className="mb-4 p-2 text-center rounded bg-blue-50 text-blue-700 border border-blue-200">{message}</div>
        )}
        <div className="flex gap-2 mb-4">
          <button type="button" className={`btn ${tab==='compose'?'btn-primary':'btn-secondary'}`} onClick={()=>setTab('compose')}>写胶囊</button>
          <button type="button" className={`btn ${tab==='sent'?'btn-primary':'btn-secondary'}`} onClick={()=>setTab('sent')}>我写的</button>
          <button type="button" className={`btn ${tab==='received'?'btn-primary':'btn-secondary'}`} onClick={()=>setTab('received')}>我收到的</button>
        </div>

        {tab === 'compose' && (
          <div className="card p-4 bg-white shadow">
            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">标题（可选）</label>
              <input className="input w-full" value={title} onChange={e=>setTitle(e.target.value)} placeholder="写给未来的自己/家人的一封信" maxLength={120} />
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">正文</label>
              <textarea className="input w-full" rows={8} value={content} onChange={e=>setContent(e.target.value)} placeholder="把此刻最想说的话写下来..." />
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">添加图片/视频/音频</label>
              <input type="file" accept="image/*,video/*,audio/*" onChange={e=> e.target.files?.[0] && handleUploadFile(e.target.files[0])} disabled={uploading} />
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {media.map((m, idx) => (
                  <div key={idx} className="border rounded p-2 flex items-center justify-between">
                    <div className="text-sm text-gray-700 truncate">{m.type} · {m.url}</div>
                    <button type="button" className="btn btn-tertiary" onClick={()=>setMedia(prev=>prev.filter((_,i)=>i!==idx))}>移除</button>
                  </div>
                ))}
              </div>
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">收件人</label>
              <div className="flex items-center gap-4 mb-2">
                <label className="flex items-center gap-2"><input type="radio" name="rm" checked={recipientsMode==='self'} onChange={()=>setRecipientsMode('self')} />给未来的自己</label>
                <label className="flex items-center gap-2"><input type="radio" name="rm" checked={recipientsMode==='family'} onChange={()=>setRecipientsMode('family')} />给家人</label>
              </div>
              {recipientsMode==='family' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                  {(familyMembers || []).map(m => (
                    <label key={m.userId} className="flex items-center gap-2 border rounded p-2">
                      <input type="checkbox" checked={selectedRecipients.includes(m.userId)} onChange={(e)=>{
                        const v = e.target.checked; setSelectedRecipients(prev=> v ? Array.from(new Set([...prev, m.userId])) : prev.filter(id=>id!==m.userId));
                      }} />
                      <span className="text-sm text-gray-800">{m.username}（UID:{m.uid}）</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">发送时间</label>
              <input type="datetime-local" className="input" value={scheduleAt} onChange={e=>setScheduleAt(e.target.value)} />
              <p className="text-xs text-gray-500 mt-1">到达此时间后，胶囊将自动开启并投递给收件人</p>
            </div>
            <div className="flex gap-3">
              <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={submitting || (!content && media.length===0) || (recipientsMode==='family' && selectedRecipients.length===0)}>
                {submitting ? '创建中...' : '创建并锁定'}
              </button>
            </div>
          </div>
        )}

        {tab === 'sent' && (
          <div className="card p-4 bg-white shadow">
            <h3 className="text-lg font-semibold mb-3">我写的</h3>
            <div className="flex flex-col gap-3">
              {sentList.map(item => (
                <div key={item.id} className="border rounded p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{item.title || '无标题'}</div>
                    <div className="text-sm text-gray-500">{new Date(item.scheduleAt).toLocaleString()}</div>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">{item.delivered ? '已投递' : '待投递'} · {item.locked ? '已锁定' : '已解锁'}</div>
                </div>
              ))}
              {sentList.length === 0 && <div className="text-sm text-gray-500">暂无</div>}
            </div>
          </div>
        )}

        {tab === 'received' && (
          <div className="card p-4 bg-white shadow">
            <h3 className="text-lg font-semibold mb-3">我收到的</h3>
            <div className="flex flex-col gap-3">
              {recvList.map(item => (
                <div key={item.id} className="border rounded p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{item.title || '无标题'}</div>
                    <div className="text-sm text-gray-500">{item.isLocked ? `解锁倒计时：${countdown(item.scheduleAt)}` : '已开启'}</div>
                  </div>
                  {!item.isLocked && (
                    <div className="mt-2">
                      <div className="whitespace-pre-wrap text-gray-800 text-sm">{item.content}</div>
                      {Array.isArray(item.media) && item.media.length > 0 && (
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {item.media.map((m, idx) => (
                            <a key={idx} href={m.url} target="_blank" rel="noreferrer" className="text-blue-600 underline text-sm">查看 {m.type}</a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {recvList.length === 0 && <div className="text-sm text-gray-500">暂无</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TimeCapsule;



