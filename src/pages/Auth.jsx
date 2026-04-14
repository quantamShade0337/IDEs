import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Code2, Globe, ArrowLeft, AlertCircle } from 'lucide-react';
import { signInWithGoogle, initFirebase, isFirebaseReady } from '../lib/firebase';
import { useStore } from '../store';

export default function Auth() {
  const nav = useNavigate();
  const { setUser, notify } = useStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showFirebaseSetup, setShowFirebaseSetup] = useState(false);
  const [fbConfig, setFbConfig] = useState({
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
  });

  const handleGoogleLogin = async () => {
    if (!isFirebaseReady()) {
      setShowFirebaseSetup(true);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await signInWithGoogle();
      setUser(result.user);
      nav('/dashboard');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGuestMode = () => {
    setUser({ uid: 'guest', displayName: 'Guest', isGuest: true });
    nav('/editor');
  };

  const handleFirebaseInit = () => {
    if (initFirebase(fbConfig)) {
      setShowFirebaseSetup(false);
      notify('Firebase connected!', 'success');
    } else {
      setError('Invalid Firebase config. Check your project settings.');
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="fixed inset-0 opacity-[0.03]" style={{
        backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
        backgroundSize: '60px 60px'
      }} />
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] opacity-10 blur-[100px]"
        style={{ background: 'radial-gradient(ellipse, #fff 0%, transparent 70%)' }} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >
        <button onClick={() => nav('/')} className="flex items-center gap-2 text-muted hover:text-white transition-colors text-sm mb-8">
          <ArrowLeft size={14} /> Back
        </button>

        <div className="bg-surface border border-border rounded-2xl p-8">
          {!showFirebaseSetup ? (
            <>
              <div className="flex items-center gap-2 mb-8">
                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
                  <Code2 size={16} className="text-black" />
                </div>
                <span className="font-display font-700 text-lg">WebIDE</span>
              </div>

              <h1 className="font-display text-2xl font-700 tracking-tight mb-2">Welcome back</h1>
              <p className="text-muted text-sm mb-8">Sign in to save and manage your projects.</p>

              {error && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-6 text-red-400 text-sm">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 bg-white text-black py-3 px-4 rounded-xl font-medium text-sm hover:bg-white/90 transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                ) : (
                  <Globe size={16} />
                )}
                Continue with Google
              </button>

              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-border" />
                <span className="text-muted text-xs">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <button
                onClick={handleGuestMode}
                className="w-full border border-border text-white py-3 px-4 rounded-xl font-medium text-sm hover:border-border-light transition-colors"
              >
                Continue as Guest
              </button>

              <p className="text-muted text-xs text-center mt-6">
                Guest mode doesn't save projects to the cloud.{' '}
                <button className="text-white underline" onClick={() => setShowFirebaseSetup(true)}>
                  Setup Firebase
                </button>
              </p>
            </>
          ) : (
            <>
              <button onClick={() => setShowFirebaseSetup(false)} className="flex items-center gap-2 text-muted hover:text-white transition-colors text-sm mb-6">
                <ArrowLeft size={14} /> Back
              </button>
              <h2 className="font-display text-xl font-700 mb-2">Firebase Setup</h2>
              <p className="text-muted text-sm mb-6">
                Create a project at{' '}
                <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="text-white underline">
                  console.firebase.google.com
                </a>
                {' '}and paste your config below.
              </p>
              <div className="space-y-3">
                {Object.keys(fbConfig).map(k => (
                  <input
                    key={k}
                    type="text"
                    placeholder={k}
                    value={fbConfig[k]}
                    onChange={e => setFbConfig(p => ({ ...p, [k]: e.target.value }))}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-muted focus:outline-none focus:border-border-light"
                  />
                ))}
              </div>
              {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
              <button
                onClick={handleFirebaseInit}
                className="w-full mt-4 bg-white text-black py-2.5 rounded-xl text-sm font-medium hover:bg-white/90 transition-colors"
              >
                Connect Firebase
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
