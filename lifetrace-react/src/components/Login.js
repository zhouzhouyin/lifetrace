import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async'; // 使用 react-helmet-async
import axios from 'axios';
import { AppContext } from '../context/AppContext';

// 清理用户输入，防止 XSS
const sanitizeInput = (input) => {
  return input.replace(/[<>"'&]/g, '');
};

const Login = () => {
  const { setIsLoggedIn, setToken, setUsername: setContextUsername, setError, lang } = useContext(AppContext);
  const [username, setLocalUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  // 若未登录，清除本地缓存的 username，避免非浏览器自动填充情况下残留旧账号
  useEffect(() => {
    const hasToken = !!localStorage.getItem('token');
    if (!hasToken) {
      try { localStorage.removeItem('username'); } catch (_) {}
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const sanitizedUsername = sanitizeInput(username);
    const sanitizedPassword = sanitizeInput(password);

    if (!sanitizedUsername || !sanitizedPassword) {
      setMessage('用户名和密码不能为空');
      return;
    }

    setIsLoading(true);
    try {
      console.log('Login.js: Sending login request:', { username: sanitizedUsername });
      // 清除旧 token
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      setToken('');
      setContextUsername('');
      setIsLoggedIn(false);

      const response = await axios.post('/api/login', { username: sanitizedUsername, password: sanitizedPassword });
      const { token, username: returnedUsername, userId, uid } = response.data;
      console.log('Login.js: Login successful, token:', token, 'username:', returnedUsername);

      localStorage.setItem('token', token);
      localStorage.setItem('username', returnedUsername);
      if (userId) localStorage.setItem('userId', userId);
      if (uid) localStorage.setItem('uid', uid);
      setToken(token);
      setContextUsername(returnedUsername);
      if (userId) {
        // 延迟设置，避免未提供的情况下污染上下文
        try { window.dispatchEvent(new Event('userId-set')); } catch (_) {}
      }
      setIsLoggedIn(true);
      setMessage('登录成功！');
      setTimeout(() => navigate('/'), 1000);
    } catch (err) {
      console.error('Login.js: Login error:', err.response?.data || err.message);
      let errorMessage = '登录失败，请检查用户名或密码';
      if (err.response) {
        const code = err.response.status;
        if (code === 400 || code === 401) {
          errorMessage = '登录失败：请重新检查用户名和密码';
        } else if (code === 429) {
          errorMessage = '请求过于频繁，请稍后再试';
        } else if (code === 500) {
          errorMessage = '服务器错误，请稍后重试';
        } else {
          errorMessage = err.response?.data?.message || err.message || '登录失败，请稍后再试';
        }
      }
      setMessage(errorMessage);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // 清除提示信息
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  return (
    <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: '#000000' }}>
      <div className="card max-w-md w-full p-6" style={{ background: '#121216', borderColor: '#2a2a30' }}>
        <Helmet>
          <title>{lang === 'zh' ? '登录 - 永念' : 'Login - LifeTrace'}</title>
        </Helmet>
        <h2 className="text-2xl font-bold text-center mb-6">{lang === 'zh' ? '登录' : 'Login'}</h2>
        {message && (
          <div className={`mb-4 p-2 text-center rounded ${message.includes('失败') || message.includes('错误') ? 'bg-red-700' : 'bg-green-700'}`} style={{ color: '#e7c36f' }}>
            {message}
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{lang === 'zh' ? '用户名' : 'Username'}</label>
            <input
              type="text"
              className="input w-full"
              placeholder={lang === 'zh' ? '请输入用户名' : 'Enter username'}
              value={username}
              onChange={(e) => setLocalUsername(sanitizeInput(e.target.value))}
              required
              disabled={isLoading}
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{lang === 'zh' ? '密码' : 'Password'}</label>
            <div className="flex gap-2">
              <input
                type={showPassword ? 'text' : 'password'}
                className="input w-full"
                placeholder={lang === 'zh' ? '请输入密码' : 'Enter password'}
                value={password}
                onChange={(e) => setPassword(sanitizeInput(e.target.value))}
                required
                disabled={isLoading}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="btn bg-gray-500 hover:bg-gray-600 whitespace-nowrap"
                onClick={() => setShowPassword((v) => !v)}
                disabled={isLoading}
                aria-label={showPassword ? (lang === 'zh' ? '隐藏密码' : 'Hide password') : (lang === 'zh' ? '显示密码' : 'Show password')}
              >
                {showPassword ? (lang === 'zh' ? '隐藏' : 'Hide') : (lang === 'zh' ? '显示' : 'Show')}
              </button>
            </div>
          </div>
          <div className="mt-1 text-sm text-center">
            <span className="text-gray-600">忘记密码？</span>
            <a href="mailto:1056829015@qq.com" className="underline ml-1" style={{ color: '#e7c36f' }}>联系管理员 1056829015@qq.com</a>
          </div>
          <button type="submit" className="btn w-full mt-2" disabled={isLoading}>
            {isLoading ? (lang === 'zh' ? '登录中...' : 'Logging in...') : (lang === 'zh' ? '登录' : 'Login')}
          </button>
          <button
            type="button"
            className="btn bg-gray-500 hover:bg-gray-600 w-full"
            onClick={() => navigate('/register')}
            disabled={isLoading}
          >
            {lang === 'zh' ? '去注册' : 'Go to Register'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;