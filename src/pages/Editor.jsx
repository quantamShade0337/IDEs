import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import {
  Panel, Group as PanelGroup, Separator as PanelResizeHandle
} from 'react-resizable-panels';
import {
  Save, Download, Share2, Code2, ChevronLeft, Terminal,
  Eye, Sparkles, LayoutGrid, FileCode, FileText, Braces,
  Command as CommandIcon, Check, Loader2
} from 'lucide-react';

import { useStore } from '../store';
import { saveProject, isFirebaseReady } from '../lib/firebase';
import { exportProject } from '../lib/zipExport';
import PreviewPanel from '../components/PreviewPanel';
import ConsolePanel from '../components/ConsolePanel';
import ShareModal from '../components/ShareModal';
import CommandPalette from '../components/CommandPalette';
import Notifications from '../components/Notifications';
import FileExplorer from '../components/FileExplorer';
import AIFloatingPanel from '../components/AIFloatingPanel';

const MonacoEditor = lazy(() => import('@monaco-editor/react'));

const MONACO_OPTIONS = {
  fontSize: 13,
  fontFamily: '"JetBrains Mono", monospace',
  fontLigatures: true,
  minimap: { enabled: false },
  lineNumbers: 'on',
  roundedSelection: true,
  scrollBeyondLastLine: false,
  padding: { top: 16, bottom: 16 },
  tabSize: 2,
  wordWrap: 'on',
  smoothScrolling: true,
  cursorBlinking: 'smooth',
  cursorSmoothCaretAnimation: 'on',
  bracketPairColorization: { enabled: true },
  guides: { bracketPairs: true },
  renderLineHighlight: 'all',
  lineDecorationsWidth: 6,
  glyphMargin: false,
  folding: true,
};

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
      'editorIndentGuide.background': '#1e1e1e',
      'editorIndentGuide.activeBackground': '#333333',
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

export default function Editor() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    user, project, setProject, updateCode, updateTitle,
    activeTab, setActiveTab, isDirty, setDirty, notify, consoleLogs,
    files, activeFileId, setActiveFileId, updateFileContent,
  } = useStore();

  const [saving, setSaving] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(project.title);
  const titleRef = useRef(null);
  const editorRef = useRef(null);

  const activeFile = files.find(f => f.id === activeFileId);

  // Load shared project
  useEffect(() => {
    const shareParam = searchParams.get('share');
    if (shareParam) {
      try {
        const decoded = JSON.parse(decodeURIComponent(atob(shareParam)));
        setProject({ ...decoded, id: null });
        notify('Shared project loaded', 'info');
      } catch {
        notify('Invalid share link', 'error');
      }
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 's') { e.preventDefault(); handleSave(); }
      if (mod && e.key === 'k') { e.preventDefault(); setShowPalette(p => !p); }
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
      const id = await saveProject({ ...project, userId: user.uid });
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
      await exportProject(project);
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

  // Build preview from files
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
    { icon: Eye, label: 'Toggle Preview', fn: () => setShowPreview(p => !p) },
    { icon: Sparkles, label: 'Toggle AI Assistant', fn: () => setShowAI(p => !p) },
    { icon: Terminal, label: 'Toggle Console', fn: () => setShowConsole(p => !p) },
    { icon: LayoutGrid, label: 'Go to Dashboard', fn: () => nav('/dashboard') },
  ];

  const previewContent = getPreviewContent();

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

        {/* Right actions */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <button
            onClick={() => setShowPalette(true)}
            className="flex items-center gap-1.5 text-muted hover:text-white transition-colors text-xs border border-border rounded-lg px-2.5 py-1.5"
          >
            <CommandIcon size={11} /> K
          </button>

          <button
            onClick={() => setShowConsole(p => !p)}
            className={`p-2 rounded-lg transition-colors ${showConsole ? 'text-white bg-white/10' : 'text-muted hover:text-white'}`}
            title="Console"
          >
            <Terminal size={14} />
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
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 bg-white text-black text-xs px-3 py-1.5 rounded-lg font-medium hover:bg-white/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : isDirty ? <Save size={13} /> : <Check size={13} />}
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </header>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* File Explorer sidebar */}
        <FileExplorer />

        {/* Editor + Preview */}
        <div className="flex-1 overflow-hidden">
          <PanelGroup direction="horizontal" className="h-full">
            {/* Editor */}
            <Panel defaultSize={showPreview ? 55 : 100} minSize={20}>
              <PanelGroup direction="vertical" className="h-full">
                <Panel defaultSize={showConsole ? 70 : 100} minSize={30}>
                  {activeFile ? (
                    <Suspense fallback={<EditorSkeleton />}>
                      <MonacoEditor
                        key={activeFile.id}
                        height="100%"
                        language={activeFile.language}
                        value={activeFile.content}
                        onChange={(val) => updateFileContent(activeFile.id, val || '')}
                        beforeMount={defineTheme}
                        onMount={(editor) => { editorRef.current = editor; }}
                        options={{ ...MONACO_OPTIONS, theme: 'webide-dark' }}
                      />
                    </Suspense>
                  ) : (
                    <div className="h-full bg-[#0d0d0d] flex items-center justify-center text-muted text-sm">
                      No file selected
                    </div>
                  )}
                </Panel>

                {showConsole && (
                  <>
                    <PanelResizeHandle className="h-px bg-border hover:bg-white/20 transition-colors cursor-row-resize" />
                    <Panel defaultSize={30} minSize={10} maxSize={50}>
                      <ConsolePanel />
                    </Panel>
                  </>
                )}
              </PanelGroup>
            </Panel>

            {/* Preview */}
            {showPreview && (
              <>
                <PanelResizeHandle className="w-px bg-border hover:bg-white/20 transition-colors cursor-col-resize" />
                <Panel defaultSize={45} minSize={20}>
                  <PreviewPanel
                    html={previewContent.html}
                    css={previewContent.css}
                    js={previewContent.js}
                  />
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
      </AnimatePresence>

      <Notifications />
    </div>
  );
}
