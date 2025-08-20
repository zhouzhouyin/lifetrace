import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { AppContext } from '../context/AppContext';

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

const View = () => {
  const { isLoggedIn, setError, notes } = useContext(AppContext);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const noteId = location.state?.noteId;
  const noteType = location.state?.type || 'Note';

  useEffect(() => {
    if (!isLoggedIn) {
      setError('请登录以继续');
      navigate('/login');
      return;
    }
    if (!noteId) {
      setMessage('无效的笔记 ID');
      return;
    }

    const note = notes.find(n => n.id === noteId);
    if (!/^[0-9a-fA-F]{24}$/.test(noteId)) {
      if (note) {
        setTitle(note.title || '');
        setContent(note.content || '');
        setMessage(`${noteType === 'Biography' ? '传记' : '随笔'}已从本地加载`);
      } else {
        setMessage(`无效的${noteType === 'Biography' ? '传记' : '随笔'} ID`);
      }
      return;
    }

    const fetchNote = async () => {
      const token = localStorage.getItem('token');
      try {
        const response = await retry(() =>
          axios.get(`/api/note/${noteId}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
        );
        const noteData = response.data;
        setTitle(noteData.title || '');
        setContent(noteData.content || '');
      } catch (err) {
        console.error('Fetch note error:', err);
        if (err.response?.status === 404) {
          if (note) {
            setTitle(note.title || '');
            setContent(note.content || '');
            setMessage(`${noteType === 'Biography' ? '传记' : '随笔'}不存在，已从本地加载`);
          } else {
            setMessage(`${noteType === 'Biography' ? '传记' : '随笔'}不存在`);
          }
        } else if (err.response?.status === 401 || err.response?.status === 403) {
          setError('身份验证失败，请重新登录');
          localStorage.removeItem('token');
          localStorage.removeItem('username');
          navigate('/login');
        } else {
          setMessage(`加载${noteType === 'Biography' ? '传记' : '随笔'}失败：${err.response?.data?.message || err.message}`);
        }
      }
    };
    fetchNote();
  }, [isLoggedIn, noteId, navigate, setError, notes, noteType]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="card max-w-2xl w-full">
        <Helmet>
          <title>查看{noteType === 'Biography' ? '传记' : '随笔'} - 永念</title>
        </Helmet>
        <h2 className="text-2xl font-bold text-center mb-6">查看{noteType === 'Biography' ? '传记' : '随笔'}</h2>
        {message && (
          <div className={`mb-4 p-2 text-center text-white rounded ${message.includes('失败') || message.includes('不存在') || message.includes('无效') ? 'bg-red-500' : 'bg-green-500'}`}>
            {message}
          </div>
        )}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">{title || '无标题'}</h3>
            <p className="text-gray-700 whitespace-pre-wrap">{content || '无内容'}</p>
          </div>
          <button
            className="btn bg-gray-500 hover:bg-gray-600"
            onClick={() => navigate('/my')}
          >
            返回
          </button>
        </div>
      </div>
    </div>
  );
};

export default View;