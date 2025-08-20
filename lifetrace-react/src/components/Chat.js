import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import axios from 'axios';
import { AppContext } from '../context/AppContext';

const Chat = () => {
  const { isLoggedIn, userId } = useContext(AppContext);
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
    axios
      .get('/api/friends')
      .then((response) => setFriends(response.data))
      .catch((error) => console.error('Failed to fetch friends:', error));
    try {
      const wsUrl = (process.env.REACT_APP_WS_URL || 'ws://localhost:5000') + (userId ? `?userId=${encodeURIComponent(userId)}` : '');
      const websocket = new WebSocket(wsUrl);
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
          <button className="btn" onClick={handleAddFriend}>
            添加好友
          </button>
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
              <option key={index} value={friend.username}>
                {friend.username}
              </option>
            ))}
          </select>
        </div>
        <div className="chat-container">
          <div className="chat-messages">
            {messages.map((msg, index) => (
              <p key={index}>
                <strong>{msg.from}:</strong> {msg.message}{' '}
                <small>{new Date(msg.timestamp).toLocaleString('zh-CN')}</small>
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
            <button className="btn" onClick={handleSend}>
              发送
            </button>
          </div>
        </div>
      </div>
      <button className="btn mt-4" onClick={() => navigate(-1)}>
        返回
      </button>
    </div>
  );
};

export default Chat;