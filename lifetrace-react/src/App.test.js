import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { QRCodeCanvas } from 'qrcode.react';
import './index.css';

const questions = [
  "你的姓名和出生年月？",
  "你童年最难忘的记忆？",
  "你最骄傲的成就？",
];

const Home = () => {
  const navigate = useNavigate();
  return (
    <div className="text-center">
      <h2 className="text-2xl font-bold mb-4">欢迎使用 LifeTrace</h2>
      <div className="flex flex-wrap gap-4 justify-center">
        <button className="btn" onClick={() => navigate('/create')}>创建传记</button>
        <button className="btn" onClick={() => navigate('/record')}>上传照片/视频</button>
        <button className="btn" onClick={() => navigate('/note')}>写随笔</button>
        <button className="btn" onClick={() => navigate('/square')}>查看广场</button>
        <button className="btn" onClick={() => navigate('/chat')}>聊天交友</button>
        <button className="btn" onClick={() => navigate('/family')}>家族传记</button>
        <button className="btn" onClick={() => navigate('/my')}>我的</button>
      </div>
    </div>
  );
};

const CreateBiography = ({ answers, setAnswers, freeBiography, setFreeBiography }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const navigate = useNavigate();

  const handleSave = async () => {
    const bioText = answers.join(' ') + ' ' + freeBiography;
    try {
      await axios.post('/api/biography', {
        username: 'user' + Math.floor(Math.random() * 1000),
        biography: bioText,
      });
      alert('传记保存成功！');
      navigate('/my');
    } catch (err) {
      alert('保存失败');
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">创建传记</h2>
      <div className="mb-4">
        <p className="mb-2">{questions[currentQuestionIndex]}</p>
        <textarea
          className="input"
          value={answers[currentQuestionIndex] || ''}
          onChange={(e) => {
            const newAnswers = [...answers];
            newAnswers[currentQuestionIndex] = e.target.value;
            setAnswers(newAnswers);
          }}
        />
        <div className="flex gap-4 mt-2">
          <button
            className="btn"
            disabled={currentQuestionIndex === 0}
            onClick={() => setCurrentQuestionIndex(currentQuestionIndex - 1)}
          >
            上一个
          </button>
          <button
            className="btn"
            onClick={() =>
              currentQuestionIndex < questions.length - 1
                ? setCurrentQuestionIndex(currentQuestionIndex + 1)
                : handleSave()
            }
          >
            {currentQuestionIndex === questions.length - 1 ? '完成' : '下一个'}
          </button>
        </div>
      </div>
      <textarea
        className="input"
        placeholder="自由编写传记..."
        value={freeBiography}
        onChange={(e) => setFreeBiography(e.target.value)}
      />
      <div className="flex gap-4 mt-4">
        <button className="btn" onClick={handleSave}>保存</button>
        <button className="btn" onClick={() => navigate('/')}>返回主页</button>
      </div>
    </div>
  );
};

const Record = () => {
  const [file, setFile] = useState(null);
  const [desc, setDesc] = useState('');
  const navigate = useNavigate();

  const handleUpload = async () => {
    if (!file) {
      alert('请选择文件');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('desc', desc);
    try {
      await axios.post('/api/upload', formData);
      alert('上传成功！');
      navigate('/my');
    } catch (err) {
      alert('上传失败');
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">上传照片/视频</h2>
      <input
        type="file"
        className="mb-4"
        onChange={(e) => setFile(e.target.files[0])}
      />
      <textarea
        className="input mb-4"
        placeholder="文件描述"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
      />
      <div className="flex gap-4">
        <button className="btn" onClick={handleUpload}>上传</button>
        <button className="btn" onClick={() => navigate('/')}>返回</button>
      </div>
    </div>
  );
};

const Note = () => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const navigate = useNavigate();

  const handleSave = async () => {
    try {
      await axios.post('/api/note', {
        username: 'user' + Math.floor(Math.random() * 1000),
        title,
        content,
        timestamp: new Date().toISOString(),
      });
      alert('随笔保存成功！');
      navigate('/my');
    } catch (err) {
      alert('保存失败');
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">写随笔</h2>
      <input
        type="text"
        className="input mb-4"
        placeholder="随笔标题"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="input mb-4"
        placeholder="随笔内容"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="flex gap-4">
        <button className="btn" onClick={handleSave}>保存</button>
        <button className="btn" onClick={() => navigate('/')}>返回</button>
      </div>
    </div>
  );
};

const Square = () => {
  const [posts, setPosts] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    axios.get('/api/square')
      .then((response) => setPosts(response.data))
      .catch((error) => console.error('获取广场数据失败:', error));
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">广场</h2>
      <div className="space-y-4">
        {posts.map((post) => (
          <div key={post.id} className="card">
            <h3 className="font-bold">{post.title}</h3>
            <p>{post.content}</p>
            <QRCodeCanvas value={`https://your-app.com/post/${post.id}`} size={100} />
          </div>
        ))}
      </div>
      <button className="btn mt-4" onClick={() => navigate('/')}>返回</button>
    </div>
  );
};

const Chat = () => {
  const navigate = useNavigate();
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">聊天交友</h2>
      <p>此功能待实现（需要 WebSocket 或第三方聊天服务）</p>
      <button className="btn mt-4" onClick={() => navigate('/')}>返回</button>
    </div>
  );
};

const Family = () => {
  const navigate = useNavigate();
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">家族传记</h2>
      <p>此功能待实现（需要家族关系数据结构）</p>
      <button className="btn mt-4" onClick={() => navigate('/')}>返回</button>
    </div>
  );
};

const My = () => {
  const [userData, setUserData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    axios.get('/api/user')
      .then((response) => setUserData(response.data))
      .catch((error) => console.error('获取用户数据失败:', error));
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">我的</h2>
      {userData ? (
        <div>
          <p>用户名: {userData.username}</p>
          <p>传记: {userData.biography}</p>
          <QRCodeCanvas value={`https://your-app.com/user/${userData.username}`} size={100} />
        </div>
      ) : (
        <p>加载中...</p>
      )}
      <button className="btn mt-4" onClick={() => navigate('/')}>返回</button>
    </div>
  );
};

const App = () => {
  const [answers, setAnswers] = useState(Array(questions.length).fill(''));
  const [freeBiography, setFreeBiography] = useState('');
  const navigate = useNavigate();

  return (
    <Router>
      <div className="min-h-screen bg-gray-100">
        <header className="bg-blue-600 text-white p-6 text-center">
          <h1 className="text-3xl font-bold">LifeTrace</h1>
          <p>记录分享你的一生</p>
        </header>
        <main className="max-w-4xl mx-auto p-6">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route
              path="/create"
              element={
                <CreateBiography
                  answers={answers}
                  setAnswers={setAnswers}
                  freeBiography={freeBiography}
                  setFreeBiography={setFreeBiography}
                />
              }
            />
            <Route path="/record" element={<Record />} />
            <Route path="/note" element={<Note />} />
            <Route path="/square" element={<Square />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/family" element={<Family />} />
            <Route path="/my" element={<My />} />
          </Routes>
        </main>
        <footer className="fixed bottom-0 w-full bg-white border-t p-2 flex justify-around">
          <button className="nav-btn" onClick={() => navigate('/')}>主页</button>
          <button className="nav-btn" onClick={() => navigate('/create')}>传记</button>
          <button className="nav-btn" onClick={() => navigate('/record')}>上传</button>
          <button className="nav-btn" onClick={() => navigate('/note')}>随笔</button>
          <button className="nav-btn" onClick={() => navigate('/square')}>广场</button>
          <button className="nav-btn" onClick={() => navigate('/chat')}>聊天</button>
          <button className="nav-btn" onClick={() => navigate('/family')}>家族</button>
          <button className="nav-btn" onClick={() => navigate('/my')}>我的</button>
        </footer>
      </div>
    </Router>
  );
};

export default App;