import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useStore } from './store';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Editor from './pages/Editor';
import AccountSettings from './pages/AccountSettings';
import NotFound from './pages/NotFound';
import Legal from './pages/Legal';
import ErrorBoundary from './components/ErrorBoundary';

function AuthListener() {
  const { setUser, setAuthLoading } = useStore();
  useEffect(() => {
    let unsub;
    const tryListen = async () => {
      try {
        const { getAuth_ } = await import('./lib/firebase');
        const { onAuthStateChanged } = await import('firebase/auth');
        const auth = getAuth_();
        if (auth) {
          unsub = onAuthStateChanged(auth, (u) => setUser(u || null));
        } else {
          setAuthLoading(false);
        }
      } catch {
        setAuthLoading(false);
      }
    };
    tryListen();
    return () => unsub?.();
  }, []);
  return null;
}

function PrivateRoute({ children }) {
  const { user, authLoading } = useStore();
  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  return children;
}

function AuthenticatedRoute({ children }) {
  const { user, authLoading } = useStore();
  if (authLoading) return null;
  if (!user || user.isGuest) return <Navigate to="/auth" replace />;
  return children;
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthListener />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/legal/:page" element={<Legal />} />
          <Route path="/dashboard" element={
            <PrivateRoute><Dashboard /></PrivateRoute>
          } />
          <Route path="/editor" element={
            <PrivateRoute><Editor /></PrivateRoute>
          } />
          <Route path="/settings" element={
            <AuthenticatedRoute><AccountSettings /></AuthenticatedRoute>
          } />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
