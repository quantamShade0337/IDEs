import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useStore } from './store';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Editor from './pages/Editor';

function AuthListener() {
  const { setUser } = useStore();
  useEffect(() => {
    // Dynamically attempt Firebase auth listener
    let unsub;
    const tryListen = async () => {
      try {
        const { getAuth_ } = await import('./lib/firebase');
        const { onAuthStateChanged } = await import('firebase/auth');
        const auth = getAuth_();
        if (auth) {
          unsub = onAuthStateChanged(auth, (u) => setUser(u || null));
        }
      } catch (e) {
        // Firebase not configured, ignore
      }
    };
    tryListen();
    return () => unsub?.();
  }, []);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthListener />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/editor" element={<Editor />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
