import React, { useState, useEffect, useContext, useRef } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { AppContext } from '../context/AppContext';

const ViewFile = () => {
  const { isLoggedIn, setIsLoggedIn, setError } = useContext(AppContext);
  const { fileId } = useParams();
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const imageRef = useRef(null);

  useEffect(() => {
    if (!isLoggedIn) {
      setMessage('请先登录以查看文件');
      setError('请登录以继续');
      setTimeout(() => navigate('/login'), 1000);
      return;
    }
    if (!fileId || !/^[0-9a-fA-F]{24}$/.test(fileId)) {
      setMessage('无效的文件 ID');
      setIsLoading(false);
      return;
    }

    const fetchFile = async () => {
      setIsLoading(true);
      try {
        const token = localStorage.getItem('token');
        console.log('ViewFile.js: Fetching file with ID:', fileId);
        const response = await axios.get(`/api/upload/${fileId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        console.log('ViewFile.js: Fetch response:', response.data);
        const filePath = response.data.filePath.startsWith('/Uploads/')
          ? response.data.filePath
          : `/Uploads/${response.data.filePath.replace(/^\/?Uploads\//, '')}`;
        setFile({ ...response.data, filePath });
        setMessage('文件已加载');
      } catch (err) {
        console.error('ViewFile.js: Fetch file error:', err);
        if (err.response?.status === 404) {
          setMessage('文件不存在');
        } else if (err.response?.status === 401 || err.response?.status === 403) {
          setMessage('身份验证失败，请重新登录');
          setError('身份验证失败，请重新登录');
          localStorage.removeItem('token');
          localStorage.removeItem('username');
          setIsLoggedIn(false);
          setTimeout(() => navigate('/login'), 1000);
        } else {
          setMessage('加载文件失败：' + (err.response?.data?.message || err.message));
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchFile();
  }, [fileId, isLoggedIn, setIsLoggedIn, setError, navigate]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY * -0.01;
    setScale((prevScale) => Math.min(Math.max(prevScale + delta, 0.5), 5));
  };

  const handleMouseDown = (e) => {
    if (file?.filePath.match(/\.(jpeg|jpg|png|gif)$/i)) {
      setIsDragging(true);
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setPosition((prev) => ({
        x: prev.x + e.movementX,
        y: prev.y + e.movementY,
      }));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    const imageElement = imageRef.current;
    if (imageElement && file?.filePath.match(/\.(jpeg|jpg|png|gif)$/i)) {
      imageElement.addEventListener('wheel', handleWheel, { passive: false });
      imageElement.addEventListener('mousedown', handleMouseDown);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        imageElement.removeEventListener('wheel', handleWheel);
        imageElement.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [file, isDragging]);

  return (
    <div className="relative min-h-screen bg-black flex items-center justify-center">
      <Helmet>
        <title>查看文件 - 永念</title>
      </Helmet>
      {message && (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 p-2 rounded ${message.includes('失败') || message.includes('不存在') || message.includes('无效') ? 'bg-red-700' : 'bg-green-700'}`} style={{ color: '#e7c36f' }}>{message}</div>
      )}
      {isLoading ? (
        <div className="text-center" style={{ color: '#e7c36f' }}>加载中...</div>
      ) : file ? (
        <div className="relative w-full h-screen flex flex-col items-center justify-center">
          <h3 className="text-lg font-semibold mb-4" style={{ color: '#d6b46a' }}>{file.desc || '无描述'}</h3>
          <p className="text-sm text-gray-400 mb-4">{new Date(file.timestamp).toLocaleString('zh-CN')}</p>
          {file.filePath.match(/\.(jpeg|jpg|png|gif|webp|bmp)$/i) ? (
            <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
              <img
                ref={imageRef}
                src={`${file.filePath}`}
                alt={file.desc || '文件'}
                className="max-w-none max-h-none cursor-move"
                style={{
                  transform: `scale(${scale}) translate(${position.x}px, ${position.y}px)`,
                  transition: isDragging ? 'none' : 'transform 0.2s ease',
                }}
                onError={(e) => {
                  console.error('ViewFile.js: Image load error:', file.id, file.filePath);
                  setMessage('图片加载失败，请检查文件路径');
                }}
              />
            </div>
          ) : file.filePath.match(/\.(mp4|webm|ogg|mov|m4v|mkv)$/i) ? (
            <video
              src={`${file.filePath}`}
              controls
              className="w-full h-auto max-h-screen object-contain"
              onError={(e) =>
                console.error('ViewFile.js: Video load error:', file.id, file.filePath)
              }
            />
          ) : file.filePath.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/i) ? (
            <audio
              src={`${file.filePath}`}
              controls
              className="w-full"
              onError={(e) =>
                console.error('ViewFile.js: Audio load error:', file.id, file.filePath)
              }
            />
          ) : (
            <p className="text-red-500">不支持的文件格式</p>
          )}
          <button className="absolute bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded" style={{ backgroundColor: '#1a1a1e', color: '#e7c36f', border: '1px solid #3a3a40' }} onClick={() => navigate(-1)}>返回</button>
        </div>
      ) : (
        <p className="text-center" style={{ color: '#e7c36f' }}>无文件数据</p>
      )}
    </div>
  );
};

export default ViewFile;