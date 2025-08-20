import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="card max-w-2xl w-full text-center">
        <Helmet>
          <title>404 - 页面不存在 - 永念</title>
        </Helmet>
        <h2 className="text-2xl font-bold text-red-500 mb-4">404 - 页面不存在</h2>
        <p className="text-gray-700 mb-6">抱歉，您访问的页面不存在，请检查 URL 或返回首页。</p>
        <button
          className="btn bg-blue-600 hover:bg-blue-700"
          onClick={() => navigate('/')}
        >
          返回首页
        </button>
      </div>
    </div>
  );
};

export default NotFound;