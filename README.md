# WebIDE — Code. Preview. Ship.

A production-quality browser-based IDE with live preview, AI assistant (Claude + GPT-4o), Firebase auth & storage, and one-click ZIP export.

## Stack

- **React + Vite** — fast dev server and build
- **TailwindCSS** — utility-first styling
- **Monaco Editor** — VS Code's editor in the browser
- **Framer Motion** — smooth animations
- **Firebase** — Google auth + Firestore project storage
- **JSZip + FileSaver.js** — client-side ZIP export
- **Zustand** — lightweight global state
- **react-resizable-panels** — draggable panel layout

## Features

| Feature | Details |
|---|---|
| 🖊️ Monaco Editor | Syntax highlighting, autocomplete, ligatures, custom dark theme |
| 👁 Live Preview | Debounced iframe srcDoc, sandboxed, mobile toggle |
| 🤖 AI Assistant | Streaming chat, Claude + GPT-4o, "Apply Changes" button |
| 💾 Firebase Save | Google auth + Firestore CRUD for projects |
| 📦 ZIP Export | JSZip download with linked index.html / styles.css / script.js |
| 🔗 Share | URL-encoded shareable read-only links |
| ⌨️ Shortcuts | ⌘S save, ⌘K command palette |
| 🖥 Console | Captured iframe logs with timestamps |
| 🎨 Design | Vercel-inspired dark UI, Syne + DM Sans + JetBrains Mono |

## Quick Start

```bash
npm install
npm run dev
```

## Firebase Setup (optional)

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a project → enable Google Auth → create Firestore DB
3. In the app, click **Sign in** → **Setup Firebase** → paste your config

## AI Setup

1. Click the **✨ AI** panel in the editor
2. Click ⚙️ Settings
3. Choose provider (Anthropic or OpenAI) and paste your API key
4. Keys are stored in localStorage only — never sent anywhere except the AI API

## Project Structure

```
src/
├── pages/
│   ├── Landing.jsx     # Vercel-style hero page
│   ├── Auth.jsx        # Google login + Firebase config
│   ├── Dashboard.jsx   # Project grid (CRUD)
│   └── Editor.jsx      # Main IDE with resizable panels
├── components/
│   ├── AIPanel.jsx     # Streaming AI chat with Apply Changes
│   ├── PreviewPanel.jsx # Sandboxed iframe live preview
│   ├── ConsolePanel.jsx # Captured console output
│   ├── ShareModal.jsx  # URL-encoded share links
│   ├── CommandPalette.jsx # ⌘K command palette
│   └── Notifications.jsx  # Toast notifications
├── lib/
│   ├── firebase.js     # Auth + Firestore helpers
│   ├── ai.js           # OpenAI + Anthropic streaming
│   └── zipExport.js    # JSZip download
└── store/
    └── index.js        # Zustand global store
```

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `⌘S` / `Ctrl+S` | Save project |
| `⌘K` / `Ctrl+K` | Open command palette |
| `⌘Enter` | Refresh preview |

## Deployment

```bash
npm run build
# Deploy the dist/ folder to Vercel, Netlify, Cloudflare Pages, etc.
```
