import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Code2, ArrowRight } from 'lucide-react';

export default function NotFound() {
  const nav = useNavigate();

  return (
    <div className="min-h-screen bg-bg text-white overflow-x-hidden flex flex-col">
      {/* Grid background */}
      <div className="fixed inset-0 opacity-[0.02]" style={{
        backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6 border-b border-border">
        <button onClick={() => nav('/')} className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center">
            <Code2 size={14} className="text-black" />
          </div>
          <span className="font-display font-700 text-lg tracking-tight">WebIDE</span>
        </button>
      </nav>

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="font-mono text-xs text-muted tracking-widest uppercase mb-6">Error 404</p>

          <h1 className="font-display text-7xl md:text-9xl font-800 tracking-tighter mb-4 leading-none">
            <span className="gradient-text">Not found.</span>
          </h1>

          <p className="text-muted text-lg max-w-sm mx-auto mb-10 font-light leading-relaxed">
            This page doesn't exist or was moved. Head back and keep building.
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => nav('/')}
              className="flex items-center gap-2 bg-white text-black px-7 py-3.5 rounded-xl font-medium text-base"
            >
              Go home <ArrowRight size={16} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => nav(-1)}
              className="flex items-center gap-2 border border-border text-white px-7 py-3.5 rounded-xl font-medium text-base hover:border-border-light transition-colors"
            >
              Go back
            </motion.button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
