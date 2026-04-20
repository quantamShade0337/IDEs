import { useEffect, useRef, useState } from 'react';
import { RefreshCw, ExternalLink, Monitor, Smartphone } from 'lucide-react';
import { useStore } from '../store';

function buildSrcDoc(html, css, js, parentOrigin) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src data: blob: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data: https:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'; object-src 'none'; media-src 'none'; manifest-src 'none'; worker-src 'none';"
  />
  <style>${css}</style>
</head>
<body>
${html}
<script>
// Strict sandbox communication - only allow logging
const _log = console.log;
const _warn = console.warn;
const _error = console.error;
const PARENT_ORIGIN = ${JSON.stringify(parentOrigin)};

// Prevent access to parent window
try {
  Object.defineProperty(window, 'parent', { value: window, writable: false });
  Object.defineProperty(window, 'top', { value: window, writable: false });
  Object.defineProperty(window, 'opener', { value: null, writable: false });
} catch (e) {}

const send = (level, args) => {
  try {
    window.parent.postMessage({ type: 'console', level, content: args.map(a => {
      try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch { return '[Object]'; }
    }).join(' ') }, PARENT_ORIGIN);
  } catch (e) {}
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
  const parentOrigin = window.location.origin;

  // Debounced update
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSrcDoc(buildSrcDoc(project.html, project.css, project.js, parentOrigin));
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [project.html, project.css, project.js, parentOrigin]);

  // Listen for console messages from iframe - strict origin verification
  useEffect(() => {
    const handler = (e) => {
      if (!iframeRef.current?.contentWindow || e.source !== iframeRef.current.contentWindow) return;
      if (e.origin !== parentOrigin) return;
      if (e.data?.type !== 'console') return;
      if (!e.data?.level || !e.data?.content) return;
      addLog({ level: e.data.level, content: e.data.content, ts: Date.now() });
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [addLog, parentOrigin]);

  const refresh = () => {
    setSrcDoc('');
    setTimeout(() => setSrcDoc(buildSrcDoc(project.html, project.css, project.js, parentOrigin)), 50);
  };

  const openInTab = () => {
    const blob = new Blob([buildSrcDoc(project.html, project.css, project.js, parentOrigin)], { type: 'text/html' });
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
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            className="w-full h-full border-0 bg-white"
            style={{ minHeight: '100%' }}
          />
        </div>
      </div>
    </div>
  );
}
