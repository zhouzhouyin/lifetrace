import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { AppContext } from '../context/AppContext';

const Home = () => {
  const { isLoggedIn, t, lang, role } = useContext(AppContext);
  const navigate = useNavigate();

  return (
    <div className="text-center container mx-auto px-3 sm:px-4">
      <Helmet>
        <title>{lang === 'zh' ? '首页 - 永念' : 'Home - LifeTrace'}</title>
      </Helmet>
      <h2 className="text-xl sm:text-2xl font-bold mb-4">
        {lang === 'zh' ? '欢迎使用永念' : 'Welcome to LifeTrace'} {isLoggedIn ? (lang === 'zh' ? '(已登录)' : '(Logged in)') : (lang === 'zh' ? '(未登录)' : '(Logged out)')}
      </h2>
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 justify-center">
        <button className="btn w-full sm:w-auto" onClick={() => navigate(isLoggedIn ? '/create' : '/login')}>{t ? t('generatePreview') : (lang === 'zh' ? '创建传记' : 'Create Biography')}</button>
        {/** 独立上传入口已移除。上传媒体请在“创建传记”的篇章内添加。 */}
        {/** 写随笔功能已移除 */}
        <button className="btn w-full sm:w-auto" onClick={() => navigate('/square')}>{lang === 'zh' ? '查看广场' : 'View Square'}</button>
        {/** 聊天交友功能已移除 */}
        <button className="btn w-full sm:w-auto" onClick={() => navigate(isLoggedIn ? '/family' : '/login')}>{lang === 'zh' ? '家族传记' : 'Family Biographies'}</button>
        <button className="btn w-full sm:w-auto" onClick={() => navigate(isLoggedIn ? '/my' : '/login')}>{lang === 'zh' ? '我的' : 'My'}</button>
        {isLoggedIn && role === 'admin' && (
          <button className="btn w-full sm:w-auto" onClick={() => navigate('/admin/reports')}>{lang === 'zh' ? '举报管理' : 'Report Management'}</button>
        )}
        
      </div>
    </div>
  );
};

export default Home;