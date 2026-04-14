import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Code2, ArrowLeft, AlertCircle, Eye, EyeOff } from 'lucide-react';
import {
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  initFirebase,
  isFirebaseReady,
} from '../lib/firebase';
import { useStore } from '../store';

function PasswordInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-muted focus:outline-none focus:border-border-light pr-10"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white transition-colors"
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

export default function Auth() {
  const nav = useNavigate();
  const { setUser, notify } = useStore();
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'firebase'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirm: '',
  });

  const [fbConfig, setFbConfig] = useState({
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleGoogleLogin = async () => {
    if (!isFirebaseReady()) { setMode('firebase'); return; }
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

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!isFirebaseReady()) { setMode('firebase'); return; }
    if (!form.email || !form.password) { setError('Please fill in all fields.'); return; }
    setLoading(true);
    setError('');
    try {
      const result = await signInWithEmail(form.email, form.password);
      setUser(result.user);
      nav('/dashboard');
    } catch (e) {
      setError(friendlyError(e.code));
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!isFirebaseReady()) { setMode('firebase'); return; }
    if (!form.firstName || !form.lastName || !form.email || !form.password || !form.confirm) {
      setError('Please fill in all fields.');
      return;
    }
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return; }
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    setError('');
    try {
      const result = await signUpWithEmail(
        form.email,
        form.password,
        `${form.firstName} ${form.lastName}`
      );
      setUser(result.user);
      nav('/dashboard');
    } catch (e) {
      setError(friendlyError(e.code));
    } finally {
      setLoading(false);
    }
  };

  const handleFirebaseInit = () => {
    if (initFirebase(fbConfig)) {
      setMode('login');
      notify('Firebase connected!', 'success');
    } else {
      setError('Invalid Firebase config.');
    }
  };

  const handleGuest = () => {
    setUser({ uid: 'guest', displayName: 'Guest', isGuest: true });
    nav('/dashboard');
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="fixed inset-0 opacity-[0.03]" style={{
        backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md"
      >
        <button onClick={() => nav('/')} className="flex items-center gap-2 text-muted hover:text-white transition-colors text-sm mb-8">
          <ArrowLeft size={14} /> Back
        </button>

        <div className="bg-surface border border-border rounded-2xl p-8">
          <AnimatePresence mode="wait">
            {mode === 'firebase' ? (
              <motion.div key="firebase" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <button onClick={() => setMode('login')} className="flex items-center gap-2 text-muted hover:text-white text-sm mb-6">
                  <ArrowLeft size={14} /> Back
                </button>
                <h2 className="font-display text-xl font-700 mb-2">Firebase Setup</h2>
                <p className="text-muted text-sm mb-6">
                  Create a project at{' '}
                  <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="text-white underline">
                    console.firebase.google.com
                  </a>{' '}and paste your config below.
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
              </motion.div>
            ) : mode === 'login' ? (
              <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="flex items-center gap-2 mb-7">
                  <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
                    <Code2 size={16} className="text-black" />
                  </div>
                  <span className="font-display font-700 text-lg">WebIDE</span>
                </div>
                <h1 className="font-display text-2xl font-700 tracking-tight mb-1">Sign in</h1>
                <p className="text-muted text-sm mb-7">Welcome back. Enter your details.</p>

                {error && (
                  <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-5 text-red-400 text-sm">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleLogin} className="space-y-3">
                  <input
                    type="email"
                    placeholder="Email address"
                    value={form.email}
                    onChange={set('email')}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-muted focus:outline-none focus:border-border-light"
                  />
                  <PasswordInput value={form.password} onChange={set('password')} placeholder="Password" />
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-white text-black py-2.5 rounded-xl text-sm font-medium hover:bg-white/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading && <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />}
                    Sign In
                  </button>
                </form>

                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-muted text-xs">or</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <button
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 border border-border text-white py-2.5 rounded-xl text-sm font-medium hover:border-border-light transition-colors disabled:opacity-50"
                >
                  <GoogleIcon />
                  Continue with Google
                </button>

                <div className="flex items-center justify-between mt-6 text-sm">
                  <button onClick={handleGuest} className="text-muted hover:text-white transition-colors text-xs">
                    Continue as guest
                  </button>
                  <button onClick={() => { setMode('signup'); setError(''); }} className="text-muted hover:text-white transition-colors text-xs">
                    Don't have an account? <span className="text-white">Sign up</span>
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="signup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="flex items-center gap-2 mb-7">
                  <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
                    <Code2 size={16} className="text-black" />
                  </div>
                  <span className="font-display font-700 text-lg">WebIDE</span>
                </div>
                <h1 className="font-display text-2xl font-700 tracking-tight mb-1">Create account</h1>
                <p className="text-muted text-sm mb-7">Start building for free.</p>

                {error && (
                  <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-5 text-red-400 text-sm">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleSignup} className="space-y-3">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder="First name"
                      value={form.firstName}
                      onChange={set('firstName')}
                      className="flex-1 bg-bg border border-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-muted focus:outline-none focus:border-border-light"
                    />
                    <input
                      type="text"
                      placeholder="Last name"
                      value={form.lastName}
                      onChange={set('lastName')}
                      className="flex-1 bg-bg border border-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-muted focus:outline-none focus:border-border-light"
                    />
                  </div>
                  <input
                    type="email"
                    placeholder="Email address"
                    value={form.email}
                    onChange={set('email')}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-muted focus:outline-none focus:border-border-light"
                  />
                  <PasswordInput value={form.password} onChange={set('password')} placeholder="Password" />
                  <PasswordInput value={form.confirm} onChange={set('confirm')} placeholder="Confirm password" />
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-white text-black py-2.5 rounded-xl text-sm font-medium hover:bg-white/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading && <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />}
                    Create Account
                  </button>
                </form>

                <p className="text-center mt-5 text-xs text-muted">
                  Already have an account?{' '}
                  <button onClick={() => { setMode('login'); setError(''); }} className="text-white hover:underline">
                    Sign in
                  </button>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {mode !== 'firebase' && (
          <p className="text-center mt-4 text-xs text-muted">
            Using Firebase?{' '}
            <button onClick={() => setMode('firebase')} className="text-white hover:underline">
              Configure
            </button>
          </p>
        )}
      </motion.div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <path d="M15.68 8.18c0-.57-.05-1.12-.14-1.64H8v3.1h4.3a3.68 3.68 0 0 1-1.6 2.42v2h2.58c1.51-1.4 2.4-3.45 2.4-5.88z" fill="#4285F4"/>
      <path d="M8 16c2.16 0 3.97-.72 5.3-1.94l-2.59-2a4.8 4.8 0 0 1-7.17-2.52H.94v2.07A8 8 0 0 0 8 16z" fill="#34A853"/>
      <path d="M3.54 9.54A4.8 4.8 0 0 1 3.3 8c0-.54.09-1.06.24-1.54V4.39H.94A8 8 0 0 0 0 8c0 1.29.31 2.51.94 3.61l2.6-2.07z" fill="#FBBC05"/>
      <path d="M8 3.18c1.22 0 2.3.42 3.16 1.24l2.37-2.37A8 8 0 0 0 .94 4.39l2.6 2.07A4.77 4.77 0 0 1 8 3.18z" fill="#EA4335"/>
    </svg>
  );
}

function friendlyError(code) {
  const map = {
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/invalid-email': 'Invalid email address.',
    'auth/weak-password': 'Password is too weak.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Check your connection.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}
