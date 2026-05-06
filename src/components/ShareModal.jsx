import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Link2, Copy, Check } from 'lucide-react';
import { useStore } from '../store';

function encodeProject(project, files) {
  try {
    const html = files.find(f => f.name.endsWith('.html'))?.content ?? project.html ?? '';
    const css = files.find(f => f.name.endsWith('.css'))?.content ?? project.css ?? '';
    const js = files.find(f => f.name.endsWith('.js') || f.name.endsWith('.jsx'))?.content ?? project.js ?? '';
    return btoa(encodeURIComponent(JSON.stringify({ title: project.title, html, css, js })));
  } catch {
    return null;
  }
}

export default function ShareModal({ onClose }) {
  const { project, files } = useStore();
  const [copied, setCopied] = useState(false);

  const encoded = encodeProject(project, files);
  const shareUrl = encoded
    ? `${window.location.origin}/editor?share=${encoded}`
    : null;

  const copy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Link2 size={16} />
            <span className="font-medium">Share Project</span>
          </div>
          <button onClick={onClose} className="text-muted hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <p className="text-muted text-sm mb-5">
          Share a read-only link to your project. The code is encoded in the URL — no server required.
        </p>

        {shareUrl ? (
          <div className="flex gap-2">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 bg-bg border border-border rounded-xl px-3 py-2.5 text-xs font-mono text-muted focus:outline-none"
            />
            <button
              onClick={copy}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                copied ? 'bg-green-500 text-white' : 'bg-white text-black hover:bg-white/90'
              }`}
            >
              {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy</>}
            </button>
          </div>
        ) : (
          <p className="text-red-400 text-sm">Project too large to encode in URL. Save to Firebase first.</p>
        )}

        <div className="mt-4 p-3 bg-bg border border-border rounded-xl">
          <p className="text-xs text-muted">
            ⚠️ Anyone with this link can view (but not edit) your project. The link contains your full code.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
