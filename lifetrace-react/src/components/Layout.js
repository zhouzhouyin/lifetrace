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
    <div className="min-h-screen" style={{ backgroundColor: '#0b0b0d', color: '#d6b46a' }}>
      <header className="p-3 sm:p-4" style={{ backgroundColor: '#0b0b0d', borderBottom: '1px solid #2a2a30' }}>
        <div className="container mx-auto px-3 sm:px-4 relative flex items-center">
          <h1 className="text-2xl sm:text-3xl font-bold mx-auto" style={{ color: '#d6b46a' }}>{lang === 'zh' ? '永念' : 'LifeTrace'}</h1>
          <div className="absolute right-3 top-2 flex items-center gap-2">
              <select
                className="rounded px-2 py-1"
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                title="Language"
                style={{ backgroundColor: '#101013', color: '#d6b46a', border: '1px solid #3a3a40' }}
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
      <footer className="p-4 text-center" style={{ backgroundColor: '#0b0b0d', borderTop: '1px solid #2a2a30', color: '#9b8451' }}>
        <p style={{ color: '#9b8451' }}>&copy; 2025 永念. 保留所有权利。</p>
      </footer>
    </div>
  );
};

export default Layout;