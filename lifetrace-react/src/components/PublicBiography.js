import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const PublicBiography = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`/api/public/biography/${id}`);
        setData(res.data);
      } catch (err) {
        setMessage(err.response?.data?.message || err.message || '加载失败');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) return <div className="min-h-screen bg-gray-100 py-6"><div className="card max-w-3xl mx-auto">加载中…</div></div>;
  if (!data) return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="card max-w-3xl mx-auto">
        <div className="mb-3 text-red-600">{message || '未找到该传记或未公开'}</div>
        <button className="btn" onClick={() => navigate('/')}>返回首页</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="card max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">{(data.title || '').trim() || '无标题'}</h1>
        {(data.username || data.uid) && (
          <div className="text-sm text-gray-600 mb-4">作者：{data.username || data.uid}</div>
        )}
        <div className="space-y-4">
          {(data.content || '').split(/\n\n+/).filter(Boolean).map((p, i) => (
            <p key={i} className="whitespace-pre-wrap text-gray-800">{p}</p>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PublicBiography;


