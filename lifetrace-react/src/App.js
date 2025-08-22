import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppContext, AppContextProvider } from './context/AppContext';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import Loading from './components/Loading';
import NotFound from './components/NotFound';
import { HelmetProvider } from 'react-helmet-async';
import './index.css';

const Home = lazy(() => import('./components/Home'));
const Login = lazy(() => import('./components/Login'));
const Register = lazy(() => import('./components/Register'));
const CreateBiography = lazy(() => import('./components/CreateBiography'));
// const Record = lazy(() => import('./components/Record'));
// const Note = lazy(() => import('./components/Note'));
const Square = lazy(() => import('./components/Square'));
// const Chat = lazy(() => import('./components/Chat'));
const Family = lazy(() => import('./components/Family'));
const Contact = lazy(() => import('./components/Contact'));
const My = lazy(() => import('./components/My'));
const View = lazy(() => import('./components/View')); // 笔记查看
const ViewFile = lazy(() => import('./components/ViewFile')); // 文件查看
const Preview = lazy(() => import('./components/Preview'));
const AdminReports = lazy(() => import('./components/AdminReports'));
const PublicBiography = lazy(() => import('./components/PublicBiography'));
const AdminStats = lazy(() => import('./components/AdminStats'));
// const Privacy = lazy(() => import('./components/Privacy'));
// const Terms = lazy(() => import('./components/Terms'));

const ProtectedRoute = ({ children }) => {
  const { isLoggedIn, authLoading } = React.useContext(AppContext);
  if (authLoading) return <Loading />;
  return isLoggedIn ? children : <Navigate to="/login" replace />;
};

const App = () => {
  return (
    <Router>
      <HelmetProvider>
        <ErrorBoundary>
          <AppContextProvider>
            <Layout>
              <Suspense fallback={<Loading />}>
                <Routes>
                  <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                  <Route path="/home" element={<Navigate to="/" replace />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/create" element={<ProtectedRoute><CreateBiography /></ProtectedRoute>} />
                  {/** 独立上传照片/视频页面已移除 */}
                  {/** 写随笔功能已移除 */}
                  <Route path="/square" element={<Square />} />
                  {/** 聊天交友功能已移除 */}
                  <Route path="/family" element={<ProtectedRoute><Family /></ProtectedRoute>} />
                  <Route path="/contact" element={<ProtectedRoute><Contact /></ProtectedRoute>} />
                  <Route path="/my" element={<ProtectedRoute><My /></ProtectedRoute>} />
                  <Route path="/view/:id" element={<ProtectedRoute><View /></ProtectedRoute>} />
                  <Route path="/view-file/:fileId" element={<ProtectedRoute><ViewFile /></ProtectedRoute>} />
                  <Route path="/preview" element={<ProtectedRoute><Preview /></ProtectedRoute>} />
                  <Route path="/admin/reports" element={<ProtectedRoute><AdminReports /></ProtectedRoute>} />
                  <Route path="/b/:id" element={<PublicBiography />} />
                  <Route path="/admin/stats" element={<ProtectedRoute><AdminStats /></ProtectedRoute>} />
                  {/** MVP 不暴露隐私/协议页面 */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </Layout>
          </AppContextProvider>
        </ErrorBoundary>
      </HelmetProvider>
    </Router>
  );
};

export default App;