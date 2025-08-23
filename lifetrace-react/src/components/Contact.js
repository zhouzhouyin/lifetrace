import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { AppContext } from '../context/AppContext';

const Contact = () => {
  const { isLoggedIn, setError } = useContext(AppContext);
  const navigate = useNavigate();
  const [message, setMessage] = useState('');

  // 验证登录状态
  useEffect(() => {
    if (!isLoggedIn) {
      setMessage('请先登录以访问联系页面');
      setError('请登录以继续');
      setTimeout(() => navigate('/login'), 1000);
    }
  }, [isLoggedIn, setError, navigate]);

  // 清除提示
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // 复制邮箱
  const handleCopy = (text, type) => {
    navigator.clipboard.writeText(text).then(
      () => setMessage(`${type}已复制到剪贴板`),
      () => setMessage(`复制${type}失败，请手动复制`)
    );
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 font-sans">
      <div className="card max-w-4xl w-full mx-4 p-10 bg-white rounded-xl shadow-xl">
        <Helmet>
          <title>联系我们 - 永念</title>
          <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet" />
        </Helmet>

        <h2 className="text-4xl font-bold text-center text-gray-900 mb-8">
          联系我们
        </h2>

        {message && (
          <div
            className={`mb-8 p-4 text-center text-white rounded-lg transition-opacity duration-300 animate-fade-in ${
              message.includes('失败') || message.includes('请先登录') ? 'bg-red-600' : 'bg-green-600'
            }`}
          >
            {message}
          </div>
        )}

        <div className="space-y-10">
          <div className="text-center">
            <h3 className="text-2xl font-semibold text-gray-800 mb-4">
              品牌愿景 | 永念 Lifetrace
            </h3>
            <p className="text-lg text-gray-600 leading-8 max-w-3xl mx-auto">
              <span className="font-medium text-gray-800">让记忆永存，让精神传承百年</span>
              <br />
              在生命的长河中，每一个故事都值得被铭记。
              <br />
              Lifetrace 永念，用数字化的力量，将您的音容笑貌、人生智慧与珍贵记忆，穿越时间，传递给未来的每一代。
            </p>
          </div>

          {/* 未来服务预告（合并了原“已支持服务”的全部付费内容） */}
          <div className="text-center">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">未来服务预告</h3>
            <p className="text-gray-500 mb-4">(以下服务即将上线，敬请期待)</p>
            <ul className="text-left list-disc list-inside text-gray-600 max-w-lg mx-auto space-y-3">
              <li className="text-base">制作精美自传实体书，书写您的人生传奇</li>
              <li className="text-base">制作珍藏影集，定格每一个动人瞬间</li>
              <li className="text-base">保存时光胶囊，封存记忆，传递未来</li>
              <li className="text-base">数字遗产存储和管理，保管您在互联网上的资产（账号密码、文字、视频、照片）</li>
              <li className="text-base">独特实体电子纪念碑，致敬不朽人生</li>
              <li className="text-base">更多专属定制服务，满足您的个性化需求</li>
            </ul>
          </div>

          {/* 联系方式 */}
          <div className="text-center">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">联系方式</h3>
            <p className="text-lg text-gray-600 mb-6">
              如有任何问题或建议，或需要定制服务，或加入我们，欢迎联系：
            </p>
            <div className="space-y-4 max-w-md mx-auto">
              <p className="text-base">
                邮箱:{' '}
                <span
                  className="text-blue-600 hover:underline hover:underline-offset-4 cursor-pointer transition-all duration-200"
                  onClick={() => handleCopy('xmwlwan@gmail.com', '邮箱')}
                >
                  xmwlwan@gmail.com
                </span>
              </p>
            </div>
          </div>

          {/* 返回按钮 */}
          <div className="text-center">
            <button
              className="mt-8 px-8 py-3 bg-gradient-to-r from-gray-600 to-gray-800 text-white rounded-lg hover:scale-105 transition-transform duration-200 text-lg font-medium"
              onClick={() => navigate(-1)}
            >
              返回
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Contact;


