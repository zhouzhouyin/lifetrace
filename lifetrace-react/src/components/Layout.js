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
    <div className="min-h-screen bg-gray-100">
      <header className="bg-blue-600 text-white p-3 sm:p-4">
        <div className="container mx-auto px-3 sm:px-4 relative flex items-center">
          <h1 className="text-2xl sm:text-3xl font-bold mx-auto">{lang === 'zh' ? '永念' : 'LifeTrace'}</h1>
          <div className="absolute right-3 top-2 hidden sm:flex items-center gap-2">
              <select
                className="text-black rounded px-2 py-1"
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                title="Language"
              >
                <option value="zh">中文</option>
                <option value="en">English</option>
              </select>
              {isLoggedIn && (
                <button className="btn" onClick={handleLogout}>{lang === 'zh' ? '登出' : 'Logout'}</button>
              )}
            </div>
        </div>
      </header>
      <main className="container mx-auto px-3 sm:px-4 py-4">{children}</main>
      <footer className="bg-gray-800 text-white p-4 text-center">
        <p>&copy; 2025 永念. 保留所有权利。</p>
      </footer>
    </div>
  );
};

export default Layout;