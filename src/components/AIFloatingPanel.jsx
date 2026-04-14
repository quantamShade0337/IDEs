import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles, Settings, Check, X, Loader, GripVertical, Minus, Maximize2 } from 'lucide-react';
import { sendAIMessage, AI_MODELS } from '../lib/ai';
import { useStore } from '../store';

function Message({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}
    >
      <div className={`max-w-[88%] rounded-xl px-3 py-2.5 text-xs leading-relaxed ${
        isUser
          ? 'bg-white text-black'
          : 'bg-white/5 border border-border text-white'
      }`}>
        {msg.streaming ? (
          <span>
            {msg.content}
            <span className="inline-block w-0.5 h-3 bg-white/60 animate-pulse ml-0.5 align-middle" />
          </span>
        ) : msg.content}
        {msg.parsed && (
          <div className="mt-2.5 pt-2.5 border-t border-white/10">
            <p className="text-white/50 mb-2 text-xs">{msg.parsed.explanation}</p>
            <button
              onClick={msg.onApply}
              className="flex items-center gap-1 bg-white text-black text-xs px-2.5 py-1 rounded-lg font-medium hover:bg-white/90 transition-colors"
            >
              <Check size={10} /> Apply Changes
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function SettingsPanel({ onClose }) {
  const { aiProvider, aiKey, aiModel, setAiProvider, setAiKey, setAiModel } = useStore();
  const [key, setKey] = useState(aiKey);
  const models = AI_MODELS[aiProvider] || [];

  return (
    <div className="absolute inset-0 bg-surface z-10 flex flex-col rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <span className="text-sm font-medium">AI Settings</span>
        <button onClick={onClose} className="text-muted hover:text-white transition-colors"><X size={14} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label className="text-xs text-muted mb-2 block">Provider</label>
          <div className="flex gap-2">
            {['anthropic', 'openai'].map(p => (
              <button
                key={p}
                onClick={() => { setAiProvider(p); setAiModel(AI_MODELS[p][0].id); }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  aiProvider === p ? 'bg-white text-black' : 'bg-bg border border-border text-muted hover:text-white'
                }`}
              >
                {p === 'anthropic' ? 'Anthropic' : 'OpenAI'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-muted mb-2 block">Model</label>
          <select
            value={aiModel}
            onChange={e => setAiModel(e.target.value)}
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
          >
            {models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted mb-2 block">API Key</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder={aiProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
              className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-muted focus:outline-none"
            />
            <button onClick={() => { setAiKey(key); onClose(); }} className="bg-white text-black px-3 rounded-lg text-xs font-medium">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const MIN_W = 300;
const MIN_H = 400;
const DEFAULT_W = 360;
const DEFAULT_H = 520;

export default function AIFloatingPanel({ onClose }) {
  const { files, activeFileId, updateFileContent, notify, aiProvider, aiKey, aiModel } = useStore();

  const [messages, setMessages] = useState([
    { id: 0, role: 'assistant', content: "Hi! Describe what you want to build or change." }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [minimized, setMinimized] = useState(false);

  // Position and size
  const [pos, setPos] = useState({ x: window.innerWidth - DEFAULT_W - 32, y: 80 });
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });

  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const resizing = useRef(false);
  const resizeStart = useRef({ mx: 0, my: 0, w: 0, h: 0 });
  const panelRef = useRef(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Drag handlers
  const onDragMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    e.preventDefault();
  }, [pos]);

  useEffect(() => {
    const onMove = (e) => {
      if (dragging.current) {
        const dx = e.clientX - dragStart.current.mx;
        const dy = e.clientY - dragStart.current.my;
        setPos({
          x: Math.max(0, Math.min(window.innerWidth - size.w, dragStart.current.px + dx)),
          y: Math.max(0, Math.min(window.innerHeight - 48, dragStart.current.py + dy)),
        });
      }
      if (resizing.current) {
        const dw = e.clientX - resizeStart.current.mx;
        const dh = e.clientY - resizeStart.current.my;
        setSize({
          w: Math.max(MIN_W, resizeStart.current.w + dw),
          h: Math.max(MIN_H, resizeStart.current.h + dh),
        });
      }
    };
    const onUp = () => { dragging.current = false; resizing.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [size.w]);

  const onResizeMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    resizing.current = true;
    resizeStart.current = { mx: e.clientX, my: e.clientY, w: size.w, h: size.h };
    e.preventDefault();
    e.stopPropagation();
  }, [size]);

  // Get current file content for context
  const getContext = () => {
    const activeFile = files.find(f => f.id === activeFileId);
    const html = files.find(f => f.name.endsWith('.html'))?.content || '';
    const css = files.find(f => f.name.endsWith('.css'))?.content || '';
    const js = files.find(f => f.name.endsWith('.js') || f.name.endsWith('.jsx'))?.content || '';
    return { html, css, js };
  };

  const handleApply = (parsed, msgId) => {
    // Apply to matching files
    if (parsed.html) {
      const f = files.find(f => f.name.endsWith('.html'));
      if (f) updateFileContent(f.id, parsed.html);
    }
    if (parsed.css) {
      const f = files.find(f => f.name.endsWith('.css'));
      if (f) updateFileContent(f.id, parsed.css);
    }
    if (parsed.js) {
      const f = files.find(f => f.name.endsWith('.js') || f.name.endsWith('.jsx'));
      if (f) updateFileContent(f.id, parsed.js);
    }
    notify('AI changes applied!', 'success');
    setMessages(ms => ms.map(m => m.id === msgId ? { ...m, applied: true } : m));
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    if (!aiKey) { setShowSettings(true); notify('Add your API key in settings', 'warning'); return; }

    const userMsg = { id: Date.now(), role: 'user', content: input };
    setInput('');
    setLoading(true);

    const streamId = Date.now() + 1;
    setMessages(ms => [...ms, userMsg, { id: streamId, role: 'assistant', content: '', streaming: true }]);

    const { html, css, js } = getContext();
    try {
      const parsed = await sendAIMessage({
        provider: aiProvider,
        apiKey: aiKey,
        model: aiModel,
        html, css, js,
        prompt: input,
        onChunk: (_, fullText) => {
          setMessages(ms => ms.map(m => m.id === streamId ? { ...m, content: fullText } : m));
        },
      });

      setMessages(ms => ms.map(m => m.id === streamId ? {
        ...m, streaming: false,
        content: parsed.explanation || 'Here are the changes.',
        parsed,
        onApply: () => handleApply(parsed, streamId),
      } : m));
    } catch (err) {
      setMessages(ms => ms.map(m => m.id === streamId ? {
        ...m, streaming: false, content: `Error: ${err.message}`,
      } : m));
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={panelRef}
      className="fixed z-50 flex flex-col bg-surface border border-border rounded-xl shadow-2xl shadow-black/60 overflow-hidden"
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: minimized ? 44 : size.h,
        transition: 'height 0.15s ease',
      }}
    >
      {/* Title bar (drag handle) */}
      <div
        className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0 cursor-grab active:cursor-grabbing select-none"
        onMouseDown={onDragMouseDown}
      >
        <div className="flex items-center gap-2">
          <GripVertical size={12} className="text-muted" />
          <Sparkles size={13} className="text-white" />
          <span className="text-xs font-medium">AI Assistant</span>
          {!aiKey && (
            <span className="text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded px-1.5 py-0.5">
              No key
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={() => setShowSettings(s => !s)}
            className="p-1 text-muted hover:text-white transition-colors rounded"
          >
            <Settings size={12} />
          </button>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={() => setMinimized(m => !m)}
            className="p-1 text-muted hover:text-white transition-colors rounded"
          >
            <Minus size={12} />
          </button>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={onClose}
            className="p-1 text-muted hover:text-white transition-colors rounded"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 relative">
            {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
            {messages.map(msg => <Message key={msg.id} msg={msg} />)}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 pb-3 pt-1 shrink-0 border-t border-border">
            <div className="flex items-end gap-2 bg-bg border border-border rounded-xl p-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                placeholder="Describe what you want..."
                rows={1}
                className="flex-1 bg-transparent text-xs text-white placeholder-muted resize-none focus:outline-none leading-relaxed py-1 px-1 max-h-24"
                style={{ fieldSizing: 'content' }}
              />
              <button
                onClick={send}
                disabled={loading || !input.trim()}
                className="w-7 h-7 bg-white rounded-lg flex items-center justify-center shrink-0 hover:bg-white/90 transition-colors disabled:opacity-30"
              >
                {loading ? <Loader size={11} className="text-black animate-spin" /> : <Send size={11} className="text-black" />}
              </button>
            </div>
          </div>

          {/* Resize handle */}
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
            onMouseDown={onResizeMouseDown}
            style={{
              background: 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.1) 50%)',
            }}
          />
        </>
      )}
    </div>
  );
}
