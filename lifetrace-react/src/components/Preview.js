import React, { useState, useContext, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AppContext } from '../context/AppContext';

const Preview = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { bioTitle = '', bioSummary = '', sections = [], currentSectionIndex = 0 } = location.state || {};
  const { t } = useContext(AppContext);
  const [title, setTitle] = useState(bioTitle || '');
  const [summary, setSummary] = useState(bioSummary || '');
  const [chapters] = useState(Array.isArray(sections) ? sections : []);
  const [contacts, setContacts] = useState([{ name: '', phone: '', address: '', relation: '' }]);
  const [eternal, setEternal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [fullText, setFullText] = useState(
    (Array.isArray(sections) ? sections : [])
      .map(s => (s && s.text) ? String(s.text) : '')
      .filter(t0 => t0.trim().length > 0)
      .join('\n\n')
  );

  const [noteId, setNoteId] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [showEternalCard, setShowEternalCard] = useState(false);
  const [serverEternalGuard, setServerEternalGuard] = useState(false);

  useEffect(() => {
    setShowEternalCard(true);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!noteId || !token) return;
    (async () => {
      try {
        const res = await axios.get(`/api/note/${noteId}`, { headers: { Authorization: `Bearer ${token}` } });
        const flag = !!res?.data?.eternalGuard;
        setServerEternalGuard(flag);
        if (flag) setShowEternalCard(false);
      } catch (_) {}
    })();
  }, [noteId]);

  const handleUpload = async (visibility) => {
    const token = localStorage.getItem('token');
    if (!token) { setMessage('请先登录'); return; }
    setIsSaving(true);
    try {
      let finalId = noteId;
      const isPublic = visibility === 'public';
      const sharedWithFamily = visibility === 'family';
      const payload = {
        title: (title || '').trim() || '无标题',
        content: (fullText || '').toString(),
        sections: chapters,
        isPublic,
        sharedWithFamily,
        cloudStatus: 'Uploaded',
        type: 'Biography',
        summary: (summary || '').trim() || '',
        contacts: (contacts || []).filter(c => (c.name||c.phone||c.address)).slice(0,10)
      };
      if (!noteId) {
        const res = await axios.post('/api/note', payload, { headers: { Authorization: `Bearer ${token}` } });
        const createdId = res?.data?.id || res?.data?._id || '';
        if (createdId) { setNoteId(createdId); finalId = createdId; }
      } else {
        await axios.put(`/api/note/${noteId}`, payload, { headers: { Authorization: `Bearer ${token}` } });
      }
      if (visibility === 'public') {
        try {
          const base = (window.location.origin).replace(/\/$/, '');
          const url = `${base}/b/${finalId || ''}`;
          setShareUrl(url);
          await navigator.clipboard.writeText(url);
          setMessage('分享链接已复制到剪贴板');
        } catch (_) {
          setMessage('已分享到广场');
        }
      } else if (visibility === 'family') {
        setMessage('已分享到家族');
      } else {
        setMessage('已保存');
      }
    } catch (e) {
      setMessage('保存失败：' + (e?.response?.data?.message || e?.message));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-4 sm:py-6">
      <div className="card max-w-4xl mx-auto w-full p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4 gap-2">
          {isEditing ? (
            <input
              className="input text-xl sm:text-2xl font-bold flex-1"
              placeholder={t ? t('noTitle') : '无标题'}
              value={title}
              onChange={(e)=> setTitle(e.target.value)}
              maxLength={200}
            />
          ) : (
            <h2 className="text-xl sm:text-2xl font-bold flex-1">{(title || '').trim() ? title : (t ? t('noTitle') : '无标题')}</h2>
          )}
          <div className="flex gap-2 flex-col sm:flex-row">
            <button className="btn w-full sm:w-auto" onClick={() => setIsEditing(!isEditing)}>{isEditing ? (t ? t('doneEdit') : '完成编辑') : (t ? t('edit') : '编辑')}</button>
            <button className="btn w-full sm:w-auto" onClick={() => {
              if (isEditing) {
                // 回写到草稿，CreateBiography 会自动恢复
                try {
                  const mergedSections = Array.isArray(chapters) ? chapters.map((s, i) => ({
                    title: s.title || '',
                    text: s.text || '',
                    media: Array.isArray(s.media) ? s.media : [],
                  })) : [];
                  const draft = {
                    bioTitle: title,
                    bioSummary: summary,
                    sections: mergedSections,
                    currentSectionIndex
                  };
                  localStorage.setItem('createDraft', JSON.stringify(draft));
                } catch (_) {}
                setIsEditing(false);
                return;
              }
              navigate(-1);
            }}>{t ? t('back') : '返回'}</button>
          </div>
        </div>
        {isEditing ? (
          <textarea
            className="input w-full h-24 sm:h-20 mb-4"
            placeholder={t ? t('summaryPlaceholder') : '简介（可选）'}
            value={summary}
            onChange={(e)=> setSummary(e.target.value.slice(0, 500))}
            maxLength={500}
          />
        ) : (
          (summary || '').trim() ? (
            <p className="mb-4 text-gray-700 whitespace-pre-wrap">{summary}</p>
          ) : null
        )}
        {message && <div className="mb-3 text-sm text-gray-700">{message}</div>}
        {isEditing ? (
          <textarea
            className="input w-full h-[40vh] sm:h-[60vh] whitespace-pre-wrap"
            placeholder={t ? t('fullTextPlaceholder') : '在此编辑整篇传记正文...'}
            value={fullText}
            onChange={(e)=> setFullText(e.target.value)}
            maxLength={200000}
          />
        ) : (
          <div className="space-y-4">
            {(fullText || '').split(/\n\n+/).filter(Boolean).map((para, i) => (
              <p key={i} className="text-gray-800 whitespace-pre-wrap">{para}</p>
            ))}
            {Array.isArray(chapters) && chapters.some(s => Array.isArray(s.media) && s.media.length > 0) && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
                {chapters.flatMap((s) => (s.media || []).map((m) => ({ ...m }))).map((m, mi) => (
                  <div key={mi} className="border rounded overflow-hidden bg-white">
                    {m.type === 'image' && <img src={m.url} alt={m.desc || ''} className="w-full h-32 object-cover" />}
                    {m.type === 'video' && <video src={m.url} className="w-full h-32 object-cover" controls />}
                    {m.type === 'audio' && <audio src={m.url} className="w-full" controls />}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* 将收费卡片放到页面底部、按钮区域上方；包含永恒守护开关与联系人；未付费显示，可关闭；点击稍后，同时隐藏 */}
        {!isEditing && showEternalCard && !serverEternalGuard && (
          <div className="relative p-4 border rounded bg-white mt-4">
            <button type="button" aria-label="关闭" className="absolute right-2 top-2 text-gray-500 hover:text-gray-700" onClick={()=>setShowEternalCard(false)}>×</button>
            <h3 className="text-xl font-bold mb-2">永恒计划：为爱与记忆，留下不朽的印记。</h3>
            <p className="text-gray-800 mb-2">“第三次死亡，是最后一个记得你的人也忘了你。”</p>
            <p className="text-gray-700 mb-2">为了对抗遗忘，我们承诺：</p>
            <ul className="list-disc pl-5 text-gray-700 space-y-1 mb-2">
              <li>您的数字资料将获得长期保存（承诺保存20年，并在此之后继续维护至技术无法支持为止）。</li>
              <li>我们将生成一份永恒实体印记（加密记忆体），交给您的家人，作为精神遗产的实体见证。</li>
              <li>你的故事，从此交由永恒守护。</li>
            </ul>
            <div className="font-semibold">费用：500元</div>
            {/* 永恒守护开关 + 联系人表单（必填） */}
            <div className="mt-3 p-3 border rounded bg-gray-50">
              <label className="flex items-center gap-2 mb-2">
                <input type="checkbox" checked={eternal} onChange={(e)=> setEternal(e.target.checked)} />
                <span>开启“永恒守护”（一次性 500 元）：承诺保存20年，并在创作完成后生成永恒实体印记交给家人</span>
              </label>
              <div className="text-sm text-gray-600 mb-2">请填写家族联系人（至少一位，需姓名与电话）：</div>
              {contacts.map((c, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2">
                  <input className="input" placeholder="联系人姓名" value={c.name} onChange={(e)=>{
                    const arr=[...contacts]; arr[idx]={...arr[idx], name:e.target.value}; setContacts(arr);
                  }} />
                  <input className="input" placeholder="联系方式（电话）" value={c.phone} onChange={(e)=>{
                    const arr=[...contacts]; arr[idx]={...arr[idx], phone:e.target.value}; setContacts(arr);
                  }} />
                  <input className="input" placeholder="联系地址" value={c.address} onChange={(e)=>{
                    const arr=[...contacts]; arr[idx]={...arr[idx], address:e.target.value}; setContacts(arr);
                  }} />
                  <input className="input" placeholder="与作者关系（父亲/女儿等）" value={c.relation} onChange={(e)=>{
                    const arr=[...contacts]; arr[idx]={...arr[idx], relation:e.target.value}; setContacts(arr);
                  }} />
                </div>
              ))}
              <div className="flex gap-2">
                <button className="btn" type="button" onClick={()=> setContacts(prev => (prev.length<10?[...prev, {name:'',phone:'',address:'',relation:''}]:prev))}>新增联系人</button>
                <button className="btn bg-gray-500 hover:bg-gray-600" type="button" onClick={()=> setContacts(prev => prev.length>1?prev.slice(0,-1):prev)}>删除最后一个</button>
              </div>
            </div>
            <div className="mt-3">
              <button type="button" className="btn" onClick={async ()=>{
                if (!noteId) { setMessage('请先保存并上传后再发起支付'); return; }
                const valid = (contacts || []).some(c => (c.name||'').trim() && (c.phone||'').trim());
                if (!valid || !eternal) { setMessage('请勾选开启永恒守护并填写至少一位联系人（姓名与电话）'); return; }
                try {
                  const token = localStorage.getItem('token');
                  const r = await axios.post('/api/pay/eternal-order', { noteId }, { headers: { Authorization: `Bearer ${token}` } });
                  const url = r?.data?.payUrl;
                  if (url) {
                    window.location.href = url;
                  } else {
                    setMessage('下单失败');
                  }
                } catch (e) {
                  setMessage('下单失败：' + (e?.response?.data?.message || e?.message));
                }
              }}>加入永恒计划</button>
              <button type="button" className="btn bg-gray-500 hover:bg-gray-600 ml-2" onClick={()=>{ setShowEternalCard(false); }}>稍后</button>
            </div>
          </div>
        )}
        <div className="mt-6 flex gap-2 flex-wrap">
          <button className="btn w-full sm:w-auto" onClick={() => handleUpload('private')} disabled={isSaving}>{isSaving ? '保存中...' : (noteId ? (t ? t('saveUpload') : '更新并上传') : (t ? t('saveUpload') : '保存并上传'))}</button>
          <button className="btn w-full sm:w-auto" onClick={() => handleUpload('family')} disabled={isSaving || !noteId}>{t ? t('shareFamily') : '分享到家族'}</button>
          <button className="btn w-full sm:w-auto" onClick={() => handleUpload('public')} disabled={isSaving || !noteId}>{t ? t('shareSquare') : '分享到广场'}</button>
          <button className="btn w-full sm:w-auto" type="button" disabled={!noteId || isSharing} onClick={async ()=>{
            try {
              setIsSharing(true);
              const token = localStorage.getItem('token');
              const res = await axios.post(`/api/note/${noteId}/share`, { action: 'create' }, { headers: { Authorization: `Bearer ${token}` }});
              const tokenStr = res?.data?.shareToken || '';
              if (tokenStr) {
                const base = (axios.defaults.baseURL || window.location.origin).replace(/\/$/, '');
                const url = `${base}/share/${tokenStr}`;
                setShareUrl(url);
                try { await navigator.clipboard.writeText(url); setMessage('分享链接已复制到剪贴板'); }
                catch(_) { window.prompt('复制此链接', url); setMessage('已生成分享链接（已在弹窗中显示）'); }
              } else {
                setMessage('分享失败');
              }
            } catch (e) {
              setMessage('生成分享链接失败：' + (e?.response?.data?.message || e?.message));
            } finally {
              setIsSharing(false);
            }
          }}>{isSharing ? '生成中...' : '生成分享链接'}</button>
          {shareUrl ? <div className="w-full text-sm text-gray-600 break-all">{shareUrl}</div> : null}
        </div>
      </div>
    </div>
  );
};

export default Preview;


