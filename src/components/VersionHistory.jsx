import { useState } from 'react';
import { motion } from 'framer-motion';
import { History, Camera, RotateCcw, X, Clock } from 'lucide-react';
import { useStore } from '../store';

function timeAgo(ts) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function VersionHistory({ onClose }) {
  const { snapshots, addSnapshot, restoreSnapshot, notify } = useStore();
  const [label, setLabel] = useState('');
  const [confirming, setConfirming] = useState(null);

  const handleSnapshot = () => {
    const snap = addSnapshot(label.trim() || null);
    setLabel('');
    notify(`Snapshot "${snap.label}" saved`, 'success');
  };

  const handleRestore = (id) => {
    restoreSnapshot(id);
    notify('Snapshot restored', 'success');
    setConfirming(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface border border-border rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <History size={16} />
            <span className="font-medium">Version History</span>
            {snapshots.length > 0 && (
              <span className="text-xs bg-white/5 text-muted rounded-full px-2 py-0.5">{snapshots.length}</span>
            )}
          </div>
          <button onClick={onClose} className="text-muted hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Create snapshot */}
        <div className="px-5 py-4 border-b border-border shrink-0">
          <div className="flex gap-2">
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSnapshot(); }}
              placeholder="Snapshot label (optional)"
              className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-border-light"
            />
            <button
              onClick={handleSnapshot}
              className="flex items-center gap-1.5 bg-white text-black text-sm px-4 py-2 rounded-lg font-medium hover:bg-white/90 transition-colors shrink-0"
            >
              <Camera size={14} /> Save
            </button>
          </div>
        </div>

        {/* Snapshot list */}
        <div className="flex-1 overflow-y-auto">
          {snapshots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <History size={32} className="text-muted mb-3" />
              <p className="text-muted text-sm text-center">No snapshots yet.</p>
              <p className="text-muted/60 text-xs text-center mt-1">Save a snapshot before major changes.</p>
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className="flex items-center gap-3 p-3 bg-bg border border-border rounded-xl hover:border-border-light transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{snap.label}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Clock size={10} className="text-muted" />
                      <span className="text-xs text-muted">{timeAgo(snap.timestamp)}</span>
                      <span className="text-muted/40 mx-1">·</span>
                      <span className="text-xs text-muted">{snap.files.length} file{snap.files.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>

                  {confirming === snap.id ? (
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => handleRestore(snap.id)}
                        className="text-xs bg-white text-black px-2.5 py-1 rounded-lg font-medium"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirming(null)}
                        className="text-xs text-muted hover:text-white px-2"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirming(snap.id)}
                      className="flex items-center gap-1 text-xs text-muted hover:text-white transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                      title="Restore this snapshot"
                    >
                      <RotateCcw size={12} /> Restore
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
