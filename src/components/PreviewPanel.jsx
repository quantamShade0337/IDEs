import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { RefreshCw, ExternalLink, Smartphone, ZoomIn, ZoomOut, Square, Play, RotateCcw } from 'lucide-react';
import { useStore } from '../store';
import { detectWorkspaceKind } from '../lib/workspace';

function buildSrcDoc(html, css, js, parentOrigin) {
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

export default function PreviewPanel({ html, css, js, files, workspaceId }) {
  const { addLog } = useStore();
  const iframeRef = useRef(null);
  const debounceRef = useRef(null);
  const syncAbortRef = useRef(null);
  const [srcDoc, setSrcDoc] = useState('');
  const [mobile, setMobile] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(ZOOM_LEVELS.indexOf(100));
  const [previewUrl, setPreviewUrl] = useState('');
  const [workspaceStatus, setWorkspaceStatus] = useState('idle');
  const [workspaceError, setWorkspaceError] = useState('');
  const [runtime, setRuntime] = useState(null);
  const [runtimeAction, setRuntimeAction] = useState('');
  const parentOrigin = window.location.origin;
  const workspaceKind = useMemo(() => detectWorkspaceKind(files), [files]);
  const packageMode = workspaceKind.packageProject;

  const refreshRuntimeStatus = useCallback(async () => {
    if (!workspaceId) return null;
    const response = await fetch(`/api/workspaces/${workspaceId}/runtime/status`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to read runtime status.');
    setRuntime(data.runtime);
    if (data.runtime?.status === 'running') {
      setPreviewUrl((current) => current?.startsWith(`/api/workspaces/${workspaceId}/runtime/`)
        ? current
        : `/api/workspaces/${workspaceId}/runtime/?ts=${Date.now()}`);
    }
    return data.runtime;
  }, [workspaceId]);

  const runRuntimeAction = useCallback(async (action) => {
    if (!workspaceId) return;
    setRuntimeAction(action);
    setWorkspaceError('');
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/runtime/${action}`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Unable to ${action} runtime.`);
      setRuntime(data.runtime);
      if (data.runtime?.status === 'running') {
        setPreviewUrl(`/api/workspaces/${workspaceId}/runtime/?ts=${Date.now()}`);
      } else if (action === 'stop') {
        setPreviewUrl(`/api/workspaces/${workspaceId}/preview?ts=${Date.now()}`);
      }
    } catch (error) {
      setWorkspaceError(error.message || `Unable to ${action} runtime.`);
    } finally {
      setRuntimeAction('');
    }
  }, [workspaceId]);

  useEffect(() => {
    if (packageMode) return undefined;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSrcDoc(buildSrcDoc(html, css, js, parentOrigin));
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [packageMode, html, css, js, parentOrigin]);

  useEffect(() => {
    if (!packageMode || !workspaceId) return undefined;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      syncAbortRef.current?.abort();
      const controller = new AbortController();
      syncAbortRef.current = controller;
      setWorkspaceStatus('syncing');
      setWorkspaceError('');
      try {
        const response = await fetch('/api/workspaces/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId, files }),
          signal: controller.signal,
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to sync workspace.');

        setWorkspaceStatus('ready');
        const currentRuntime = data.runtime || await refreshRuntimeStatus();
        if (!currentRuntime || currentRuntime.status === 'stopped' || currentRuntime.status === 'error') {
          await runRuntimeAction('start');
        } else if (currentRuntime.status === 'running') {
          setPreviewUrl(`/api/workspaces/${workspaceId}/runtime/?ts=${Date.now()}`);
        } else {
          setRuntime(currentRuntime);
          setPreviewUrl(`${data.previewUrl}&ts=${Date.now()}`);
        }
      } catch (error) {
        if (error.name === 'AbortError') return;
        setWorkspaceStatus('error');
        setWorkspaceError(error.message || 'Unable to sync workspace.');
      }
    }, 300);

    return () => {
      clearTimeout(debounceRef.current);
      syncAbortRef.current?.abort();
    };
  }, [packageMode, workspaceId, files, refreshRuntimeStatus, runRuntimeAction]);

  useEffect(() => {
    if (!packageMode || !workspaceId) return undefined;
    const timer = setInterval(() => {
      refreshRuntimeStatus().catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [packageMode, workspaceId, refreshRuntimeStatus]);

  useEffect(() => {
    if (packageMode) return undefined;
    const handler = (e) => {
      if (!iframeRef.current?.contentWindow || e.source !== iframeRef.current.contentWindow) return;
      if (e.data?.type === 'console') {
        addLog({ level: e.data.level, content: e.data.content, ts: Date.now() });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [packageMode, addLog]);

  const refresh = useCallback(() => {
    if (packageMode) {
      setPreviewUrl((current) => {
        const base = runtime?.status === 'running' ? `/api/workspaces/${workspaceId}/runtime/` : current?.split('&ts=')[0];
        return base ? `${base}?ts=${Date.now()}` : current;
      });
      return;
    }
    const doc = buildSrcDoc(html, css, js, parentOrigin);
    setSrcDoc('');
    requestAnimationFrame(() => setSrcDoc(doc));
  }, [packageMode, html, css, js, parentOrigin, runtime?.status, workspaceId]);

  const openInTab = useCallback(() => {
    if (packageMode && previewUrl) {
      window.open(previewUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const blob = new Blob([buildSrcDoc(html, css, js, parentOrigin)], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  }, [packageMode, previewUrl, html, css, js, parentOrigin]);

  const zoom = ZOOM_LEVELS[zoomIndex];
  const zoomIn = () => setZoomIndex((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1));
  const zoomOut = () => setZoomIndex((i) => Math.max(0, i - 1));
  const runtimeRunning = runtime?.status === 'running';

  const renderPreviewFrame = () => {
    if (packageMode) {
      if (workspaceStatus === 'error') {
        return (
          <div className="h-full flex items-center justify-center bg-[#09090b] px-6">
            <div className="w-full max-w-2xl rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
              <p className="text-sm font-medium text-red-300">{workspaceKind.label} workspace sync failed</p>
              <pre className="mt-3 whitespace-pre-wrap text-xs leading-6 text-red-200/80">{workspaceError}</pre>
            </div>
          </div>
        );
      }

      if (!runtimeRunning && !previewUrl) {
        return (
          <div className="h-full flex items-center justify-center bg-[#09090b] px-6">
            <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-sm font-medium text-white">{workspaceKind.label} runtime</p>
              <p className="mt-2 text-xs leading-6 text-zinc-400">
                Start the workspace runtime to preview this app here. Imported package projects keep their own structure and run from the server workspace as-is.
              </p>
            </div>
          </div>
        );
      }

      return (
        <iframe
          ref={iframeRef}
          src={previewUrl || 'about:blank'}
          title="react-preview"
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
          className="w-full h-full border-0 bg-white"
          style={{ minHeight: '100%' }}
        />
      );
    }

    return (
      <iframe
        ref={iframeRef}
        srcDoc={srcDoc}
        title="preview"
        sandbox="allow-scripts allow-modals allow-forms"
        referrerPolicy="no-referrer"
        className="w-full h-full border-0 bg-white"
        style={{ minHeight: '100%' }}
      />
    );
  };

  return (
    <div className="h-full flex flex-col bg-bg">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${packageMode ? 'bg-sky-400' : 'bg-green-400'} animate-pulse`} />
          <span className="text-xs text-muted font-mono">{packageMode ? `${workspaceKind.label} Preview` : 'Live Preview'}</span>
        </div>
        <div className="flex items-center gap-1">
          {packageMode && (
            <>
              <button
                onClick={() => runRuntimeAction(runtimeRunning ? 'restart' : 'start')}
                disabled={runtimeAction !== ''}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-muted transition-colors hover:text-white hover:border-border-light disabled:opacity-40"
                title={runtimeRunning ? 'Restart runtime' : 'Start runtime'}
              >
                {runtimeRunning ? <RotateCcw size={11} /> : <Play size={11} />}
                {runtimeRunning ? 'Restart' : 'Start'}
              </button>
              <button
                onClick={() => runRuntimeAction('stop')}
                disabled={runtimeAction !== '' || !runtimeRunning}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-muted transition-colors hover:text-white hover:border-border-light disabled:opacity-40"
                title="Stop runtime"
              >
                <Square size={11} />
                Stop
              </button>
            </>
          )}
          <button
            onClick={() => setMobile((m) => !m)}
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


      <div className="relative flex-1 overflow-auto bg-[#f5f5f5] flex items-start justify-center">
        <div
          className="h-full transition-all duration-300 ease-out origin-top-left"
          style={{
            width: mobile ? '375px' : `${(100 / zoom) * 100}%`,
            maxHeight: '100%',
            transform: zoom !== 100 ? `scale(${zoom / 100})` : undefined,
            transformOrigin: 'top left',
          }}
        >
          {renderPreviewFrame()}
        </div>
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-0.5 rounded-md bg-black/40 backdrop-blur-sm px-1.5 py-1 border border-white/[0.08]">
          <button
            onClick={zoomOut}
            disabled={zoomIndex === 0}
            className="p-0.5 text-white/50 hover:text-white disabled:opacity-25 transition-colors"
            title="Zoom out"
          >
            <ZoomOut size={11} />
          </button>
          <span className="text-[10px] text-white/50 font-mono w-7 text-center select-none">{zoom}%</span>
          <button
            onClick={zoomIn}
            disabled={zoomIndex === ZOOM_LEVELS.length - 1}
            className="p-0.5 text-white/50 hover:text-white disabled:opacity-25 transition-colors"
            title="Zoom in"
          >
            <ZoomIn size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}
