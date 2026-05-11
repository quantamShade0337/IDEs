import { useState, useRef, useEffect } from 'react';
import {
  FilePlus, Trash2, PencilLine, Check, X, Upload,
  FileCode, FileText, Braces, File, FileJson, Blocks, FolderOpen,
} from 'lucide-react';
import { isReactProjectFiles, useStore } from '../store';

function fileIcon(name, lang) {
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'html' || ext === 'htm') return <FileText size={13} className="text-orange-400 shrink-0" />;
  if (ext === 'css' || ext === 'scss' || ext === 'sass') return <FileCode size={13} className="text-blue-400 shrink-0" />;
  if (ext === 'js' || ext === 'jsx' || ext === 'ts' || ext === 'tsx') return <Braces size={13} className="text-yellow-400 shrink-0" />;
  if (ext === 'json') return <FileJson size={13} className="text-green-400 shrink-0" />;
  return <File size={13} className="text-muted shrink-0" />;
}

function RenameInput({ value, onConfirm, onCancel }) {
  const [val, setVal] = useState(value);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <div className="flex items-center gap-1 flex-1 min-w-0">
      <input
        ref={ref}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') onConfirm(val);
          if (e.key === 'Escape') onCancel();
        }}
        className="flex-1 bg-bg border border-border rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-white min-w-0"
        onClick={e => e.stopPropagation()}
      />
      <button onClick={() => onConfirm(val)} className="text-green-400 hover:text-green-300">
        <Check size={11} />
      </button>
      <button onClick={onCancel} className="text-muted hover:text-white">
        <X size={11} />
      </button>
    </div>
  );
}

export default function FileExplorer() {
  const { files, activeFileId, setActiveFileId, addFile, renameFile, deleteFile, importFiles, createComponent, notify } = useStore();
  const [renaming, setRenaming] = useState(null);
  const [hovering, setHovering] = useState(null);
  const [newFileName, setNewFileName] = useState('');
  const [adding, setAdding] = useState(false);
  const [addingComponent, setAddingComponent] = useState(false);
  const [newComponentName, setNewComponentName] = useState('');
  const addInputRef = useRef(null);
  const componentInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const reactProject = isReactProjectFiles(files);

  useEffect(() => {
    if (adding) addInputRef.current?.focus();
  }, [adding]);

  useEffect(() => {
    if (addingComponent) componentInputRef.current?.focus();
  }, [addingComponent]);

  // F2 to rename active file
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'F2' && activeFileId && !renaming && !adding) {
        setRenaming(activeFileId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeFileId, renaming, adding]);

  const handleAdd = () => {
    if (!newFileName.trim()) { setAdding(false); return; }
    addFile(newFileName.trim());
    setNewFileName('');
    setAdding(false);
  };

  const handleAddComponent = () => {
    if (!newComponentName.trim()) {
      setAddingComponent(false);
      return;
    }

    const result = createComponent(newComponentName.trim());
    if (!result.ok) {
      notify(result.error, 'error');
      return;
    }

    notify(`${result.componentName} component created`, 'success');
    setNewComponentName('');
    setAddingComponent(false);
  };

  const handleImport = async (e, mode = 'files') => {
    const selectedFiles = Array.from(e.target.files || []);
    e.target.value = '';
    if (selectedFiles.length === 0) return;

    try {
      const importedFiles = await Promise.all(selectedFiles.map(async (file) => {
        const content = await file.text();
        return {
          name: mode === 'folder' ? (file.webkitRelativePath || file.name) : file.name,
          language: undefined,
          content,
        };
      }));

      const projectTitle = mode === 'folder'
        ? (selectedFiles[0]?.webkitRelativePath?.split('/')[0] || undefined)
        : undefined;

      const activeId = importFiles(importedFiles, {
        replace: mode === 'folder',
        projectTitle,
      });

      if (activeId) {
        setActiveFileId(activeId);
      }

      notify(
        mode === 'folder'
          ? `Imported ${importedFiles.length} files into a new editable workspace`
          : `Imported ${importedFiles.length} file${importedFiles.length === 1 ? '' : 's'}`,
        'success'
      );
    } catch (error) {
      notify(error.message || 'Unable to import files.', 'error');
    }
  };

  return (
    <div className="h-full flex flex-col bg-surface border-r border-border w-48 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <span className="text-xs font-medium text-muted uppercase tracking-wider">Files</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Import files"
            className="p-1 text-muted hover:text-white transition-colors rounded"
          >
            <Upload size={12} />
          </button>
          <button
            onClick={() => folderInputRef.current?.click()}
            title="Import folder"
            className="p-1 text-muted hover:text-white transition-colors rounded"
          >
            <FolderOpen size={12} />
          </button>
          <button
            onClick={() => setAdding(true)}
            title="New file"
            className="p-1 text-muted hover:text-white transition-colors rounded"
          >
            <FilePlus size={12} />
          </button>
          {reactProject && (
            <button
              onClick={() => setAddingComponent(true)}
              title="New component"
              className="p-1 text-muted hover:text-white transition-colors rounded"
            >
              <Blocks size={12} />
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept=".html,.htm,.css,.scss,.sass,.js,.jsx,.ts,.tsx,.json,.md,.txt,.xml,.svg,.mjs,.cjs,.yml,.yaml,.env,.gitignore"
          onChange={(event) => handleImport(event, 'files')}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          webkitdirectory=""
          directory=""
          onChange={(event) => handleImport(event, 'folder')}
        />
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto py-1">
        {files.map(file => (
          <div
            key={file.id}
            onMouseEnter={() => setHovering(file.id)}
            onMouseLeave={() => setHovering(null)}
            onClick={() => setActiveFileId(file.id)}
            className={`group flex items-center gap-2 px-2.5 py-1.5 cursor-pointer transition-colors relative ${
              activeFileId === file.id
                ? 'bg-white/10 text-white'
                : 'text-muted hover:text-white hover:bg-white/5'
            }`}
          >
            {activeFileId === file.id && (
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-white rounded-full" />
            )}
            {fileIcon(file.name, file.language)}

            {renaming === file.id ? (
              <RenameInput
                value={file.name}
                onConfirm={(name) => { if (name.trim()) renameFile(file.id, name.trim()); setRenaming(null); }}
                onCancel={() => setRenaming(null)}
              />
            ) : (
              <>
                <span
                  className="text-xs truncate flex-1 min-w-0"
                  onDoubleClick={e => { e.stopPropagation(); setRenaming(file.id); }}
                  title="Double-click to rename"
                >
                  {file.name}
                </span>
                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => setRenaming(file.id)}
                    className="p-0.5 text-muted hover:text-white transition-colors"
                    title="Rename (F2)"
                  >
                    <PencilLine size={10} />
                  </button>
                  {files.length > 1 && (
                    <button
                      onClick={() => deleteFile(file.id)}
                      className="p-0.5 text-muted hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}

        {/* New file input */}
        {adding && (
          <div className="flex items-center gap-2 px-2.5 py-1.5">
            <File size={13} className="text-muted shrink-0" />
            <input
              ref={addInputRef}
              value={newFileName}
              onChange={e => setNewFileName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') { setAdding(false); setNewFileName(''); }
              }}
              onBlur={handleAdd}
              placeholder="filename.js"
              className="flex-1 bg-bg border border-border rounded px-1.5 py-0.5 text-xs text-white placeholder-muted focus:outline-none focus:border-white min-w-0"
            />
          </div>
        )}

        {addingComponent && (
          <div className="flex items-center gap-2 px-2.5 py-1.5">
            <Blocks size={13} className="text-violet-300 shrink-0" />
            <input
              ref={componentInputRef}
              value={newComponentName}
              onChange={e => setNewComponentName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddComponent();
                if (e.key === 'Escape') { setAddingComponent(false); setNewComponentName(''); }
              }}
              onBlur={handleAddComponent}
              placeholder="ComponentName"
              className="flex-1 bg-bg border border-border rounded px-1.5 py-0.5 text-xs text-white placeholder-muted focus:outline-none focus:border-white min-w-0"
            />
          </div>
        )}
      </div>
    </div>
  );
}
