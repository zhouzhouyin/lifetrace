import { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
// QR 取消使用
import axios from 'axios';
import { AppContext } from '../context/AppContext';

const Square = () => {
  const { publicBiographies, setPublicBiographies, publicNotes, setPublicNotes, lang } = useContext(AppContext);
  const navigate = useNavigate();
  const [hiddenIds, setHiddenIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hiddenPosts') || '[]'); } catch { return []; }
  });

  const toggleFavorite = async (postId, type, isFav) => {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('请先登录');
      navigate('/login');
      return;
    }
    try {
      if (type !== 'Biography') {
        alert('目前仅支持收藏传记');
        return;
      }
      if (isFav) {
        await axios.delete(`/api/favorite/${postId}`, { headers: { Authorization: `Bearer ${token}` } });
        alert('已取消收藏');
      } else {
        await axios.post(`/api/favorite/${postId}`, {}, { headers: { Authorization: `Bearer ${token}` } });
        alert('已收藏');
      }
    } catch (err) {
      console.error('Toggle favorite failed:', err);
      alert((isFav ? '取消收藏失败：' : '收藏失败：') + (err.response?.data?.message || err.message));
    }
  };

  const handleLike = async (postId, type) => {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('请先登录');
      navigate('/login');
      return;
    }
    try {
      await axios.post(`/api/square/${postId}/like`);
      if (type === 'Biography') {
        setPublicBiographies(
          publicBiographies.map((post) =>
            post.id === postId ? { ...post, likes: (post.likes || 0) + 1 } : post
          )
        );
      } else {
        setPublicNotes(
          publicNotes.map((post) =>
            post.id === postId ? { ...post, likes: (post.likes || 0) + 1 } : post
          )
        );
      }
    } catch (err) {
      console.error('Failed to like post:', err);
      alert('点赞失败: ' + (err.response?.data?.message || err.message));
    }
  };

  const readText = (text) => {
    if (!window.speechSynthesis) {
      alert(lang === 'zh' ? '浏览器不支持语音朗读' : 'Browser does not support speech synthesis');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    window.speechSynthesis.speak(utterance);
  };

  const posts = [...publicBiographies, ...publicNotes].filter(p => !hiddenIds.includes(p.id)).sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );

  const reportPost = async (postId) => {
    const token = localStorage.getItem('token');
    if (!token) { alert(lang === 'zh' ? '请先登录' : 'Please log in first'); navigate('/login'); return; }
    // 弹窗收集理由
    const reason = window.prompt(lang === 'zh' ? '请输入举报原因（可选）' : 'Enter a reason for reporting (optional)') || '';
    const details = window.prompt(lang === 'zh' ? '请补充说明（可选）' : 'Additional details (optional)') || '';
    if (!window.confirm(lang === 'zh' ? '确认要举报此传记吗？举报后它将对你不可见。' : 'Report this biography? It will be hidden for you.')) return;
    try {
      await axios.post('/api/report', { noteId: postId, reason, details }, { headers: { Authorization: `Bearer ${token}` } });
      const nextHidden = Array.from(new Set([...(hiddenIds || []), postId]));
      setHiddenIds(nextHidden);
      try { localStorage.setItem('hiddenPosts', JSON.stringify(nextHidden)); } catch {}
      alert(lang === 'zh' ? '已提交举报，该传记将不再显示' : 'Reported. This biography will no longer be shown.');
    } catch (err) {
      console.error('Report failed:', err);
      alert((lang === 'zh' ? '举报失败：' : 'Report failed: ') + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div className="container mx-auto px-3 sm:px-4">
      <Helmet>
        <title>{lang === 'zh' ? '大家的故事 - 永念' : 'Community - LifeTrace'}</title>
      </Helmet>
      <h2 className="text-xl sm:text-2xl font-bold mb-4">{lang === 'zh' ? '大家的故事' : 'Community'}</h2>
      <div className="space-y-3 sm:space-y-4">
        {posts.length > 0 ? (
          posts.map((post) => (
            <div key={post.id} className="card p-3 sm:p-4">
              <h3 className="font-bold">
                {post.username} ({post.type})
              </h3>
              {post.type === 'Biography' ? (
                <div>
                  {post.title && <h4 className="font-semibold mb-1">{post.title}</h4>}
                  <p className="whitespace-pre-wrap text-gray-800">{(post.summary || post.content || '').substring(0, 150)}{(post.summary || post.content || '').length > 150 ? '...' : ''}</p>
                </div>
              ) : (
                <>
                  <h4 className="font-semibold">{post.title}</h4>
                  <p>{(post.content || '').substring(0, 100)}...</p>
                </>
              )}
              <p className="text-sm text-gray-500">{lang === 'zh' ? '点赞' : 'Likes'}: {post.likes || 0}</p>
              <p className="text-sm text-gray-500">
                {new Date(post.timestamp).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}
              </p>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                <button className="btn w-full sm:w-auto" onClick={() => handleLike(post.id, post.type)}>
                  {lang === 'zh' ? '点赞' : 'Like'}
                </button>
                {post.type === 'Biography' && (
                  <button
                    className="btn w-full sm:w-auto"
                    onClick={() => toggleFavorite(post.id, post.type, false)}
                  >
                    {lang === 'zh' ? '收藏' : 'Favorite'}
                  </button>
                )}
                <button className="btn w-full sm:w-auto" onClick={() => navigate(`/view/${post.id}`)}>{lang === 'zh' ? '查看' : 'View'}</button>
                {post.type === 'Biography' && (
                  <button className="btn bg-red-600 hover:bg-red-700 w-full sm:w-auto" onClick={() => reportPost(post.id)}>
                    {lang === 'zh' ? '举报' : 'Report'}
                  </button>
                )}
              </div>
            </div>
          ))
        ) : (
          <p>{lang === 'zh' ? '暂无公开内容' : 'No public content yet'}</p>
        )}
      </div>
      <button className="btn mt-4" onClick={() => navigate(-1)}>
        {lang === 'zh' ? '返回' : 'Back'}
      </button>
    </div>
  );
};

export default Square;