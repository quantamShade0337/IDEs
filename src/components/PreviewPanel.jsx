import { useEffect, useRef, useState, useCallback } from 'react';
import { RefreshCw, ExternalLink, Monitor, Smartphone } from 'lucide-react';
import { useStore } from '../store';

function buildSrcDoc(html, css, js) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${css}</style>
</head>
<body>
${html}
<script>
// Intercept console
const _log = console.log;
const _warn = console.warn;
const _error = console.error;
const send = (level, args) => {
  window.parent.postMessage({ type: 'console', level, content: args.map(a => {
    try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch { return '[Object]'; }
  }).join(' ') }, '*');
};
console.log = (...a) => { _log(...a); send('log', a); };
console.warn = (...a) => { _warn(...a); send('warn', a); };
console.error = (...a) => { _error(...a); send('error', a); };
window.onerror = (msg, src, line, col, err) => {
  send('error', [\`\${msg} (line \${line})\`]);
  return false;
};
</script>
<script>${js}<\/script>
</body>
</html>`;
}

export default function PreviewPanel() {
  const { project, addLog } = useStore();
  const iframeRef = useRef(null);
  const [srcDoc, setSrcDoc] = useState('');
  const [mobile, setMobile] = useState(false);
  const debounceRef = useRef(null);

  // Debounced update
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSrcDoc(buildSrcDoc(project.html, project.css, project.js));
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [project.html, project.css, project.js]);

  // Listen for console messages from iframe
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'console') {
        addLog({ level: e.data.level, content: e.data.content, ts: Date.now() });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [addLog]);

  const refresh = () => {
    setSrcDoc('');
    setTimeout(() => setSrcDoc(buildSrcDoc(project.html, project.css, project.js)), 50);
  };

  const openInTab = () => {
    const blob = new Blob([buildSrcDoc(project.html, project.css, project.js)], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  };

  return (
    <div className="h-full flex flex-col bg-bg">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-muted font-mono">Live Preview</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMobile(m => !m)}
            className={`p-1.5 rounded-lg transition-colors ${mobile ? 'text-white bg-white/10' : 'text-muted hover:text-white'}`}
            title="Mobile view"
          >
            <Smartphone size={13} />
          </button>
          <button onClick={refresh} className="p-1.5 rounded-lg text-muted hover:text-white transition-colors" title="Refresh">
            <RefreshCw size={13} />
          </button>
          <button onClick={openInTab} className="p-1.5 rounded-lg text-muted hover:text-white transition-colors" title="Open in tab">
            <ExternalLink size={13} />
          </button>
        </div>
      </div>

      {/* Preview */}
      <div className="flex-1 overflow-auto bg-[#f5f5f5] flex items-start justify-center">
        <div
          className="h-full transition-all duration-300 ease-out"
          style={{ width: mobile ? '375px' : '100%', maxHeight: '100%' }}
        >
          <iframe
            ref={iframeRef}
            srcDoc={srcDoc}
            title="preview"
            sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
            className="w-full h-full border-0 bg-white"
            style={{ minHeight: '100%' }}
          />
        </div>
      </div>
    </div>
  );
}
