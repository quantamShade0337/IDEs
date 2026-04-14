import { useRef, useEffect } from 'react';
import { Terminal, Trash2 } from 'lucide-react';
import { useStore } from '../store';

const levelColor = {
  log: 'text-white',
  warn: 'text-yellow-400',
  error: 'text-red-400',
};

const levelBg = {
  log: '',
  warn: 'bg-yellow-500/5',
  error: 'bg-red-500/5',
};

function fmt(ts) {
  return new Date(ts).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function ConsolePanel() {
  const { consoleLogs, clearLogs } = useStore();
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [consoleLogs]);

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Terminal size={13} className="text-muted" />
          <span className="text-xs text-muted font-mono">Console</span>
          {consoleLogs.length > 0 && (
            <span className="text-xs bg-white/5 text-muted rounded px-1.5 py-0.5 font-mono">{consoleLogs.length}</span>
          )}
        </div>
        <button onClick={clearLogs} className="text-muted hover:text-white transition-colors p-1" title="Clear">
          <Trash2 size={12} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto font-mono text-xs">
        {consoleLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted/40">
            No output yet
          </div>
        ) : (
          consoleLogs.map((log, i) => (
            <div key={i} className={`flex gap-3 px-3 py-1.5 border-b border-border/40 ${levelBg[log.level] || ''}`}>
              <span className="text-muted/40 shrink-0 tabular-nums">{fmt(log.ts)}</span>
              <span className={levelColor[log.level] || 'text-white'}>{log.content}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
