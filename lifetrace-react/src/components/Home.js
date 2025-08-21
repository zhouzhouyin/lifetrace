import { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { AppContext } from '../context/AppContext';

const Home = () => {
  const { isLoggedIn, t, lang, role, setIsLoggedIn } = useContext(AppContext);
  const navigate = useNavigate();
  const zhSlogans = [
    '生而不灭于遗忘，你的故事永有人可读',
    '写下你的故事，给未来的孩子一盏可以回望的灯',
    '为后代留一本真实的家族史，让爱得以传承',
    '让记忆延续，让精神成为家族的财富',
    '从童年至暮年，你的每一刻都值得被珍藏',
    '当他们想起你，这里有你留下的声音与文字',
    '用技术对抗遗忘，让生命温柔长存',
  ];
  const enSlogans = [
    'Reunite with memories, stay connected with family. Let time gently keep your story.',
    'Your memories are not only the past. LifeTrace helps love be seen and passed on.',
    'Write this moment together, and gift it to future family.',
    'Here, years have names, and family has echoes.',
    'Connect bloodlines with stories, continue love with memories.',
    'Memories never age, family never fades. Write your life for those who care.',
    'Let the past be heard, and the future be lit.',
    'Turn memories into a gift for the next generation.',
    'Every chapter of your life deserves to be recorded with care.',
    'LifeTrace: gently keeping the stories of a lifetime with you.',
  ];
  const slogans = lang === 'zh' ? zhSlogans : enSlogans;
  const [sloganIndex, setSloganIndex] = useState(0);
  useEffect(() => {
    setSloganIndex(0);
    const id = setInterval(() => {
      setSloganIndex((i) => (i + 1) % slogans.length);
    }, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const handleMobileLogout = () => {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('username');
    } catch (_) {}
    setIsLoggedIn(false);
    navigate('/login');
  };

  return (
    <div className="text-center container mx-auto px-3 sm:px-4">
      <Helmet>
        <title>{lang === 'zh' ? '首页 - 永念' : 'Home - LifeTrace'}</title>
      </Helmet>
      <h2 className="text-xl sm:text-2xl font-bold mb-4">
        {slogans[sloganIndex] || ''}
      </h2>
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 justify-center">
        <button className="btn w-full sm:w-auto" onClick={() => navigate(isLoggedIn ? '/create' : '/login')}>{lang === 'zh' ? '记录此生' : 'Record Life'}</button>
        {/** 独立上传入口已移除。上传媒体请在“创建传记”的篇章内添加。 */}
        {/** 写随笔功能已移除 */}
        <button className="btn w-full sm:w-auto" onClick={() => navigate('/square')}>{lang === 'zh' ? '查看广场' : 'View Square'}</button>
        {/** 聊天交友功能已移除 */}
        <button className="btn w-full sm:w-auto" onClick={() => navigate(isLoggedIn ? '/family' : '/login')}>{lang === 'zh' ? '家族传记' : 'Family Biographies'}</button>
        <button className="btn w-full sm:w-auto" onClick={() => navigate(isLoggedIn ? '/my' : '/login')}>{lang === 'zh' ? '我的' : 'My'}</button>
        {isLoggedIn && (
          <button className="btn w-full sm:hidden" onClick={handleMobileLogout}>
            {lang === 'zh' ? '登出' : 'Logout'}
          </button>
        )}
        {isLoggedIn && role === 'admin' && (
          <>
            <button className="btn w-full sm:w-auto" onClick={() => navigate('/admin/reports')}>{lang === 'zh' ? '举报管理' : 'Report Management'}</button>
            <button className="btn w-full sm:w-auto" onClick={() => navigate('/admin/stats')}>{lang === 'zh' ? '后台统计' : 'Admin Stats'}</button>
          </>
        )}
        
      </div>
    </div>
  );
};

export default Home;