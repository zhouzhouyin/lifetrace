import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async'; // 使用 react-helmet-async
import { AppContext } from '../context/AppContext';

// 重试函数
const retry = async (fn, retries = 3, delay = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if ((err.response?.status === 429 || err.response?.status === 503) && i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        continue;
      }
      throw err;
    }
  }
};

// 清理用户输入，防止 XSS
const sanitizeInput = (input) => {
  return input.replace(/[<>"'&]/g, '');
};

const Register = () => {
  const { setIsLoggedIn, setToken, setUsername: setContextUsername, setError, lang } = useContext(AppContext);
  const [username, setLocalUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // 提交注册（移除防抖，避免事件被回收导致无法提交）
  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const sanitizedUsername = sanitizeInput(username);
    const sanitizedPassword = sanitizeInput(password);
    const sanitizedConfirmPassword = sanitizeInput(confirmPassword);

    // 前端验证
    if (!sanitizedUsername || !sanitizedPassword || !sanitizedConfirmPassword) {
      setMessage('请填写所有字段');
      return;
    }
    
    if (sanitizedPassword !== sanitizedConfirmPassword) {
      setMessage('密码不一致，请重新输入');
      return;
    }
    if (sanitizedPassword.length < 8) {
      setMessage('密码长度必须至少 8 位');
      return;
    }
    if (!/^[a-zA-Z0-9]+$/.test(sanitizedUsername)) {
      setMessage('用户名只能包含字母和数字');
      return;
    }

    setIsLoading(true);
    try {
      console.log('Sending register request:', { username: sanitizedUsername });
      // 清除旧 token
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      setToken('');
      setContextUsername('');
      setIsLoggedIn(false);

      await retry(() => axios.post('/api/register', { username: sanitizedUsername, password: sanitizedPassword }));
      setMessage('注册成功！请返回登录页，输入账号和密码进行登录');
    } catch (err) {
      console.error('Register error:', err);
      let errorMessage = '注册失败，请稍后再试';
      if (err.response) {
        switch (err.response.status) {
          case 400:
            errorMessage = err.response.data.message || '请求格式错误，请检查输入';
            if (errorMessage.includes('E11000') || errorMessage.includes('Username already exists')) {
              errorMessage = '用户名已存在，请尝试其他用户名';
            }
            break;
          case 429:
            errorMessage = '请求过于频繁，请稍后再试';
            break;
          default:
            errorMessage = err.response?.data?.message || err.message;
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
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="card max-w-md w-full p-6">
        <Helmet>
          <title>{lang === 'zh' ? '注册 - 永念' : 'Register - LifeTrace'}</title>
        </Helmet>
        <h2 className="text-2xl font-bold text-center mb-6">{lang === 'zh' ? '注册' : 'Register'}</h2>
        {message && (
          <div className={`mb-4 p-2 text-center text-white rounded ${message.includes('失败') || message.includes('错误') || message.includes('不一致') || message.includes('长度') || message.includes('用户名已存在') ? 'bg-red-500' : 'bg-green-500'}`}>
            {message}
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{lang === 'zh' ? '用户名' : 'Username'}</label>
            <input
              type="text"
              className="input w-full"
              placeholder={lang === 'zh' ? '请输入用户名（字母和数字）' : 'Enter username (letters and numbers)'}
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
                placeholder={lang === 'zh' ? '请输入密码（至少 8 位）' : 'Enter password (min 8 chars)'}
                value={password}
                onChange={(e) => setPassword(sanitizeInput(e.target.value))}
                required
                disabled={isLoading}
                autoComplete="new-password"
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
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{lang === 'zh' ? '确认密码' : 'Confirm Password'}</label>
            <div className="flex gap-2">
              <input
                type={showConfirm ? 'text' : 'password'}
                className="input w-full"
                placeholder={lang === 'zh' ? '请再次输入密码' : 'Re-enter password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(sanitizeInput(e.target.value))}
                required
                disabled={isLoading}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="btn bg-gray-500 hover:bg-gray-600 whitespace-nowrap"
                onClick={() => setShowConfirm((v) => !v)}
                disabled={isLoading}
                aria-label={showConfirm ? (lang === 'zh' ? '隐藏密码' : 'Hide password') : (lang === 'zh' ? '显示密码' : 'Show password')}
              >
                {showConfirm ? (lang === 'zh' ? '隐藏' : 'Hide') : (lang === 'zh' ? '显示' : 'Show')}
              </button>
            </div>
          </div>
          <div className="flex gap-4">
            <button type="submit" className="btn w-full" disabled={isLoading}>
              {isLoading ? (lang === 'zh' ? '注册中...' : 'Registering...') : (lang === 'zh' ? '注册' : 'Register')}
            </button>
            <button
              type="button"
              className="btn bg-gray-500 hover:bg-gray-600 w-full"
              onClick={() => navigate('/login')}
              disabled={isLoading}
            >
              {lang === 'zh' ? '返回登录' : 'Back to Login'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;