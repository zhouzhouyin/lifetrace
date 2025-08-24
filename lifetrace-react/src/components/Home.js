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
    <div className="min-h-screen bg-amber-50/50">
      <Helmet>
        <title>{lang === 'zh' ? '首页 - 永念' : 'Home - LifeTrace'}</title>
      </Helmet>
      {/* Hero */}
      <section className="container mx-auto px-4 pt-10 pb-8 sm:pt-16 sm:pb-12">
        <div className="max-w-5xl mx-auto text-center">
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-gray-900">
            {lang === 'zh' ? '把一生好好写下，温柔地交给时间' : 'Write a life, gently handed to time'}
          </h1>
          <p className="mt-4 text-base sm:text-lg text-gray-700">
            {slogans[sloganIndex] || (lang === 'zh' ? '让记忆延续，让精神成为家族的财富' : 'Memories continue, love is passed on')}
          </p>
          {/* CTA cards with copy (mobile-first) */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <button
              aria-label={lang === 'zh' ? '开始记录' : 'Start Now'}
              onClick={() => navigate(isLoggedIn ? '/create' : '/login')}
              className="text-left p-4 rounded-lg transition shadow-sm"
              style={{ backgroundColor: '#1a1a1e', color: '#e7c36f', border: '1px solid #3a3a40' }}
            >
              <div className="text-2xl mb-1">✍️</div>
              <h3 className="font-semibold text-lg">{lang === 'zh' ? '开始记录' : 'Start Now'}</h3>
              <p className="text-sm opacity-90 mt-1">
                {lang === 'zh' ? '用温和的引导问答，从童年至当下，一步步写下。' : 'Gentle prompts to capture a lifetime, step by step.'}
              </p>
            </button>
            <button
              aria-label={lang === 'zh' ? '家族档案' : 'Family Archive'}
              onClick={() => navigate(isLoggedIn ? '/family' : '/login')}
              className="text-left p-4 rounded-lg bg-white hover:bg-gray-50 border transition shadow-sm"
            >
              <div className="text-2xl mb-1">👪</div>
              <h3 className="font-semibold text-lg text-gray-900">{lang === 'zh' ? '家族档案' : 'Family Archive'}</h3>
              <p className="text-sm text-gray-600 mt-1">
                {lang === 'zh' ? '只与家人私密共享，随时补充与回看。' : 'Private with family, add and revisit anytime.'}
              </p>
            </button>
            <button
              aria-label={lang === 'zh' ? '我的' : 'My'}
              onClick={() => navigate(isLoggedIn ? '/my' : '/login')}
              className="text-left p-4 rounded-lg bg-white hover:bg-gray-50 border transition shadow-sm"
            >
              <div className="text-2xl mb-1">✨</div>
              <h3 className="font-semibold text-lg text-gray-900">{lang === 'zh' ? '我的' : 'My'}</h3>
              <p className="text-sm text-gray-600 mt-1">
                {lang === 'zh' ? '管理我已记录的篇章与媒体素材。' : 'Manage your chapters and media.'}
              </p>
            </button>
          </div>
          {isLoggedIn && (
            <div className="mt-3 sm:hidden">
              <button className="btn w-full" onClick={handleMobileLogout}>
                {lang === 'zh' ? '登出' : 'Logout'}
              </button>
            </div>
          )}
          {isLoggedIn && role === 'admin' && (
            <div className="mt-3 flex gap-3 justify-center">
              <button className="btn" onClick={() => navigate('/admin/reports')}>{lang === 'zh' ? '举报管理' : 'Report Management'}</button>
              <button className="btn" onClick={() => navigate('/admin/stats')}>{lang === 'zh' ? '后台统计' : 'Admin Stats'}</button>
            </div>
          )}
        </div>
      </section>

      {/* Features removed per request */}

      {/* Quote */}
      <section className="container mx-auto px-4 pb-12">
        <div className="max-w-4xl mx-auto bg-white/70 rounded-lg p-6 text-center border">
          <p className="text-gray-700 italic">
            {lang === 'zh'
              ? '“当他们想起你，这里有你留下的声音与文字。”'
              : '“When they think of you, your words and voice remain here.”'}
          </p>
        </div>
      </section>
    </div>
  );
};

export default Home;