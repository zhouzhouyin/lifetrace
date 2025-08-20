import React, { useEffect, useState, useContext } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';

const AdminReports = () => {
  const { lang } = useContext(AppContext);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const fetchReports = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) { setMessage(lang === 'zh' ? '请先登录' : 'Please log in first'); navigate('/login'); return; }
      const res = await axios.get('/api/reports', { headers: { Authorization: `Bearer ${token}` } });
      setReports(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setMessage((lang === 'zh' ? '获取举报列表失败：' : 'Failed to fetch reports: ') + (e?.response?.data?.message || e?.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReports(); // eslint-disable-next-line
  }, []);

  const updateStatus = async (id, status) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`/api/report/${id}`, { status }, { headers: { Authorization: `Bearer ${token}` } });
      setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch (e) {
      alert((lang === 'zh' ? '更新失败：' : 'Update failed: ') + (e?.response?.data?.message || e?.message));
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="card max-w-4xl mx-auto">
        <h2 className="text-xl font-bold mb-3">{lang === 'zh' ? '举报管理' : 'Report Management'}</h2>
        {message && <div className="mb-2 text-sm text-red-600">{message}</div>}
        {loading ? (
          <div>{lang === 'zh' ? '加载中...' : 'Loading...'}</div>
        ) : (
          <div className="space-y-3">
            {reports.length === 0 ? (
              <div>{lang === 'zh' ? '暂无举报' : 'No reports yet'}</div>
            ) : reports.map(r => (
              <div key={r.id} className="border rounded p-3 bg-white flex flex-col gap-1">
                <div className="text-sm text-gray-700">{lang === 'zh' ? '举报人' : 'Reporter'}: {r.reporterUsername || '-'}</div>
                <div className="text-sm text-gray-700">{lang === 'zh' ? '传记标题' : 'Title'}: {r.noteTitle || '-'}</div>
                <div className="text-sm text-gray-700">{lang === 'zh' ? '原因' : 'Reason'}: {r.reason || '-'}</div>
                <div className="text-sm text-gray-700">{lang === 'zh' ? '说明' : 'Details'}: {r.details || '-'}</div>
                <div className="text-sm text-gray-700">{lang === 'zh' ? '状态' : 'Status'}: {r.status}</div>
                <div className="flex gap-2 mt-2">
                  <button className="btn" onClick={() => updateStatus(r.id, 'pending')}>{lang === 'zh' ? '设为待处理' : 'Set Pending'}</button>
                  <button className="btn" onClick={() => updateStatus(r.id, 'reviewed')}>{lang === 'zh' ? '设为已审核' : 'Set Reviewed'}</button>
                  <button className="btn" onClick={() => updateStatus(r.id, 'rejected')}>{lang === 'zh' ? '设为已驳回' : 'Set Rejected'}</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4">
          <button className="btn" onClick={() => navigate(-1)}>{lang === 'zh' ? '返回' : 'Back'}</button>
        </div>
      </div>
    </div>
  );
};

export default AdminReports;


