import React, { useState, useContext } from 'react';
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

  const handleUpload = async (visibility) => {
    const token = localStorage.getItem('token');
    if (!token) { setMessage('请先登录'); return; }
    setIsSaving(true);
    try {
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
      };
      if (!noteId) {
        const res = await axios.post('/api/note', payload, { headers: { Authorization: `Bearer ${token}` } });
        const createdId = res?.data?.id || res?.data?._id || '';
        if (createdId) setNoteId(createdId);
      } else {
        await axios.put(`/api/note/${noteId}`, payload, { headers: { Authorization: `Bearer ${token}` } });
      }
      if (visibility === 'public') {
        setMessage('已分享到广场');
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
        <div className="mt-6 flex gap-2 flex-wrap">
          <button className="btn w-full sm:w-auto" onClick={() => handleUpload('private')} disabled={isSaving}>{isSaving ? '保存中...' : (noteId ? (t ? t('saveUpload') : '更新并上传') : (t ? t('saveUpload') : '保存并上传'))}</button>
          <button className="btn w-full sm:w-auto" onClick={() => handleUpload('family')} disabled={isSaving || !noteId}>{t ? t('shareFamily') : '分享到家族'}</button>
          <button className="btn w-full sm:w-auto" onClick={() => handleUpload('public')} disabled={isSaving || !noteId}>{t ? t('shareSquare') : '分享到广场'}</button>
          <button className="btn w-full sm:w-auto" type="button" disabled={!noteId} onClick={async ()=>{
            try {
              const token = localStorage.getItem('token');
              const res = await axios.post(`/api/note/${noteId}/share`, { action: 'create' }, { headers: { Authorization: `Bearer ${token}` }});
              const tokenStr = res?.data?.shareToken || '';
              if (tokenStr) {
                const base = (axios.defaults.baseURL || window.location.origin).replace(/\/$/, '');
                const url = `${base}/share/${tokenStr}`;
                setShareUrl(url);
                try { await navigator.clipboard.writeText(url); setMessage('分享链接已复制，可发微信/QQ/微博'); } catch(_) { window.prompt('复制此链接', url); }
              } else {
                setMessage('分享失败');
              }
            } catch (e) {
              setMessage('生成分享链接失败：' + (e?.response?.data?.message || e?.message));
            }
          }}>生成分享链接</button>
          {shareUrl ? <div className="w-full text-sm text-gray-600 break-all">{shareUrl}</div> : null}
        </div>
      </div>
    </div>
  );
};

export default Preview;


