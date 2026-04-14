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
  btn.textContent = 'Clicked! 🎉';
  btn.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
  btn.style.color = '#fff';
  
  setTimeout(() => {
    btn.textContent = 'Click me';
    btn.style.background = '#fff';
    btn.style.color = '#000';
  }, 2000);
}

console.log('Script loaded! ✓');`;

export const useStore = create((set, get) => ({
  // Auth
  user: null,
  setUser: (user) => set({ user }),

  // Current project
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

  // Active tab
  activeTab: 'html',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Unsaved changes
  isDirty: false,
  setDirty: (v) => set({ isDirty: v }),

  // AI settings
  aiProvider: localStorage.getItem('ai_provider') || 'anthropic',
  aiKey: localStorage.getItem('ai_key') || '',
  aiModel: localStorage.getItem('ai_model') || 'claude-sonnet-4-20250514',
  setAiProvider: (p) => {
    localStorage.setItem('ai_provider', p);
    set({ aiProvider: p });
  },
  setAiKey: (k) => {
    localStorage.setItem('ai_key', k);
    set({ aiKey: k });
  },
  setAiModel: (m) => {
    localStorage.setItem('ai_model', m);
    set({ aiModel: m });
  },

  // Console logs
  consoleLogs: [],
  addLog: (log) => set((s) => ({ consoleLogs: [...s.consoleLogs.slice(-99), log] })),
  clearLogs: () => set({ consoleLogs: [] }),

  // Notifications
  notifications: [],
  notify: (msg, type = 'info') => {
    const id = Date.now();
    set((s) => ({ notifications: [...s.notifications, { id, msg, type }] }));
    setTimeout(() => set((s) => ({ notifications: s.notifications.filter(n => n.id !== id) })), 3500);
  },
}));
