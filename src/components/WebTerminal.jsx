import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Maximize2, Minimize2, RefreshCw, Terminal } from 'lucide-react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

function getTerminalUrl(workspaceId) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = new URL(`${protocol}//${window.location.host}/terminal`);
  if (workspaceId) url.searchParams.set('workspaceId', workspaceId);
  return url.toString();
}

export default function WebTerminal({ onClose, isMaximized, onToggleMaximize, workspaceId, files = [] }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const socketRef = useRef(null);
  const disposedRef = useRef(false);
  const connectRef = useRef(() => {});
  const [connectionState, setConnectionState] = useState('connecting');
  const [sessionInfo, setSessionInfo] = useState(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [accessKey, setAccessKey] = useState(() => sessionStorage.getItem('terminal_access_key') || '');
  const [authError, setAuthError] = useState('');
  const [syncState, setSyncState] = useState('idle');
  const syncKeyRef = useRef('');

  const statusLabel = useMemo(() => {
    if (connectionState === 'open') return 'live';
    if (connectionState === 'connecting') return 'connecting';
    return 'offline';
  }, [connectionState]);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    disposedRef.current = false;
    setConnectionState('connecting');
    setSessionInfo(null);
    setAuthRequired(false);
    setAuthError('');

    const term = new XTerm({
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 13,
      theme: {
        background: '#0a0a0a',
        foreground: '#e5e7eb',
        cursor: '#ffffff',
        cursorAccent: '#0a0a0a',
        selectionBackground: '#ffffff30',
        black: '#000000',
        red: '#ff6b6b',
        green: '#7ee787',
        yellow: '#f4d35e',
        blue: '#79c0ff',
        magenta: '#d2a8ff',
        cyan: '#76e3ea',
        white: '#f8fafc',
        brightBlack: '#6b7280',
        brightRed: '#ff7b72',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#bc8cff',
        brightCyan: '#39c5cf',
        brightWhite: '#ffffff',
      },
      cursorBlink: true,
      convertEol: true,
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    term.focus();
    fitRef.current = fitAddon;
    termRef.current = term;

    const safeSetState = (setter, value) => {
      if (!disposedRef.current) setter(value);
    };

    const writeToTerminal = (message, mode = 'write') => {
      if (disposedRef.current) return;
      const currentTerm = termRef.current;
      if (!currentTerm) return;
      try {
        if (mode === 'writeln') currentTerm.writeln(message);
        else currentTerm.write(message);
      } catch {}
    };

    const sendResize = () => {
      if (disposedRef.current) return;
      try {
        fitAddon.fit();
      } catch {
        return;
      }
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: 'resize',
          cols: term.cols,
          rows: term.rows,
        }));
      }
    };

    const closeSocket = ({ kill = false } = {}) => {
      const currentSocket = socketRef.current;
      socketRef.current = null;
      if (!currentSocket) return;

      currentSocket.onopen = null;
      currentSocket.onmessage = null;
      currentSocket.onerror = null;
      currentSocket.onclose = null;

      try {
        if (kill && currentSocket.readyState === WebSocket.OPEN) {
          currentSocket.send(JSON.stringify({ type: 'kill' }));
        }
      } catch {}

      try {
        currentSocket.close();
      } catch {}
    };

    const connect = ({ resetTerminal = false } = {}) => {
      if (disposedRef.current) return;

      const currentSocket = socketRef.current;
      if (currentSocket?.readyState === WebSocket.OPEN || currentSocket?.readyState === WebSocket.CONNECTING) {
        return;
      }

      if (resetTerminal) {
        try {
          term.clear();
        } catch {}
        safeSetState(setSessionInfo, null);
        safeSetState(setAuthRequired, false);
        safeSetState(setAuthError, '');
      }

      safeSetState(setConnectionState, 'connecting');
      const socket = new WebSocket(getTerminalUrl(workspaceId));
      socketRef.current = socket;

      socket.onopen = () => {
        if (disposedRef.current || socketRef.current !== socket) return;
        safeSetState(setConnectionState, 'open');
        try {
          term.focus();
        } catch {}
        sendResize();
      };

      socket.onmessage = (event) => {
        if (disposedRef.current || socketRef.current !== socket) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'auth-required') {
            safeSetState(setAuthRequired, true);
            safeSetState(setConnectionState, 'connecting');
          } else if (message.type === 'auth-failed') {
            safeSetState(setAuthError, message.message || 'Terminal authentication failed.');
            safeSetState(setAuthRequired, true);
          } else if (message.type === 'ready') {
            safeSetState(setSessionInfo, message);
            safeSetState(setAuthRequired, false);
            safeSetState(setAuthError, '');
            writeToTerminal('\x1b[1m\x1b[32mWebIDE Terminal\x1b[0m', 'writeln');
            writeToTerminal(`\x1b[90mConnected to ${message.shell} in ${message.cwd}\x1b[0m`, 'writeln');
            writeToTerminal('', 'writeln');
            sendResize();
          } else if (message.type === 'output') {
            writeToTerminal(message.data);
          } else if (message.type === 'exit') {
            writeToTerminal('', 'writeln');
            writeToTerminal(`\x1b[31mShell exited (${message.exitCode ?? 'unknown'})\x1b[0m`, 'writeln');
            safeSetState(setConnectionState, 'closed');
          } else if (message.type === 'error') {
            writeToTerminal(`\x1b[31m${message.message}\x1b[0m`, 'writeln');
          }
        } catch {
          writeToTerminal('\x1b[31mReceived malformed terminal payload.\x1b[0m', 'writeln');
        }
      };

      socket.onclose = () => {
        if (socketRef.current !== socket) return;
        socketRef.current = null;
        safeSetState(setConnectionState, 'closed');
      };

      socket.onerror = () => {
        if (socketRef.current !== socket) return;
        safeSetState(setConnectionState, 'closed');
        writeToTerminal('\x1b[31mUnable to connect to terminal backend.\x1b[0m', 'writeln');
      };
    };

    connectRef.current = connect;

    const handlePointerDown = () => {
      try {
        term.focus();
      } catch {}
    };

    containerRef.current.addEventListener('mousedown', handlePointerDown);

    const dataDisposable = term.onData((data) => {
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'input', data }));
      }
    });

    requestAnimationFrame(() => {
      sendResize();
      connect();
    });

    const resizeObserver = new ResizeObserver(() => {
      sendResize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      disposedRef.current = true;
      connectRef.current = () => {};
      dataDisposable.dispose();
      resizeObserver.disconnect();
      containerRef.current?.removeEventListener('mousedown', handlePointerDown);
      closeSocket({ kill: true });
      socketRef.current = null;
      fitRef.current = null;
      termRef.current = null;
      term.dispose();
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || files.length === 0) return;

    const syncKey = JSON.stringify(files.map((file) => [file.name, file.content]));
    if (syncKeyRef.current === syncKey) return;
    syncKeyRef.current = syncKey;

    let cancelled = false;

    const syncWorkspace = async () => {
      setSyncState('syncing');
      try {
        const response = await fetch('/api/workspaces/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId, files }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to sync workspace for terminal.');
        if (!cancelled) {
          setSyncState('ready');
        }
      } catch (error) {
        if (!cancelled) {
          setSyncState('error');
          setAuthError(error.message || 'Unable to sync workspace for terminal.');
        }
      }
    };

    syncWorkspace();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, files]);

  const reconnect = () => {
    if (disposedRef.current) return;
    setSessionInfo(null);
    setConnectionState('connecting');
    setAuthError('');
    setAuthRequired(false);
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
      try {
        socket.close();
      } catch {}
    }
    connectRef.current({ resetTerminal: true });
  };

  const submitAccessKey = (event) => {
    event.preventDefault();
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setAuthError('Terminal connection is not ready yet.');
      return;
    }
    sessionStorage.setItem('terminal_access_key', accessKey);
    setAuthError('');
    socket.send(JSON.stringify({ type: 'auth', key: accessKey }));
  };

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex gap-1.5 shrink-0">
            <div className="w-3 h-3 rounded-full bg-red-500/70" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <div className="w-3 h-3 rounded-full bg-green-500/70" />
          </div>
          <span className="text-xs text-muted font-mono ml-2">Terminal</span>
          <span className="text-xs bg-white/5 text-muted/70 rounded px-1.5 py-0.5 font-mono">
            {sessionInfo?.shell || 'shell'}
          </span>
          <span
            className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${
              connectionState === 'open' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-muted'
            }`}
          >
            {statusLabel}
          </span>
          {sessionInfo?.cwd && (
            <span className="text-[11px] text-muted/70 font-mono truncate max-w-64">
              {sessionInfo.cwd}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={reconnect}
            className="p-1.5 rounded text-muted hover:text-white transition-colors"
            title="Reconnect"
          >
            <RefreshCw size={12} />
          </button>
          <button
            onClick={onToggleMaximize}
            className="p-1.5 rounded text-muted hover:text-white transition-colors"
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded text-muted hover:text-white transition-colors"
              title="Close"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {connectionState !== 'open' && (
        <div className="px-3 py-2 border-b border-border/70 text-xs text-muted flex items-center gap-2">
          <Terminal size={12} />
          {authRequired
            ? 'Terminal access key required for this deployment.'
            : syncState === 'syncing'
            ? 'Syncing current project files into the local workspace...'
            : connectionState === 'connecting'
            ? 'Connecting to local shell backend...'
            : 'Terminal backend disconnected. Use reconnect after the server is running again.'}
        </div>
      )}

      {authRequired && (
        <form
          onSubmit={submitAccessKey}
          className="px-3 py-3 border-b border-border/70 bg-[#0f0f0f] flex items-center gap-2"
        >
          <input
            type="password"
            value={accessKey}
            onChange={(event) => setAccessKey(event.target.value)}
            placeholder="Enter terminal access key"
            className="flex-1 min-w-0 bg-black/30 border border-border rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-white"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded bg-white text-black text-xs font-medium hover:bg-white/90 transition-colors"
          >
            Unlock
          </button>
          {authError && (
            <div className="text-xs text-red-300 shrink-0">{authError}</div>
          )}
        </form>
      )}

      <div
        ref={containerRef}
        className="flex-1 overflow-hidden"
        tabIndex={0}
        style={{ padding: '4px 8px' }}
      />
    </div>
  );
}
