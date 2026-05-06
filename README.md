# WebIDE

WebIDE is a browser-based coding environment built with React, Vite, Monaco, xterm, and Firebase. It now ships as a single Node service: the frontend is served from `dist/`, and the built-in terminal connects to a real shell over WebSockets.

## What ships now

- Monaco-powered editor with live preview
- Real shell-backed web terminal
- AI panel with user-supplied OpenAI or Anthropic keys
- Firebase auth and project persistence
- Share links, ZIP export, console output, collaboration UI

## Local development

Install dependencies:

```bash
npm install
```

Run the full app in dev mode:

```bash
npm run dev
```

That starts:

- Vite on `http://localhost:5173`
- the terminal/backend server on `http://localhost:3001`

The Vite dev server proxies `/api` and `/terminal` to the backend, so the terminal works during development too.

## Production run

Build and start the single-service app:

```bash
npm run build
npm start
```

By default it serves on `http://localhost:3000`.

## Environment variables

See [.env.example](/Users/ethansoh/Downloads/Swift%20Stuff/IDEs-main/.env.example).

- `PORT`: HTTP port for the Node server
- `TERMINAL_ENABLED`: set to `false` to disable shell access
- `TERMINAL_WORKDIR`: working directory used for new shell sessions
- `TERMINAL_ACCESS_KEY`: required in production if you want the terminal enabled
- `TERMINAL_SHELL`: optional explicit shell path

## Render deployment

This repo includes [render.yaml](/Users/ethansoh/Downloads/Swift%20Stuff/IDEs-main/render.yaml), so the easy path is:

1. Push the repo to GitHub.
2. In Render, create a new Web Service from the repo.
3. Let Render read `render.yaml`, or use these values manually:
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Health check path: `/api/health`
4. Set a secret `TERMINAL_ACCESS_KEY` in Render before using the terminal.
5. Leave `TERMINAL_ENABLED=true`.
6. Optionally set `TERMINAL_WORKDIR` if you want the shell rooted somewhere specific.

## Firebase setup

Firebase is optional. The app stores config in the browser and can still run without it.

1. Create a Firebase project.
2. Enable Authentication and Firestore.
3. Open the app and paste the Firebase web config in the setup flow.

## AI setup

The AI panel uses user-provided API keys from the browser.

1. Open the AI panel.
2. Pick OpenAI or Anthropic.
3. Paste your API key.

Keys are stored locally in the browser and sent directly to the provider API.

## Health check

The server exposes:

- `/api/health`

Example response:

```json
{
  "ok": true,
  "shell": "/bin/bash",
  "terminalEnabled": true,
  "terminalRequiresAuth": true,
  "workspaceRoot": "/opt/render/project/src",
  "built": true
}
```

## Notes

- The terminal is a real shell, not a simulated in-browser filesystem anymore.
- In production, the terminal stays disabled unless `TERMINAL_ACCESS_KEY` is set. That is intentional, so the app does not expose a public unauthenticated shell.
- This implementation uses a plain child shell process, so common shell commands work well, but full-screen terminal apps may still be rough compared with a full PTY setup.
- `npm run lint` still reports pre-existing issues outside the terminal/deploy work.
