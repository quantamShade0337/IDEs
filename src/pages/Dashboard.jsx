import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Code2, Trash2, Copy, Clock, LogOut, User, FolderOpen } from 'lucide-react';
import { loadProjects, deleteProject, saveProject, signOutUser } from '../lib/firebase';
import { useStore } from '../store';

function timeAgo(ts) {
  if (!ts) return 'Just now';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function Skeleton() {
  return (
    <div className="bg-surface border border-border rounded-2xl p-5 animate-pulse">
      <div className="h-4 bg-border rounded w-3/4 mb-3" />
      <div className="h-3 bg-border rounded w-1/2 mb-6" />
      <div className="flex gap-2">
        <div className="h-8 bg-border rounded-lg flex-1" />
        <div className="h-8 w-8 bg-border rounded-lg" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const nav = useNavigate();
  const { user, setUser, setProject, notify } = useStore();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { nav('/auth'); return; }
    if (user.isGuest) { setLoading(false); return; }
    loadProjects(user.uid).then(p => {
      setProjects(p);
      setLoading(false);
    });
  }, [user]);

  const handleNew = () => {
    setProject({ id: null, title: 'Untitled Project', html: '<h1>Hello</h1>', css: 'body { background: #0f0f0f; color: #fff; }', js: '' });
    nav('/editor');
  };

  const handleOpen = (p) => {
    setProject(p);
    nav('/editor');
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this project?')) return;
    await deleteProject(id);
    setProjects(ps => ps.filter(p => p.id !== id));
    notify('Project deleted', 'info');
  };

  const handleDuplicate = async (p, e) => {
    e.stopPropagation();
    try {
      const id = await saveProject({ ...p, id: null, title: `${p.title} (copy)`, userId: user.uid });
      const newP = { ...p, id, title: `${p.title} (copy)` };
      setProjects(ps => [newP, ...ps]);
      notify('Project duplicated', 'success');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
    setUser(null);
    nav('/');
  };

  return (
    <div className="min-h-screen bg-bg">
      <div className="fixed inset-0 opacity-[0.02]" style={{
        backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
        backgroundSize: '60px 60px'
      }} />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-border">
        <button onClick={() => nav('/')} className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center">
            <Code2 size={14} className="text-black" />
          </div>
          <span className="font-display font-700 tracking-tight">WebIDE</span>
        </button>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-muted">
            <User size={14} />
            {user?.displayName || 'Guest'}
          </div>
          {!user?.isGuest && (
            <button onClick={handleSignOut} className="flex items-center gap-1.5 text-muted hover:text-white transition-colors text-sm">
              <LogOut size={14} /> Sign out
            </button>
          )}
        </div>
      </nav>

      <main className="relative z-10 max-w-5xl mx-auto px-8 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="font-display text-3xl font-700 tracking-tight mb-1">
              {user?.isGuest ? 'Guest Mode' : 'Your Projects'}
            </h1>
            <p className="text-muted text-sm">
              {user?.isGuest
                ? 'Sign in to save projects to the cloud.'
                : `${projects.length} project${projects.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleNew}
            className="flex items-center gap-2 bg-white text-black px-5 py-2.5 rounded-xl font-medium text-sm"
          >
            <Plus size={16} /> New Project
          </motion.button>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3,4,5,6].map(i => <Skeleton key={i} />)}
          </div>
        ) : user?.isGuest ? (
          <div className="text-center py-24">
            <FolderOpen size={40} className="text-muted mx-auto mb-4" />
            <p className="text-muted mb-6">Guest mode doesn't persist projects.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={handleNew} className="bg-white text-black px-5 py-2.5 rounded-xl text-sm font-medium">
                Open Editor
              </button>
              <button onClick={() => nav('/auth')} className="border border-border text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:border-border-light transition-colors">
                Sign In
              </button>
            </div>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-24">
            <Code2 size={40} className="text-muted mx-auto mb-4" />
            <p className="text-muted mb-6">No projects yet. Create your first one.</p>
            <button onClick={handleNew} className="bg-white text-black px-5 py-2.5 rounded-xl text-sm font-medium">
              Create Project
            </button>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {projects.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => handleOpen(p)}
                className="bg-surface border border-border rounded-2xl p-5 cursor-pointer hover:border-border-light transition-all group"
              >
                {/* Mini preview */}
                <div className="h-20 rounded-xl bg-bg border border-border mb-4 overflow-hidden flex items-center justify-center">
                  <div className="text-xs text-muted font-mono">{p.title[0]?.toUpperCase()}</div>
                </div>

                <h3 className="font-medium text-sm mb-1 truncate">{p.title}</h3>
                <p className="text-muted text-xs flex items-center gap-1 mb-4">
                  <Clock size={10} /> {timeAgo(p.updatedAt)}
                </p>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleOpen(p)}
                    className="flex-1 bg-bg border border-border hover:border-border-light text-white text-xs py-2 rounded-lg transition-colors font-medium"
                  >
                    Open
                  </button>
                  <button
                    onClick={(e) => handleDuplicate(p, e)}
                    className="p-2 bg-bg border border-border hover:border-border-light rounded-lg transition-colors"
                    title="Duplicate"
                  >
                    <Copy size={13} className="text-muted" />
                  </button>
                  <button
                    onClick={(e) => handleDelete(p.id, e)}
                    className="p-2 bg-bg border border-border hover:border-red-500/40 hover:border rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={13} className="text-muted hover:text-red-400" />
                  </button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </main>
    </div>
  );
}
