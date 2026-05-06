/* eslint-env node */
import express from 'express';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = createServer(app);
app.disable('x-powered-by');

const port = Number(process.env.PORT || 3000);
const host = '0.0.0.0';
const terminalRequested = process.env.TERMINAL_ENABLED !== 'false';
const terminalAccessKey = process.env.TERMINAL_ACCESS_KEY || '';
const terminalEnabled = terminalRequested && (process.env.NODE_ENV !== 'production' || Boolean(terminalAccessKey));
function resolveShell() {
  if (process.env.TERMINAL_SHELL) return process.env.TERMINAL_SHELL;
  if (process.platform === 'win32') return 'powershell.exe';

  const candidates = ['/bin/bash', '/usr/bin/bash', process.env.SHELL, '/bin/zsh', '/bin/sh']
    .filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.includes('/') && fs.existsSync(candidate)) return candidate;
    if (!candidate.includes('/')) return candidate;
  }

  return 'sh';
}

const shell = resolveShell();
const distDir = path.join(__dirname, 'dist');
const workspaceRoot = process.env.TERMINAL_WORKDIR || process.cwd();

const sessions = new Map();

function createShellSession() {
  const id = randomUUID();
  const shellProcess = spawn(shell, ['-i'], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    },
    stdio: 'pipe',
  });

  const session = {
    id,
    shellProcess,
    clients: new Set(),
  };

  const broadcast = (payload) => {
    const serialized = JSON.stringify(payload);
    session.clients.forEach((client) => {
      if (client.readyState === client.OPEN) client.send(serialized);
    });
  };

  shellProcess.stdout.on('data', (chunk) => {
    broadcast({ type: 'output', data: chunk.toString() });
  });

  shellProcess.stderr.on('data', (chunk) => {
    broadcast({ type: 'output', data: chunk.toString() });
  });

  shellProcess.on('error', (error) => {
    broadcast({ type: 'error', message: error.message });
  });

  shellProcess.on('close', (exitCode, signal) => {
    broadcast({ type: 'exit', exitCode, signal });
    sessions.delete(id);
  });

  sessions.set(id, session);
  return session;
}

function killShellSession(session) {
  if (!session) return;
  if (!session.shellProcess.killed) {
    session.shellProcess.kill();
  }
  sessions.delete(session.id);
}

const wss = new WebSocketServer({ server, path: '/terminal' });

wss.on('connection', (socket) => {
  if (!terminalEnabled) {
    socket.send(JSON.stringify({
      type: 'error',
      message: terminalRequested
        ? 'Terminal access requires TERMINAL_ACCESS_KEY in production.'
        : 'Terminal access is disabled on this deployment.',
    }));
    socket.close();
    return;
  }
  let session = null;

  const openSession = () => {
    session = createShellSession();
    session.clients.add(socket);
    socket.send(JSON.stringify({
      type: 'ready',
      sessionId: session.id,
      shell,
      cwd: workspaceRoot,
      platform: os.platform(),
    }));
  };

  if (terminalAccessKey) {
    socket.send(JSON.stringify({ type: 'auth-required' }));
  } else {
    openSession();
  }

  socket.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.type === 'auth') {
        if (!terminalAccessKey) {
          socket.send(JSON.stringify({ type: 'error', message: 'Terminal auth is not enabled.' }));
          return;
        }
        if (message.key !== terminalAccessKey) {
          socket.send(JSON.stringify({ type: 'auth-failed', message: 'Incorrect terminal access key.' }));
          return;
        }
        if (!session) {
          openSession();
        }
        return;
      }

      if (!session) {
        socket.send(JSON.stringify({ type: 'error', message: 'Authenticate before using the terminal.' }));
        return;
      }

      if (message.type === 'input' && typeof message.data === 'string') {
        session.shellProcess.stdin.write(message.data);
      } else if (message.type === 'resize') {
        // Plain child processes do not support PTY resizing.
      } else if (message.type === 'kill') {
        killShellSession(session);
      }
    } catch {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid terminal message.' }));
    }
  });

  socket.on('close', () => {
    if (!session) return;
    session.clients.delete(socket);
    if (session.clients.size === 0) {
      killShellSession(session);
    }
  });
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    shell,
    terminalEnabled,
    terminalRequiresAuth: Boolean(terminalAccessKey),
    workspaceRoot,
    built: fs.existsSync(path.join(distDir, 'index.html')),
  });
});

app.use(express.static(distDir));

app.get(/.*/, (_req, res) => {
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    res.status(503).send('Build output not found. Run "npm run build" before starting the server.');
    return;
  }
  res.sendFile(path.join(distDir, 'index.html'));
});

server.listen(port, host, () => {
  console.log(`WebIDE server listening on http://${host}:${port}`);
});

const shutdown = () => {
  wss.clients.forEach((client) => client.close());
  sessions.forEach((session) => killShellSession(session));
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
