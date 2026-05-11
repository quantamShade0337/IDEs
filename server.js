/* eslint-env node */
import express from 'express';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import * as esbuild from 'esbuild';
import net from 'node:net';
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
const terminalMode = 'devtools';
const distDir = path.join(__dirname, 'dist');
const workspaceRoot = path.resolve(process.env.TERMINAL_WORKDIR || process.cwd());
const workspaceBaseDir = path.join(workspaceRoot, '.webide-workspaces');
const deploymentsBaseDir = path.join(workspaceRoot, '.webide-deployments');
const runtimePortBase = Number(process.env.WORKSPACE_RUNTIME_PORT_BASE || 4100);
const sessions = new Map();
const workspaceState = new Map();

const RESERVED_TOP_LEVEL_PATHS = new Set([
  'api', 'assets', 'auth', 'dashboard', 'editor', 'settings', 'legal',
  'favicon.svg', 'icons.svg',
]);

app.use(express.json({ limit: '5mb' }));

const ALLOWED_COMMANDS = new Set([
  'help', 'pwd', 'ls', 'cd', 'cat', 'head', 'tail', 'wc', 'grep', 'find', 'echo', 'clear',
  'date', 'whoami', 'uname', 'git', 'npm', 'npx', 'curl', 'exit',
]);

const SAFE_NPM_RUN_SCRIPTS = new Set([
  'dev', 'dev:client', 'dev:server', 'build', 'lint', 'preview', 'start',
]);

const SAFE_GIT_SUBCOMMANDS = new Set([
  'status', 'diff', 'add', 'commit', 'push', 'pull', 'branch', 'switch', 'log', 'fetch', 'remote',
]);

function broadcast(session, payload) {
  const serialized = JSON.stringify(payload);
  session.clients.forEach((client) => {
    if (client.readyState === client.OPEN) client.send(serialized);
  });
}

function writeOutput(session, data) {
  broadcast(session, { type: 'output', data });
}

function promptFor(session) {
  const relative = path.relative(workspaceRoot, session.cwd);
  const display = relative ? `/${relative}` : '/';
  return `\x1b[32mwebide\x1b[0m:\x1b[34m${display}\x1b[0m$ `;
}

function createSession(initialCwd = workspaceRoot) {
  const session = {
    id: randomUUID(),
    cwd: initialCwd,
    inputBuffer: '',
    clients: new Set(),
    activeProcess: null,
    closed: false,
  };
  sessions.set(session.id, session);
  return session;
}

function closeSession(session) {
  if (!session) return;
  if (session.activeProcess && !session.activeProcess.killed) {
    session.activeProcess.kill('SIGTERM');
  }
  sessions.delete(session.id);
}

function tokenize(line) {
  return line.match(/"[^"]*"|'[^']*'|\S+/g) || [];
}

function sanitizeWorkspaceId(value = '') {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

function getWorkspacePaths(workspaceId) {
  const safeId = sanitizeWorkspaceId(workspaceId);
  if (!safeId) throw new Error('Invalid workspace id.');
  const dir = path.join(workspaceBaseDir, safeId);
  return {
    id: safeId,
    dir,
    srcDir: path.join(dir, 'src'),
  };
}

function sanitizeDeploymentSlug(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function getDeploymentDir(slug) {
  const safeSlug = sanitizeDeploymentSlug(slug);
  if (!safeSlug) throw new Error('Deployment slug is required.');
  if (RESERVED_TOP_LEVEL_PATHS.has(safeSlug)) {
    throw new Error(`'${safeSlug}' is reserved by the IDE app.`);
  }

  const dir = path.join(deploymentsBaseDir, safeSlug);
  return {
    slug: safeSlug,
    dir,
    metadataPath: path.join(dir, '.deployment.json'),
  };
}

async function ensureCleanDirectory(targetDir) {
  await fsp.rm(targetDir, { recursive: true, force: true });
  await fsp.mkdir(targetDir, { recursive: true });
}

function isPathInsideDirectory(rootDir, targetPath) {
  const relative = path.relative(rootDir, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function injectBaseHref(html, slug) {
  if (!html.trim()) return html;
  if (/<base\s/i.test(html)) return html;

  const baseTag = `  <base href="/${slug}/" />`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, (match, attrs) => `${match}\n${baseTag}`);
  }

  return `<!doctype html>
<html lang="en">
<head>
${baseTag}
</head>
<body>
${html}
</body>
</html>`;
}

async function writeDeploymentMetadata(slug, metadata) {
  const { metadataPath } = getDeploymentDir(slug);
  await fsp.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
  return metadata;
}

async function readDeploymentMetadata(slug) {
  try {
    const { metadataPath } = getDeploymentDir(slug);
    const raw = await fsp.readFile(metadataPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function listDeploymentsForWorkspace(workspaceId) {
  try {
    const entries = await fsp.readdir(deploymentsBaseDir, { withFileTypes: true });
    const deployments = await Promise.all(entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => readDeploymentMetadata(entry.name)));

    return deployments
      .filter((deployment) => deployment?.workspaceId === workspaceId)
      .sort((a, b) => (b.deployedAt || 0) - (a.deployedAt || 0));
  } catch {
    return [];
  }
}

function createStaticDeploymentIndex(files, slug) {
  const htmlFile = files.find((file) => file.name === 'index.html');
  if (htmlFile?.content) {
    return injectBaseHref(htmlFile.content, slug);
  }

  const cssFile = files.find((file) => file.name === 'styles.css');
  const jsFile = files.find((file) => file.name === 'script.js');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <base href="/${slug}/" />
    <title>WebIDE Deployment</title>
    ${cssFile ? '<link rel="stylesheet" href="./styles.css" />' : ''}
  </head>
  <body>
    ${htmlFile?.content || '<main></main>'}
    ${jsFile ? '<script type="module" src="./script.js"></script>' : ''}
  </body>
</html>`;
}

async function deployStaticWorkspace({ workspaceId, slug, files, projectTitle }) {
  const { dir } = getDeploymentDir(slug);
  const safeFiles = files
    .filter((file) => typeof file?.name === 'string' && typeof file?.content === 'string')
    .map((file) => ({
      name: file.name.replace(/^\/+/, ''),
      content: file.content,
    }))
    .filter((file) => file.name && !file.name.includes('..'));

  await ensureCleanDirectory(dir);

  await Promise.all(safeFiles.map(async (file) => {
    const fullPath = path.join(dir, file.name);
    if (!isPathInsideDirectory(dir, fullPath)) {
      throw new Error('Deployment file path escaped the deployment root.');
    }
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    const content = file.name === 'index.html' ? injectBaseHref(file.content, slug) : file.content;
    await fsp.writeFile(fullPath, content, 'utf8');
  }));

  if (!safeFiles.some((file) => file.name === 'index.html')) {
    await fsp.writeFile(path.join(dir, 'index.html'), createStaticDeploymentIndex(safeFiles, slug), 'utf8');
  }

  const metadata = {
    slug,
    workspaceId,
    mode: 'static',
    projectTitle: projectTitle || 'Untitled Project',
    deployedAt: Date.now(),
    route: `/${slug}`,
  };
  await writeDeploymentMetadata(slug, metadata);
  return metadata;
}

async function buildCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}.`);
      error.stdout = stdout;
      error.stderr = stderr;
      error.exitCode = code;
      reject(error);
    });
  });
}

async function deployReactWorkspace({ workspaceId, slug, files, projectTitle }) {
  const { dir: deploymentDir } = getDeploymentDir(slug);
  const { dir: workspaceDir } = await ensureWorkspace(workspaceId);

  if (Array.isArray(files) && files.length > 0) {
    await syncWorkspaceFiles(workspaceId, files);
  }

  await ensureNodeModulesLink(workspaceDir);
  await buildCommand('npm', ['run', 'build', '--', '--base', `/${slug}/`], {
    cwd: workspaceDir,
    env: {
      ...process.env,
      CI: '1',
    },
  });

  const distPath = path.join(workspaceDir, 'dist');
  if (!fs.existsSync(distPath)) {
    throw new Error('React deployment build did not produce a dist directory.');
  }

  await ensureCleanDirectory(deploymentDir);
  await fsp.cp(distPath, deploymentDir, { recursive: true });

  const metadata = {
    slug,
    workspaceId,
    mode: 'react',
    projectTitle: projectTitle || 'Untitled Project',
    deployedAt: Date.now(),
    route: `/${slug}`,
  };
  await writeDeploymentMetadata(slug, metadata);
  return metadata;
}

async function deployWorkspace({ workspaceId, slug, files, projectTitle }) {
  const safeSlug = sanitizeDeploymentSlug(slug);
  if (!safeSlug) {
    throw new Error('Choose a deployment name with letters or numbers.');
  }

  const packageFile = Array.isArray(files)
    ? files.find((file) => file?.name === 'package.json')
    : null;
  let manifest = null;

  if (packageFile?.content) {
    try {
      manifest = JSON.parse(packageFile.content);
    } catch {
      manifest = null;
    }
  }

  const framework = detectWorkspaceFrameworkFromManifest(manifest);

  if (framework.kind === 'vite' || framework.kind === 'react') {
    return deployReactWorkspace({ workspaceId, slug: safeSlug, files, projectTitle });
  }

  if (framework.kind === 'next' || framework.kind === 'node' || framework.kind === 'package') {
    throw new Error('Path deployments currently support static HTML/CSS/JS projects and Vite-style React apps. Next.js and Node apps can run in the workspace runtime, but they are not yet published to /your-slug.');
  }

  return deployStaticWorkspace({ workspaceId, slug: safeSlug, files, projectTitle });
}

function getRuntimeDefaults(workspaceId) {
  return {
    workspaceId,
    status: 'stopped',
    port: null,
    startedAt: null,
    updatedAt: null,
    logs: [],
    pid: null,
    lastError: null,
    process: null,
  };
}

function getTaskDefaults() {
  return {
    active: null,
    history: [],
  };
}

function getWorkspaceRecord(workspaceId) {
  const safeId = sanitizeWorkspaceId(workspaceId);
  const existing = workspaceState.get(safeId);
  if (existing) return existing;
  const created = {
    revision: 0,
    lastBuildAt: 0,
    outputs: null,
    lastError: null,
    runtime: getRuntimeDefaults(safeId),
    tasks: getTaskDefaults(),
  };
  workspaceState.set(safeId, created);
  return created;
}

async function ensureNodeModulesLink(workspaceDir) {
  const localNodeModules = path.join(workspaceDir, 'node_modules');
  if (fs.existsSync(localNodeModules)) return;

  const rootNodeModules = path.join(workspaceRoot, 'node_modules');
  if (!fs.existsSync(rootNodeModules)) return;

  try {
    await fsp.symlink(rootNodeModules, localNodeModules, 'junction');
  } catch {
    /* best effort */
  }
}

async function readWorkspacePackageManifest(workspaceDir) {
  try {
    const raw = await fsp.readFile(path.join(workspaceDir, 'package.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function detectWorkspaceFrameworkFromManifest(manifest) {
  if (!manifest) return { kind: 'static', label: 'Static' };

  const deps = {
    ...(manifest.dependencies || {}),
    ...(manifest.devDependencies || {}),
  };

  if (deps.next) return { kind: 'next', label: 'Next.js' };
  if (deps.vite) return { kind: 'vite', label: 'Vite' };
  if (deps.react || deps['react-dom']) return { kind: 'react', label: 'React' };
  if (manifest.scripts?.dev || manifest.scripts?.start) return { kind: 'node', label: 'Node.js' };
  return { kind: 'package', label: 'Package app' };
}

function normalizeViteIndexHtml(content = '') {
  if (typeof content !== 'string' || !content) return content;

  return content
    .replace(
      /(<script\b[^>]*type=["']module["'][^>]*\bsrc=["'])\/src\//gi,
      '$1./src/'
    )
    .replace(
      /(<link\b[^>]*rel=["']stylesheet["'][^>]*\bhref=["'])\/src\//gi,
      '$1./src/'
    )
    .replace(
      /(<script\b[^>]*type=["']module["'][^>]*\bsrc=["'])\/@vite\/client/gi,
      '$1./@vite/client'
    );
}

function resolveRuntimeCommand(framework, manifest, workspaceId, runtimePort) {
  const scripts = manifest?.scripts || {};

  if (framework.kind === 'next') {
    return {
      command: 'npm',
      args: ['run', 'dev', '--', '--hostname', '0.0.0.0', '--port', String(runtimePort)],
      env: {
        PORT: String(runtimePort),
        HOST: '0.0.0.0',
        HOSTNAME: '0.0.0.0',
      },
    };
  }

  if (framework.kind === 'vite' || framework.kind === 'react') {
    return {
      command: 'npm',
      args: ['run', 'dev', '--', '--host', '0.0.0.0', '--port', String(runtimePort), '--base', `/api/workspaces/${workspaceId}/runtime/`],
      env: {
        PORT: String(runtimePort),
        HOST: '0.0.0.0',
      },
    };
  }

  if (scripts.dev) {
    return {
      command: 'npm',
      args: ['run', 'dev'],
      env: {
        PORT: String(runtimePort),
        HOST: '0.0.0.0',
        HOSTNAME: '0.0.0.0',
      },
    };
  }

  if (scripts.start) {
    return {
      command: 'npm',
      args: ['start'],
      env: {
        PORT: String(runtimePort),
        HOST: '0.0.0.0',
        HOSTNAME: '0.0.0.0',
      },
    };
  }

  throw new Error('This project does not define an npm dev or start script yet.');
}

async function ensureWorkspace(workspaceId) {
  const paths = getWorkspacePaths(workspaceId);
  await fsp.mkdir(paths.srcDir, { recursive: true });

  await ensureNodeModulesLink(paths.dir);

  getWorkspaceRecord(paths.id);

  return paths;
}

function markWorkspaceDirty(workspaceId) {
  const safeId = sanitizeWorkspaceId(workspaceId);
  const current = getWorkspaceRecord(safeId);
  workspaceState.set(safeId, {
    ...current,
    revision: current.revision + 1,
    outputs: null,
    lastError: null,
  });
  return workspaceState.get(safeId);
}

async function syncWorkspaceFiles(workspaceId, files = []) {
  const { id, dir } = await ensureWorkspace(workspaceId);
  const safeFiles = files
    .filter((file) => typeof file?.name === 'string' && typeof file?.content === 'string')
    .map((file) => ({
      name: file.name.replace(/^\/+/, ''),
      content: file.content,
    }))
    .filter((file) => file.name && !file.name.includes('..'));

  const incomingManifestFile = safeFiles.find((file) => file.name === 'package.json');
  let framework = { kind: 'static', label: 'Static' };
  if (incomingManifestFile) {
    try {
      framework = detectWorkspaceFrameworkFromManifest(JSON.parse(incomingManifestFile.content));
    } catch {
      framework = { kind: 'static', label: 'Static' };
    }
  } else {
    const currentManifest = await readWorkspacePackageManifest(dir);
    framework = detectWorkspaceFrameworkFromManifest(currentManifest);
  }

  await Promise.all(safeFiles.map(async (file) => {
    const fullPath = path.join(dir, file.name);
    if (!isPathWithinRoot(fullPath)) throw new Error('Workspace file path escaped the workspace root.');
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    const nextContent = framework.kind === 'vite' && file.name === 'index.html'
      ? normalizeViteIndexHtml(file.content)
      : file.content;
    await fsp.writeFile(fullPath, nextContent, 'utf8');
  }));

  return markWorkspaceDirty(id);
}

function buildErrorModule(error) {
  const safeMessage = JSON.stringify(error?.message || 'React build failed.');
  return `const root = document.getElementById('root');
if (root) {
  root.innerHTML = '';
  const pre = document.createElement('pre');
  pre.textContent = ${safeMessage};
  pre.style.whiteSpace = 'pre-wrap';
  pre.style.padding = '24px';
  pre.style.margin = '0';
  pre.style.minHeight = '100vh';
  pre.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
  pre.style.background = '#09090b';
  pre.style.color = '#fda4af';
  document.body.style.margin = '0';
  document.body.style.background = '#09090b';
  root.appendChild(pre);
}`;
}

async function buildWorkspaceOutputs(workspaceId) {
  const { id, dir } = await ensureWorkspace(workspaceId);
  const state = getWorkspaceRecord(id);
  if (state?.outputs) return state;

  try {
    const result = await esbuild.build({
      entryPoints: [path.join(dir, 'src', 'main.jsx')],
      absWorkingDir: dir,
      bundle: true,
      format: 'esm',
      platform: 'browser',
      write: false,
      sourcemap: 'inline',
      jsx: 'automatic',
      loader: {
        '.js': 'jsx',
        '.jsx': 'jsx',
        '.ts': 'ts',
        '.tsx': 'tsx',
        '.css': 'css',
      },
      define: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
      },
      outdir: 'out',
    });

    const outputs = {};
    result.outputFiles.forEach((file) => {
      outputs[path.basename(file.path)] = file.text;
    });

    const nextState = {
      ...state,
      revision: state?.revision || 0,
      lastBuildAt: Date.now(),
      outputs,
      lastError: null,
    };
    workspaceState.set(id, nextState);
    return nextState;
  } catch (error) {
    const nextState = {
      ...state,
      revision: state?.revision || 0,
      lastBuildAt: Date.now(),
      outputs: {
        'main.js': buildErrorModule(error),
        'main.css': '',
      },
      lastError: error?.message || String(error),
    };
    workspaceState.set(id, nextState);
    return nextState;
  }
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

function getRuntimeSnapshot(workspaceId) {
  const record = getWorkspaceRecord(workspaceId);
  const runtime = record.runtime || getRuntimeDefaults(workspaceId);
  return {
    workspaceId: sanitizeWorkspaceId(workspaceId),
    framework: runtime.framework || null,
    frameworkLabel: runtime.frameworkLabel || null,
    status: runtime.status,
    port: runtime.port,
    startedAt: runtime.startedAt,
    updatedAt: runtime.updatedAt,
    pid: runtime.pid,
    logs: runtime.logs.slice(-120),
    lastError: runtime.lastError,
    previewUrl: runtime.port ? `/api/workspaces/${sanitizeWorkspaceId(workspaceId)}/runtime/` : null,
  };
}

function getTasksSnapshot(workspaceId) {
  const record = getWorkspaceRecord(workspaceId);
  const tasks = record.tasks || getTaskDefaults();
  return {
    active: tasks.active,
    history: tasks.history.slice(-20),
  };
}

function appendRuntimeLog(workspaceId, chunk, stream = 'stdout') {
  const record = getWorkspaceRecord(workspaceId);
  const runtime = record.runtime || getRuntimeDefaults(workspaceId);
  const nextLogs = [...runtime.logs, {
    id: randomUUID(),
    stream,
    message: chunk,
    ts: Date.now(),
  }].slice(-200);
  record.runtime = {
    ...runtime,
    logs: nextLogs,
    updatedAt: Date.now(),
  };
  workspaceState.set(sanitizeWorkspaceId(workspaceId), record);
}

function setRuntimeState(workspaceId, patch) {
  const safeId = sanitizeWorkspaceId(workspaceId);
  const record = getWorkspaceRecord(safeId);
  const runtime = record.runtime || getRuntimeDefaults(safeId);
  const next = {
    ...runtime,
    ...patch,
    workspaceId: safeId,
    updatedAt: Date.now(),
  };
  record.runtime = next;
  workspaceState.set(safeId, record);
  return next;
}

function setTaskState(workspaceId, updater) {
  const safeId = sanitizeWorkspaceId(workspaceId);
  const record = getWorkspaceRecord(safeId);
  const tasks = record.tasks || getTaskDefaults();
  record.tasks = updater(tasks);
  workspaceState.set(safeId, record);
  return record.tasks;
}

async function isPortOpen(portToCheck) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: portToCheck }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

async function findAvailablePort() {
  for (let candidate = runtimePortBase; candidate < runtimePortBase + 100; candidate += 1) {
    // eslint-disable-next-line no-await-in-loop
    const open = await isPortOpen(candidate);
    if (!open) return candidate;
  }
  throw new Error('No available workspace runtime port.');
}

async function waitForPort(portToCheck, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    const open = await isPortOpen(portToCheck);
    if (open) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function startWorkspaceRuntime(workspaceId) {
  const { id, dir } = await ensureWorkspace(workspaceId);
  const runtime = getWorkspaceRecord(id).runtime || getRuntimeDefaults(id);

  if (runtime.status === 'running' || runtime.status === 'starting') {
    return getRuntimeSnapshot(id);
  }

  const portForRuntime = await findAvailablePort();
  const manifest = await readWorkspacePackageManifest(dir);
  const framework = detectWorkspaceFrameworkFromManifest(manifest);
  const runtimeCommand = resolveRuntimeCommand(framework, manifest, id, portForRuntime);
  setRuntimeState(id, {
    status: 'starting',
    port: portForRuntime,
    startedAt: runtime.startedAt || Date.now(),
    lastError: null,
    logs: [],
    framework: framework.kind,
    frameworkLabel: framework.label,
  });
  appendRuntimeLog(id, `Starting ${framework.label} runtime on port ${portForRuntime}\n`, 'system');

  const child = spawn(runtimeCommand.command, runtimeCommand.args, {
    cwd: dir,
    env: {
      ...process.env,
      ...runtimeCommand.env,
      BROWSER: 'none',
      CI: '1',
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    },
    stdio: 'pipe',
  });

  setRuntimeState(id, {
    process: child,
    pid: child.pid,
    port: portForRuntime,
  });

  child.stdout.on('data', (chunk) => {
    appendRuntimeLog(id, chunk.toString(), 'stdout');
  });

  child.stderr.on('data', (chunk) => {
    appendRuntimeLog(id, chunk.toString(), 'stderr');
  });

  child.on('error', (error) => {
    appendRuntimeLog(id, `${error.message}\n`, 'stderr');
    setRuntimeState(id, {
      status: 'error',
      process: null,
      pid: null,
      lastError: error.message,
    });
  });

  child.on('close', (code, signal) => {
    const current = getWorkspaceRecord(id).runtime || getRuntimeDefaults(id);
    const stoppedStatus = current.status === 'stopping' ? 'stopped' : (code === 0 ? 'stopped' : 'error');
    setRuntimeState(id, {
      status: stoppedStatus,
      process: null,
      pid: null,
      port: stoppedStatus === 'running' ? current.port : null,
      lastError: stoppedStatus === 'error' ? `Runtime exited (${signal || code || 0})` : null,
    });
    appendRuntimeLog(id, `Runtime exited (${signal || code || 0})\n`, 'system');
  });

  const ready = await waitForPort(portForRuntime);
  if (!ready) {
    setRuntimeState(id, {
      status: 'error',
      process: child,
      lastError: `Runtime did not become ready on port ${portForRuntime}.`,
    });
    appendRuntimeLog(id, `Runtime failed to become ready on port ${portForRuntime}\n`, 'stderr');
    return getRuntimeSnapshot(id);
  }

  setRuntimeState(id, {
    status: 'running',
    startedAt: Date.now(),
  });
  appendRuntimeLog(id, `Runtime ready at http://127.0.0.1:${portForRuntime}\n`, 'system');
  return getRuntimeSnapshot(id);
}

async function stopWorkspaceRuntime(workspaceId) {
  const safeId = sanitizeWorkspaceId(workspaceId);
  const runtime = getWorkspaceRecord(safeId).runtime || getRuntimeDefaults(safeId);
  if (!runtime.process || runtime.status === 'stopped') {
    setRuntimeState(safeId, { status: 'stopped', process: null, pid: null, port: null });
    return getRuntimeSnapshot(safeId);
  }

  setRuntimeState(safeId, { status: 'stopping' });
  appendRuntimeLog(safeId, 'Stopping workspace runtime\n', 'system');
  runtime.process.kill('SIGTERM');

  const started = Date.now();
  while (Date.now() - started < 5000) {
    const current = getWorkspaceRecord(safeId).runtime || getRuntimeDefaults(safeId);
    if (!current.process && current.status === 'stopped') {
      return getRuntimeSnapshot(safeId);
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  const current = getWorkspaceRecord(safeId).runtime || getRuntimeDefaults(safeId);
  if (current.process) {
    current.process.kill('SIGKILL');
  }
  setRuntimeState(safeId, { status: 'stopped', process: null, pid: null, port: null });
  return getRuntimeSnapshot(safeId);
}

async function restartWorkspaceRuntime(workspaceId) {
  await stopWorkspaceRuntime(workspaceId);
  return startWorkspaceRuntime(workspaceId);
}

const TASK_DEFINITIONS = {
  install: {
    label: 'Install dependencies',
    command: 'npm',
    args: ['install'],
  },
  build: {
    label: 'Build app',
    command: 'npm',
    args: ['run', 'build'],
  },
  lint: {
    label: 'Lint app',
    command: 'npm',
    args: ['run', 'lint'],
  },
};

async function runWorkspaceTask(workspaceId, taskKey) {
  const definition = TASK_DEFINITIONS[taskKey];
  if (!definition) throw new Error('Unknown task.');

  const { id, dir } = await ensureWorkspace(workspaceId);
  const currentTasks = getTasksSnapshot(id);
  if (currentTasks.active && currentTasks.active.status === 'running') {
    throw new Error(`Task already running: ${currentTasks.active.label}`);
  }

  const task = {
    id: randomUUID(),
    key: taskKey,
    label: definition.label,
    command: [definition.command, ...definition.args].join(' '),
    status: 'running',
    startedAt: Date.now(),
    completedAt: null,
    exitCode: null,
    logs: [],
  };

  setTaskState(id, (tasks) => ({
    ...tasks,
    active: task,
  }));

  const child = spawn(definition.command, definition.args, {
    cwd: dir,
    env: {
      ...process.env,
      CI: '1',
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    },
    stdio: 'pipe',
  });

  const appendTaskLog = (chunk, stream) => {
    setTaskState(id, (tasks) => {
      if (!tasks.active || tasks.active.id !== task.id) return tasks;
      return {
        ...tasks,
        active: {
          ...tasks.active,
          logs: [...tasks.active.logs, {
            id: randomUUID(),
            stream,
            message: chunk,
            ts: Date.now(),
          }].slice(-400),
        },
      };
    });
  };

  child.stdout.on('data', (chunk) => appendTaskLog(chunk.toString(), 'stdout'));
  child.stderr.on('data', (chunk) => appendTaskLog(chunk.toString(), 'stderr'));

  child.on('error', (error) => appendTaskLog(`${error.message}\n`, 'stderr'));

  child.on('close', (code) => {
    setTaskState(id, (tasks) => {
      const active = tasks.active?.id === task.id ? tasks.active : task;
      const finished = {
        ...active,
        status: code === 0 ? 'succeeded' : 'failed',
        completedAt: Date.now(),
        exitCode: code ?? 0,
      };
      return {
        active: null,
        history: [finished, ...tasks.history].slice(0, 20),
      };
    });
  });

  return getTasksSnapshot(id);
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
    if (error.code === 'ENOENT') return candidate;
    throw error;
  }
}

async function listDirectory(targetDir, { long = false, all = false } = {}) {
  const dirents = await fsp.readdir(targetDir, { withFileTypes: true });
  const names = dirents
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
    const perms = isDir ? 'drwxr-xr-x' : '-rw-r--r--';
    const size = String(stat.size).padStart(8);
    const displayName = isDir ? `\x1b[34m${name}\x1b[0m` : name;
    return `${perms} 1 webide webide ${size} ${displayName}`;
  }));

  return lines.join('\n');
}

async function readTextFile(targetPath) {
  const stat = await fsp.stat(targetPath);
  if (stat.isDirectory()) throw new Error('Target is a directory.');
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
    if (regex.test(line)) matches.push(`\x1b[35m${fileLabel}:${index + 1}\x1b[0m ${line}`);
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

function validateCommand(command, args) {
  if (!ALLOWED_COMMANDS.has(command)) {
    throw new Error(`'${command}' is not allowed. This terminal only supports local dev and GitHub workflows.`);
  }

  if (command === 'npm') {
    const [subcommand, ...rest] = args;
    if (subcommand === 'install') return;
    if (subcommand === 'run' && SAFE_NPM_RUN_SCRIPTS.has(rest[0])) return;
    throw new Error('Allowed npm usage: npm install, npm run dev/build/lint/preview/start.');
  }

  if (command === 'npx') {
    throw new Error('npx is disabled in this terminal. Use package scripts through npm run instead.');
  }

  if (command === 'git') {
    const [subcommand, ...rest] = args;
    if (!SAFE_GIT_SUBCOMMANDS.has(subcommand)) {
      throw new Error('Only safe git workflows are allowed here: status, diff, add, commit, push, pull, branch, switch, log, fetch, remote.');
    }
    if (subcommand === 'push' && rest.some((arg) => arg.includes('--force'))) {
      throw new Error('Force push is disabled in this terminal.');
    }
    return;
  }

  if (command === 'curl') {
    const target = args.find((arg) => /^https?:\/\//.test(arg));
    if (!target) throw new Error('curl requires an explicit URL.');
    const url = new URL(target);
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
      throw new Error('curl is limited to localhost addresses in this terminal.');
    }
  }
}

function spawnAllowedProcess(session, command, args) {
  const child = spawn(command, args, {
    cwd: session.cwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    },
    stdio: 'pipe',
  });

  session.activeProcess = child;

  child.stdout.on('data', (chunk) => {
    writeOutput(session, chunk.toString());
  });

  child.stderr.on('data', (chunk) => {
    writeOutput(session, chunk.toString());
  });

  child.stdin.on('error', () => {});

  child.on('error', (error) => {
    writeOutput(session, `\x1b[31m${error.message}\x1b[0m\r\n`);
  });

  child.on('close', (exitCode, signal) => {
    session.activeProcess = null;
    writeOutput(session, `\r\n\x1b[90mProcess exited${signal ? ` (${signal})` : ` (${exitCode ?? 0})`}.\x1b[0m\r\n`);
    if (!session.closed) {
      writeOutput(session, promptFor(session));
    }
  });
}

async function executeCommand(session, rawLine) {
  const line = rawLine.trim();
  if (!line) return '';

  const tokens = tokenize(line).map(cleanToken);
  const command = tokens[0];
  const args = tokens.slice(1);

  validateCommand(command, args);

  switch (command) {
    case 'help':
      return [
        '\x1b[1mDev-tool terminal mode\x1b[0m',
        'Allowed: pwd, ls, cd, cat, head, tail, wc, grep, find, echo, clear, date, whoami, uname',
        'Dev tools: npm install, npm run dev/build/lint/preview/start, git status/diff/add/commit/push/pull/branch/switch/log/fetch/remote',
        'Network: curl only to localhost/127.0.0.1',
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
      if (!stat.isDirectory()) return path.basename(targetDir);
      return listDirectory(targetDir, { long, all });
    }

    case 'cd': {
      const nextDir = await resolvePath(session, args[0] || '/');
      const stat = await fsp.stat(nextDir);
      if (!stat.isDirectory()) throw new Error('Target is not a directory.');
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
      return allPaths
        .filter((fullPath) => {
          if (!pattern) return true;
          const name = path.basename(fullPath);
          const normalized = pattern.replace(/\*/g, '');
          return normalized ? name.includes(normalized) : true;
        })
        .slice(0, 200)
        .map((fullPath) => path.relative(session.cwd, fullPath) || '.')
        .join('\n');
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
      return args.includes('-a') ? `WebIDE devtools ${os.platform()} ${os.release()}` : 'WebIDE devtools';

    case 'exit':
      session.closed = true;
      return 'Session closed.';

    case 'npm':
    case 'git':
    case 'curl':
      spawnAllowedProcess(session, command, args);
      return null;

    default:
      throw new Error(`'${command}' is not allowed.`);
  }
}

async function handleInput(session, data) {
  if (session.activeProcess) {
    if (data.includes('\u0003')) {
      session.activeProcess.kill('SIGINT');
      return;
    }
    if (!session.activeProcess.stdin.destroyed && session.activeProcess.stdin.writable) {
      session.activeProcess.stdin.write(data);
    }
    return;
  }

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
        broadcast(session, { type: 'exit', exitCode: 0, signal: null });
        closeSession(session);
        return;
      }

      if (!session.activeProcess) {
        writeOutput(session, promptFor(session));
      }
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

    if (char === '\u001b') continue;

    if (char >= ' ' && char !== '\u007f') {
      session.inputBuffer += char;
      writeOutput(session, char);
    }
  }
}

const wss = new WebSocketServer({ server, path: '/terminal' });

wss.on('connection', async (socket, request) => {
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
  const requestUrl = new URL(request.url || '/terminal', 'http://localhost');
  const requestedWorkspaceId = sanitizeWorkspaceId(requestUrl.searchParams.get('workspaceId') || '');
  let workspaceCwd = workspaceRoot;

  if (requestedWorkspaceId) {
    try {
      const workspace = await ensureWorkspace(requestedWorkspaceId);
      workspaceCwd = workspace.dir;
    } catch {
      workspaceCwd = workspaceRoot;
    }
  }

  const openSession = () => {
    session = createSession(workspaceCwd);
    session.clients.add(socket);
    socket.send(JSON.stringify({
      type: 'ready',
      sessionId: session.id,
      shell: 'devtools-terminal',
      cwd: workspaceCwd,
      platform: os.platform(),
      mode: terminalMode,
      workspaceId: requestedWorkspaceId || null,
    }));
    writeOutput(session, '\x1b[1m\x1b[32mWebIDE Dev Terminal\x1b[0m\r\n');
    writeOutput(session, '\x1b[90mThis shell is attached to the server workspace for the current project.\x1b[0m\r\n');
    writeOutput(session, '\x1b[90mAllowed: npm app scripts, safe git workflows, localhost curl, and read-only file navigation.\x1b[0m\r\n\r\n');
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
        if (!session) openSession();
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
        if (session.activeProcess) {
          session.activeProcess.kill('SIGTERM');
        }
        broadcast(session, { type: 'exit', exitCode: 0, signal: 'SIGTERM' });
        closeSession(session);
      }
    } catch {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid terminal message.' }));
    }
  });

  socket.on('close', () => {
    if (!session) return;
    session.clients.delete(socket);
    if (session.clients.size === 0) closeSession(session);
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

app.post('/api/workspaces/sync', async (req, res) => {
  try {
    const workspaceId = sanitizeWorkspaceId(req.body?.workspaceId);
    if (!workspaceId) {
      res.status(400).json({ error: 'workspaceId is required.' });
      return;
    }

    const state = await syncWorkspaceFiles(workspaceId, req.body?.files || []);
    res.json({
      ok: true,
      workspaceId,
      revision: state.revision,
      previewUrl: `/api/workspaces/${workspaceId}/preview?rev=${state.revision}`,
      cwd: path.join(workspaceBaseDir, workspaceId),
      runtime: getRuntimeSnapshot(workspaceId),
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to sync workspace.' });
  }
});

app.get('/api/workspaces/:workspaceId/runtime/status', async (req, res) => {
  try {
    const workspaceId = sanitizeWorkspaceId(req.params.workspaceId);
    await ensureWorkspace(workspaceId);
    res.json({
      ok: true,
      runtime: getRuntimeSnapshot(workspaceId),
      tasks: getTasksSnapshot(workspaceId),
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to read runtime status.' });
  }
});

app.get('/api/workspaces/:workspaceId/tasks', async (req, res) => {
  try {
    const workspaceId = sanitizeWorkspaceId(req.params.workspaceId);
    await ensureWorkspace(workspaceId);
    res.json({
      ok: true,
      tasks: getTasksSnapshot(workspaceId),
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to read workspace tasks.' });
  }
});

app.post('/api/workspaces/:workspaceId/tasks/run', async (req, res) => {
  try {
    const workspaceId = sanitizeWorkspaceId(req.params.workspaceId);
    const taskKey = String(req.body?.task || '');
    const tasks = await runWorkspaceTask(workspaceId, taskKey);
    res.json({ ok: true, tasks });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Unable to run workspace task.' });
  }
});

app.get('/api/workspaces/:workspaceId/deployments', async (req, res) => {
  try {
    const workspaceId = sanitizeWorkspaceId(req.params.workspaceId);
    const deployments = await listDeploymentsForWorkspace(workspaceId);
    res.json({ ok: true, deployments });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to read deployments.' });
  }
});

app.post('/api/workspaces/:workspaceId/deploy', async (req, res) => {
  try {
    const workspaceId = sanitizeWorkspaceId(req.params.workspaceId);
    const slug = sanitizeDeploymentSlug(req.body?.slug || '');
    const files = Array.isArray(req.body?.files) ? req.body.files : [];
    const projectTitle = String(req.body?.projectTitle || '');
    const deployment = await deployWorkspace({ workspaceId, slug, files, projectTitle });
    const deployments = await listDeploymentsForWorkspace(workspaceId);

    res.json({
      ok: true,
      deployment,
      deployments,
      url: `/${deployment.slug}`,
    });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Unable to deploy workspace.' });
  }
});

app.post('/api/workspaces/:workspaceId/runtime/start', async (req, res) => {
  try {
    const workspaceId = sanitizeWorkspaceId(req.params.workspaceId);
    const runtime = await startWorkspaceRuntime(workspaceId);
    res.json({ ok: true, runtime });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to start runtime.' });
  }
});

app.post('/api/workspaces/:workspaceId/runtime/stop', async (req, res) => {
  try {
    const workspaceId = sanitizeWorkspaceId(req.params.workspaceId);
    const runtime = await stopWorkspaceRuntime(workspaceId);
    res.json({ ok: true, runtime });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to stop runtime.' });
  }
});

app.post('/api/workspaces/:workspaceId/runtime/restart', async (req, res) => {
  try {
    const workspaceId = sanitizeWorkspaceId(req.params.workspaceId);
    const runtime = await restartWorkspaceRuntime(workspaceId);
    res.json({ ok: true, runtime });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to restart runtime.' });
  }
});

app.get('/api/workspaces/:workspaceId/preview', async (req, res) => {
  try {
    const workspaceId = sanitizeWorkspaceId(req.params.workspaceId);
    await ensureWorkspace(workspaceId);
    const state = workspaceState.get(workspaceId) || { revision: 0 };
    const rev = state.revision || 0;
    res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WebIDE React Preview</title>
    <link rel="stylesheet" href="/api/workspaces/${workspaceId}/main.css?rev=${rev}" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/api/workspaces/${workspaceId}/main.js?rev=${rev}"></script>
  </body>
</html>`);
  } catch (error) {
    res.status(500).send(error.message || 'Unable to load preview.');
  }
});

app.get('/api/workspaces/:workspaceId/main.js', async (req, res) => {
  try {
    const workspaceId = sanitizeWorkspaceId(req.params.workspaceId);
    const state = await buildWorkspaceOutputs(workspaceId);
    res.type('js').send(
      state.outputs['main.js']
      || state.outputs['bundle.js']
      || state.outputs['index.js']
      || buildErrorModule(new Error('No JavaScript output generated.'))
    );
  } catch (error) {
    res.status(500).type('js').send(buildErrorModule(error));
  }
});

app.get('/api/workspaces/:workspaceId/main.css', async (req, res) => {
  try {
    const workspaceId = sanitizeWorkspaceId(req.params.workspaceId);
    const state = await buildWorkspaceOutputs(workspaceId);
    res.type('css').send(
      state.outputs['main.css']
      || state.outputs['bundle.css']
      || state.outputs['index.css']
      || ''
    );
  } catch (error) {
    res.status(500).type('css').send(`/* ${error.message || 'Unable to build CSS.'} */`);
  }
});

app.use('/api/workspaces/:workspaceId/runtime', async (req, res, next) => {
  try {
    const workspaceId = sanitizeWorkspaceId(req.params.workspaceId);
    const runtime = getRuntimeSnapshot(workspaceId);
    if (!runtime.port || runtime.status !== 'running') {
      res.status(409).send('Workspace runtime is not running.');
      return;
    }

    const originalUrl = req.originalUrl;
    const prefix = `/api/workspaces/${workspaceId}/runtime`;
    const suffix = originalUrl.startsWith(prefix) ? originalUrl.slice(prefix.length) || '/' : '/';
    const targetPath = runtime.framework === 'vite' || runtime.framework === 'react'
      ? (originalUrl || `${prefix}/`)
      : suffix;
    const targetUrl = new URL(`http://127.0.0.1:${runtime.port}${targetPath}`);

    const forwardedHeaders = new Headers();
    Object.entries(req.headers).forEach(([key, value]) => {
      if (value == null) return;
      if (['host', 'connection', 'content-length'].includes(key.toLowerCase())) return;
      if (Array.isArray(value)) {
        forwardedHeaders.set(key, value.join(', '));
      } else {
        forwardedHeaders.set(key, value);
      }
    });

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: forwardedHeaders,
      redirect: 'manual',
    });

    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive'].includes(key.toLowerCase())) {
        return;
      }
      res.setHeader(key, value);
    });

    const body = Buffer.from(await response.arrayBuffer());
    res.send(body);
  } catch (error) {
    if (error?.message?.includes('fetch failed')) {
      res.status(502).send('Workspace runtime is unavailable.');
      return;
    }
    next(error);
  }
});

app.use(async (req, res, next) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    next();
    return;
  }

  const pathname = decodeURIComponent(new URL(req.originalUrl, 'http://localhost').pathname);
  const [slug, ...restParts] = pathname.replace(/^\/+/, '').split('/').filter(Boolean);

  if (!slug || RESERVED_TOP_LEVEL_PATHS.has(slug)) {
    next();
    return;
  }

  const { dir } = getDeploymentDir(slug);
  if (!fs.existsSync(dir)) {
    next();
    return;
  }

  const relativePath = restParts.join('/');
  const requestedPath = relativePath ? path.join(dir, relativePath) : path.join(dir, 'index.html');
  const normalized = path.normalize(requestedPath);

  if (!isPathInsideDirectory(dir, normalized)) {
    res.status(400).send('Invalid deployment path.');
    return;
  }

  if (fs.existsSync(normalized) && fs.statSync(normalized).isFile()) {
    res.sendFile(normalized, { dotfiles: 'allow' });
    return;
  }

  const spaIndex = path.join(dir, 'index.html');
  if (fs.existsSync(spaIndex)) {
    res.sendFile(spaIndex, { dotfiles: 'allow' });
    return;
  }

  next();
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
