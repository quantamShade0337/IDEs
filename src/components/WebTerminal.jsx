import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal, X, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

// Virtual filesystem for the in-browser shell
class VirtualFS {
  constructor() {
    this.cwd = '/home/user';
    this.fs = {
      '/': { type: 'dir', children: ['home', 'tmp', 'var'] },
      '/home': { type: 'dir', children: ['user'] },
      '/home/user': { type: 'dir', children: [] },
      '/tmp': { type: 'dir', children: [] },
      '/var': { type: 'dir', children: [] },
    };
    this.env = {
      PATH: '/usr/local/bin:/usr/bin:/bin',
      HOME: '/home/user',
      USER: 'user',
      SHELL: '/bin/sh',
      TERM: 'xterm-256color',
    };
    this.history = [];
    this.aliases = { ll: 'ls -la', la: 'ls -a', cls: 'clear' };
  }

  resolvePath(path) {
    if (!path || path === '~') return this.env.HOME;
    if (path.startsWith('~/')) return this.env.HOME + path.slice(1);
    if (path.startsWith('/')) return this.normalizePath(path);
    return this.normalizePath(this.cwd + '/' + path);
  }

  normalizePath(path) {
    const parts = path.split('/').filter(Boolean);
    const resolved = [];
    for (const p of parts) {
      if (p === '..') resolved.pop();
      else if (p !== '.') resolved.push(p);
    }
    return '/' + resolved.join('/');
  }

  exists(path) {
    return this.fs.hasOwnProperty(path);
  }

  isDir(path) {
    return this.exists(path) && this.fs[path].type === 'dir';
  }

  mkdir(path) {
    if (this.exists(path)) return `mkdir: ${path}: File exists`;
    const parent = this.normalizePath(path + '/..');
    if (!this.isDir(parent)) return `mkdir: ${parent}: No such file or directory`;
    this.fs[path] = { type: 'dir', children: [] };
    const name = path.split('/').pop();
    this.fs[parent].children.push(name);
    return null;
  }

  writeFile(path, content) {
    const parent = this.normalizePath(path + '/..');
    if (!this.isDir(parent)) return `No such directory: ${parent}`;
    const name = path.split('/').pop();
    this.fs[path] = { type: 'file', content, size: content.length };
    if (!this.fs[parent].children.includes(name)) {
      this.fs[parent].children.push(name);
    }
    return null;
  }

  readFile(path) {
    if (!this.exists(path)) return { error: `cat: ${path}: No such file or directory` };
    if (this.isDir(path)) return { error: `cat: ${path}: Is a directory` };
    return { content: this.fs[path].content || '' };
  }

  listDir(path, long = false, all = false) {
    if (!this.exists(path)) return { error: `ls: ${path}: No such file or directory` };
    if (!this.isDir(path)) return { error: `ls: ${path}: Not a directory` };
    let children = this.fs[path].children || [];
    if (!all) children = children.filter(c => !c.startsWith('.'));
    if (!long) return { items: children };
    return {
      items: children.map(name => {
        const fullPath = path === '/' ? `/${name}` : `${path}/${name}`;
        const entry = this.fs[fullPath];
        const isDir = entry?.type === 'dir';
        const size = isDir ? 0 : (entry?.size || 0);
        return { name, isDir, size };
      })
    };
  }

  rm(path, recursive = false) {
    if (!this.exists(path)) return `rm: ${path}: No such file or directory`;
    if (this.isDir(path) && !recursive) return `rm: ${path}: is a directory (use -r)`;
    const parent = this.normalizePath(path + '/..');
    const name = path.split('/').pop();
    if (this.fs[parent]) {
      this.fs[parent].children = this.fs[parent].children.filter(c => c !== name);
    }
    const removeRec = (p) => {
      if (this.isDir(p)) {
        const kids = (this.fs[p].children || []).map(c => p === '/' ? `/${c}` : `${p}/${c}`);
        kids.forEach(removeRec);
      }
      delete this.fs[p];
    };
    removeRec(path);
    return null;
  }
}

// The in-browser shell interpreter
class BrowserShell {
  constructor(vfs, term) {
    this.vfs = vfs;
    this.term = term;
    this.histIndex = -1;
    this.tempLine = '';
  }

  prompt() {
    const short = this.vfs.cwd.replace(this.vfs.env.HOME, '~');
    return `\x1b[32muser\x1b[0m:\x1b[34m${short}\x1b[0m$ `;
  }

  async exec(raw) {
    const line = raw.trim();
    if (!line) return;

    // Expand aliases
    const parts = line.split(/\s+/);
    const cmd = this.vfs.aliases[parts[0]] ? this.vfs.aliases[parts[0]] + ' ' + parts.slice(1).join(' ') : line;
    const tokens = cmd.split(/\s+/);
    const command = tokens[0];
    const args = tokens.slice(1);

    this.vfs.history.unshift(line);
    if (this.vfs.history.length > 200) this.vfs.history.pop();
    this.histIndex = -1;

    switch (command) {
      case 'clear':
        this.term.clear();
        break;
      case 'echo':
        this.println(args.map(a => this.expandVar(a)).join(' '));
        break;
      case 'pwd':
        this.println(this.vfs.cwd);
        break;
      case 'cd': {
        const target = this.vfs.resolvePath(args[0] || this.vfs.env.HOME);
        if (!this.vfs.isDir(target)) {
          this.printErr(`cd: ${args[0] || ''}: No such file or directory`);
        } else {
          this.vfs.cwd = target;
        }
        break;
      }
      case 'ls': {
        let path = this.vfs.cwd;
        let long = false, all = false;
        for (const a of args) {
          if (a.startsWith('-')) { long = long || a.includes('l'); all = all || a.includes('a'); }
          else path = this.vfs.resolvePath(a);
        }
        const result = this.vfs.listDir(path, long, all);
        if (result.error) { this.printErr(result.error); break; }
        if (long) {
          result.items.forEach(item => {
            const type = item.isDir ? 'd' : '-';
            const perms = item.isDir ? 'rwxr-xr-x' : 'rw-r--r--';
            const size = String(item.size).padStart(6);
            const name = item.isDir ? `\x1b[34m${item.name}\x1b[0m` : item.name;
            this.println(`${type}${perms} 1 user user ${size} May  6 00:00 ${name}`);
          });
        } else {
          const formatted = result.items.map(n => {
            const fullPath = path === '/' ? `/${n}` : `${path}/${n}`;
            return this.vfs.isDir(fullPath) ? `\x1b[34m${n}\x1b[0m` : n;
          });
          if (formatted.length > 0) this.println(formatted.join('  '));
        }
        break;
      }
      case 'mkdir': {
        if (!args[0]) { this.printErr('mkdir: missing operand'); break; }
        const recursive = args.includes('-p');
        const target = args.find(a => !a.startsWith('-'));
        if (!target) break;
        const full = this.vfs.resolvePath(target);
        if (recursive) {
          const parts = full.split('/').filter(Boolean);
          let cur = '';
          for (const p of parts) {
            cur += '/' + p;
            if (!this.vfs.exists(cur)) this.vfs.mkdir(cur);
          }
        } else {
          const err = this.vfs.mkdir(full);
          if (err) this.printErr(err);
        }
        break;
      }
      case 'touch': {
        if (!args[0]) { this.printErr('touch: missing file operand'); break; }
        const full = this.vfs.resolvePath(args[0]);
        if (!this.vfs.exists(full)) this.vfs.writeFile(full, '');
        break;
      }
      case 'cat': {
        if (!args[0]) { this.printErr('cat: missing operand'); break; }
        const full = this.vfs.resolvePath(args[0]);
        const result = this.vfs.readFile(full);
        if (result.error) this.printErr(result.error);
        else this.println(result.content);
        break;
      }
      case 'rm': {
        const recursive = args.includes('-r') || args.includes('-rf') || args.includes('-R');
        const targets = args.filter(a => !a.startsWith('-'));
        for (const t of targets) {
          const full = this.vfs.resolvePath(t);
          const err = this.vfs.rm(full, recursive);
          if (err) this.printErr(err);
        }
        break;
      }
      case 'cp': {
        if (args.length < 2) { this.printErr('cp: missing operand'); break; }
        const src = this.vfs.resolvePath(args[0]);
        const dst = this.vfs.resolvePath(args[1]);
        const r = this.vfs.readFile(src);
        if (r.error) { this.printErr(r.error); break; }
        const err = this.vfs.writeFile(dst, r.content);
        if (err) this.printErr(err);
        break;
      }
      case 'mv': {
        if (args.length < 2) { this.printErr('mv: missing operand'); break; }
        const src = this.vfs.resolvePath(args[0]);
        const dst = this.vfs.resolvePath(args[1]);
        const r = this.vfs.readFile(src);
        if (r.error) { this.printErr(r.error); break; }
        const err = this.vfs.writeFile(dst, r.content);
        if (err) { this.printErr(err); break; }
        this.vfs.rm(src, false);
        break;
      }
      case 'grep': {
        if (args.length < 2) { this.printErr('grep: usage: grep PATTERN FILE'); break; }
        const pattern = args[0];
        const file = this.vfs.resolvePath(args[1]);
        const r = this.vfs.readFile(file);
        if (r.error) { this.printErr(r.error); break; }
        const regex = new RegExp(pattern, 'g');
        r.content.split('\n').forEach((line, i) => {
          if (regex.test(line)) this.println(`\x1b[35m${i+1}\x1b[0m:${line.replace(regex, m => `\x1b[31m${m}\x1b[0m`)}`);
        });
        break;
      }
      case 'wc': {
        if (!args[args.length - 1] || args[args.length - 1].startsWith('-')) {
          this.printErr('wc: missing operand');
          break;
        }
        const file = this.vfs.resolvePath(args[args.length - 1]);
        const r = this.vfs.readFile(file);
        if (r.error) { this.printErr(r.error); break; }
        const lines = r.content.split('\n').length;
        const words = r.content.split(/\s+/).filter(Boolean).length;
        const chars = r.content.length;
        this.println(`  ${lines}  ${words}  ${chars} ${args[args.length - 1]}`);
        break;
      }
      case 'date':
        this.println(new Date().toString());
        break;
      case 'whoami':
        this.println(this.vfs.env.USER);
        break;
      case 'uname':
        if (args.includes('-a')) this.println('WebIDE 1.0.0 Browser wasm/js');
        else this.println('WebIDE');
        break;
      case 'env':
        Object.entries(this.vfs.env).forEach(([k, v]) => this.println(`${k}=${v}`));
        break;
      case 'export': {
        const [k, v] = (args[0] || '').split('=');
        if (k && v !== undefined) this.vfs.env[k] = v;
        break;
      }
      case 'history':
        this.vfs.history.slice().reverse().forEach((h, i) => {
          this.println(`  ${String(i + 1).padStart(3)}  ${h}`);
        });
        break;
      case 'help':
        this.printHelp();
        break;
      case 'node':
      case 'python':
      case 'python3':
        this.printErr(`${command}: Not available in browser shell. Use the Live Preview to run JS code.`);
        break;
      case 'curl':
      case 'wget':
        this.printErr(`${command}: Network requests blocked in sandbox. Use the browser DevTools.`);
        break;
      default:
        this.printErr(`${command}: command not found. Type 'help' for available commands.`);
    }
  }

  expandVar(s) {
    return s.replace(/\$(\w+)/g, (_, k) => this.vfs.env[k] || '');
  }

  println(text) {
    this.term.writeln(text || '');
  }

  printErr(text) {
    this.term.writeln(`\x1b[31m${text}\x1b[0m`);
  }

  printHelp() {
    const cmds = [
      ['ls [-la]', 'List directory contents'],
      ['cd [dir]', 'Change directory'],
      ['pwd', 'Print working directory'],
      ['mkdir [-p] dir', 'Create directory'],
      ['touch file', 'Create empty file'],
      ['cat file', 'Print file contents'],
      ['cp src dst', 'Copy file'],
      ['mv src dst', 'Move file'],
      ['rm [-r] path', 'Remove file/dir'],
      ['grep pat file', 'Search in file'],
      ['wc file', 'Word count'],
      ['echo [args]', 'Print text'],
      ['export K=V', 'Set env variable'],
      ['env', 'Show environment'],
      ['date', 'Show current date'],
      ['whoami', 'Show current user'],
      ['history', 'Show command history'],
      ['clear', 'Clear terminal'],
    ];
    this.println('\x1b[1mAvailable commands:\x1b[0m');
    cmds.forEach(([c, d]) => {
      this.println(`  \x1b[33m${c.padEnd(18)}\x1b[0m ${d}`);
    });
    this.println('');
    this.println('\x1b[90mThis is a sandboxed in-browser shell. No network access.\x1b[0m');
  }
}

export default function WebTerminal({ onClose, isMaximized, onToggleMaximize }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const shellRef = useRef(null);
  const lineRef = useRef('');
  const cursorRef = useRef(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 13,
      theme: {
        background: '#0a0a0a',
        foreground: '#e0e0e0',
        cursor: '#ffffff',
        cursorAccent: '#0a0a0a',
        selectionBackground: '#ffffff30',
        black: '#000000',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#6272a4',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#f8f8f2',
        brightBlack: '#6272a4',
        brightRed: '#ff6e6e',
        brightGreen: '#69ff94',
        brightYellow: '#ffffa5',
        brightBlue: '#d6acff',
        brightMagenta: '#ff92df',
        brightCyan: '#a4ffff',
        brightWhite: '#ffffff',
      },
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 2000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);

    setTimeout(() => {
      fitAddon.fit();
      setReady(true);
    }, 50);

    const vfs = new VirtualFS();
    const shell = new BrowserShell(vfs, term);
    shellRef.current = shell;
    termRef.current = term;

    // Welcome banner
    term.writeln('\x1b[1m\x1b[32mWebIDE Terminal\x1b[0m \x1b[90mv1.0\x1b[0m');
    term.writeln('\x1b[90mIn-browser shell — sandboxed, no network access\x1b[0m');
    term.writeln('\x1b[90mType \x1b[33mhelp\x1b[90m to see available commands\x1b[0m');
    term.writeln('');
    term.write(shell.prompt());

    const handleKey = async ({ key, domEvent }) => {
      const ev = domEvent;
      const line = lineRef.current;
      const cursor = cursorRef.current;

      if (ev.ctrlKey && ev.key === 'c') {
        term.writeln('^C');
        lineRef.current = '';
        cursorRef.current = 0;
        term.write(shell.prompt());
        return;
      }

      if (ev.ctrlKey && ev.key === 'l') {
        term.clear();
        term.write(shell.prompt());
        return;
      }

      if (ev.ctrlKey && ev.key === 'u') {
        term.write('\x1b[2K\r' + shell.prompt());
        lineRef.current = '';
        cursorRef.current = 0;
        return;
      }

      if (ev.ctrlKey && ev.key === 'a') {
        const move = cursor;
        if (move > 0) term.write(`\x1b[${move}D`);
        cursorRef.current = 0;
        return;
      }

      if (ev.ctrlKey && ev.key === 'e') {
        const move = line.length - cursor;
        if (move > 0) term.write(`\x1b[${move}C`);
        cursorRef.current = line.length;
        return;
      }

      // Arrow up = history
      if (ev.key === 'ArrowUp') {
        const hist = vfs.history;
        if (shell.histIndex < hist.length - 1) {
          if (shell.histIndex === -1) shell.tempLine = line;
          shell.histIndex++;
          const newLine = hist[shell.histIndex];
          term.write('\x1b[2K\r' + shell.prompt() + newLine);
          lineRef.current = newLine;
          cursorRef.current = newLine.length;
        }
        return;
      }

      if (ev.key === 'ArrowDown') {
        if (shell.histIndex > -1) {
          shell.histIndex--;
          const newLine = shell.histIndex === -1 ? shell.tempLine : vfs.history[shell.histIndex];
          term.write('\x1b[2K\r' + shell.prompt() + newLine);
          lineRef.current = newLine;
          cursorRef.current = newLine.length;
        }
        return;
      }

      if (ev.key === 'ArrowLeft') {
        if (cursor > 0) {
          term.write('\x1b[D');
          cursorRef.current = cursor - 1;
        }
        return;
      }

      if (ev.key === 'ArrowRight') {
        if (cursor < line.length) {
          term.write('\x1b[C');
          cursorRef.current = cursor + 1;
        }
        return;
      }

      if (ev.key === 'Backspace') {
        if (cursor > 0) {
          const newLine = line.slice(0, cursor - 1) + line.slice(cursor);
          lineRef.current = newLine;
          cursorRef.current = cursor - 1;
          // Redraw from cursor
          term.write('\x1b[D' + newLine.slice(cursor - 1) + ' ' + `\x1b[${newLine.length - cursor + 1}D`);
        }
        return;
      }

      if (ev.key === 'Delete') {
        if (cursor < line.length) {
          const newLine = line.slice(0, cursor) + line.slice(cursor + 1);
          lineRef.current = newLine;
          term.write(newLine.slice(cursor) + ' ' + `\x1b[${newLine.length - cursor + 1}D`);
        }
        return;
      }

      if (ev.key === 'Tab') {
        ev.preventDefault();
        // Basic tab completion
        const words = line.split(' ');
        const lastWord = words[words.length - 1];
        if (lastWord) {
          const resolved = vfs.resolvePath(lastWord);
          const parent = vfs.normalizePath(resolved + '/..');
          const base = resolved.split('/').pop();
          if (vfs.isDir(parent)) {
            const children = vfs.fs[parent]?.children || [];
            const matches = children.filter(c => c.startsWith(base));
            if (matches.length === 1) {
              const completion = matches[0].slice(base.length);
              lineRef.current = line + completion;
              cursorRef.current = lineRef.current.length;
              term.write(completion);
            } else if (matches.length > 1) {
              term.writeln('');
              term.writeln(matches.join('  '));
              term.write(shell.prompt() + line);
            }
          }
        }
        return;
      }

      if (ev.key === 'Enter') {
        term.writeln('');
        const cmd = lineRef.current;
        lineRef.current = '';
        cursorRef.current = 0;
        await shell.exec(cmd);
        term.write(shell.prompt());
        return;
      }

      // Printable chars
      if (key && key.length === 1 && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
        const newLine = line.slice(0, cursor) + key + line.slice(cursor);
        lineRef.current = newLine;
        cursorRef.current = cursor + 1;
        if (cursor === line.length) {
          term.write(key);
        } else {
          // Insert mode: redraw rest of line
          term.write(key + newLine.slice(cursor + 1) + `\x1b[${newLine.length - cursor - 1}D`);
        }
      }
    };

    term.onKey(handleKey);

    const resizeObs = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch { /* ignore */ }
    });
    if (containerRef.current.parentElement) {
      resizeObs.observe(containerRef.current.parentElement);
    }

    return () => {
      resizeObs.disconnect();
      term.dispose();
    };
  }, []);

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a]">
      {/* Terminal toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/70" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <div className="w-3 h-3 rounded-full bg-green-500/70" />
          </div>
          <span className="text-xs text-muted font-mono ml-2">Terminal</span>
          <span className="text-xs bg-white/5 text-muted/60 rounded px-1.5 py-0.5 font-mono">bash</span>
        </div>
        <div className="flex items-center gap-1">
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
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden"
        style={{ padding: '4px 8px' }}
      />
    </div>
  );
}
