import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Zap, Eye, Download, Code2, Sparkles, Terminal } from 'lucide-react';

const TYPING_STRINGS = [
  'Code. Preview. Ship.',
  'Build with AI.',
  'Deploy in seconds.',
  'Create anything.',
];

export default function Landing() {
  const nav = useNavigate();
  const [typed, setTyped] = useState('');
  const [strIdx, setStrIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const target = TYPING_STRINGS[strIdx];
    const delay = deleting ? 40 : charIdx === target.length ? 1800 : 70;
    const timer = setTimeout(() => {
      if (!deleting && charIdx < target.length) {
        setTyped(target.slice(0, charIdx + 1));
        setCharIdx(c => c + 1);
      } else if (!deleting && charIdx === target.length) {
        setDeleting(true);
      } else if (deleting && charIdx > 0) {
        setTyped(target.slice(0, charIdx - 1));
        setCharIdx(c => c - 1);
      } else {
        setDeleting(false);
        setStrIdx(i => (i + 1) % TYPING_STRINGS.length);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [typed, charIdx, deleting, strIdx]);

  const features = [
    { icon: Eye, title: 'Live Preview', desc: 'Instant feedback as you type. No refresh needed.' },
    { icon: Sparkles, title: 'AI Assistant', desc: 'Cursor-like AI that reads and rewrites your code.' },
    { icon: Download, title: 'Instant Export', desc: 'Download a clean ZIP with one click, ready to deploy.' },
    { icon: Terminal, title: 'Console', desc: 'See logs and errors in real-time without leaving the IDE.' },
    { icon: Code2, title: 'Monaco Editor', desc: 'The same editor powering VS Code. Autocomplete included.' },
    { icon: Zap, title: 'Share Anywhere', desc: 'Share your project via URL. Anyone can preview instantly.' },
  ];

  return (
    <div className="min-h-screen bg-bg text-white overflow-x-hidden">
      {/* Grid background */}
      <div className="fixed inset-0 opacity-[0.03]" style={{
        backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
        backgroundSize: '60px 60px'
      }} />

      {/* Glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] opacity-20 blur-[120px]"
        style={{ background: 'radial-gradient(ellipse, #fff 0%, transparent 70%)' }} />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center">
            <Code2 size={14} className="text-black" />
          </div>
          <span className="font-display font-700 text-lg tracking-tight">WebIDE</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => nav('/auth')}
            className="text-muted hover:text-white transition-colors text-sm px-4 py-2"
          >
            Sign in
          </button>
          <button
            onClick={() => nav('/editor')}
            className="bg-white text-black text-sm px-4 py-2 rounded-lg font-medium hover:bg-white/90 transition-colors"
          >
            Try free
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 text-center pt-28 pb-20 px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-xs text-muted mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Now with Claude & GPT-4o support
          </div>

          <h1 className="font-display text-6xl md:text-8xl font-800 tracking-tighter mb-6 leading-none">
            <span className="gradient-text">
              {typed}
              <span className="opacity-60 animate-pulse">|</span>
            </span>
          </h1>

          <p className="text-muted text-lg md:text-xl max-w-xl mx-auto mb-10 font-light leading-relaxed">
            A browser-based IDE with live preview, AI code generation, and one-click export.
            No installs. No configuration. Just code.
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => nav('/editor')}
              className="flex items-center gap-2 bg-white text-black px-7 py-3.5 rounded-xl font-medium text-base hover:bg-white/90 transition-colors"
            >
              Start Coding <ArrowRight size={16} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => nav('/auth')}
              className="flex items-center gap-2 border border-border text-white px-7 py-3.5 rounded-xl font-medium text-base hover:border-border-light transition-colors"
            >
              Sign in with Google
            </motion.button>
          </div>
        </motion.div>
      </section>

      {/* Fake editor preview */}
      <motion.section
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 max-w-6xl mx-auto px-8 mb-28"
      >
        <div className="rounded-2xl border border-border overflow-hidden shadow-2xl shadow-black/50">
          {/* Fake topbar */}
          <div className="bg-surface border-b border-border px-4 py-3 flex items-center gap-3">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/70" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
              <div className="w-3 h-3 rounded-full bg-green-500/70" />
            </div>
            <div className="flex gap-1 ml-2">
              {['HTML', 'CSS', 'JS'].map(t => (
                <div key={t} className={`text-xs px-3 py-1 rounded font-mono ${t === 'HTML' ? 'bg-white/10 text-white' : 'text-muted'}`}>{t}</div>
              ))}
            </div>
          </div>
          {/* Fake editor split */}
          <div className="flex h-80 bg-[#0d0d0d]">
            <div className="flex-1 p-6 font-mono text-xs text-muted leading-6 border-r border-border overflow-hidden">
              <div><span className="text-purple-400">{'<div'}</span> <span className="text-yellow-300">class</span><span className="text-muted">{"=\""}</span><span className="text-green-400">hero</span><span className="text-muted">{"\">"}</span></div>
              <div className="ml-4"><span className="text-purple-400">{'<h1>'}</span><span className="text-white">Hello, World!</span><span className="text-purple-400">{'</h1>'}</span></div>
              <div className="ml-4"><span className="text-purple-400">{'<p>'}</span><span className="text-muted">Build something amazing</span><span className="text-purple-400">{'</p>'}</span></div>
              <div className="ml-4"><span className="text-purple-400">{'<button'}</span> <span className="text-yellow-300">onclick</span><span className="text-muted">{"=\""}</span><span className="text-blue-400">go()</span><span className="text-muted">{"\">"}</span></div>
              <div className="ml-8 text-white">Get Started</div>
              <div className="ml-4"><span className="text-purple-400">{'</button>'}</span></div>
              <div><span className="text-purple-400">{'</div>'}</span></div>
              <div className="mt-4 text-white/20">{'·'.repeat(30)}</div>
              <div className="mt-2 opacity-40">
                <div><span className="text-purple-400">.hero</span> {'{'}</div>
                <div className="ml-4"><span className="text-yellow-300">display</span>: <span className="text-green-400">flex</span>;</div>
                <div>{'}'}</div>
              </div>
            </div>
            <div className="w-80 bg-[#0f0f0f] flex items-center justify-center text-center p-8">
              <div>
                <div className="text-2xl font-bold mb-2">Hello, World!</div>
                <div className="text-muted text-sm mb-4">Build something amazing</div>
                <div className="bg-white text-black text-xs px-4 py-2 rounded-lg inline-block">Get Started</div>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Features */}
      <section className="relative z-10 max-w-6xl mx-auto px-8 pb-28">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-4xl font-700 tracking-tight mb-4">Everything you need</h2>
          <p className="text-muted">Built for speed. Designed for creativity.</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.07, ease: [0.16, 1, 0.3, 1] }}
              viewport={{ once: true }}
              className="bg-surface border border-border rounded-2xl p-6 hover:border-border-light transition-colors group"
            >
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-4 group-hover:bg-white/10 transition-colors">
                <f.icon size={18} className="text-white" />
              </div>
              <h3 className="font-display font-600 mb-2">{f.title}</h3>
              <p className="text-muted text-sm leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-2xl mx-auto text-center px-8 pb-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          <h2 className="font-display text-4xl font-700 tracking-tight mb-4">Ready to build?</h2>
          <p className="text-muted mb-8">No signup required. Start coding in seconds.</p>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => nav('/editor')}
            className="bg-white text-black px-8 py-4 rounded-xl font-medium text-base hover:bg-white/90 transition-colors"
          >
            Open the Editor →
          </motion.button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border px-8 py-8 text-center text-muted text-sm">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-5 h-5 rounded bg-white flex items-center justify-center">
            <Code2 size={11} className="text-black" />
          </div>
          <span className="font-display font-600 text-white">WebIDE</span>
        </div>
        <p>A browser-based IDE powered by Monaco, Firebase, and AI.</p>
      </footer>
    </div>
  );
}
