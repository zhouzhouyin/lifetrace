import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { QRCodeCanvas } from 'qrcode.react';
import './index.css';
import axios from 'axios';

axios.defaults.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
axios.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
}, error => Promise.reject(error));

const routerConfig = {
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true,
  },
};

const questions = [
  "你的姓名和出生年月？",
  "你童年最难忘的记忆是什么？",
  "你人生中最骄傲的成就是什么？",
  "你的家庭对你有哪些深远影响？",
  "你经历过的最困难的时刻是什么？",
  "你最珍视的人际关系是怎样的？",
  "你的职业生涯或兴趣爱好如何塑造了你？",
  "你对未来的期望或梦想是什么？",
];

const eternalImprints = [
  "生成实体书",
  "生成影集",
  "生成时光胶囊",
  "生成实体电子墓碑",
];

const Login = ({ setIsLoggedIn }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const response = await axios.post('/api/login', { username, password });
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('username', username);
      setIsLoggedIn(true);
      alert('登录成功！');
      navigate('/');
    } catch (err) {
      alert('登录失败: ' + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div className="text-center">
      <Helmet>
        <title>登录 - 永念</title>
      </Helmet>
      <h2 className="text-2xl font-bold mb-4">登录</h2>
      <div className="flex flex-col gap-4 max-w-md mx-auto">
        <input
          type="text"
          className="input"
          placeholder="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          className="input"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn" onClick={handleLogin}>登录</button>
        <button className="btn" onClick={() => navigate('/register')}>去注册</button>
      </div>
    </div>
  );
};

const Register = ({ setIsLoggedIn }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleRegister = async () => {
    try {
      await axios.post('/api/register', { username, password });
      alert('注册成功！请登录');
      setIsLoggedIn(false);
      navigate('/login');
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message;
      if (errorMessage.includes('E11000') || errorMessage.includes('duplicate key')) {
        alert('注册失败：用户名已存在，请尝试其他用户名');
      } else {
        alert('注册失败：' + errorMessage);
      }
    }
  };

  return (
    <div className="text-center">
      <Helmet>
        <title>注册 - 永念</title>
      </Helmet>
      <h2 className="text-2xl font-bold mb-4">注册</h2>
      <div className="flex flex-col gap-4 max-w-md mx-auto">
        <input
          type="text"
          className="input"
          placeholder="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          className="input"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn" onClick={handleRegister}>注册</button>
        <button className="btn" onClick={() => navigate('/login')}>返回登录</button>
      </div>
    </div>
  );
};

const Home = ({ isLoggedIn }) => {
  const navigate = useNavigate();
  return (
    <div className="text-center">
      <Helmet>
        <title>首页 - 永念</title>
      </Helmet>
      <h2 className="text-2xl font-bold mb-4">
        欢迎使用永念 {isLoggedIn ? '(已登录)' : '(未登录)'}
      </h2>
      <div className="flex flex-wrap gap-4 justify-center">
        <button className="btn" onClick={() => navigate(isLoggedIn ? '/create' : '/login')}>创建传记</button>
        <button className="btn" onClick={() => navigate(isLoggedIn ? '/record' : '/login')}>上传照片/视频</button>
        <button className="btn" onClick={() => navigate(isLoggedIn ? '/note' : '/login')}>写随笔</button>
        <button className="btn" onClick={() => navigate('/square')}>查看广场</button>
        <button className="btn" onClick={() => navigate(isLoggedIn ? '/chat' : '/login')}>聊天交友</button>
        <button className="btn" onClick={() => navigate(isLoggedIn ? '/family' : '/login')}>家族传记</button>
        <button className="btn" onClick={() => navigate(isLoggedIn ? '/my' : '/login')}>我的</button>
      </div>
    </div>
  );
};

const CreateBiography = ({ answers, setAnswers, freeBiography, setFreeBiography, setPublicBiographies, isLoggedIn }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [polishedBiography, setPolishedBiography] = useState('');
  const [isPolishing, setIsPolishing] = useState(false);
  const [publicBio, setPublicBio] = useState(false);
  const [videoFile, setVideoFile] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoggedIn) navigate('/login');
  }, [isLoggedIn, navigate]);

  const handleSpeech = (targetId) => {
    if (!window.webkitSpeechRecognition) {
      alert('浏览器不支持语音输入，请手动输入');
      return;
    }
    const recognition = new window.webkitSpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      if (targetId === 'free-biography') {
        setFreeBiography(freeBiography + (freeBiography ? '\n' : '') + text);
      } else {
        const index = parseInt(targetId.split('-')[1]);
        const newAnswers = [...answers];
        newAnswers[index] = newAnswers[index] ? newAnswers[index] + ' ' + text : text;
        setAnswers(newAnswers);
        setFreeBiography(newAnswers.filter(a => a).join('\n'));
      }
    };
    recognition.onerror = () => alert('语音识别失败，请重试');
    recognition.start();
  };

  const handleAnswerChange = (e) => {
    const newAnswers = [...answers];
    newAnswers[currentQuestionIndex] = e.target.value;
    setAnswers(newAnswers);
    setFreeBiography(newAnswers.filter(a => a).join('\n'));
  };

  const handleVideoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setVideoFile(URL.createObjectURL(file));
      alert('视频已上传，文字转录需后端支持，当前仅显示预览');
    }
  };

  const handlePolish = async () => {
    setIsPolishing(true);
    const bioText = answers.filter(a => a).join(' ') + (freeBiography ? ' ' + freeBiography : '');
    if (!bioText.trim()) {
      alert('请至少回答一个问题或输入自由传记内容');
      setIsPolishing(false);
      return;
    }
    try {
      const response = { data: { polishedText: `润色后的传记：${bioText}。这段人生经历已被优化，愿它启发后人。` } };
      setPolishedBiography(response.data.polishedText);
      alert('传记已润色！');
    } catch (err) {
      console.error('Failed to polish biography:', err);
      alert('润色失败，请稍后重试');
    } finally {
      setIsPolishing(false);
    }
  };

  const handleSave = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('请先登录');
      navigate('/login');
      return;
    }
    const bioText = polishedBiography || answers.filter(a => a).join(' ') + (freeBiography ? ' ' + freeBiography : '');
    if (!bioText.trim()) {
      alert('请至少回答一个问题或输入自由传记内容');
      return;
    }
    try {
      const response = await axios.post('/api/note', {
        title: 'Biography ' + new Date().toISOString().slice(0, 19).replace('T', ' '),
        content: bioText,
        public: publicBio,
        cloudStatus: 'Not Uploaded',
      });
      if (publicBio) {
        setPublicBiographies(prev => [...prev, {
          id: response.data._id,
          username: localStorage.getItem('username') || 'testuser',
          biography: bioText,
          timestamp: new Date().toISOString(),
          likes: 0,
          type: 'Biography',
        }]);
      }
      alert('传记保存成功！');
      navigate('/my');
    } catch (err) {
      console.error('Save biography error:', err);
      alert('保存失败: ' + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div>
      <Helmet>
        <title>创建传记 - 永念</title>
      </Helmet>
      <h2 className="text-2xl font-bold mb-4">创建传记</h2>
      <div className="flex flex-col gap-6">
        <div>
          <h3 className="text-xl font-semibold mb-2">引导问题</h3>
          <div className="mb-4">
            <p className="mb-2 font-medium">{questions[currentQuestionIndex]}</p>
            <textarea
              className="input w-full"
              value={answers[currentQuestionIndex] || ''}
              onChange={handleAnswerChange}
              placeholder={`请输入关于“${questions[currentQuestionIndex]}”的回答...`}
            />
            <div className="flex gap-4 mt-2">
              <button
                type="button"
                className="btn"
                onClick={() => handleSpeech(`answer-${currentQuestionIndex}`)}
              >
                语音输入
              </button>
              <button
                className="btn"
                disabled={currentQuestionIndex === 0}
                onClick={() => setCurrentQuestionIndex(currentQuestionIndex - 1)}
              >
                上一个
              </button>
              <button
                className="btn"
                disabled={currentQuestionIndex === questions.length - 1}
                onClick={() => setCurrentQuestionIndex(currentQuestionIndex + 1)}
              >
                下一个
              </button>
            </div>
          </div>
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-2">自由编写传记</h3>
          <textarea
            className="input w-full h-64"
            placeholder="自由编写你的传记，记录更多人生故事..."
            value={freeBiography}
            onChange={(e) => setFreeBiography(e.target.value)}
          />
          <div className="flex gap-4 mt-2">
            <button
              type="button"
              className="btn"
              onClick={() => handleSpeech('free-biography')}
            >
              语音输入
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => document.getElementById('video-upload').click()}
            >
              视频输入
            </button>
            <input
              type="file"
              id="video-upload"
              accept="video/*"
              className="hidden"
              onChange={handleVideoUpload}
            />
          </div>
          {videoFile && (
            <video src={videoFile} className="w-full h-32 object-cover rounded mt-2" controls />
          )}
          <div className="mt-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={publicBio}
                onChange={(e) => setPublicBio(e.target.checked)}
              />
              公开到广场
            </label>
          </div>
          <div className="flex gap-4 mt-4">
            <button
              className="btn"
              onClick={handlePolish}
              disabled={isPolishing}
            >
              {isPolishing ? '润色中...' : 'AI 润色'}
            </button>
            <button className="btn" onClick={handleSave}>
              保存
            </button>
            <button className="btn" onClick={() => navigate(-1)}>
              返回
            </button>
          </div>
          {polishedBiography && (
            <div className="mt-4">
              <h3 className="text-xl font-semibold mb-2">润色后的传记</h3>
              <p className="p-4 bg-gray-50 rounded">{polishedBiography}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Record = ({ setUploads, isLoggedIn }) => {
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
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percent);
        },
      });
      setUploads((prev) => [...prev, {
        id: response.data._id,
        url: response.data.filePath,
        desc,
        timestamp: new Date().toISOString(),
      }]);
      alert('上传成功！');
      navigate('/my');
    } catch (err) {
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
        accept="image/*,video/*"
        className="mb-4"
        onChange={handleFileChange}
      />
      {preview && (
        <div className="mb-4">
          {file.type.startsWith('image/') ? (
            <img src={preview} alt="预览" className="w-full h-32 object-cover rounded" />
          ) : (
            <video src={preview} controls className="w-full h-32 object-cover rounded" />
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
        <button className="btn" onClick={handleUpload}>上传</button>
        <button className="btn" onClick={() => navigate(-1)}>返回</button>
      </div>
    </div>
  );
};

const Note = ({ notes, setNotes, setPublicNotes, isLoggedIn }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [noteId, setNoteId] = useState(null);
  const [publicNote, setPublicNote] = useState(false);
  const [cloudStatus, setCloudStatus] = useState('Not Uploaded');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isLoggedIn) navigate('/login');
    const note = notes.find(n => n.id === location.state?.noteId);
    if (note) {
      setNoteId(location.state.noteId);
      setTitle(note.title);
      setContent(note.content);
      setPublicNote(note.public || false);
      setCloudStatus(note.cloudStatus || 'Not Uploaded');
    }
  }, [isLoggedIn, location.state, notes, navigate]);

  const handleSave = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('请先登录');
      navigate('/login');
      return;
    }
    if (!content.trim()) {
      alert('请输入随笔内容');
      return;
    }
    try {
      if (noteId) {
        await axios.put(`/api/note/${noteId}`, {
          title,
          content,
          public: publicNote,
          cloudStatus,
        });
        setNotes(notes.map(n => n.id === noteId ? { ...n, title, content, public: publicNote, cloudStatus, timestamp: new Date().toISOString() } : n));
        if (publicNote) {
          setPublicNotes(prev => prev.filter(p => p.id !== noteId).concat({
            id: noteId,
            username: localStorage.getItem('username') || 'testuser',
            title,
            content,
            timestamp: new Date().toISOString(),
            likes: notes.find(n => n.id === noteId)?.likes || 0,
            type: 'Note',
          }));
        }
      } else {
        const response = await axios.post('/api/note', {
          title,
          content,
          public: publicNote,
          cloudStatus,
        });
        const newNote = {
          id: response.data._id,
          username: localStorage.getItem('username') || 'testuser',
          title,
          content,
          public: publicNote,
          cloudStatus,
          timestamp: new Date().toISOString(),
        };
        setNotes([...notes, newNote]);
        if (publicNote) {
          setPublicNotes(prev => [...prev, { ...newNote, type: 'Note', likes: 0 }]);
        }
      }
      alert('随笔保存成功！');
      navigate('/my');
    } catch (err) {
      alert('保存失败: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleUploadToCloud = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('请先登录');
      navigate('/login');
      return;
    }
    if (!content.trim()) {
      alert('请输入随笔内容');
      return;
    }
    try {
      await axios.post('/api/note/upload', {
        id: noteId || 'temp-' + Math.random().toString(36).substr(2, 9),
        title,
        content,
      });
      setCloudStatus('Uploaded');
      setNotes(notes.map(n => n.id === noteId ? { ...n, cloudStatus: 'Uploaded' } : n));
      alert('随笔已上传到云端！');
    } catch (err) {
      alert('上传到云端失败: ' + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div>
      <Helmet>
        <title>写随笔 - 永念</title>
      </Helmet>
      <h2 className="text-2xl font-bold mb-4">写随笔</h2>
      <input
        type="text"
        className="input mb-4"
        placeholder="随笔标题"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="input mb-4 h-64"
        placeholder="随笔内容"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="mt-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={publicNote}
            onChange={(e) => setPublicNote(e.target.checked)}
          />
          公开到广场
        </label>
      </div>
      <div className="flex gap-4 mt-4">
        <button className="btn" onClick={handleSave}>保存</button>
        <button className="btn" onClick={handleUploadToCloud}>上传到云端</button>
        <button className="btn" onClick={() => navigate(-1)}>返回</button>
      </div>
      {cloudStatus === 'Uploaded' && (
        <p className="mt-2 text-green-600">已上传到云端</p>
      )}
    </div>
  );
};

const Square = ({ publicBiographies, setPublicBiographies, publicNotes, setPublicNotes }) => {
  const navigate = useNavigate();

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
        setPublicBiographies(publicBiographies.map(post =>
          post.id === postId ? { ...post, likes: (post.likes || 0) + 1 } : post
        ));
      } else {
        setPublicNotes(publicNotes.map(post =>
          post.id === postId ? { ...post, likes: (post.likes || 0) + 1 } : post
        ));
      }
    } catch (err) {
      console.error('Failed to like post:', err);
      alert('点赞失败: ' + (err.response?.data?.message || err.message));
    }
  };

  const readText = (text) => {
    if (!window.speechSynthesis) {
      alert('浏览器不支持语音朗读');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    window.speechSynthesis.speak(utterance);
  };

  const posts = [...publicBiographies, ...publicNotes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return (
    <div>
      <Helmet>
        <title>广场 - 永念</title>
      </Helmet>
      <h2 className="text-2xl font-bold mb-4">广场</h2>
      <div className="space-y-4">
        {posts.length > 0 ? posts.map((post) => (
          <div key={post.id} className="card">
            <h3 className="font-bold">{post.username} ({post.type})</h3>
            {post.type === 'Biography' ? (
              <p>{post.biography.substring(0, 100)}...</p>
            ) : (
              <>
                <h4 className="font-semibold">{post.title}</h4>
                <p>{post.content.substring(0, 100)}...</p>
              </>
            )}
            <p className="text-sm text-gray-500">点赞: {post.likes || 0}</p>
            <p className="text-sm text-gray-500">{new Date(post.timestamp).toLocaleString('zh-CN')}</p>
            <div className="flex gap-4">
              <button className="btn" onClick={() => handleLike(post.id, post.type)}>点赞</button>
              <button className="btn" onClick={() => readText(post.type === 'Biography' ? post.biography : post.content)}>朗读</button>
              <QRCodeCanvas value={`https://your-app.com/post/${post.id}`} size={100} />
            </div>
          </div>
        )) : <p>暂无公开内容</p>}
      </div>
      <button className="btn mt-4" onClick={() => navigate(-1)}>返回</button>
    </div>
  );
};

const Chat = ({ isLoggedIn }) => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [recipient, setRecipient] = useState('');
  const [friends, setFriends] = useState([]);
  const [friendName, setFriendName] = useState('');
  const [wsError, setWsError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    axios.get('/api/friends')
      .then((response) => setFriends(response.data))
      .catch((error) => console.error('Failed to fetch friends:', error));
    try {
      const websocket = new WebSocket(process.env.REACT_APP_WS_URL || 'ws://localhost:5000');
      websocket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        setMessages((prev) => [...prev, msg]);
      };
      websocket.onerror = () => {
        setWsError('无法连接到聊天服务器，请稍后重试');
      };
      websocket.onclose = () => {
        setWsError('聊天服务器连接已关闭');
      };
      return () => websocket.close();
    } catch (err) {
      setWsError('聊天功能当前不可用，请检查后端服务');
    }
  }, [isLoggedIn, navigate]);

  const handleSend = () => {
    if (!message.trim() || !recipient) {
      alert('请填写消息内容并选择收件人');
      return;
    }
    alert('聊天功能需后端支持，当前不可用');
  };

  const handleAddFriend = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('请先登录');
      navigate('/login');
      return;
    }
    if (!friendName.trim()) {
      alert('请输入朋友用户名');
      return;
    }
    try {
      await axios.post('/api/friends', { target: friendName });
      setFriends([...friends, { username: friendName }]);
      alert(`已添加 ${friendName} 为好友`);
      setFriendName('');
    } catch (err) {
      alert('添加好友失败: ' + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div>
      <Helmet>
        <title>聊天交友 - 永念</title>
      </Helmet>
      <h2 className="text-2xl font-bold mb-4">聊天交友</h2>
      <div className="space-y-4">
        {wsError && <p className="text-red-500">{wsError}</p>}
        <div>
          <h3 className="text-xl font-semibold mb-2">添加好友</h3>
          <input
            type="text"
            className="input mb-2"
            placeholder="输入朋友用户名"
            value={friendName}
            onChange={(e) => setFriendName(e.target.value)}
          />
          <button className="btn" onClick={handleAddFriend}>添加好友</button>
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-2">选择好友</h3>
          <select
            className="input mb-4"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          >
            <option value="">选择好友</option>
            {friends.map((friend, index) => (
              <option key={index} value={friend.username}>{friend.username}</option>
            ))}
          </select>
        </div>
        <div className="chat-container">
          <div className="chat-messages">
            {messages.map((msg, index) => (
              <p key={index}>
                <strong>{msg.from}:</strong> {msg.message} <small>{new Date(msg.timestamp).toLocaleString('zh-CN')}</small>
              </p>
            ))}
          </div>
          <div className="chat-input">
            <input
              type="text"
              className="input flex-1"
              placeholder="输入消息..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <button className="btn" onClick={handleSend}>发送</button>
          </div>
        </div>
      </div>
      <button className="btn mt-4" onClick={() => navigate(-1)}>返回</button>
    </div>
  );
};

const Family = ({ isLoggedIn, publicBiographies }) => {
  const [familyMembers, setFamilyMembers] = useState([]);
  const [filterName, setFilterName] = useState('');
  const [filterRelation, setFilterRelation] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    axios.get('/api/family')
      .then((response) => setFamilyMembers(response.data))
      .catch((error) => console.error('Failed to fetch family data:', error));
  }, [isLoggedIn, navigate]);

  const getBiography = (username) => {
    return publicBiographies.find(bio => bio.username === username)?.biography || '暂无传记';
  };

  const readText = (text) => {
    if (!window.speechSynthesis) {
      alert('浏览器不支持语音朗读');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    window.speechSynthesis.speak(utterance);
  };

  const filteredMembers = familyMembers.filter(member =>
    (!filterName || member.name.toLowerCase().includes(filterName.toLowerCase())) &&
    (!filterRelation || member.relation === filterRelation)
  );

  return (
    <div>
      <Helmet>
        <title>家族传记 - 永念</title>
      </Helmet>
      <h2 className="text-2xl font-bold mb-4">家族传记</h2>
      <div className="flex gap-4 mb-4">
        <input
          type="text"
          className="input"
          placeholder="按姓名过滤"
          value={filterName}
          onChange={(e) => setFilterName(e.target.value)}
        />
        <select
          className="input"
          value={filterRelation}
          onChange={(e) => setFilterRelation(e.target.value)}
        >
          <option value="">按关系过滤</option>
          <option value="parent">父母</option>
          <option value="grandparent">祖父母</option>
          <option value="sibling">兄弟姐妹</option>
          <option value="spouse">配偶</option>
        </select>
      </div>
      <div className="space-y-4">
        {filteredMembers.length > 0 ? filteredMembers.map((member, index) => (
          <div key={index} className="card">
            <h3 className="font-bold">{member.name} ({member.relation})</h3>
            <p>{getBiography(member.name).substring(0, 100)}...</p>
            <div className="flex gap-4">
              <button className="btn" onClick={() => readText(getBiography(member.name))}>朗读</button>
              <QRCodeCanvas value={`https://your-app.com/user/${member.name}`} size={100} />
            </div>
          </div>
        )) : <p>暂无家族传记</p>}
      </div>
      <button className="btn mt-4" onClick={() => navigate(-1)}>返回</button>
    </div>
  );
};

const Contact = () => {
  const navigate = useNavigate();
  return (
    <div>
      <Helmet>
        <title>联系我们 - 永念</title>
      </Helmet>
      <h2 className="text-2xl font-bold mb-4">联系我们</h2>
      <p className="mb-4">请联系我们以生成您的永恒印记实体，包括生成实体书、影集、时光胶囊或实体电子墓碑。</p>
      <p className="mb-4">邮箱: support@lifetrace.com</p>
      <p className="mb-4">电话: 19357101233</p>
      <button className="btn" onClick={() => navigate(-1)}>返回</button>
    </div>
  );
};

const My = ({ isLoggedIn, setIsLoggedIn, uploads, setUploads, notes, setNotes, freeBiography, publicBiographies }) => {
  const [userData, setUserData] = useState(null);
  const [isImprintsOpen, setIsImprintsOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    axios.get('/api/user')
      .then((response) => setUserData(response.data))
      .catch((error) => console.error('Failed to fetch user data:', error));
    axios.get('/api/uploads')
      .then((response) => setUploads(response.data))
      .catch((error) => console.error('Failed to fetch uploads:', error));
    axios.get('/api/notes')
      .then((response) => setNotes(response.data))
      .catch((error) => console.error('Failed to fetch notes:', error));
  }, [isLoggedIn, navigate, setUploads, setNotes]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setIsLoggedIn(false);
    setUserData(null);
    setUploads([]);
    setNotes([]);
    alert('已登出！');
    navigate('/login');
  };

  const handleDeleteUpload = async (id) => {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('请先登录');
      navigate('/login');
      return;
    }
    if (window.confirm('确定删除此媒体？')) {
      try {
        await axios.delete(`/api/upload/${id}`);
        setUploads(uploads.filter(u => u.id !== id));
        alert('媒体已删除！');
      } catch (err) {
        alert('删除失败: ' + (err.response?.data?.message || err.message));
      }
    }
  };

  const handleDeleteNote = async (id) => {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('请先登录');
      navigate('/login');
      return;
    }
    if (window.confirm('确定删除此随笔？')) {
      try {
        await axios.delete(`/api/note/${id}`);
        setNotes(notes.filter(n => n.id !== id));
        alert('随笔已删除！');
      } catch (err) {
        alert('删除失败: ' + (err.response?.data?.message || err.message));
      }
    }
  };

  const readText = (text) => {
    if (!window.speechSynthesis) {
      alert('浏览器不支持语音朗读');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div>
      <Helmet>
        <title>我的 - 永念</title>
      </Helmet>
      <h2 className="text-2xl font-bold mb-4">我的</h2>
      <div className="space-y-6">
        <div>
          <h3 className="text-xl font-semibold mb-2">个人信息</h3>
          {userData ? (
            <div className="card">
              <p>用户名: {userData.username}</p>
              <button className="btn mt-2" onClick={handleLogout}>登出</button>
            </div>
          ) : (
            <p>加载中...</p>
          )}
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-2">我的传记</h3>
          {freeBiography ? (
            <div className="card">
              <p>{freeBiography.substring(0, 100)}...</p>
              <div className="flex gap-4">
                <button className="btn" onClick={() => readText(freeBiography)}>朗读</button>
                <QRCodeCanvas value={freeBiography} size={100} />
              </div>
            </div>
          ) : (
            <p>暂无传记</p>
          )}
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-2">我的随笔</h3>
          {notes.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {notes.map((note, index) => (
                <div key={index} className="card">
                  <h4 className="font-bold">{note.title}</h4>
                  <p>{note.content.substring(0, 100)}...</p>
                  <p className="text-sm text-gray-500">{new Date(note.timestamp).toLocaleString('zh-CN')}</p>
                  <p className="text-sm text-gray-500">云端状态: {note.cloudStatus || 'Not Uploaded'}</p>
                  <div className="flex gap-2 mt-2">
                    <button className="btn" onClick={() => navigate('/note', { state: { noteId: note.id } })}>编辑</button>
                    <button className="btn" onClick={() => handleDeleteNote(note.id)}>删除</button>
                    <button className="btn" onClick={() => readText(note.content)}>朗读</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>暂无随笔</p>
          )}
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-2">我的媒体</h3>
          {uploads.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {uploads.map((upload, index) => (
                <div key={index} className="card">
                  <p>{upload.desc}</p>
                  {upload.url.match(/\.(jpeg|jpg|png)$/i) ? (
                    <img src={upload.url} alt={upload.desc} className="w-full h-32 object-cover rounded" />
                  ) : (
                    <video src={upload.url} controls className="w-full h-32 object-cover rounded" />
                  )}
                  <p className="text-sm text-gray-500">{new Date(upload.timestamp).toLocaleString('zh-CN')}</p>
                  <button className="btn mt-2" onClick={() => handleDeleteUpload(upload.id)}>删除</button>
                </div>
              ))}
            </div>
          ) : (
            <p>暂无媒体</p>
          )}
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-2">永恒印记</h3>
          <div className="flex items-center gap-4 mb-4">
            <button
              className="btn"
              onClick={() => setIsImprintsOpen(!isImprintsOpen)}
            >
              {isImprintsOpen ? '收起永恒印记' : '联系我们生成永恒印记'}
            </button>
            <span>电话: 19357101233</span>
          </div>
          {isImprintsOpen && (
            <ul className="list-disc pl-6 mb-4">
              {eternalImprints.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <button className="btn mt-4" onClick={() => navigate(-1)}>返回</button>
    </div>
  );
};

const AppContent = () => {
  const [answers, setAnswers] = useState(Array(questions.length).fill(''));
  const [freeBiography, setFreeBiography] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'));
  const [uploads, setUploads] = useState([]);
  const [publicBiographies, setPublicBiographies] = useState([]);
  const [notes, setNotes] = useState([]);
  const [publicNotes, setPublicNotes] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const verifyToken = async () => {
      const token = localStorage.getItem('token');
      // 仅在需要登录的页面验证 token，允许 /login 和 /register 页面访问
      if (location.pathname !== '/login' && location.pathname !== '/register') {
        if (token) {
          try {
            await axios.get('/api/user');
            setIsLoggedIn(true);
          } catch (err) {
            console.error('Token verification failed:', err);
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            setIsLoggedIn(false);
            navigate('/login');
          }
        } else {
          setIsLoggedIn(false);
          navigate('/login');
        }
      }
    };
    verifyToken();
  }, [navigate, location.pathname]);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-blue-600 text-white p-6 text-center">
        <h1 className="text-3xl font-bold">永念</h1>
        <p>记录分享你的一生</p>
      </header>
      <main className="max-w-4xl mx-auto p-6">
        <Routes>
          <Route path="/" element={<Home isLoggedIn={isLoggedIn} />} />
          <Route path="/login" element={<Login setIsLoggedIn={setIsLoggedIn} />} />
          <Route path="/register" element={<Register setIsLoggedIn={setIsLoggedIn} />} />
          <Route
            path="/create"
            element={
              <CreateBiography
                answers={answers}
                setAnswers={setAnswers}
                freeBiography={freeBiography}
                setFreeBiography={setFreeBiography}
                setPublicBiographies={setPublicBiographies}
                isLoggedIn={isLoggedIn}
              />
            }
          />
          <Route path="/record" element={<Record setUploads={setUploads} isLoggedIn={isLoggedIn} />} />
          <Route path="/note" element={<Note notes={notes} setNotes={setNotes} setPublicNotes={setPublicNotes} isLoggedIn={isLoggedIn} />} />
          <Route path="/square" element={<Square publicBiographies={publicBiographies} setPublicBiographies={setPublicBiographies} publicNotes={publicNotes} setPublicNotes={setPublicNotes} />} />
          <Route path="/chat" element={<Chat isLoggedIn={isLoggedIn} />} />
          <Route path="/family" element={<Family isLoggedIn={isLoggedIn} publicBiographies={publicBiographies} />} />
          <Route
            path="/my"
            element={
              <My
                isLoggedIn={isLoggedIn}
                setIsLoggedIn={setIsLoggedIn}
                uploads={uploads}
                setUploads={setUploads}
                notes={notes}
                setNotes={setNotes}
                freeBiography={freeBiography}
                publicBiographies={publicBiographies}
              />
            }
          />
          <Route path="/contact" element={<Contact />} />
        </Routes>
      </main>
      <footer className="fixed bottom-0 w-full bg-white border-t p-2 flex justify-around">
        <button className="nav-btn" onClick={() => navigate('/')}>主页</button>
        <button className="nav-btn" onClick={() => navigate(isLoggedIn ? '/create' : '/login')}>传记</button>
        <button className="nav-btn" onClick={() => navigate(isLoggedIn ? '/record' : '/login')}>上传</button>
        <button className="nav-btn" onClick={() => navigate(isLoggedIn ? '/note' : '/login')}>随笔</button>
        <button className="nav-btn" onClick={() => navigate('/square')}>广场</button>
        <button className="nav-btn" onClick={() => navigate(isLoggedIn ? '/chat' : '/login')}>聊天</button>
        <button className="nav-btn" onClick={() => navigate(isLoggedIn ? '/family' : '/login')}>家族</button>
        <button className="nav-btn" onClick={() => navigate(isLoggedIn ? '/my' : '/login')}>我的</button>
      </footer>
    </div>
  );
};

const App = () => {
  return (
    <Router unstable_future={routerConfig}>
      <AppContent />
    </Router>
  );
};

export default App;