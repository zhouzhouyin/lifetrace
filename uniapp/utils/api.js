// 统一请求封装（mp-weixin 使用 uni.request）
// 使用本地存储 token，自动附加到请求头 Authorization: Bearer <token>
// 通过环境变量或常量配置 BASE_URL

const DEFAULT_BASE_URL = 'https://lifetrace-backend.onrender.com';

function getBaseUrl() {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.API_BASE) {
      return globalThis.API_BASE;
    }
  } catch (e) {}
  try {
    const stored = uni.getStorageSync('API_BASE');
    if (stored) return stored;
  } catch (e) {}
  return DEFAULT_BASE_URL;
}

function getToken() {
  try {
    const token = uni.getStorageSync('token');
    return token || '';
  } catch (e) {
    return '';
  }
}

export function apiRequest({ url, method = 'GET', data = {}, header = {} }) {
  return new Promise((resolve, reject) => {
    const token = getToken();
    const finalHeader = Object.assign(
      {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : ''
      },
      header
    );

    uni.request({
      url: `${getBaseUrl()}${url}`,
      method,
      data,
      header: finalHeader,
      timeout: 15000,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(res);
        }
      },
      fail: (err) => reject(err)
    });
  });
}

export const api = {
  // Auth
  login(payload) {
    return apiRequest({ url: '/api/login', method: 'POST', data: payload });
  },
  register(payload) {
    return apiRequest({ url: '/api/register', method: 'POST', data: payload });
  },
  verify() {
    return apiRequest({ url: '/api/verify', method: 'GET' });
  },
  // Daily reflection
  getDailySession() {
    return apiRequest({ url: '/api/daily/session', method: 'GET' });
  },
  answerDaily(payload) {
    return apiRequest({ url: '/api/daily/session/answer', method: 'POST', data: payload });
  },
  nextDaily() {
    return apiRequest({ url: '/api/daily/session/next', method: 'POST' });
  },
  // Memo
  listMemos(query = {}) {
    return apiRequest({ url: '/api/memos', method: 'GET', data: query });
  },
  createMemo(payload) {
    return apiRequest({ url: '/api/memos', method: 'POST', data: payload });
  }
};

export default api;


