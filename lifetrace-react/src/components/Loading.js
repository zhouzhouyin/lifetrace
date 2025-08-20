import React from 'react';

const Loading = () => (
  <div className="flex items-center justify-center min-h-screen bg-gray-100">
    <div className="text-center">
      <div className="loader animate-spin rounded-full h-16 w-16 border-t-4 border-blue-500"></div>
      <p className="mt-4 text-gray-700">加载中...</p>
    </div>
  </div>
);

export default Loading;