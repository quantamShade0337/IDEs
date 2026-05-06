import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Code2, Trash2, Copy, Clock, LogOut, User,
  FolderOpen, Search, X, Settings, ExternalLink,
  Layers, FileCode, Globe, Zap, Grid3X3,
} from 'lucide-react';
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

// Renders a tiny iframe preview of the project
function ProjectThumbnail({ html, css, js }) {
  const srcDoc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{transform:scale(0.25);transform-origin:top left;width:400%;height:400%;overflow:hidden;pointer-events:none;}
  ${css || ''}
  </style></head><body>${html || ''}</body></html>`;

  return (
    <iframe
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      className="w-full h-full border-0 pointer-events-none"
      title="preview"
    />
  );
}

function Skeleton() {
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden animate-pulse">
      <div className="h-28 bg-border/50" />
      <div className="p-4">
        <div className="h-4 bg-border rounded w-3/4 mb-2" />
        <div className="h-3 bg-border rounded w-1/3 mb-4" />
        <div className="flex gap-2">
          <div className="h-8 bg-border rounded-lg flex-1" />
          <div className="h-8 w-8 bg-border rounded-lg" />
        </div>
      </div>
    </div>
  );
}

const TEMPLATES = [
  {
    id: 'blank',
    title: 'Blank Project',
    description: 'Start from scratch',
    icon: FileCode,
    html: '<div class="container">\n  <h1>Hello, World!</h1>\n  <p>Start coding.</p>\n</div>',
    css: 'body { font-family: system-ui; background: #0f0f0f; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; } .container { text-align: center; }',
    js: 'console.log("Ready!");',
  },
  {
    id: 'landing',
    title: 'Landing Page',
    description: 'Hero + CTA + features',
    icon: Globe,
    html: `<nav class="nav"><div class="brand">Brand</div><div class="links"><a href="#">Features</a><a href="#">Pricing</a><button class="btn-outline">Login</button></div></nav>
<section class="hero"><h1>Build something <span class="grad">amazing</span></h1><p>The modern platform for modern teams. Fast, reliable, and beautiful.</p><div class="hero-btns"><button class="btn-primary">Get Started Free</button><button class="btn-outline">See Demo →</button></div></section>
<section class="features"><div class="feature"><div class="feat-icon">⚡</div><h3>Lightning Fast</h3><p>Optimized for performance from day one.</p></div><div class="feature"><div class="feat-icon">🔒</div><h3>Secure</h3><p>Enterprise-grade security built in.</p></div><div class="feature"><div class="feat-icon">🌍</div><h3>Global</h3><p>Deployed worldwide, always close to users.</p></div></section>`,
    css: `*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#080808;color:#fff}.nav{display:flex;align-items:center;justify-content:space-between;padding:1.25rem 3rem;border-bottom:1px solid #ffffff10}.brand{font-weight:700;font-size:1.2rem}.links{display:flex;align-items:center;gap:2rem}.links a{color:#888;text-decoration:none;font-size:.9rem}.links a:hover{color:#fff}.hero{max-width:800px;margin:0 auto;padding:8rem 2rem;text-align:center}h1{font-size:4rem;font-weight:800;line-height:1.1;margin-bottom:1.5rem}.grad{background:linear-gradient(135deg,#667eea,#764ba2);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.hero p{color:#888;font-size:1.25rem;margin-bottom:2.5rem;max-width:500px;margin-left:auto;margin-right:auto}.hero-btns{display:flex;gap:1rem;justify-content:center;flex-wrap:wrap}.btn-primary{background:#fff;color:#000;border:none;padding:.875rem 2rem;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer}.btn-outline{background:transparent;color:#fff;border:1px solid #333;padding:.875rem 2rem;border-radius:8px;font-size:1rem;cursor:pointer}.features{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1.5rem;max-width:900px;margin:0 auto 6rem;padding:0 2rem}.feature{background:#111;border:1px solid #ffffff10;border-radius:16px;padding:2rem;text-align:center}.feat-icon{font-size:2rem;margin-bottom:1rem}.feature h3{margin-bottom:.5rem}.feature p{color:#888;font-size:.9rem}`,
    js: '',
  },
  {
    id: 'dashboard',
    title: 'Dashboard UI',
    description: 'Stats, charts, sidebar',
    icon: Grid3X3,
    html: `<div class="layout"><aside class="sidebar"><div class="logo">◉ Dashboard</div><nav><a class="active" href="#">Overview</a><a href="#">Analytics</a><a href="#">Projects</a><a href="#">Settings</a></nav></aside><main><div class="topbar"><h2>Good morning 👋</h2><div class="user-chip">User</div></div><div class="stats"><div class="stat"><div class="stat-value">24.5k</div><div class="stat-label">Total Users</div><div class="stat-change up">↑ 12%</div></div><div class="stat"><div class="stat-value">$18.2k</div><div class="stat-label">Revenue</div><div class="stat-change up">↑ 8%</div></div><div class="stat"><div class="stat-value">3.4k</div><div class="stat-label">Orders</div><div class="stat-change down">↓ 2%</div></div><div class="stat"><div class="stat-value">98.2%</div><div class="stat-label">Uptime</div><div class="stat-change up">↑ 0.1%</div></div></div></main></div>`,
    css: `*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;color:#fff}.layout{display:flex;min-height:100vh}.sidebar{width:220px;background:#111;border-right:1px solid #222;padding:1.5rem 0;display:flex;flex-direction:column;gap:0}.logo{font-weight:700;font-size:1rem;padding:0 1.25rem 1.5rem;border-bottom:1px solid #222;margin-bottom:1rem}nav a{display:block;padding:.7rem 1.25rem;color:#888;text-decoration:none;font-size:.9rem;border-radius:0}nav a:hover{color:#fff;background:#ffffff08}nav a.active{color:#fff;background:#ffffff10;font-weight:500}main{flex:1;padding:2rem}.topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:2rem}h2{font-size:1.5rem;font-weight:700}.user-chip{background:#222;padding:.5rem 1rem;border-radius:20px;font-size:.85rem;color:#888}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem}.stat{background:#111;border:1px solid #222;border-radius:16px;padding:1.5rem}.stat-value{font-size:1.8rem;font-weight:700;margin-bottom:.25rem}.stat-label{color:#888;font-size:.85rem;margin-bottom:.5rem}.stat-change{font-size:.8rem;font-weight:500}.stat-change.up{color:#50fa7b}.stat-change.down{color:#ff5555}`,
    js: '',
  },
  {
    id: 'animation',
    title: 'CSS Animation',
    description: 'Animated shapes & effects',
    icon: Zap,
    html: `<div class="scene"><div class="orb orb1"></div><div class="orb orb2"></div><div class="orb orb3"></div><div class="center"><h1>Motion</h1><p>Pure CSS animations</p></div></div>`,
    css: `*{margin:0;padding:0;box-sizing:border-box}body{background:#000;height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}.scene{position:relative;width:400px;height:400px}.orb{position:absolute;border-radius:50%;filter:blur(60px);animation:spin 8s linear infinite}.orb1{width:280px;height:280px;background:radial-gradient(circle,#667eea,transparent);top:10%;left:10%;animation-duration:8s}.orb2{width:220px;height:220px;background:radial-gradient(circle,#764ba2,transparent);bottom:10%;right:10%;animation-duration:6s;animation-direction:reverse}.orb3{width:160px;height:160px;background:radial-gradient(circle,#f093fb,transparent);top:30%;right:20%;animation-duration:10s}@keyframes spin{0%{transform:rotate(0deg) translateX(40px) rotate(0deg)}100%{transform:rotate(360deg) translateX(40px) rotate(-360deg)}}.center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;z-index:1}h1{font-size:3.5rem;font-weight:800;background:linear-gradient(135deg,#fff,#aaa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-family:system-ui}p{color:#888;margin-top:.5rem;font-family:system-ui}`,
    js: '',
  },
];

export default function Dashboard() {
  const nav = useNavigate();
  const { user, setUser, setProject, setFiles, setActiveFileId, notify } = useStore();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    if (!user) { nav('/auth'); return; }
    if (user.isGuest) { setLoading(false); return; }
    loadProjects(user.uid).then(p => {
      setProjects(p);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user]);

  const openEditor = (projectData, files) => {
    setProject(projectData);
    if (files) {
      setFiles(files);
      setActiveFileId(files[0]?.id || null);
    }
    nav('/editor');
  };

  const handleNew = () => {
    setShowTemplates(true);
  };

  const handleTemplate = (template) => {
    const files = [
      { id: 'index.html', name: 'index.html', language: 'html', content: template.html },
      { id: 'styles.css', name: 'styles.css', language: 'css', content: template.css },
      { id: 'script.js', name: 'script.js', language: 'javascript', content: template.js },
    ];
    openEditor({
      id: null,
      title: template.id === 'blank' ? 'Untitled Project' : template.title,
      html: template.html, css: template.css, js: template.js,
    }, files);
  };

  const handleOpen = (p) => {
    const files = p.files || [
      { id: 'index.html', name: 'index.html', language: 'html', content: p.html || '' },
      { id: 'styles.css', name: 'styles.css', language: 'css', content: p.css || '' },
      { id: 'script.js', name: 'script.js', language: 'javascript', content: p.js || '' },
    ];
    openEditor(p, files);
  };

  const handleDelete = async (id) => {
    await deleteProject(id);
    setProjects(ps => ps.filter(p => p.id !== id));
    setDeleteConfirm(null);
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

  const filtered = projects.filter(p =>
    p.title?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-bg">
      {/* Grid background */}
      <div className="fixed inset-0 opacity-[0.02]" style={{
        backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
        backgroundSize: '60px 60px'
      }} />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-4 border-b border-border bg-surface/50 backdrop-blur-sm sticky top-0">
        <button onClick={() => nav('/')} className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center">
            <Code2 size={14} className="text-black" />
          </div>
          <span className="font-display font-700 tracking-tight">WebIDE</span>
        </button>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-muted">
            <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
              <User size={12} />
            </div>
            {user?.displayName || user?.email?.split('@')[0] || 'Guest'}
          </div>
          {!user?.isGuest && (
            <button onClick={handleSignOut} className="flex items-center gap-1.5 text-muted hover:text-white transition-colors text-sm">
              <LogOut size={14} /> Sign out
            </button>
          )}
        </div>
      </nav>

      <main className="relative z-10 max-w-6xl mx-auto px-8 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl font-700 tracking-tight mb-1">
              {user?.isGuest ? 'Guest Mode' : 'Projects'}
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

        {/* Search */}
        {!user?.isGuest && projects.length > 0 && (
          <div className="relative mb-6">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="w-full bg-surface border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-muted focus:outline-none focus:border-border-light transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white"
              >
                <X size={13} />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3,4,5,6].map(i => <Skeleton key={i} />)}
          </div>
        ) : user?.isGuest ? (
          <div className="text-center py-24">
            <FolderOpen size={40} className="text-muted mx-auto mb-4" />
            <p className="text-muted mb-6">Guest mode doesn't persist projects.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => handleTemplate(TEMPLATES[0])} className="bg-white text-black px-5 py-2.5 rounded-xl text-sm font-medium">
                Open Editor
              </button>
              <button onClick={() => nav('/auth')} className="border border-border text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:border-border-light transition-colors">
                Sign In
              </button>
            </div>
          </div>
        ) : filtered.length === 0 && projects.length > 0 ? (
          <div className="text-center py-24">
            <Search size={32} className="text-muted mx-auto mb-3" />
            <p className="text-muted">No projects match "{search}"</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16">
            <Code2 size={40} className="text-muted mx-auto mb-4" />
            <p className="text-muted mb-2 text-lg font-medium">No projects yet</p>
            <p className="text-muted/60 text-sm mb-8">Create your first project and start building.</p>
            <button onClick={handleNew} className="bg-white text-black px-6 py-3 rounded-xl text-sm font-medium">
              Create Project
            </button>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {filtered.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => handleOpen(p)}
                className="bg-surface border border-border rounded-2xl overflow-hidden cursor-pointer hover:border-border-light transition-all group"
              >
                {/* Thumbnail */}
                <div className="h-28 bg-bg border-b border-border overflow-hidden">
                  {(p.html || p.css) ? (
                    <ProjectThumbnail html={p.html} css={p.css} js={p.js} />
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                        <span className="text-lg font-bold text-muted">{p.title[0]?.toUpperCase()}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <h3 className="font-medium text-sm mb-1 truncate group-hover:text-white transition-colors">{p.title}</h3>
                  <p className="text-muted text-xs flex items-center gap-1 mb-4">
                    <Clock size={10} /> {timeAgo(p.updatedAt)}
                  </p>

                  <div className="flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleOpen(p); }}
                      className="flex-1 bg-bg border border-border hover:border-border-light text-white text-xs py-2 rounded-lg transition-colors font-medium"
                    >
                      Open
                    </button>
                    <button
                      onClick={(e) => handleDuplicate(p, e)}
                      className="p-2 bg-bg border border-border hover:border-border-light rounded-lg transition-colors"
                      title="Duplicate"
                    >
                      <Copy size={12} className="text-muted" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm(p.id); }}
                      className="p-2 bg-bg border border-border hover:border-red-500/40 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={12} className="text-muted" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </main>

      {/* Delete confirm modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            >
              <h3 className="font-medium mb-2">Delete project?</h3>
              <p className="text-muted text-sm mb-5">This action cannot be undone.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 border border-border text-muted hover:text-white py-2 rounded-lg text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="flex-1 bg-red-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Template picker modal */}
      <AnimatePresence>
        {showTemplates && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface border border-border rounded-2xl w-full max-w-2xl shadow-2xl"
            >
              <div className="flex items-center justify-between px-6 py-5 border-b border-border">
                <div>
                  <h2 className="font-medium text-lg">New Project</h2>
                  <p className="text-muted text-sm mt-0.5">Choose a template to get started</p>
                </div>
                <button onClick={() => setShowTemplates(false)} className="text-muted hover:text-white transition-colors">
                  <X size={16} />
                </button>
              </div>

              <div className="p-6 grid grid-cols-2 gap-3">
                {TEMPLATES.map(t => {
                  const Icon = t.icon;
                  return (
                    <motion.button
                      key={t.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => { setShowTemplates(false); handleTemplate(t); }}
                      className="flex items-start gap-3 p-4 bg-bg border border-border rounded-xl hover:border-border-light transition-all text-left"
                    >
                      <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center shrink-0 mt-0.5">
                        <Icon size={16} className="text-muted" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{t.title}</p>
                        <p className="text-muted text-xs mt-0.5">{t.description}</p>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
