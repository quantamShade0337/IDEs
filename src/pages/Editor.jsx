import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import {
  Panel, Group as PanelGroup, Separator as PanelResizeHandle
} from 'react-resizable-panels';
import {
  Save, Download, Share2, Code2, ChevronLeft, Terminal,
  Eye, Sparkles, LayoutGrid,
  Command as CommandIcon, Check, Loader2, Users, History,
  Settings, ShieldAlert, TerminalSquare, SlidersHorizontal,
} from 'lucide-react';

import { useStore } from '../store';
import { saveProject, isFirebaseReady } from '../lib/firebase';
import { exportProject } from '../lib/zipExport';
import { scanCode, isHighRisk } from '../lib/security';
import { joinSession, subscribePresence, updateCursor } from '../lib/collaboration';
import PreviewPanel from '../components/PreviewPanel';
import ConsolePanel from '../components/ConsolePanel';
import ShareModal from '../components/ShareModal';
import CommandPalette from '../components/CommandPalette';
import Notifications from '../components/Notifications';
import FileExplorer from '../components/FileExplorer';
import AIFloatingPanel from '../components/AIFloatingPanel';
import CollaborationPanel from '../components/CollaborationPanel';
import SecurityWarning from '../components/SecurityWarning';
import VersionHistory from '../components/VersionHistory';
import EditorSettings from '../components/EditorSettings';

const MonacoEditor = lazy(() => import('@monaco-editor/react'));
const WebTerminal = lazy(() => import('../components/WebTerminal'));

function defineTheme(monaco) {
  monaco.editor.defineTheme('webide-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '555555', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c792ea' },
      { token: 'string', foreground: 'c3e88d' },
      { token: 'number', foreground: 'f78c6c' },
      { token: 'tag', foreground: 'f07178' },
      { token: 'attribute.name', foreground: 'ffcb6b' },
      { token: 'attribute.value', foreground: 'c3e88d' },
    ],
    colors: {
      'editor.background': '#0d0d0d',
      'editor.foreground': '#e0e0e0',
      'editor.lineHighlightBackground': '#ffffff08',
      'editor.selectionBackground': '#ffffff18',
      'editorLineNumber.foreground': '#333333',
      'editorLineNumber.activeForeground': '#666666',
      'editorCursor.foreground': '#ffffff',
      'editor.findMatchBackground': '#ffffff20',
      'editorIndentGuide.background1': '#1e1e1e',
      'editorIndentGuide.activeBackground1': '#333333',
      'scrollbarSlider.background': '#2a2a2a',
      'scrollbarSlider.hoverBackground': '#3a3a3a',
    },
  });
}

function EditorSkeleton() {
  return (
    <div className="h-full bg-[#0d0d0d] flex items-center justify-center">
      <div className="flex items-center gap-2 text-muted text-sm">
        <Loader2 size={16} className="animate-spin" />
        Loading editor...
      </div>
    </div>
  );
}

// Active user avatar dots in the toolbar
function ActiveUsersDots({ users, currentUid }) {
  const others = users.filter(u => u.uid !== currentUid);
  if (others.length === 0) return null;
  return (
    <div className="flex -space-x-1.5 items-center">
      {others.slice(0, 4).map(u => (
        <div
          key={u.uid}
          className="w-6 h-6 rounded-full border-2 border-surface flex items-center justify-center text-white text-xs font-bold"
          style={{ background: u.color }}
          title={u.displayName}
        >
          {(u.displayName || 'U')[0].toUpperCase()}
        </div>
      ))}
      {others.length > 4 && (
        <div className="w-6 h-6 rounded-full bg-border border-2 border-surface text-muted text-xs flex items-center justify-center">
          +{others.length - 4}
        </div>
      )}
    </div>
  );
}

export default function Editor() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    user, project, setProject, updateTitle,
    isDirty, setDirty, notify,
    files, activeFileId, setActiveFileId, updateFileContent,
    editorFontSize, editorWordWrap, editorMinimap,
    activeCollabUsers, setActiveCollabUsers,
  } = useStore();

  const [saving, setSaving] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [showTerminal, setShowTerminal] = useState(false);
  const [termMaximized, setTermMaximized] = useState(false);
  const [showCollab, setShowCollab] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showEditorSettings, setShowEditorSettings] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(project.title);
  const [securityWarnings, setSecurityWarnings] = useState([]);
  const [securityDismissed, setSecurityDismissed] = useState(false);
  const titleRef = useRef(null);
  const editorRef = useRef(null);
  const leaveSessionRef = useRef(null);

  const activeFile = files.find(f => f.id === activeFileId);

  // Load shared or collab project from URL
  useEffect(() => {
    const shareParam = searchParams.get('share');
    const collabParam = searchParams.get('collab');

    if (shareParam) {
      try {
        const decoded = JSON.parse(decodeURIComponent(atob(shareParam)));
        setProject({ ...decoded, id: null });
        notify('Shared project loaded', 'info');
      } catch {
        notify('Invalid share link', 'error');
      }
    }

    if (collabParam && user && !user.isGuest) {
      // Join collaboration session
      notify(`Joining collaboration on project ${collabParam}…`, 'info');
      // The project will be loaded via Firestore subscription in CollaborationPanel
    }
  }, []);

  // Presence tracking
  useEffect(() => {
    if (!user || user.isGuest || !project.id || !isFirebaseReady()) return;

    const leave = joinSession(project.id, user);
    leaveSessionRef.current = leave;

    const unsub = subscribePresence(project.id, setActiveCollabUsers);
    return () => {
      leave();
      unsub();
    };
  }, [user, project.id]);

  // Update cursor position in Firestore for collaboration
  const handleEditorMount = (editor) => {
    editorRef.current = editor;
    if (!user || user.isGuest || !project.id) return;
    editor.onDidChangeCursorPosition((e) => {
      updateCursor(project.id, user.uid, activeFileId, {
        line: e.position.lineNumber,
        column: e.position.column,
      });
    });
  };

  // Security scan on file changes
  useEffect(() => {
    const htmlFile = files.find(f => f.name.endsWith('.html') || f.name.endsWith('.htm'));
    const cssFile = files.find(f => f.name.endsWith('.css'));
    const jsFile = files.find(f => f.name.endsWith('.js') || f.name.endsWith('.jsx'));
    const warnings = scanCode(
      htmlFile?.content || '',
      cssFile?.content || '',
      jsFile?.content || ''
    );
    setSecurityWarnings(warnings);
    if (warnings.length > 0) setSecurityDismissed(false);
  }, [files]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 's') { e.preventDefault(); handleSave(); }
      if (mod && e.key === 'k') { e.preventDefault(); setShowPalette(p => !p); }
      if (mod && e.shiftKey && e.key === 'e') { e.preventDefault(); setShowTerminal(p => !p); }
      if (mod && e.shiftKey && e.key === 'p') { e.preventDefault(); setShowCollab(p => !p); }
      if (mod && e.shiftKey && e.key === 'h') { e.preventDefault(); setShowHistory(p => !p); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [project, files]);

  useEffect(() => { setDirty(true); }, [files]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    if (!user || user.isGuest) {
      localStorage.setItem('last_project', JSON.stringify(project));
      notify('Saved locally', 'info');
      setDirty(false);
      return;
    }
    if (!isFirebaseReady()) {
      localStorage.setItem('last_project', JSON.stringify(project));
      notify('Saved locally (Firebase not configured)', 'info');
      setDirty(false);
      return;
    }
    setSaving(true);
    try {
      const htmlFile = files.find(f => f.name.endsWith('.html') || f.name.endsWith('.htm'));
      const cssFile = files.find(f => f.name.endsWith('.css'));
      const jsFile = files.find(f => f.name.endsWith('.js') || f.name.endsWith('.jsx'));
      const id = await saveProject({
        ...project,
        userId: user.uid,
        files,
        html: htmlFile?.content || project.html || '',
        css: cssFile?.content || project.css || '',
        js: jsFile?.content || project.js || '',
      });
      setProject({ ...project, id });
      setDirty(false);
      notify('Project saved!', 'success');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }, [project, user, saving]);

  const handleExport = async () => {
    try {
      await exportProject({ ...project, files });
      notify('Download started!', 'success');
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const handleTitleBlur = () => {
    setEditingTitle(false);
    if (titleDraft.trim()) updateTitle(titleDraft.trim());
    else setTitleDraft(project.title);
  };

  const getPreviewContent = () => {
    const htmlFile = files.find(f => f.name.endsWith('.html') || f.name.endsWith('.htm'));
    const cssFile = files.find(f => f.name.endsWith('.css'));
    const jsFile = files.find(f => f.name.endsWith('.js') || f.name.endsWith('.jsx'));
    return {
      html: htmlFile?.content || '',
      css: cssFile?.content || '',
      js: jsFile?.content || '',
    };
  };

  const commandActions = [
    { icon: Save, label: 'Save Project', description: 'Save to cloud', shortcut: '⌘S', fn: handleSave },
    { icon: Download, label: 'Export as ZIP', description: 'Download project files', fn: handleExport },
    { icon: Share2, label: 'Share Project', description: 'Get shareable link', fn: () => setShowShare(true) },
    { icon: Eye, label: 'Toggle Preview', shortcut: '⌘⇧P', fn: () => setShowPreview(p => !p) },
    { icon: Sparkles, label: 'Toggle AI Assistant', fn: () => setShowAI(p => !p) },
    { icon: Terminal, label: 'Toggle Console', fn: () => setShowConsole(p => !p) },
    { icon: TerminalSquare, label: 'Toggle Terminal', shortcut: '⌘⇧E', fn: () => setShowTerminal(p => !p) },
    { icon: Users, label: 'Collaboration Panel', shortcut: '⌘⇧P', fn: () => setShowCollab(p => !p) },
    { icon: History, label: 'Version History', shortcut: '⌘⇧H', fn: () => setShowHistory(p => !p) },
    { icon: Settings, label: 'Editor Settings', fn: () => setShowEditorSettings(true) },
    { icon: LayoutGrid, label: 'Go to Dashboard', fn: () => nav('/dashboard') },
  ];

  const previewContent = getPreviewContent();
  const hasSecurityWarnings = securityWarnings.length > 0 && !securityDismissed;
  const hasHighRisk = isHighRisk(securityWarnings);

  const monacoOptions = {
    fontSize: editorFontSize,
    fontFamily: '"JetBrains Mono", monospace',
    fontLigatures: true,
    minimap: { enabled: editorMinimap },
    lineNumbers: 'on',
    roundedSelection: true,
    scrollBeyondLastLine: false,
    padding: { top: 16, bottom: 16 },
    tabSize: 2,
    wordWrap: editorWordWrap ? 'on' : 'off',
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: true },
    renderLineHighlight: 'all',
    lineDecorationsWidth: 6,
    glyphMargin: false,
    folding: true,
    formatOnPaste: true,
    formatOnType: true,
    suggest: { showIcons: true },
    quickSuggestions: true,
  };

  return (
    <div className="h-screen flex flex-col bg-bg overflow-hidden">
      {/* Top Bar */}
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-border shrink-0 bg-surface z-20">
        {/* Left */}
        <button
          onClick={() => nav(user ? '/dashboard' : '/')}
          className="flex items-center gap-1.5 text-muted hover:text-white transition-colors shrink-0"
        >
          <ChevronLeft size={16} />
          <div className="w-5 h-5 rounded bg-white flex items-center justify-center">
            <Code2 size={11} className="text-black" />
          </div>
        </button>

        <div className="w-px h-5 bg-border" />

        {/* Project title */}
        <div className="flex items-center gap-2 min-w-0">
          {editingTitle ? (
            <input
              ref={titleRef}
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={e => {
                if (e.key === 'Enter') titleRef.current?.blur();
                if (e.key === 'Escape') { setTitleDraft(project.title); setEditingTitle(false); }
              }}
              autoFocus
              className="bg-transparent border-b border-border text-sm font-medium focus:outline-none focus:border-white text-white min-w-0 w-40"
            />
          ) : (
            <button
              onClick={() => setEditingTitle(true)}
              className="text-sm font-medium hover:text-muted transition-colors truncate max-w-xs"
            >
              {project.title}
            </button>
          )}
          {isDirty && <div className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" title="Unsaved changes" />}
        </div>

        {/* Collaboration active users */}
        {activeCollabUsers.length > 1 && (
          <ActiveUsersDots users={activeCollabUsers} currentUid={user?.uid} />
        )}

        {/* Right actions */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          <button
            onClick={() => setShowPalette(true)}
            className="flex items-center gap-1.5 text-muted hover:text-white transition-colors text-xs border border-border rounded-lg px-2.5 py-1.5"
          >
            <CommandIcon size={11} /> K
          </button>

          {/* Security indicator */}
          {securityWarnings.length > 0 && (
            <button
              onClick={() => setSecurityDismissed(false)}
              className={`p-2 rounded-lg transition-colors ${
                hasHighRisk ? 'text-red-400 bg-red-500/10 hover:bg-red-500/20' : 'text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20'
              }`}
              title={`${securityWarnings.length} security warning${securityWarnings.length > 1 ? 's' : ''}`}
            >
              <ShieldAlert size={14} />
            </button>
          )}

          <button
            onClick={() => setShowTerminal(p => !p)}
            className={`p-2 rounded-lg transition-colors ${showTerminal ? 'text-green-400 bg-green-500/10' : 'text-muted hover:text-white'}`}
            title="Terminal (⌘⇧E)"
          >
            <TerminalSquare size={14} />
          </button>

          <button
            onClick={() => setShowConsole(p => !p)}
            className={`p-2 rounded-lg transition-colors ${showConsole ? 'text-white bg-white/10' : 'text-muted hover:text-white'}`}
            title="Console"
          >
            <Terminal size={14} />
          </button>

          <button
            onClick={() => setShowCollab(p => !p)}
            className={`p-2 rounded-lg transition-colors ${showCollab ? 'text-white bg-white/10' : 'text-muted hover:text-white'}`}
            title="Collaboration (⌘⇧P)"
          >
            <Users size={14} />
          </button>

          <button
            onClick={() => setShowHistory(p => !p)}
            className={`p-2 rounded-lg transition-colors ${showHistory ? 'text-white bg-white/10' : 'text-muted hover:text-white'}`}
            title="Version History (⌘⇧H)"
          >
            <History size={14} />
          </button>

          <button
            onClick={() => setShowAI(p => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${showAI ? 'bg-white text-black' : 'text-muted hover:text-white border border-border'}`}
            title="AI Assistant"
          >
            <Sparkles size={13} />
            AI
          </button>

          <button
            onClick={() => setShowPreview(p => !p)}
            className={`p-2 rounded-lg transition-colors ${showPreview ? 'text-white bg-white/10' : 'text-muted hover:text-white'}`}
            title="Preview"
          >
            <Eye size={14} />
          </button>

          <div className="w-px h-5 bg-border" />

          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 border border-border text-muted hover:text-white hover:border-border-light transition-colors text-xs px-3 py-1.5 rounded-lg"
          >
            <Download size={13} /> Export
          </button>

          <button
            onClick={() => setShowShare(true)}
            className="flex items-center gap-1.5 border border-border text-muted hover:text-white hover:border-border-light transition-colors text-xs px-3 py-1.5 rounded-lg"
          >
            <Share2 size={13} /> Share
          </button>

          <button
            onClick={() => nav('/settings')}
            className="p-2 rounded-lg text-muted hover:text-white transition-colors"
            title="Account Settings"
          >
            <SlidersHorizontal size={14} />
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 bg-white text-black text-xs px-3 py-1.5 rounded-lg font-medium hover:bg-white/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : isDirty ? <Save size={13} /> : <Check size={13} />}
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </header>

      {/* Security warning banner */}
      <AnimatePresence>
        {hasSecurityWarnings && (
          <SecurityWarning
            warnings={securityWarnings}
            onDismiss={() => setSecurityDismissed(true)}
          />
        )}
      </AnimatePresence>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* File Explorer sidebar */}
        <FileExplorer />

        {/* Editor + Preview + Collab */}
        <div className="flex-1 overflow-hidden">
          <PanelGroup direction="horizontal" className="h-full">
            {/* Editor column */}
            <Panel defaultSize={showPreview ? 55 : 100} minSize={20}>
              <PanelGroup direction="vertical" className="h-full">
                {/* Monaco editor */}
                <Panel
                  defaultSize={showConsole ? (showTerminal ? 50 : 70) : (showTerminal ? 55 : 100)}
                  minSize={20}
                >
                  {activeFile ? (
                    <Suspense fallback={<EditorSkeleton />}>
                      <MonacoEditor
                        key={activeFile.id}
                        height="100%"
                        language={activeFile.language}
                        value={activeFile.content}
                        onChange={(val) => updateFileContent(activeFile.id, val || '')}
                        beforeMount={defineTheme}
                        onMount={handleEditorMount}
                        options={{ ...monacoOptions, theme: 'webide-dark' }}
                      />
                    </Suspense>
                  ) : (
                    <div className="h-full bg-[#0d0d0d] flex items-center justify-center text-muted text-sm">
                      No file selected
                    </div>
                  )}
                </Panel>

                {/* Console panel */}
                {showConsole && (
                  <>
                    <PanelResizeHandle className="h-px bg-border hover:bg-white/20 transition-colors cursor-row-resize" />
                    <Panel defaultSize={showTerminal ? 25 : 30} minSize={10} maxSize={50}>
                      <ConsolePanel />
                    </Panel>
                  </>
                )}

                {/* Terminal panel */}
                {showTerminal && (
                  <>
                    <PanelResizeHandle className="h-px bg-border hover:bg-white/20 transition-colors cursor-row-resize" />
                    <Panel
                      defaultSize={termMaximized ? 80 : 30}
                      minSize={15}
                      maxSize={termMaximized ? 90 : 60}
                    >
                      <Suspense fallback={
                        <div className="h-full bg-[#0a0a0a] flex items-center justify-center text-muted text-xs">
                          <Loader2 size={14} className="animate-spin mr-2" /> Loading terminal...
                        </div>
                      }>
                        <WebTerminal
                          onClose={() => setShowTerminal(false)}
                          isMaximized={termMaximized}
                          onToggleMaximize={() => setTermMaximized(m => !m)}
                        />
                      </Suspense>
                    </Panel>
                  </>
                )}
              </PanelGroup>
            </Panel>

            {/* Preview panel */}
            {showPreview && (
              <>
                <PanelResizeHandle className="w-px bg-border hover:bg-white/20 transition-colors cursor-col-resize" />
                <Panel defaultSize={45} minSize={20}>
                  <PanelGroup direction="vertical" className="h-full">
                    <Panel defaultSize={100} minSize={30}>
                      <PreviewPanel
                        html={previewContent.html}
                        css={previewContent.css}
                        js={previewContent.js}
                      />
                    </Panel>
                  </PanelGroup>
                </Panel>
              </>
            )}

            {/* Collaboration sidebar */}
            {showCollab && (
              <>
                <PanelResizeHandle className="w-px bg-border hover:bg-white/20 transition-colors cursor-col-resize" />
                <Panel defaultSize={22} minSize={18} maxSize={35}>
                  <CollaborationPanel projectId={project.id} />
                </Panel>
              </>
            )}
          </PanelGroup>
        </div>
      </div>

      {/* Floating AI Panel */}
      {showAI && <AIFloatingPanel onClose={() => setShowAI(false)} />}

      {/* Modals */}
      <AnimatePresence>
        {showShare && <ShareModal onClose={() => setShowShare(false)} />}
        {showPalette && (
          <CommandPalette
            onClose={() => setShowPalette(false)}
            actions={commandActions}
          />
        )}
        {showHistory && <VersionHistory onClose={() => setShowHistory(false)} />}
        {showEditorSettings && <EditorSettings onClose={() => setShowEditorSettings(false)} />}
      </AnimatePresence>

      <Notifications />
    </div>
  );
}
