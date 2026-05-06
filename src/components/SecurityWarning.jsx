import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, ShieldCheck, ChevronDown, ChevronUp, X, AlertTriangle } from 'lucide-react';
import { severityLevel } from '../lib/security';

const SEVERITY_COLORS = {
  high: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', dot: 'bg-red-500' },
  medium: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', dot: 'bg-yellow-500' },
  low: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', dot: 'bg-blue-500' },
};

export default function SecurityWarning({ warnings, onDismiss }) {
  const [expanded, setExpanded] = useState(false);

  if (!warnings || warnings.length === 0) return null;

  const sorted = [...warnings].sort((a, b) => severityLevel(b.severity) - severityLevel(a.severity));
  const hasHigh = sorted.some(w => w.severity === 'high');
  const topColor = SEVERITY_COLORS[sorted[0]?.severity] || SEVERITY_COLORS.low;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`mx-2 mt-2 rounded-xl border ${topColor.bg} ${topColor.border} overflow-hidden`}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        {hasHigh
          ? <ShieldAlert size={14} className="text-red-400 shrink-0" />
          : <AlertTriangle size={14} className="text-yellow-400 shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <span className={`text-xs font-medium ${topColor.text}`}>
            {hasHigh ? 'High-risk patterns detected' : `${warnings.length} suspicious pattern${warnings.length > 1 ? 's' : ''} detected`}
          </span>
          <span className="text-xs text-muted ml-2">
            · Code runs sandboxed but review before sharing
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-muted hover:text-white transition-colors p-0.5"
            title="Details"
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <button
            onClick={onDismiss}
            className="text-muted hover:text-white transition-colors p-0.5"
            title="Dismiss"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-1.5 border-t border-white/5 pt-2">
              {sorted.map((w, i) => {
                const c = SEVERITY_COLORS[w.severity];
                return (
                  <div key={i} className="flex items-start gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${c.dot} mt-1 shrink-0`} />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-medium ${c.text}`}>{w.label}</span>
                        <span className="text-xs text-muted/40 uppercase">{w.source}</span>
                      </div>
                      {w.snippet && (
                        <code className="text-xs text-muted/60 font-mono">{w.snippet}</code>
                      )}
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-muted/50 pt-1">
                Your code runs in an isolated sandbox. These warnings help you identify potentially harmful patterns before sharing.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
