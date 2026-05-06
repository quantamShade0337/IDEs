import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, User, Mail, Lock, Shield, KeyRound,
  Trash2, Check, AlertCircle, Loader2, Eye, EyeOff,
  CheckCircle2, XCircle, Plus, ChevronRight, Code2,
  Fingerprint, LogOut,
} from 'lucide-react';
import {
  updateDisplayName,
  sendVerificationEmail,
  changePassword,
  linkGoogleAccount,
  isGoogleLinked,
  isEmailProvider,
  registerPasskey,
  getPasskeys,
  removePasskey,
  deleteAccount,
  signOutUser,
  isFirebaseReady,
} from '../lib/firebase';
import { useStore } from '../store';

// ── Helpers ───────────────────────────────────────────────────────────────────

function PasswordInput({ value, onChange, placeholder, className = '' }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-muted focus:outline-none focus:border-border-light pr-10 ${className}`}
      />
      <button type="button" onClick={() => setShow(s => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white transition-colors">
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

function SectionCard({ title, description, icon: Icon, children }) {
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
            <Icon size={15} className="text-muted" />
          </div>
          <div>
            <h2 className="font-medium text-sm">{title}</h2>
            {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
          </div>
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function StatusBadge({ ok, label }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
      ok ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'
    }`}>
      {ok ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
      {label}
    </span>
  );
}

function Alert({ type, msg }) {
  if (!msg) return null;
  const styles = {
    error: 'bg-red-500/10 border-red-500/20 text-red-400',
    success: 'bg-green-500/10 border-green-500/20 text-green-400',
    info: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  };
  return (
    <div className={`flex items-start gap-2 border rounded-xl p-3 text-xs mt-4 ${styles[type]}`}>
      <AlertCircle size={13} className="mt-0.5 shrink-0" />
      <span>{msg}</span>
    </div>
  );
}

// ── Profile section ───────────────────────────────────────────────────────────

function ProfileSection({ user, onUpdated }) {
  const [name, setName] = useState(user?.displayName || '');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // {type, msg}

  const handleSave = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setStatus(null);
    try {
      await updateDisplayName(name.trim());
      onUpdated();
      setStatus({ type: 'success', msg: 'Display name updated.' });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SectionCard title="Profile" description="Your public display name" icon={User}>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted mb-1.5 block">Display name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            placeholder="Your name"
            className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-muted focus:outline-none focus:border-border-light"
          />
        </div>
        <div>
          <label className="text-xs text-muted mb-1.5 block">Email</label>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={user?.email || '—'}
              className="flex-1 bg-bg border border-border rounded-lg px-3 py-2.5 text-sm text-muted"
            />
            <StatusBadge ok={user?.emailVerified} label={user?.emailVerified ? 'Verified' : 'Unverified'} />
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={loading || !name.trim() || name.trim() === user?.displayName}
          className="flex items-center gap-2 bg-white text-black text-sm px-4 py-2 rounded-lg font-medium hover:bg-white/90 transition-colors disabled:opacity-40"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          Save changes
        </button>
        {status && <Alert type={status.type} msg={status.msg} />}
      </div>
    </SectionCard>
  );
}

// ── Email verification section ────────────────────────────────────────────────

function EmailVerificationSection({ user }) {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  if (user?.emailVerified) {
    return (
      <SectionCard title="Email Verification" description="Your email address" icon={Mail}>
        <div className="flex items-center gap-2 text-sm text-green-400">
          <CheckCircle2 size={15} />
          <span>{user.email} is verified</span>
        </div>
      </SectionCard>
    );
  }

  const handleSend = async () => {
    setLoading(true);
    setError('');
    try {
      await sendVerificationEmail();
      setSent(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SectionCard title="Email Verification" description="Verify your email address" icon={Mail}>
      {sent ? (
        <div className="flex items-center gap-2 text-sm text-green-400">
          <CheckCircle2 size={15} />
          <span>Verification email sent to <strong>{user?.email}</strong>. Check your inbox.</span>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Your email <strong className="text-white">{user?.email}</strong> is not verified.
            Verify it to secure your account.
          </p>
          <button
            onClick={handleSend}
            disabled={loading}
            className="flex items-center gap-2 border border-border text-white text-sm px-4 py-2 rounded-lg hover:border-border-light transition-colors disabled:opacity-40"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
            Send verification email
          </button>
          {error && <Alert type="error" msg={error} />}
        </div>
      )}
    </SectionCard>
  );
}

// ── Password section ──────────────────────────────────────────────────────────

function PasswordSection({ user }) {
  const hasPassword = isEmailProvider();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleChange = async (e) => {
    e.preventDefault();
    if (!form.current || !form.next || !form.confirm) {
      setStatus({ type: 'error', msg: 'Please fill in all fields.' }); return;
    }
    if (form.next !== form.confirm) {
      setStatus({ type: 'error', msg: 'New passwords do not match.' }); return;
    }
    if (form.next.length < 8) {
      setStatus({ type: 'error', msg: 'New password must be at least 8 characters.' }); return;
    }
    setLoading(true);
    setStatus(null);
    try {
      await changePassword(form.current, form.next);
      setForm({ current: '', next: '', confirm: '' });
      setStatus({ type: 'success', msg: 'Password changed successfully.' });
    } catch (e) {
      const msg = e.code === 'auth/wrong-password' ? 'Current password is incorrect.' : e.message;
      setStatus({ type: 'error', msg });
    } finally {
      setLoading(false);
    }
  };

  if (!hasPassword) {
    return (
      <SectionCard title="Password" description="Password-based sign-in" icon={Lock}>
        <p className="text-sm text-muted">
          You signed in with Google. Password sign-in is not enabled for your account.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Change Password" description="Update your account password" icon={Lock}>
      <form onSubmit={handleChange} className="space-y-3">
        <div>
          <label className="text-xs text-muted mb-1.5 block">Current password</label>
          <PasswordInput value={form.current} onChange={set('current')} placeholder="••••••••" />
        </div>
        <div>
          <label className="text-xs text-muted mb-1.5 block">New password</label>
          <PasswordInput value={form.next} onChange={set('next')} placeholder="Min 8 characters" />
        </div>
        <div>
          <label className="text-xs text-muted mb-1.5 block">Confirm new password</label>
          <PasswordInput value={form.confirm} onChange={set('confirm')} placeholder="••••••••" />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 bg-white text-black text-sm px-4 py-2 rounded-lg font-medium hover:bg-white/90 transition-colors disabled:opacity-40"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
          Change password
        </button>
        {status && <Alert type={status.type} msg={status.msg} />}
      </form>
    </SectionCard>
  );
}

// ── Connected accounts section ────────────────────────────────────────────────

function ConnectedAccountsSection({ user, onUpdated }) {
  const googleLinked = isGoogleLinked();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  const handleLinkGoogle = async () => {
    setLoading(true);
    setStatus(null);
    try {
      await linkGoogleAccount();
      onUpdated();
      setStatus({ type: 'success', msg: 'Google account linked successfully.' });
    } catch (e) {
      const msg = e.code === 'auth/credential-already-in-use'
        ? 'This Google account is already linked to another user.'
        : e.message;
      setStatus({ type: 'error', msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SectionCard title="Connected Accounts" description="Link external sign-in providers" icon={Shield}>
      <div className="space-y-3">
        <div className="flex items-center justify-between py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
              <GoogleIcon />
            </div>
            <div>
              <p className="text-sm font-medium">Google</p>
              <p className="text-xs text-muted">
                {googleLinked
                  ? user?.providerData.find(p => p.providerId === 'google.com')?.email || 'Linked'
                  : 'Not connected'}
              </p>
            </div>
          </div>
          {googleLinked ? (
            <StatusBadge ok label="Connected" />
          ) : (
            <button
              onClick={handleLinkGoogle}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs border border-border px-3 py-1.5 rounded-lg hover:border-border-light transition-colors disabled:opacity-40"
            >
              {loading ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
              Connect
            </button>
          )}
        </div>
        {status && <Alert type={status.type} msg={status.msg} />}
      </div>
    </SectionCard>
  );
}

// ── Passkeys section ──────────────────────────────────────────────────────────

function PasskeysSection() {
  const [passkeys, setPasskeys] = useState(getPasskeys);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [removing, setRemoving] = useState(null);
  const supported = !!window.PublicKeyCredential;

  const handleAdd = async () => {
    setLoading(true);
    setStatus(null);
    try {
      const entry = await registerPasskey();
      setPasskeys(getPasskeys());
      setStatus({ type: 'success', msg: `Passkey "${entry.name}" added.` });
    } catch (e) {
      const msg = e.name === 'NotAllowedError'
        ? 'Passkey creation was cancelled.'
        : e.message;
      setStatus({ type: 'error', msg });
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = (id) => {
    removePasskey(id);
    setPasskeys(getPasskeys());
    setRemoving(null);
  };

  return (
    <SectionCard title="Passkeys" description="Sign in with Face ID, Touch ID, or security key" icon={Fingerprint}>
      {!supported ? (
        <p className="text-sm text-muted">Passkeys are not supported in this browser.</p>
      ) : (
        <div className="space-y-4">
          {passkeys.length > 0 ? (
            <div className="space-y-2">
              {passkeys.map(pk => (
                <div key={pk.id} className="flex items-center justify-between py-2.5 px-3 bg-bg border border-border rounded-xl">
                  <div className="flex items-center gap-2.5">
                    <Fingerprint size={14} className="text-muted" />
                    <div>
                      <p className="text-sm">{pk.name}</p>
                      <p className="text-xs text-muted">Added {new Date(pk.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  {removing === pk.id ? (
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleRemove(pk.id)} className="text-xs text-red-400 hover:text-red-300 font-medium">Remove</button>
                      <button onClick={() => setRemoving(null)} className="text-xs text-muted hover:text-white">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setRemoving(pk.id)} className="text-muted hover:text-red-400 transition-colors p-1">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No passkeys added yet. Add one for faster, passwordless sign-in.</p>
          )}

          <button
            onClick={handleAdd}
            disabled={loading}
            className="flex items-center gap-2 border border-border text-white text-sm px-4 py-2 rounded-lg hover:border-border-light transition-colors disabled:opacity-40"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Add passkey
          </button>
          {status && <Alert type={status.type} msg={status.msg} />}
        </div>
      )}
    </SectionCard>
  );
}

// ── Danger zone ───────────────────────────────────────────────────────────────

function DangerZone({ user, onSignOut }) {
  const nav = useNavigate();
  const { setUser } = useStore();
  const [showDelete, setShowDelete] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const needsPassword = isEmailProvider();

  const handleSignOut = async () => {
    await signOutUser();
    setUser(null);
    nav('/');
  };

  const handleDelete = async () => {
    if (confirm !== 'DELETE') { setError('Type DELETE to confirm.'); return; }
    if (needsPassword && !password) { setError('Enter your password to confirm.'); return; }
    setLoading(true);
    setError('');
    try {
      await deleteAccount(needsPassword ? password : null);
      setUser(null);
      nav('/');
    } catch (e) {
      const msg = e.code === 'auth/wrong-password' ? 'Incorrect password.' : e.message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface border border-red-500/20 rounded-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-red-500/20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
            <Trash2 size={15} className="text-red-400" />
          </div>
          <div>
            <h2 className="font-medium text-sm text-red-400">Danger Zone</h2>
            <p className="text-xs text-muted mt-0.5">These actions are permanent and cannot be undone</p>
          </div>
        </div>
      </div>
      <div className="px-6 py-5 space-y-4">
        {/* Sign out */}
        <div className="flex items-center justify-between py-3 border-b border-border">
          <div>
            <p className="text-sm font-medium">Sign out</p>
            <p className="text-xs text-muted mt-0.5">Sign out of your account on this device</p>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-xs border border-border px-3 py-1.5 rounded-lg hover:border-border-light transition-colors"
          >
            <LogOut size={11} /> Sign out
          </button>
        </div>

        {/* Delete account */}
        <div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-400">Delete account</p>
              <p className="text-xs text-muted mt-0.5">Permanently delete your account and all projects</p>
            </div>
            <button
              onClick={() => setShowDelete(s => !s)}
              className="flex items-center gap-1.5 text-xs border border-red-500/30 text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={11} /> Delete
            </button>
          </div>

          <AnimatePresence>
            {showDelete && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-4 p-4 bg-red-500/5 border border-red-500/20 rounded-xl space-y-3">
                  <p className="text-xs text-red-400 font-medium">
                    This will permanently delete your account, all your projects, and cannot be undone.
                  </p>
                  {needsPassword && (
                    <div>
                      <label className="text-xs text-muted mb-1.5 block">Your password</label>
                      <PasswordInput
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Enter password to confirm"
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-muted mb-1.5 block">
                      Type <span className="text-white font-mono">DELETE</span> to confirm
                    </label>
                    <input
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="DELETE"
                      className="w-full bg-bg border border-red-500/30 rounded-lg px-3 py-2.5 text-sm text-white placeholder-muted focus:outline-none focus:border-red-500/60 font-mono"
                    />
                  </div>
                  {error && <Alert type="error" msg={error} />}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleDelete}
                      disabled={loading || confirm !== 'DELETE'}
                      className="flex items-center gap-2 bg-red-500 text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-red-600 transition-colors disabled:opacity-40"
                    >
                      {loading ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      Delete my account
                    </button>
                    <button
                      onClick={() => { setShowDelete(false); setError(''); setConfirm(''); setPassword(''); }}
                      className="text-sm text-muted hover:text-white px-4 py-2 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AccountSettings() {
  const nav = useNavigate();
  const { user, setUser, notify } = useStore();
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Get live Firebase user object (has emailVerified, providerData, etc.)
  useEffect(() => {
    if (!isFirebaseReady()) { setLoadingUser(false); return; }
    const loadAuth = async () => {
      try {
        const { getAuth_ } = await import('../lib/firebase');
        const { onAuthStateChanged } = await import('firebase/auth');
        const auth = getAuth_();
        if (!auth) { setLoadingUser(false); return; }
        const unsub = onAuthStateChanged(auth, (u) => {
          setFirebaseUser(u);
          setLoadingUser(false);
        });
        return unsub;
      } catch {
        setLoadingUser(false);
      }
    };
    loadAuth();
  }, []);

  const refresh = () => {
    // Force Firebase to reload user data
    firebaseUser?.reload().then(() => {
      setFirebaseUser({ ...firebaseUser });
    }).catch(() => {});
  };

  if (!user || user.isGuest) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted mb-4">Sign in to access account settings.</p>
          <button onClick={() => nav('/auth')} className="bg-white text-black px-5 py-2.5 rounded-xl text-sm font-medium">
            Sign In
          </button>
        </div>
      </div>
    );
  }

  const displayUser = firebaseUser || user;
  const firebaseReady = isFirebaseReady();

  return (
    <div className="min-h-screen bg-bg">
      {/* Grid bg */}
      <div className="fixed inset-0 opacity-[0.02] pointer-events-none" style={{
        backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-4 border-b border-border bg-surface/50 backdrop-blur-sm sticky top-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => nav('/dashboard')}
            className="flex items-center gap-1.5 text-muted hover:text-white transition-colors text-sm"
          >
            <ArrowLeft size={14} /> Dashboard
          </button>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-white flex items-center justify-center">
              <Code2 size={11} className="text-black" />
            </div>
            <span className="text-sm font-medium">Account Settings</span>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-2xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-2">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-xl font-bold">
              {(displayUser.displayName || displayUser.email || 'U')[0].toUpperCase()}
            </div>
            <div>
              <h1 className="font-display text-2xl font-700 tracking-tight">
                {displayUser.displayName || 'Your Account'}
              </h1>
              <p className="text-muted text-sm">{displayUser.email}</p>
            </div>
          </div>
        </div>

        {!firebaseReady && (
          <div className="mb-6 p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
            <p className="text-xs text-yellow-400">
              Firebase is not configured. Most settings require Firebase to be set up.
            </p>
          </div>
        )}

        {loadingUser ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={20} className="animate-spin text-muted" />
          </div>
        ) : (
          <div className="space-y-4">
            <ProfileSection user={displayUser} onUpdated={refresh} />
            <EmailVerificationSection user={displayUser} />
            <PasswordSection user={displayUser} />
            <ConnectedAccountsSection user={displayUser} onUpdated={refresh} />
            <PasskeysSection />
            <DangerZone user={displayUser} />
          </div>
        )}
      </main>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16">
      <path d="M15.68 8.18c0-.57-.05-1.12-.14-1.64H8v3.1h4.3a3.68 3.68 0 0 1-1.6 2.42v2h2.58c1.51-1.4 2.4-3.45 2.4-5.88z" fill="#4285F4"/>
      <path d="M8 16c2.16 0 3.97-.72 5.3-1.94l-2.59-2a4.8 4.8 0 0 1-7.17-2.52H.94v2.07A8 8 0 0 0 8 16z" fill="#34A853"/>
      <path d="M3.54 9.54A4.8 4.8 0 0 1 3.3 8c0-.54.09-1.06.24-1.54V4.39H.94A8 8 0 0 0 0 8c0 1.29.31 2.51.94 3.61l2.6-2.07z" fill="#FBBC05"/>
      <path d="M8 3.18c1.22 0 2.3.42 3.16 1.24l2.37-2.37A8 8 0 0 0 .94 4.39l2.6 2.07A4.77 4.77 0 0 1 8 3.18z" fill="#EA4335"/>
    </svg>
  );
}
