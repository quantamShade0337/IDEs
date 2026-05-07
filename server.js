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
app.use(express.json({ limit: '512kb' }));

const port = Number(process.env.PORT || 3000);
const host = '0.0.0.0';
const terminalRequested = process.env.TERMINAL_ENABLED !== 'false';
const terminalAccessKey = process.env.TERMINAL_ACCESS_KEY || '';
const terminalEnabled = terminalRequested && (process.env.NODE_ENV !== 'production' || Boolean(terminalAccessKey));
const terminalMode = 'interactive';
const distDir = path.join(__dirname, 'dist');
const workspaceRoot = path.resolve(process.env.TERMINAL_WORKDIR || process.cwd());
const sessions = new Map();

function resolveShell() {
  if (process.env.TERMINAL_SHELL) return process.env.TERMINAL_SHELL;
  if (process.platform === 'win32') return 'powershell.exe';

  const candidates = [
    '/bin/bash',
    '/usr/bin/bash',
    '/bin/zsh',
    process.env.SHELL,
    '/bin/sh',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!candidate.includes('/')) return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }

  return 'sh';
}

const shell = resolveShell();

function resolveTerminalCommand() {
  if (process.platform === 'win32') {
    return { command: shell, args: [] };
  }

  return { command: shell, args: ['-i'] };
}

const terminalCommand = resolveTerminalCommand();

function broadcast(session, payload) {
  const serialized = JSON.stringify(payload);
  session.clients.forEach((client) => {
    if (client.readyState === client.OPEN) client.send(serialized);
  });
}

function createShellSession() {
  const shellProcess = spawn(terminalCommand.command, terminalCommand.args, {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    },
    stdio: 'pipe',
  });

  const session = {
    id: randomUUID(),
    cwd: workspaceRoot,
    shellProcess,
    clients: new Set(),
    closed: false,
  };

  shellProcess.stdout.on('data', (chunk) => {
    broadcast(session, { type: 'output', data: chunk.toString() });
  });

  shellProcess.stderr.on('data', (chunk) => {
    broadcast(session, { type: 'output', data: chunk.toString() });
  });

  shellProcess.stdin.on('error', (error) => {
    if (error.code !== 'EPIPE') {
      broadcast(session, { type: 'error', message: error.message });
    }
  });

  shellProcess.on('error', (error) => {
    broadcast(session, { type: 'error', message: error.message });
  });

  shellProcess.on('close', (exitCode, signal) => {
    session.closed = true;
    broadcast(session, { type: 'exit', exitCode, signal });
    sessions.delete(session.id);
  });

  sessions.set(session.id, session);
  return session;
}

function closeSession(session) {
  if (!session) return;
  if (!session.closed) {
    try {
      session.shellProcess.kill();
    } catch {
      // ignore cleanup errors
    }
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
      mode: terminalMode,
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
        if (!session.shellProcess.stdin.destroyed && session.shellProcess.stdin.writable) {
          session.shellProcess.stdin.write(message.data);
        } else {
          socket.send(JSON.stringify({ type: 'error', message: 'Terminal input channel is closed.' }));
        }
      } else if (message.type === 'resize') {
        // `script`/plain child-process fallback does not expose resize hooks.
      } else if (message.type === 'kill') {
        closeSession(session);
        broadcast(session, { type: 'exit', exitCode: 0, signal: 'SIGTERM' });
      }
    } catch {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid terminal message.' }));
    }
  });

  socket.on('close', () => {
    if (!session) return;
    session.clients.delete(socket);
    if (session.clients.size === 0) {
      closeSession(session);
    }
  });
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    terminalEnabled,
    terminalRequiresAuth: Boolean(terminalAccessKey),
    terminalMode,
    shell,
    terminalCommand: path.basename(terminalCommand.command),
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
  sessions.forEach((session) => closeSession(session));
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
