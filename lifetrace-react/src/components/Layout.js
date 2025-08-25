import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';

const Layout = ({ children }) => {
  const { isLoggedIn, setIsLoggedIn, lang, setLang } = useContext(AppContext);
  const navigate = useNavigate();

  console.log('Layout.js: isLoggedIn:', isLoggedIn, 'token:', localStorage.getItem('token'));

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setIsLoggedIn(false);
    navigate('/login');
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f7f0dc', color: '#111827' }}>
      <header className="p-3 sm:p-4 bg-gradient-to-r from-blue-200 to-blue-300 border-b" style={{ borderBottomColor: '#93c5fd' }}>
        <div className="container mx-auto px-3 sm:px-4 relative flex items-center">
          <h1 className="text-2xl sm:text-3xl font-bold mx-auto text-white">{lang === 'zh' ? '永念' : 'LifeTrace'}</h1>
          <div className="absolute right-3 top-2 flex items-center gap-2">
              <select
                className="rounded px-2 py-1"
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                title="Language"
                style={{ backgroundColor: '#ffffff', color: '#111827', border: '1px solid #d1d5db' }}
              >
                <option value="zh">中文</option>
                <option value="en">English</option>
              </select>
              {isLoggedIn && (
                <button className="btn hidden sm:inline-flex" onClick={handleLogout}>{lang === 'zh' ? '登出' : 'Logout'}</button>
              )}
            </div>
        </div>
      </header>
      <main className="container mx-auto px-3 sm:px-4 py-4">{children}</main>
      <footer className="p-4 text-center" style={{ backgroundColor: '#f7f0dc', borderTop: '1px solid #e5e7eb', color: '#6b7280' }}>
        <p>&copy; 2025 永念. 保留所有权利。</p>
      </footer>
    </div>
  );
};

export default Layout;