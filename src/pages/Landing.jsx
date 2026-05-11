import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight, Zap, Eye, Download, Code2, Sparkles, Terminal,
  Users, Share2, FolderOpen, Cpu, GitBranch, Shield,
  ChevronRight,
} from 'lucide-react';

const TYPING_STRINGS = [
  'Code. Preview. Ship.',
  'Deploy in seconds.',
  'Create anything.',
];

const inView = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true } };

export default function Landing() {
  const nav = useNavigate();
  const [typed, setTyped] = useState('');
  const [strIdx, setStrIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [activeDemoTab, setActiveDemoTab] = useState('HTML');

  const demoFiles = {
    HTML: [
      { indent: 0, tokens: [{ t: '<div', c: 'text-purple-400' }, { t: ' class', c: 'text-yellow-300' }, { t: '="hero">', c: 'text-muted' }] },
      { indent: 1, tokens: [{ t: '<h1>', c: 'text-purple-400' }, { t: 'Hello, World!', c: 'text-white' }, { t: '</h1>', c: 'text-purple-400' }] },
      { indent: 1, tokens: [{ t: '<p>', c: 'text-purple-400' }, { t: 'Build something amazing', c: 'text-muted' }, { t: '</p>', c: 'text-purple-400' }] },
      { indent: 1, tokens: [{ t: '<button', c: 'text-purple-400' }, { t: ' onclick', c: 'text-yellow-300' }, { t: '="go()">', c: 'text-muted' }] },
      { indent: 2, tokens: [{ t: 'Get Started', c: 'text-white' }] },
      { indent: 1, tokens: [{ t: '</button>', c: 'text-purple-400' }] },
      { indent: 0, tokens: [{ t: '</div>', c: 'text-purple-400' }] },
    ],
    CSS: [
      { indent: 0, tokens: [{ t: '.hero', c: 'text-purple-400' }, { t: ' {', c: 'text-white' }] },
      { indent: 1, tokens: [{ t: 'display', c: 'text-yellow-300' }, { t: ': ', c: 'text-white' }, { t: 'grid', c: 'text-green-400' }, { t: ';', c: 'text-white' }] },
      { indent: 1, tokens: [{ t: 'place-items', c: 'text-yellow-300' }, { t: ': ', c: 'text-white' }, { t: 'center', c: 'text-green-400' }, { t: ';', c: 'text-white' }] },
      { indent: 1, tokens: [{ t: 'gap', c: 'text-yellow-300' }, { t: ': ', c: 'text-white' }, { t: '12px', c: 'text-green-400' }, { t: ';', c: 'text-white' }] },
      { indent: 1, tokens: [{ t: 'padding', c: 'text-yellow-300' }, { t: ': ', c: 'text-white' }, { t: '32px', c: 'text-green-400' }, { t: ';', c: 'text-white' }] },
      { indent: 0, tokens: [{ t: '}', c: 'text-white' }] },
      { indent: 0, tokens: [] },
      { indent: 0, tokens: [{ t: 'button', c: 'text-purple-400' }, { t: ' {', c: 'text-white' }] },
      { indent: 1, tokens: [{ t: 'border-radius', c: 'text-yellow-300' }, { t: ': ', c: 'text-white' }, { t: '12px', c: 'text-green-400' }, { t: ';', c: 'text-white' }] },
      { indent: 1, tokens: [{ t: 'background', c: 'text-yellow-300' }, { t: ': ', c: 'text-white' }, { t: '#fff', c: 'text-green-400' }, { t: ';', c: 'text-white' }] },
      { indent: 0, tokens: [{ t: '}', c: 'text-white' }] },
    ],
    JS: [
      { indent: 0, tokens: [{ t: 'const ', c: 'text-purple-400' }, { t: 'button', c: 'text-blue-400' }, { t: ' = ', c: 'text-white' }, { t: 'document', c: 'text-green-400' }, { t: '.querySelector(', c: 'text-white' }, { t: '\'button\'', c: 'text-yellow-300' }, { t: ');', c: 'text-white' }] },
      { indent: 0, tokens: [] },
      { indent: 0, tokens: [{ t: 'function ', c: 'text-purple-400' }, { t: 'go', c: 'text-blue-400' }, { t: '() {', c: 'text-white' }] },
      { indent: 1, tokens: [{ t: 'button', c: 'text-blue-400' }, { t: '.textContent = ', c: 'text-white' }, { t: '\'Launching...\'', c: 'text-yellow-300' }, { t: ';', c: 'text-white' }] },
      { indent: 1, tokens: [{ t: 'button', c: 'text-blue-400' }, { t: '.style.transform = ', c: 'text-white' }, { t: '\'translateY(-1px)\'', c: 'text-yellow-300' }, { t: ';', c: 'text-white' }] },
      { indent: 0, tokens: [{ t: '}', c: 'text-white' }] },
      { indent: 0, tokens: [] },
      { indent: 0, tokens: [{ t: 'button', c: 'text-blue-400' }, { t: '.addEventListener(', c: 'text-white' }, { t: '\'click\'', c: 'text-yellow-300' }, { t: ', go);', c: 'text-white' }] },
    ],
  };

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
    { icon: Eye, title: 'Live Preview', desc: 'Instant feedback as you type. No refresh needed. What you see is exactly what ships.' },
    { icon: Sparkles, title: 'AI Assistant', desc: 'Describe what you want, and the AI rewrites your code. Powered by Claude and GPT-4o.' },
    { icon: Users, title: 'Real-time Collab', desc: 'Work with teammates live. See cursors, share sessions, stay in sync.' },
    { icon: Download, title: 'Instant Export', desc: 'Download a clean ZIP with one click — HTML, CSS, and JS, ready to deploy anywhere.' },
    { icon: Terminal, title: 'Built-in Console', desc: 'See logs, warnings, and errors in real-time without leaving the IDE.' },
    { icon: Code2, title: 'Monaco Editor', desc: 'The same editor powering VS Code. Syntax highlighting, autocomplete, and multi-cursor.' },
    { icon: Share2, title: 'Share via URL', desc: 'Share your full project as a link. No account needed to view.' },
    { icon: FolderOpen, title: 'Cloud Projects', desc: 'Save unlimited projects to the cloud. Pick up where you left off from any device.' },
    { icon: Shield, title: 'Secure Sandbox', desc: 'Preview runs in a sandboxed iframe. Malicious code stays contained.' },
  ];

  const workflow = [
    {
      step: '01',
      title: 'Open the editor',
      body: 'No download. No signup required. Just open a browser tab and start writing HTML, CSS, and JavaScript immediately.',
    },
    {
      step: '02',
      title: 'See it live',
      body: 'The split preview updates as you type. Change a color, tweak a font, add an animation — see the result in milliseconds.',
    },
    {
      step: '03',
      title: 'Collaborate or share',
      body: 'Invite teammates to a live session, or share a read-only link to your project. No git, no setup, no friction.',
    },
    {
      step: '04',
      title: 'Export and ship',
      body: 'When you\'re done, download a clean ZIP or copy your share link. Your code is yours — take it anywhere.',
    },
  ];

  const useCases = [
    {
      label: 'Prototyping',
      title: 'Go from idea to prototype in minutes',
      body: 'Spin up a landing page, a component, or a full UI in a blank project. Skip the boilerplate. WebIDE gives you HTML, CSS, and JS wired up and ready to run the moment you open it.',
      code: [
        { indent: 0, tokens: [{ t: '<section', c: 'text-purple-400' }, { t: ' class', c: 'text-yellow-300' }, { t: '="hero">', c: 'text-muted' }] },
        { indent: 1, tokens: [{ t: '<h1>', c: 'text-purple-400' }, { t: 'Ship faster.', c: 'text-white' }, { t: '</h1>', c: 'text-purple-400' }] },
        { indent: 1, tokens: [{ t: '<button', c: 'text-purple-400' }, { t: ' class', c: 'text-yellow-300' }, { t: '="btn">', c: 'text-muted' }, { t: 'Start', c: 'text-white' }, { t: '</button>', c: 'text-purple-400' }] },
        { indent: 0, tokens: [{ t: '</section>', c: 'text-purple-400' }] },
      ],
    },
    {
      label: 'Teaching',
      title: 'The best classroom tool for web dev',
      body: 'Share a starter project with your students, watch them edit it live, and see their output in real time. No environment setup, no "it works on my machine." Just code.',
      code: [
        { indent: 0, tokens: [{ t: '/* Exercise 1: center a div */', c: 'text-muted/60 italic' }] },
        { indent: 0, tokens: [{ t: '.container', c: 'text-purple-400' }, { t: ' {', c: 'text-white' }] },
        { indent: 1, tokens: [{ t: 'display', c: 'text-yellow-300' }, { t: ': ', c: 'text-white' }, { t: 'flex', c: 'text-green-400' }, { t: ';', c: 'text-white' }] },
        { indent: 1, tokens: [{ t: 'place-items', c: 'text-yellow-300' }, { t: ': ', c: 'text-white' }, { t: 'center', c: 'text-green-400' }, { t: ';', c: 'text-white' }] },
        { indent: 0, tokens: [{ t: '}', c: 'text-white' }] },
      ],
    },
    {
      label: 'Interviews',
      title: 'Run frontend interviews without setup',
      body: 'Send a candidate a share link with a starter project. They edit it live, you watch in real time. No IDE installs, no screen share lag, no boilerplate confusion.',
      code: [
        { indent: 0, tokens: [{ t: '// Implement a debounce function', c: 'text-muted/60 italic' }] },
        { indent: 0, tokens: [{ t: 'function ', c: 'text-purple-400' }, { t: 'debounce', c: 'text-blue-400' }, { t: '(fn, ms) {', c: 'text-white' }] },
        { indent: 1, tokens: [{ t: 'let ', c: 'text-purple-400' }, { t: 'timer;', c: 'text-white' }] },
        { indent: 1, tokens: [{ t: 'return ', c: 'text-purple-400' }, { t: '(...args) => {', c: 'text-white' }] },
        { indent: 2, tokens: [{ t: 'clearTimeout', c: 'text-blue-400' }, { t: '(timer);', c: 'text-white' }] },
        { indent: 1, tokens: [{ t: '};', c: 'text-white' }] },
        { indent: 0, tokens: [{ t: '}', c: 'text-white' }] },
      ],
    },
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
          <h1 className="font-display text-6xl md:text-8xl font-800 tracking-tighter mb-6 leading-none">
            <span className="gradient-text">
              {typed}
              <span className="opacity-60 animate-pulse">|</span>
            </span>
          </h1>

          <p className="text-muted text-lg md:text-xl max-w-xl mx-auto mb-10 font-light leading-relaxed">
            A browser-based IDE with live preview, real-time collaboration, and one-click export.
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
              {Object.keys(demoFiles).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveDemoTab(tab)}
                  className={`text-xs px-3 py-1 rounded font-mono transition-colors ${
                    tab === activeDemoTab
                      ? 'bg-white/10 text-white'
                      : 'text-muted hover:text-white hover:bg-white/5'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            {/* Fake collab avatars */}
            <div className="ml-auto flex -space-x-1.5">
              {['#6366f1', '#ec4899', '#10b981'].map((c, i) => (
                <div key={i} className="w-5 h-5 rounded-full border border-surface text-xs flex items-center justify-center font-bold" style={{ background: c }}>
                  {['A', 'B', 'C'][i]}
                </div>
              ))}
            </div>
          </div>
          {/* Fake editor split */}
          <div className="flex h-80 bg-[#0d0d0d]">
            <div className="flex-1 p-6 font-mono text-xs text-muted leading-6 border-r border-border overflow-hidden">
              {demoFiles[activeDemoTab].map((line, index) => (
                <div key={`${activeDemoTab}-${index}`} className={line.tokens.length === 0 ? 'h-6' : ''} style={{ marginLeft: `${line.indent * 16}px` }}>
                  {line.tokens.map((token, tokenIndex) => (
                    <span key={`${activeDemoTab}-${index}-${tokenIndex}`} className={token.c}>
                      {token.t}
                    </span>
                  ))}
                </div>
              ))}
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

      {/* Stats bar */}
      <motion.section
        {...inView}
        transition={{ duration: 0.6 }}
        className="relative z-10 max-w-6xl mx-auto px-8 mb-28"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border rounded-2xl overflow-hidden border border-border">
          {[
            { value: '< 1s', label: 'Preview latency' },
            { value: '3', label: 'Languages supported' },
            { value: '∞', label: 'Projects in cloud' },
            { value: '0', label: 'Things to install' },
          ].map(s => (
            <div key={s.label} className="bg-surface px-8 py-8 text-center">
              <div className="font-display text-4xl font-800 tracking-tight mb-1">{s.value}</div>
              <div className="text-muted text-sm">{s.label}</div>
            </div>
          ))}
        </div>
      </motion.section>

      {/* Features grid */}
      <section className="relative z-10 max-w-6xl mx-auto px-8 pb-28">
        <motion.div
          {...inView}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-4xl font-700 tracking-tight mb-4">Everything you need</h2>
          <p className="text-muted">Built for speed. Designed for creativity.</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              {...inView}
              transition={{ duration: 0.5, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
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

      {/* How it works */}
      <section className="relative z-10 max-w-6xl mx-auto px-8 pb-28">
        <motion.div
          {...inView}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-4xl font-700 tracking-tight mb-4">How it works</h2>
          <p className="text-muted">From blank page to shipped project in four steps.</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workflow.map((w, i) => (
            <motion.div
              key={w.step}
              {...inView}
              transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="bg-surface border border-border rounded-2xl p-7 hover:border-border-light transition-colors"
            >
              <div className="font-mono text-xs text-muted/50 mb-4 tracking-widest">{w.step}</div>
              <h3 className="font-display font-600 text-lg mb-2">{w.title}</h3>
              <p className="text-muted text-sm leading-relaxed">{w.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Use cases — alternating layout */}
      <section className="relative z-10 max-w-6xl mx-auto px-8 pb-28">
        <motion.div
          {...inView}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-4xl font-700 tracking-tight mb-4">Built for every workflow</h2>
          <p className="text-muted">Whether you're building, teaching, or hiring — WebIDE fits in.</p>
        </motion.div>

        <div className="space-y-4">
          {useCases.map((uc, i) => (
            <motion.div
              key={uc.label}
              {...inView}
              transition={{ duration: 0.6, delay: i * 0.08 }}
              className="bg-surface border border-border rounded-2xl overflow-hidden"
            >
              <div className={`flex flex-col ${i % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'}`}>
                {/* Text side */}
                <div className="flex-1 p-8 md:p-10 flex flex-col justify-center">
                  <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1 text-xs text-muted mb-5 self-start">
                    {uc.label}
                  </div>
                  <h3 className="font-display text-2xl font-700 tracking-tight mb-3">{uc.title}</h3>
                  <p className="text-muted text-sm leading-relaxed mb-6">{uc.body}</p>
                  <button
                    onClick={() => nav('/editor')}
                    className="self-start flex items-center gap-1.5 text-sm text-white hover:text-white/80 transition-colors font-medium"
                  >
                    Try it now <ChevronRight size={14} />
                  </button>
                </div>
                {/* Code side */}
                <div className="flex-1 bg-[#0d0d0d] border-t md:border-t-0 border-border md:border-l p-6 font-mono text-xs leading-7 overflow-hidden">
                  <div className="flex gap-1.5 mb-5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                  </div>
                  {uc.code.map((line, li) => (
                    <div key={li} style={{ paddingLeft: `${line.indent * 16}px` }}>
                      {line.tokens.map((tok, ti) => (
                        <span key={ti} className={tok.c}>{tok.t}</span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* AI section */}
      <section className="relative z-10 max-w-6xl mx-auto px-8 pb-28">
        <motion.div
          {...inView}
          transition={{ duration: 0.6 }}
          className="bg-surface border border-border rounded-2xl overflow-hidden"
        >
          <div className="flex flex-col md:flex-row">
            {/* Left */}
            <div className="flex-1 p-10 flex flex-col justify-center">
              <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1 text-xs text-muted mb-5 self-start">
                <Sparkles size={11} /> AI-powered
              </div>
              <h2 className="font-display text-3xl font-700 tracking-tight mb-4">
                Describe it.<br />Watch it appear.
              </h2>
              <p className="text-muted text-sm leading-relaxed mb-6">
                The built-in AI assistant reads your code and rewrites it based on plain-English instructions.
                Add a dark mode toggle, make it mobile-responsive, or build a whole feature from scratch — just describe what you want.
              </p>
              <div className="space-y-2">
                {[
                  '"Add smooth scroll animations"',
                  '"Make this responsive for mobile"',
                  '"Build a contact form with validation"',
                ].map(s => (
                  <div key={s} className="flex items-center gap-2 text-xs text-muted">
                    <div className="w-1 h-1 rounded-full bg-white/30 shrink-0" />
                    {s}
                  </div>
                ))}
              </div>
            </div>
            {/* Right — fake AI chat */}
            <div className="flex-1 border-t md:border-t-0 md:border-l border-border bg-[#0d0d0d] p-6 flex flex-col gap-3">
              <div className="text-xs text-muted mb-1 flex items-center gap-2">
                <Sparkles size={11} />
                AI Assistant
              </div>
              {[
                { role: 'user', msg: 'Add a dark mode toggle button' },
                { role: 'ai', msg: 'Done! I added a toggle button in the top-right corner. It switches between light and dark themes using a CSS class on the body.' },
                { role: 'user', msg: 'Make the button animated' },
                { role: 'ai', msg: 'Updated — the button now has a smooth 300ms transition on the icon and background color.' },
              ].map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    m.role === 'user' ? 'bg-white text-black' : 'bg-white/5 border border-border text-white'
                  }`}>
                    {m.msg}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* Comparison table */}
      <section className="relative z-10 max-w-4xl mx-auto px-8 pb-28">
        <motion.div
          {...inView}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="font-display text-4xl font-700 tracking-tight mb-4">Why not just use VS Code?</h2>
          <p className="text-muted">WebIDE isn't a replacement — it's the fastest path from idea to result.</p>
        </motion.div>

        <motion.div
          {...inView}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="bg-surface border border-border rounded-2xl overflow-hidden"
        >
          <div className="grid grid-cols-3 text-xs font-medium border-b border-border">
            <div className="px-6 py-4 text-muted" />
            <div className="px-6 py-4 text-center border-l border-border">Local IDE</div>
            <div className="px-6 py-4 text-center border-l border-border text-white bg-white/5">WebIDE</div>
          </div>
          {[
            ['Setup time', '10–30 min', '0 seconds'],
            ['Works on any device', '✗', '✓'],
            ['Live preview built in', '✗ (extension)', '✓'],
            ['Share via link', '✗', '✓'],
            ['Real-time collaboration', '✗ (extension)', '✓'],
            ['AI assistant', '✗ (extension)', '✓'],
            ['No install required', '✗', '✓'],
          ].map(([label, local, web]) => (
            <div key={label} className="grid grid-cols-3 text-sm border-b border-border last:border-0">
              <div className="px-6 py-3.5 text-muted text-xs">{label}</div>
              <div className="px-6 py-3.5 text-center border-l border-border text-muted text-xs">{local}</div>
              <div className="px-6 py-3.5 text-center border-l border-border text-green-400 text-xs font-medium bg-white/[0.02]">{web}</div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-2xl mx-auto text-center px-8 pb-28">
        <motion.div
          {...inView}
          transition={{ duration: 0.6 }}
        >
          <h2 className="font-display text-5xl font-700 tracking-tight mb-4">Ready to build?</h2>
          <p className="text-muted mb-8 text-lg">No signup required. Start coding in seconds.</p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => nav('/editor')}
              className="flex items-center gap-2 bg-white text-black px-8 py-4 rounded-xl font-medium text-base hover:bg-white/90 transition-colors"
            >
              Open the Editor <ArrowRight size={16} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => nav('/auth')}
              className="flex items-center gap-2 border border-border text-white px-8 py-4 rounded-xl font-medium text-base hover:border-border-light transition-colors"
            >
              Create free account
            </motion.button>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border px-8 py-10 text-muted text-sm">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-white flex items-center justify-center">
              <Code2 size={11} className="text-black" />
            </div>
            <span className="font-display font-600 text-white">WebIDE</span>
            <span className="text-muted/50">—</span>
            <span className="text-xs">A browser-based IDE powered by Monaco and Firebase.</span>
          </div>
          <div className="flex items-center gap-5 text-xs">
            <Link to="/legal/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link to="/legal/privacy" className="hover:text-white transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
