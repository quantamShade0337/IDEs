/* eslint-env node */
import express from 'express';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
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
const terminalMode = 'restricted';
const distDir = path.join(__dirname, 'dist');
const workspaceRoot = path.resolve(process.env.TERMINAL_WORKDIR || process.cwd());
const sessions = new Map();

const FORBIDDEN_TOKENS = ['&&', '||', ';', '|', '>', '<', '$(', '`'];
const ALLOWED_COMMANDS = new Set([
  'help',
  'pwd',
  'ls',
  'cd',
  'cat',
  'head',
  'tail',
  'wc',
  'grep',
  'find',
  'echo',
  'clear',
  'date',
  'whoami',
  'uname',
  'exit',
]);

function relativeCwd(cwd) {
  const relative = path.relative(workspaceRoot, cwd);
  return relative ? `/${relative}` : '/';
}

function promptFor(session) {
  return `\x1b[32mwebide\x1b[0m:\x1b[34m${relativeCwd(session.cwd)}\x1b[0m$ `;
}

function broadcast(session, payload) {
  const serialized = JSON.stringify(payload);
  session.clients.forEach((client) => {
    if (client.readyState === client.OPEN) client.send(serialized);
  });
}

function writeOutput(session, data) {
  broadcast(session, { type: 'output', data });
}

function closeSession(session) {
  if (!session) return;
  sessions.delete(session.id);
}

function createRestrictedSession() {
  const session = {
    id: randomUUID(),
    cwd: workspaceRoot,
    inputBuffer: '',
    clients: new Set(),
    closed: false,
  };
  sessions.set(session.id, session);
  return session;
}

function isPathWithinRoot(targetPath) {
  const relative = path.relative(workspaceRoot, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function resolvePath(session, inputPath = '.') {
  const candidate = inputPath.startsWith('/')
    ? path.resolve(workspaceRoot, `.${inputPath}`)
    : path.resolve(session.cwd, inputPath);

  if (!isPathWithinRoot(candidate)) {
    throw new Error('Access outside the workspace is blocked.');
  }

  try {
    const real = await fsp.realpath(candidate);
    if (!isPathWithinRoot(real)) {
      throw new Error('Symlink escape outside the workspace is blocked.');
    }
    return real;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return candidate;
    }
    throw error;
  }
}

function tokenize(line) {
  return line.match(/"[^"]*"|'[^']*'|\S+/g) || [];
}

function cleanToken(token = '') {
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith('\'') && token.endsWith('\''))
  ) {
    return token.slice(1, -1);
  }
  return token;
}

function validateLine(line) {
  for (const token of FORBIDDEN_TOKENS) {
    if (line.includes(token)) {
      throw new Error('Shell operators, pipes, redirects, and command substitution are disabled.');
    }
  }

  const trimmed = line.trim();
  if (!trimmed) return;

  const [command] = tokenize(trimmed).map(cleanToken);
  if (!ALLOWED_COMMANDS.has(command)) {
    throw new Error(`'${command}' is not allowed in restricted terminal mode.`);
  }
}

async function listDirectory(targetDir, { long = false, all = false } = {}) {
  const dirents = await fsp.readdir(targetDir, { withFileTypes: true });
  let names = dirents
    .filter((dirent) => all || !dirent.name.startsWith('.'))
    .map((dirent) => dirent.name)
    .sort((a, b) => a.localeCompare(b));

  if (!long) {
    return names.map((name) => {
      const dirent = dirents.find((entry) => entry.name === name);
      return dirent?.isDirectory() ? `\x1b[34m${name}\x1b[0m` : name;
    }).join('  ');
  }

  const lines = await Promise.all(names.map(async (name) => {
    const fullPath = path.join(targetDir, name);
    const stat = await fsp.stat(fullPath);
    const isDir = stat.isDirectory();
    const perms = isDir ? 'dr-xr-xr-x' : '-r--r--r--';
    const size = String(stat.size).padStart(8);
    const displayName = isDir ? `\x1b[34m${name}\x1b[0m` : name;
    return `${perms} 1 webide webide ${size} ${displayName}`;
  }));

  return lines.join('\n');
}

async function readTextFile(targetPath) {
  const stat = await fsp.stat(targetPath);
  if (stat.isDirectory()) {
    throw new Error('Target is a directory.');
  }
  return fsp.readFile(targetPath, 'utf8');
}

function limitedLines(text, count, fromTail = false) {
  const lines = text.split('\n');
  return fromTail ? lines.slice(-count).join('\n') : lines.slice(0, count).join('\n');
}

function grepText(text, pattern, fileLabel) {
  const regex = new RegExp(pattern, 'i');
  const matches = [];
  text.split('\n').forEach((line, index) => {
    if (regex.test(line)) {
      matches.push(`\x1b[35m${fileLabel}:${index + 1}\x1b[0m ${line}`);
    }
  });
  return matches.join('\n');
}

async function walkFiles(root, maxResults = 200) {
  const results = [];
  const queue = [root];

  while (queue.length > 0 && results.length < maxResults) {
    const current = queue.shift();
    const dirents = await fsp.readdir(current, { withFileTypes: true });

    for (const dirent of dirents) {
      const fullPath = path.join(current, dirent.name);
      results.push(fullPath);
      if (results.length >= maxResults) break;
      if (dirent.isDirectory() && !dirent.name.startsWith('.') && dirent.name !== 'node_modules') {
        queue.push(fullPath);
      }
    }
  }

  return results;
}

async function executeCommand(session, rawLine) {
  const line = rawLine.trim();
  if (!line) return '';

  validateLine(line);

  const tokens = tokenize(line).map(cleanToken);
  const command = tokens[0];
  const args = tokens.slice(1);

  switch (command) {
    case 'help':
      return [
        '\x1b[1mRestricted terminal mode\x1b[0m',
        'Allowed commands: help, pwd, ls, cd, cat, head, tail, wc, grep, find, echo, clear, date, whoami, uname, exit',
        'Blocked: script execution, package installs, process control, writes, pipes, redirects, subshells',
      ].join('\n');

    case 'pwd':
      return session.cwd;

    case 'ls': {
      let long = false;
      let all = false;
      const targets = [];
      for (const arg of args) {
        if (arg.startsWith('-')) {
          long = long || arg.includes('l');
          all = all || arg.includes('a');
        } else {
          targets.push(arg);
        }
      }

      const targetDir = await resolvePath(session, targets[0] || '.');
      const stat = await fsp.stat(targetDir);
      if (!stat.isDirectory()) {
        return path.basename(targetDir);
      }
      return listDirectory(targetDir, { long, all });
    }

    case 'cd': {
      const nextDir = await resolvePath(session, args[0] || '/');
      const stat = await fsp.stat(nextDir);
      if (!stat.isDirectory()) {
        throw new Error('Target is not a directory.');
      }
      session.cwd = nextDir;
      return '';
    }

    case 'cat': {
      if (!args[0]) throw new Error('Usage: cat <file>');
      const targetPath = await resolvePath(session, args[0]);
      return readTextFile(targetPath);
    }

    case 'head': {
      if (!args[0]) throw new Error('Usage: head <file>');
      const targetPath = await resolvePath(session, args[0]);
      const count = Number(args[2] || args[1]) || 10;
      const text = await readTextFile(targetPath);
      return limitedLines(text, Math.min(count, 200), false);
    }

    case 'tail': {
      if (!args[0]) throw new Error('Usage: tail <file>');
      const targetPath = await resolvePath(session, args[0]);
      const count = Number(args[2] || args[1]) || 10;
      const text = await readTextFile(targetPath);
      return limitedLines(text, Math.min(count, 200), true);
    }

    case 'wc': {
      if (!args[0]) throw new Error('Usage: wc <file>');
      const targetPath = await resolvePath(session, args[0]);
      const text = await readTextFile(targetPath);
      const lines = text.split('\n').length;
      const words = text.split(/\s+/).filter(Boolean).length;
      const chars = text.length;
      return ` ${String(lines).padStart(6)} ${String(words).padStart(6)} ${String(chars).padStart(6)} ${args[0]}`;
    }

    case 'grep': {
      if (args.length < 2) throw new Error('Usage: grep <pattern> <file>');
      const [pattern, fileArg] = args;
      const targetPath = await resolvePath(session, fileArg);
      const text = await readTextFile(targetPath);
      return grepText(text, pattern, fileArg) || 'No matches';
    }

    case 'find': {
      const searchRoot = await resolvePath(session, args[0] || '.');
      const nameIndex = args.indexOf('-name');
      const pattern = nameIndex >= 0 ? args[nameIndex + 1] : null;
      const allPaths = await walkFiles(searchRoot);
      const filtered = allPaths
        .filter((fullPath) => {
          if (!pattern) return true;
          const name = path.basename(fullPath);
          const normalized = pattern.replace(/\*/g, '');
          return normalized ? name.includes(normalized) : true;
        })
        .map((fullPath) => path.relative(session.cwd, fullPath) || '.');
      return filtered.slice(0, 200).join('\n');
    }

    case 'echo':
      return args.join(' ');

    case 'clear':
      return '\x1bc';

    case 'date':
      return new Date().toString();

    case 'whoami':
      return 'webide';

    case 'uname':
      return args.includes('-a') ? `WebIDE restricted ${os.platform()} ${os.release()}` : 'WebIDE restricted';

    case 'exit':
      session.closed = true;
      return 'Session closed.';

    default:
      throw new Error(`'${command}' is not allowed in restricted terminal mode.`);
  }
}

async function handleInput(session, data) {
  for (const char of data) {
    if (char === '\u0003') {
      session.inputBuffer = '';
      writeOutput(session, '^C\r\n');
      writeOutput(session, promptFor(session));
      continue;
    }

    if (char === '\u000c') {
      writeOutput(session, '\x1bc');
      writeOutput(session, promptFor(session));
      continue;
    }

    if (char === '\r' || char === '\n') {
      writeOutput(session, '\r\n');
      const line = session.inputBuffer;
      session.inputBuffer = '';
      try {
        const result = await executeCommand(session, line);
        if (result) {
          writeOutput(session, result.endsWith('\n') ? result : `${result}\r\n`);
        }
      } catch (error) {
        writeOutput(session, `\x1b[31m${error.message}\x1b[0m\r\n`);
      }

      if (session.closed) {
        writeOutput(session, '\x1b[90mTerminal session ended.\x1b[0m\r\n');
        broadcast(session, { type: 'exit', exitCode: 0, signal: null });
        closeSession(session);
        return;
      }

      writeOutput(session, promptFor(session));
      continue;
    }

    if (char === '\u007f') {
      if (session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        writeOutput(session, '\b \b');
      }
      continue;
    }

    if (char === '\t') {
      writeOutput(session, '\u0007');
      continue;
    }

    if (char === '\u001b') {
      continue;
    }

    if (char >= ' ' && char !== '\u007f') {
      session.inputBuffer += char;
      writeOutput(session, char);
    }
  }
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
    session = createRestrictedSession();
    session.clients.add(socket);
    socket.send(JSON.stringify({
      type: 'ready',
      sessionId: session.id,
      shell: 'restricted-terminal',
      cwd: workspaceRoot,
      platform: os.platform(),
      mode: terminalMode,
    }));
    writeOutput(session, '\x1b[1m\x1b[32mWebIDE Restricted Terminal\x1b[0m\r\n');
    writeOutput(session, '\x1b[90mRead-only workspace access. Script execution and dangerous shell operators are blocked.\x1b[0m\r\n\r\n');
    writeOutput(session, promptFor(session));
  };

  if (terminalAccessKey) {
    socket.send(JSON.stringify({ type: 'auth-required' }));
  } else {
    openSession();
  }

  socket.on('message', async (raw) => {
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
        await handleInput(session, message.data);
      } else if (message.type === 'kill') {
        session.closed = true;
        broadcast(session, { type: 'exit', exitCode: 0, signal: null });
        closeSession(session);
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
