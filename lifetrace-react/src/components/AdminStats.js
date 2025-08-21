import React, { useEffect, useState, useContext } from 'react';
import axios from 'axios';
import { AppContext } from '../context/AppContext';

const AdminStats = () => {
  const { t } = useContext(AppContext);
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` }});
        setData(res.data);
      } catch (e) {
        setMsg(e?.response?.data?.message || e?.message || '加载失败');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="card max-w-5xl mx-auto w-full">
        <h2 className="text-2xl font-bold mb-4">后台统计</h2>
        {loading && <div>加载中…</div>}
        {msg && <div className="text-red-600 mb-3">{msg}</div>}
        {data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 border rounded"><div className="text-gray-500">总用户</div><div className="text-2xl font-bold">{data.totalUsers}</div></div>
              <div className="p-4 border rounded"><div className="text-gray-500">近7天新增</div><div className="text-2xl font-bold">{data.newUsers7d}</div></div>
              <div className="p-4 border rounded"><div className="text-gray-500">近7天登录</div><div className="text-2xl font-bold">{data.logins7d}</div></div>
              <div className="p-4 border rounded"><div className="text-gray-500">DAU</div><div className="text-2xl font-bold">{data.dau}</div></div>
              <div className="p-4 border rounded"><div className="text-gray-500">WAU</div><div className="text-2xl font-bold">{data.wau}</div></div>
              <div className="p-4 border rounded"><div className="text-gray-500">传记总数</div><div className="text-2xl font-bold">{data.totalBio}</div></div>
              <div className="p-4 border rounded"><div className="text-gray-500">公开传记</div><div className="text-2xl font-bold">{data.publicBio}</div></div>
            </div>
            {/* 简易趋势：此处先占位，后续可接后端趋势数据 */}
            <div className="p-4 border rounded bg-white">
              <div className="text-gray-600 mb-2">趋势（占位）</div>
              <div className="h-32 bg-gray-100 rounded flex items-center justify-center text-gray-400">Coming soon</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminStats;


