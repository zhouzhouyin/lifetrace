import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import axios from 'axios';
import { AppContext } from '../context/AppContext';

const Record = () => {
  const { setFiles, isLoggedIn } = useContext(AppContext);
  const [file, setFile] = useState(null);
  const [desc, setDesc] = useState('');
  const [preview, setPreview] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoggedIn) navigate('/login');
  }, [isLoggedIn, navigate]);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    if (selectedFile) {
      setPreview(URL.createObjectURL(selectedFile));
    }
  };

  const handleUpload = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('请先登录');
      navigate('/login');
      return;
    }
    if (!file) {
      alert('请选择文件');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('desc', desc);
    try {
      const response = await axios.post('/api/upload', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percent);
        },
      });
      console.log('Record.js: Upload response:', response.data); // 调试日志
      const newFile = {
        id: response.data.id,
        filePath: response.data.filePath,
        desc: response.data.desc,
        timestamp: response.data.timestamp,
      };
      setFiles((prev) => [...prev, newFile]);
      alert('上传成功！');
      navigate('/my');
    } catch (err) {
      console.error('Record.js: Upload error:', err);
      alert('上传失败: ' + (err.response?.data?.message || err.message));
    } finally {
      setUploadProgress(0);
    }
  };

  return (
    <div>
      <Helmet>
        <title>上传照片/视频 - 永念</title>
      </Helmet>
      <h2 className="text-2xl font-bold mb-4">上传照片/视频</h2>
      <input
        type="file"
        accept="image/*,video/*,audio/*"
        className="mb-4"
        onChange={handleFileChange}
      />
      {preview && (
        <div className="mb-4">
          {file.type.startsWith('image/') ? (
            <img src={preview} alt="预览" className="w-full h-32 object-cover rounded" />
          ) : file.type.startsWith('video/') ? (
            <video src={preview} controls className="w-full h-32 object-cover rounded" />
          ) : (
            <audio src={preview} controls className="w-full" />
          )}
        </div>
      )}
      <textarea
        className="input mb-4"
        placeholder="文件描述"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
      />
      {uploadProgress > 0 && (
        <div className="progress-container">
          <div className="progress-bar" style={{ width: `${uploadProgress}%` }}></div>
        </div>
      )}
      <div className="flex gap-4">
        <button className="btn" onClick={handleUpload}>
          上传
        </button>
        <button className="btn" onClick={() => navigate(-1)}>
          返回
        </button>
      </div>
    </div>
  );
};

export default Record;