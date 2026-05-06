import { useEffect, useRef, useState, useCallback } from 'react';
import { RefreshCw, ExternalLink, Monitor, Smartphone, ZoomIn, ZoomOut } from 'lucide-react';
import { useStore } from '../store';

function buildSrcDoc(html, css, js, parentOrigin) {
  // Inject CSS links from any <link rel="stylesheet"> in html
  const combinedHtml = html || '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src data: blob: https: http:; style-src 'unsafe-inline' https: http:; script-src 'unsafe-inline' https: http:; font-src data: https: http:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none';"
  />
  <style>
/* Reset */
*, *::before, *::after { box-sizing: border-box; }
${css || ''}
  </style>
</head>
<body>
${combinedHtml}
<script>
(function() {
  const PARENT_ORIGIN = ${JSON.stringify(parentOrigin)};
  const send = (level, args) => {
    try {
      window.parent.postMessage({
        type: 'console', level,
        content: args.map(a => {
          try { return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a); }
          catch { return '[Circular]'; }
        }).join(' ')
      }, PARENT_ORIGIN);
    } catch {}
  };
  const _log = console.log.bind(console);
  const _warn = console.warn.bind(console);
  const _error = console.error.bind(console);
  const _info = console.info.bind(console);
  console.log = (...a) => { _log(...a); send('log', a); };
  console.warn = (...a) => { _warn(...a); send('warn', a); };
  console.error = (...a) => { _error(...a); send('error', a); };
  console.info = (...a) => { _info(...a); send('log', a); };
  window.addEventListener('error', (ev) => {
    send('error', [\`\${ev.message} (line \${ev.lineno}:\${ev.colno})\`]);
    return false;
  });
  window.addEventListener('unhandledrejection', (ev) => {
    send('error', [\`Unhandled Promise: \${ev.reason}\`]);
  });
})();
</script>
<script>
${js || ''}
<\/script>
</body>
</html>`;
}

const ZOOM_LEVELS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200];

export default function PreviewPanel({ html, css, js }) {
  const { addLog } = useStore();
  const iframeRef = useRef(null);
  const [srcDoc, setSrcDoc] = useState('');
  const [mobile, setMobile] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(ZOOM_LEVELS.indexOf(100));
  const debounceRef = useRef(null);
  const parentOrigin = window.location.origin;

  // Debounced preview update
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSrcDoc(buildSrcDoc(html, css, js, parentOrigin));
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [html, css, js, parentOrigin]);

  // Listen for console messages from iframe
  useEffect(() => {
    const handler = (e) => {
      if (!iframeRef.current?.contentWindow || e.source !== iframeRef.current.contentWindow) return;
      if (e.data?.type === 'console') {
        addLog({ level: e.data.level, content: e.data.content, ts: Date.now() });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [addLog]);

  const refresh = useCallback(() => {
    const doc = buildSrcDoc(html, css, js, parentOrigin);
    setSrcDoc('');
    requestAnimationFrame(() => setSrcDoc(doc));
  }, [html, css, js, parentOrigin]);

  const openInTab = useCallback(() => {
    const blob = new Blob([buildSrcDoc(html, css, js, parentOrigin)], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  }, [html, css, js, parentOrigin]);

  const zoom = ZOOM_LEVELS[zoomIndex];
  const zoomIn = () => setZoomIndex(i => Math.min(ZOOM_LEVELS.length - 1, i + 1));
  const zoomOut = () => setZoomIndex(i => Math.max(0, i - 1));

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
            onClick={zoomOut}
            disabled={zoomIndex === 0}
            className="p-1.5 rounded-lg text-muted hover:text-white transition-colors disabled:opacity-30"
            title="Zoom out"
          >
            <ZoomOut size={12} />
          </button>
          <span className="text-xs text-muted font-mono w-10 text-center">{zoom}%</span>
          <button
            onClick={zoomIn}
            disabled={zoomIndex === ZOOM_LEVELS.length - 1}
            className="p-1.5 rounded-lg text-muted hover:text-white transition-colors disabled:opacity-30"
            title="Zoom in"
          >
            <ZoomIn size={12} />
          </button>
          <div className="w-px h-4 bg-border mx-0.5" />
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
          <button onClick={openInTab} className="p-1.5 rounded-lg text-muted hover:text-white transition-colors" title="Open in new tab">
            <ExternalLink size={13} />
          </button>
        </div>
      </div>

      {/* Preview container */}
      <div className="flex-1 overflow-auto bg-[#f5f5f5] flex items-start justify-center">
        <div
          className="h-full transition-all duration-300 ease-out origin-top-left"
          style={{
            width: mobile ? '375px' : `${(100 / zoom) * 100}%`,
            maxHeight: '100%',
            transform: zoom !== 100 ? `scale(${zoom / 100})` : undefined,
            transformOrigin: 'top left',
          }}
        >
          <iframe
            ref={iframeRef}
            srcDoc={srcDoc}
            title="preview"
            sandbox="allow-scripts allow-modals allow-forms"
            referrerPolicy="no-referrer"
            className="w-full h-full border-0 bg-white"
            style={{ minHeight: '100%' }}
          />
        </div>
      </div>
    </div>
  );
}
