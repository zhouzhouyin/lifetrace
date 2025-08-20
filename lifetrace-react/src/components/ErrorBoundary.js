import React, { Component } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';

// 转换为函数组件以使用 hooks
const ErrorBoundary = ({ children }) => {
  const navigate = useNavigate();
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    if (hasError) {
      console.error('ErrorBoundary caught an error');
      // 可添加日志发送到后端
      // axios.post('/api/log-error', { error: error.toString(), stack: errorInfo.componentStack });
    }
  }, [hasError]);

  const componentDidCatch = (error, errorInfo) => {
    setHasError(true);
    console.error('ErrorBoundary:', error, errorInfo);
  };

  if (hasError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="card max-w-2xl w-full text-center">
          <Helmet>
            <title>错误 - 永念</title>
          </Helmet>
          <h2 className="text-2xl font-bold text-red-500 mb-4">发生错误</h2>
          <p className="text-gray-700 mb-6">抱歉，页面出现错误，请尝试刷新或返回首页。</p>
          <div className="flex gap-4 justify-center">
            <button
              className="btn bg-blue-600 hover:bg-blue-700"
              onClick={() => window.location.reload()}
            >
              刷新页面
            </button>
            <button
              className="btn bg-gray-500 hover:bg-gray-600"
              onClick={() => navigate('/')}
            >
              返回首页
            </button>
          </div>
        </div>
      </div>
    );
  }

  return children;
};

export default ErrorBoundary;