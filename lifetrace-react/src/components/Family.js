import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import axios from 'axios';
import { AppContext } from '../context/AppContext';

const Family = () => {
  const { isLoggedIn, familyMembers, setFamilyMembers, familyRequests, setFamilyRequests, uid } = useContext(AppContext);
  const [targetUid, setTargetUid] = useState('');
  const [relationFromRequester, setRelationFromRequester] = useState('');
  const [relationFromTarget, setRelationFromTarget] = useState('');
  const [familyBiographies, setFamilyBiographies] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    const token = localStorage.getItem('token');
    Promise.all([
      axios.get('/api/family', { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] })),
      axios.get('/api/family/requests', { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] })),
      axios.get('/api/family/biographies', { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] })),
    ]).then(([famRes, reqRes, bioRes]) => {
      setFamilyMembers(Array.isArray(famRes.data) ? famRes.data : []);
      setFamilyRequests(Array.isArray(reqRes.data) ? reqRes.data : []);
      setFamilyBiographies(Array.isArray(bioRes.data) ? bioRes.data : []);
    });
  }, [isLoggedIn, navigate, setFamilyMembers, setFamilyRequests]);

  const getOwnerRelationLabel = (ownerId, isOwnerFlag) => {
    if (isOwnerFlag) return '我';
    const m = (familyMembers || []).find(x => String(x.userId) === String(ownerId));
    return m?.relation ? m.relation : '家人';
  };

  const sendRequest = async () => {
    const token = localStorage.getItem('token');
    if (!targetUid) return alert('请输入对方UID');
    try {
      await axios.post('/api/family/request', { targetUid, relationFromRequester }, { headers: { Authorization: `Bearer ${token}` } });
      alert('请求已发送');
      setTargetUid('');
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    }
  };

  const acceptRequest = async (id) => {
    const token = localStorage.getItem('token');
    if (!relationFromTarget) return alert('请填写与对方的关系');
    try {
      await axios.post('/api/family/accept', { requestId: id, relationFromTarget }, { headers: { Authorization: `Bearer ${token}` } });
      setFamilyRequests(prev => prev.filter(r => r.id !== id));
      // refresh family list
      const fam = await axios.get('/api/family', { headers: { Authorization: `Bearer ${token}` } });
      setFamilyMembers(Array.isArray(fam.data) ? fam.data : []);
      setRelationFromTarget('');
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    }
  };

  const rejectRequest = async (id) => {
    const token = localStorage.getItem('token');
    try {
      await axios.post('/api/family/reject', { requestId: id }, { headers: { Authorization: `Bearer ${token}` } });
      setFamilyRequests(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    }
  };

  return (
    <div className="min-h-screen">
      <Helmet>
        <title>家族档案 - 永念</title>
      </Helmet>
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <h2 className="text-2xl font-bold mb-2">家族档案</h2>
        <p className="text-sm mb-4" style={{ color: '#bfa366' }}>连接家人，彼此见证，共同守护家族的记忆。</p>
        <p className="mb-4">我的UID：{uid || '获取中…'}</p>
      <div className="card p-4 mb-4" style={{ background: '#121216', borderColor: '#2a2a30' }}>
        <h3 className="font-semibold mb-2">通过UID添加家人</h3>
        <div className="flex gap-2 flex-wrap">
          <input className="input flex-1 min-w-[200px]" placeholder="对方UID" value={targetUid} onChange={e => setTargetUid(e.target.value)} />
          <input className="input flex-1 min-w-[220px]" placeholder="我与TA的关系（如：父亲/配偶）" value={relationFromRequester} onChange={e => setRelationFromRequester(e.target.value)} />
          <button className="btn" onClick={sendRequest}>发送请求</button>
        </div>
      </div>

      <div className="card p-4 mb-4" style={{ background: '#121216', borderColor: '#2a2a30' }}>
        <h3 className="font-semibold mb-2">待处理请求（对方向你发起）</h3>
        {familyRequests && familyRequests.length > 0 ? familyRequests.map(r => (
          <div key={r.id} className="flex items-center gap-2 mb-2">
            <span>来自 {r.requester.username}（UID: {r.requester.uid}），对方称呼你：{r.relationFromRequester || '未填写'}</span>
            <input className="input flex-1 min-w-[160px]" placeholder="你与TA的关系" value={relationFromTarget} onChange={e => setRelationFromTarget(e.target.value)} />
            <button className="btn" onClick={() => acceptRequest(r.id)}>接受</button>
            <button className="btn bg-gray-500 hover:bg-gray-600" onClick={() => rejectRequest(r.id)}>拒绝</button>
          </div>
        )) : <p>暂无请求</p>}
      </div>

      <div className="card p-4 mb-4" style={{ background: '#121216', borderColor: '#2a2a30' }}>
        <h3 className="font-semibold mb-2">已认证的家人</h3>
        {familyMembers && familyMembers.length > 0 ? familyMembers.map((m, idx) => (
          <div key={idx} className="mb-2">
            <span>{m.username}（UID: {m.uid}）：{m.relation}</span>
          </div>
        )) : <p>暂无家人</p>}
      </div>

      <div className="card p-4 mb-4" style={{ background: '#121216', borderColor: '#2a2a30' }}>
        <h3 className="font-semibold mb-2">家族档案（含我与家人）</h3>
        {familyBiographies && familyBiographies.length > 0 ? familyBiographies.map((b) => (
          <div key={b.id} className="flex items-center justify-between border-b py-2" style={{ borderColor: '#2a2a30' }}>
            <div>
              <div className="font-medium">{b.title || '(无标题)'} <span className="text-sm" style={{ color: '#bfa366' }}>（{getOwnerRelationLabel(b.ownerId, b.isOwner)}）</span></div>
              <div className="text-sm" style={{ color: '#bfa366' }}>{new Date(b.timestamp).toLocaleString('zh-CN')} | {b.isPublic ? '已公开' : '私有'}</div>
            </div>
            <div className="flex gap-2">
              <button className="btn" onClick={() => navigate(`/view/${b.id}`)}>查看</button>
              {b.isOwner && b.sharedWithFamily && (
                <button className="btn bg-gray-500 hover:bg-gray-600" onClick={async () => {
                  const token = localStorage.getItem('token');
                  try {
                    await axios.put(`/api/note/${b.id}/family-share`, { shared: false }, { headers: { Authorization: `Bearer ${token}` } });
                    setFamilyBiographies(prev => prev.filter(x => x.id !== b.id));
                  } catch (e) {
                    alert(e.response?.data?.message || e.message);
                  }
                }}>从家族撤销</button>
              )}
            </div>
          </div>
        )) : <p>暂无记录</p>}
      </div>
      <div className="flex justify-center">
        <button className="btn" onClick={() => navigate(-1)}>返回</button>
      </div>
      </div>
    </div>
  );
};

export default Family;