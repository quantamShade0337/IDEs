import { create } from 'zustand';

const DEFAULT_HTML = `<div class="container">
  <h1>Hello, World!</h1>
  <p>Start coding to see your changes live.</p>
  <button onclick="handleClick()">Click me</button>
</div>`;

const DEFAULT_CSS = `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #0f0f0f;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
}

.container {
  text-align: center;
  padding: 2rem;
}

h1 {
  font-size: 3rem;
  margin-bottom: 1rem;
  background: linear-gradient(135deg, #fff, #888);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

p {
  color: #888;
  margin-bottom: 2rem;
}

button {
  padding: 0.75rem 2rem;
  background: #fff;
  color: #000;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  transition: opacity 0.2s;
}

button:hover {
  opacity: 0.8;
}`;

const DEFAULT_JS = `function handleClick() {
  const btn = document.querySelector('button');
  btn.textContent = 'Clicked!';
  btn.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
  btn.style.color = '#fff';

  setTimeout(() => {
    btn.textContent = 'Click me';
    btn.style.background = '#fff';
    btn.style.color = '#000';
  }, 2000);
}

console.log('Script loaded!');`;

const DEFAULT_FILES = [
  { id: 'index.html', name: 'index.html', language: 'html', content: DEFAULT_HTML },
  { id: 'styles.css', name: 'styles.css', language: 'css', content: DEFAULT_CSS },
  { id: 'script.js', name: 'script.js', language: 'javascript', content: DEFAULT_JS },
];

function isReactProjectFiles(files = []) {
  const names = files.map((file) => file.name.toLowerCase());
  if (names.includes('src/main.jsx') || names.includes('src/main.tsx')) return true;
  if (names.includes('src/app.jsx') || names.includes('src/app.tsx')) return true;
  if (names.includes('package.json')) {
    const pkg = files.find((file) => file.name === 'package.json');
    return /"react"\s*:/.test(pkg?.content || '');
  }
  return false;
}

function normalizeComponentName(name = '') {
  const cleaned = String(name)
    .replace(/[^a-zA-Z0-9/_-\s]/g, ' ')
    .split(/[\/\\]/)
    .map((segment) => segment
      .trim()
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(''))
    .filter(Boolean);

  return cleaned.join('/');
}

function createComponentScaffold(name, includeCss = true) {
  const normalized = normalizeComponentName(name);
  if (!normalized) return null;

  const segments = normalized.split('/');
  const componentName = segments[segments.length - 1];
  const componentDir = segments.length > 1 ? `${segments.slice(0, -1).join('/')}/` : '';
  const basePath = `src/components/${componentDir}${componentName}`;
  const cssImportPath = includeCss ? `./${componentName}.css` : null;
  const className = componentName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();

  const jsx = `import React from 'react';
${includeCss ? `import '${cssImportPath}';\n` : ''}
export default function ${componentName}() {
  return <div className="${className}"></div>;
}
`;

  const css = `.${className} {\n}\n`;

  return {
    componentName,
    files: [
      {
        id: `${basePath}.jsx`,
        name: `${basePath}.jsx`,
        language: 'javascript',
        content: jsx,
      },
      ...(includeCss ? [{
        id: `${basePath}.css`,
        name: `${basePath}.css`,
        language: 'css',
        content: css,
      }] : []),
    ],
  };
}

function getLanguage(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const map = {
    html: 'html', htm: 'html',
    css: 'css', scss: 'css', sass: 'css',
    js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    json: 'json', md: 'markdown', txt: 'plaintext', xml: 'xml', svg: 'xml',
    py: 'python', rb: 'ruby', php: 'php', go: 'go', rs: 'rust',
  };
  return map[ext] || 'plaintext';
}

export { getLanguage, DEFAULT_FILES, isReactProjectFiles, normalizeComponentName, createComponentScaffold };

export const useStore = create((set, get) => ({
  // ── Auth ──────────────────────────────────────────────────────────────
  user: null,
  authLoading: true,
  setUser: (user) => set({ user, authLoading: false }),
  setAuthLoading: (v) => set({ authLoading: v }),

  // ── Current project ───────────────────────────────────────────────────
  project: {
    id: null,
    title: 'Untitled Project',
    html: DEFAULT_HTML,
    css: DEFAULT_CSS,
    js: DEFAULT_JS,
  },
  setProject: (project) => set({ project }),
  updateCode: (file, value) =>
    set((s) => ({ project: { ...s.project, [file]: value } })),
  updateTitle: (title) =>
    set((s) => ({ project: { ...s.project, title } })),

  // ── File system ───────────────────────────────────────────────────────
  files: DEFAULT_FILES,
  activeFileId: 'index.html',
  setFiles: (files) => set({ files }),
  setActiveFileId: (id) => set({ activeFileId: id }),
  importFiles: (incomingFiles, options = {}) => {
    const replace = options.replace === true;
    const projectTitle = options.projectTitle;

    const normalized = (Array.isArray(incomingFiles) ? incomingFiles : [])
      .filter((file) => typeof file?.name === 'string' && typeof file?.content === 'string')
      .map((file, index) => ({
        id: file.id || `import-${Date.now()}-${index}-${file.name}`,
        name: file.name.replace(/^\/+/, ''),
        language: file.language || getLanguage(file.name),
        content: file.content,
      }))
      .filter((file) => file.name && !file.name.includes('..'));

    if (normalized.length === 0) return null;

    const preferredActive = normalized.find((file) =>
      /(^|\/)(index\.html|src\/main\.(jsx|tsx|js|ts)|src\/app\.(jsx|tsx|js|ts)|app\/page\.(jsx|tsx|js|ts))$/i.test(file.name)
    ) || normalized[0];

    set((state) => {
      if (replace) {
        return {
          files: normalized,
          activeFileId: preferredActive.id,
          project: projectTitle ? { ...state.project, title: projectTitle } : state.project,
          isDirty: true,
        };
      }

      const existingByName = new Map(state.files.map((file) => [file.name, file]));
      const merged = [...state.files];

      normalized.forEach((file) => {
        const existing = existingByName.get(file.name);
        if (existing) {
          const position = merged.findIndex((entry) => entry.id === existing.id);
          merged[position] = {
            ...existing,
            language: file.language,
            content: file.content,
          };
          return;
        }

        merged.push(file);
      });

      return {
        files: merged,
        activeFileId: preferredActive.id,
        project: projectTitle ? { ...state.project, title: projectTitle } : state.project,
        isDirty: true,
      };
    });

    return preferredActive.id;
  },

  addFile: (name, initialContent) => {
    const id = `${Date.now()}-${name}`;
    const lang = getLanguage(name);
    const templates = {
      html: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <title>Document</title>\n</head>\n<body>\n  \n</body>\n</html>',
      css: '/* Styles */\n',
      javascript: '// Script\n',
      typescript: '// TypeScript\n',
      json: '{\n  \n}\n',
      markdown: '# Title\n\n',
    };
    const content = initialContent !== undefined ? initialContent : (templates[lang] || '');
    const newFile = { id, name, language: lang, content };
    set((s) => ({ files: [...s.files, newFile], activeFileId: id }));
    return id;
  },

  createComponent: (name, options = {}) => {
    const includeCss = options.includeCss !== false;
    const scaffold = createComponentScaffold(name, includeCss);
    if (!scaffold) return { ok: false, error: 'Invalid component name.' };

    const { files } = get();
    const existingNames = new Set(files.map((file) => file.name.toLowerCase()));
    if (scaffold.files.some((file) => existingNames.has(file.name.toLowerCase()))) {
      return { ok: false, error: 'A component with that name already exists.' };
    }

    set((state) => ({
      files: [...state.files, ...scaffold.files],
      activeFileId: scaffold.files[0].id,
    }));

    return { ok: true, componentName: scaffold.componentName, fileIds: scaffold.files.map((file) => file.id) };
  },

  updateFileContent: (id, content) => {
    set((s) => ({
      files: s.files.map(f => f.id === id ? { ...f, content } : f),
    }));
  },

  renameFile: (id, newName) => {
    set((s) => ({
      files: s.files.map(f =>
        f.id === id ? { ...f, name: newName, language: getLanguage(newName) } : f
      ),
    }));
  },

  deleteFile: (id) => {
    set((s) => {
      const remaining = s.files.filter(f => f.id !== id);
      const newActive = s.activeFileId === id
        ? (remaining[0]?.id || null)
        : s.activeFileId;
      return { files: remaining, activeFileId: newActive };
    });
  },

  // ── Active tab (legacy compat) ─────────────────────────────────────────
  activeTab: 'html',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // ── Unsaved changes ───────────────────────────────────────────────────
  isDirty: false,
  setDirty: (v) => set({ isDirty: v }),

  // ── AI settings ───────────────────────────────────────────────────────
  aiProvider: localStorage.getItem('ai_provider') || 'anthropic',
  aiKey: localStorage.getItem('ai_key') || '',
  aiModel: localStorage.getItem('ai_model') || 'claude-sonnet-4-20250514',
  setAiProvider: (p) => { localStorage.setItem('ai_provider', p); set({ aiProvider: p }); },
  setAiKey: (k) => { localStorage.setItem('ai_key', k); set({ aiKey: k }); },
  setAiModel: (m) => { localStorage.setItem('ai_model', m); set({ aiModel: m }); },

  // ── Console logs ──────────────────────────────────────────────────────
  consoleLogs: [],
  addLog: (log) => set((s) => ({ consoleLogs: [...s.consoleLogs.slice(-199), log] })),
  clearLogs: () => set({ consoleLogs: [] }),

  // ── Notifications ─────────────────────────────────────────────────────
  notifications: [],
  notify: (msg, type = 'info') => {
    const id = Date.now() + Math.random();
    set((s) => ({ notifications: [...s.notifications, { id, msg, type }] }));
    setTimeout(() => set((s) => ({ notifications: s.notifications.filter(n => n.id !== id) })), 3500);
  },

  // ── Collaboration ─────────────────────────────────────────────────────
  activeCollabUsers: [],
  setActiveCollabUsers: (users) => set({ activeCollabUsers: users }),

  collabSessionActive: false,
  setCollabSessionActive: (v) => set({ collabSessionActive: v }),

  // ── Version History ───────────────────────────────────────────────────
  snapshots: [],
  addSnapshot: (label) => {
    const { files, project } = get();
    const snapshot = {
      id: Date.now(),
      label: label || `Snapshot ${new Date().toLocaleTimeString()}`,
      timestamp: Date.now(),
      files: files.map(f => ({ ...f })),
      project: { ...project },
    };
    set((s) => ({
      snapshots: [snapshot, ...s.snapshots].slice(0, 30),
    }));
    return snapshot;
  },
  restoreSnapshot: (snapshotId) => {
    const { snapshots } = get();
    const snap = snapshots.find(s => s.id === snapshotId);
    if (!snap) return;
    set({
      files: snap.files.map(f => ({ ...f })),
      project: { ...snap.project },
      activeFileId: snap.files[0]?.id || null,
      isDirty: true,
    });
  },

  // ── Editor preferences ────────────────────────────────────────────────
  editorFontSize: parseInt(localStorage.getItem('editor_font_size') || '13'),
  setEditorFontSize: (size) => {
    localStorage.setItem('editor_font_size', String(size));
    set({ editorFontSize: size });
  },
  editorWordWrap: localStorage.getItem('editor_word_wrap') !== 'false',
  setEditorWordWrap: (v) => {
    localStorage.setItem('editor_word_wrap', String(v));
    set({ editorWordWrap: v });
  },
  editorMinimap: localStorage.getItem('editor_minimap') === 'true',
  setEditorMinimap: (v) => {
    localStorage.setItem('editor_minimap', String(v));
    set({ editorMinimap: v });
  },
}));
