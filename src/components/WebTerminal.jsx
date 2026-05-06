import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Maximize2, Minimize2, RefreshCw, Terminal } from 'lucide-react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

function getTerminalUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/terminal`;
}

export default function WebTerminal({ onClose, isMaximized, onToggleMaximize }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const socketRef = useRef(null);
  const [connectionState, setConnectionState] = useState('connecting');
  const [sessionInfo, setSessionInfo] = useState(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [accessKey, setAccessKey] = useState(() => sessionStorage.getItem('terminal_access_key') || '');
  const [authError, setAuthError] = useState('');

  const statusLabel = useMemo(() => {
    if (connectionState === 'open') return 'live';
    if (connectionState === 'connecting') return 'connecting';
    return 'offline';
  }, [connectionState]);

  useEffect(() => {
    if (!containerRef.current) return undefined;

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
    fitRef.current = fitAddon;
    termRef.current = term;

    const sendResize = () => {
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

    const connect = () => {
      setConnectionState('connecting');
      const socket = new WebSocket(getTerminalUrl());
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        setConnectionState('open');
        sendResize();
      });

      socket.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'auth-required') {
            setAuthRequired(true);
            setConnectionState('connecting');
          } else if (message.type === 'auth-failed') {
            setAuthError(message.message || 'Terminal authentication failed.');
            setAuthRequired(true);
          } else if (message.type === 'ready') {
            setSessionInfo(message);
            setAuthRequired(false);
            setAuthError('');
            term.writeln('\x1b[1m\x1b[32mWebIDE Terminal\x1b[0m');
            term.writeln(`\x1b[90mConnected to ${message.shell} in ${message.cwd}\x1b[0m`);
            term.writeln('');
            sendResize();
          } else if (message.type === 'output') {
            term.write(message.data);
          } else if (message.type === 'exit') {
            term.writeln('');
            term.writeln(`\x1b[31mShell exited (${message.exitCode ?? 'unknown'})\x1b[0m`);
            setConnectionState('closed');
          } else if (message.type === 'error') {
            term.writeln(`\x1b[31m${message.message}\x1b[0m`);
          }
        } catch {
          term.writeln('\x1b[31mReceived malformed terminal payload.\x1b[0m');
        }
      });

      socket.addEventListener('close', () => {
        setConnectionState('closed');
      });

      socket.addEventListener('error', () => {
        setConnectionState('closed');
        term.writeln('\x1b[31mUnable to connect to terminal backend.\x1b[0m');
      });
    };

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
      dataDisposable.dispose();
      resizeObserver.disconnect();
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'kill' }));
        socket.close();
      }
      term.dispose();
    };
  }, []);

  const reconnect = () => {
    const term = termRef.current;
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) return;
    term?.clear();
    setSessionInfo(null);
    setConnectionState('connecting');
    setAuthError('');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const nextSocket = new WebSocket(`${protocol}//${window.location.host}/terminal`);
    socketRef.current = nextSocket;

    nextSocket.addEventListener('open', () => {
      setConnectionState('open');
      if (fitRef.current && term) {
        fitRef.current.fit();
        nextSocket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    });

    nextSocket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'auth-required') {
          setAuthRequired(true);
        } else if (message.type === 'auth-failed') {
          setAuthError(message.message || 'Terminal authentication failed.');
          setAuthRequired(true);
        } else if (message.type === 'ready') {
          setSessionInfo(message);
          setAuthRequired(false);
          setAuthError('');
          term?.writeln('\x1b[1m\x1b[32mWebIDE Terminal\x1b[0m');
          term?.writeln(`\x1b[90mConnected to ${message.shell} in ${message.cwd}\x1b[0m`);
          term?.writeln('');
        } else if (message.type === 'output') {
          term?.write(message.data);
        } else if (message.type === 'exit') {
          term?.writeln(`\r\n\x1b[31mShell exited (${message.exitCode ?? 'unknown'})\x1b[0m`);
          setConnectionState('closed');
        } else if (message.type === 'error') {
          term?.writeln(`\r\n\x1b[31m${message.message}\x1b[0m`);
        }
      } catch {
        term?.writeln('\r\n\x1b[31mReceived malformed terminal payload.\x1b[0m');
      }
    });

    nextSocket.addEventListener('close', () => {
      setConnectionState('closed');
    });

    nextSocket.addEventListener('error', () => {
      setConnectionState('closed');
      term?.writeln('\r\n\x1b[31mUnable to reconnect to terminal backend.\x1b[0m');
    });
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
        style={{ padding: '4px 8px' }}
      />
    </div>
  );
}
