import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles, Settings, Check, X, ChevronDown, Loader } from 'lucide-react';
import { sendAIMessage, AI_MODELS, parseAIResponse } from '../lib/ai';
import { useStore } from '../store';

function Message({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}
    >
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
        isUser
          ? 'bg-white text-black rounded-br-sm'
          : 'bg-surface border border-border text-white rounded-bl-sm'
      }`}>
        {msg.streaming ? (
          <span>
            {msg.content}
            <span className="inline-block w-0.5 h-3.5 bg-white/60 animate-pulse ml-0.5 align-middle" />
          </span>
        ) : msg.content}
        {msg.parsed && (
          <div className="mt-3 pt-3 border-t border-white/10">
            <p className="text-xs text-white/60 mb-2 font-mono">{msg.parsed.explanation}</p>
            <button
              onClick={msg.onApply}
              className="flex items-center gap-1.5 bg-white text-black text-xs px-3 py-1.5 rounded-lg font-medium hover:bg-white/90 transition-colors"
            >
              <Check size={11} /> Apply Changes
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
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="absolute top-12 right-2 left-2 z-30 bg-surface border border-border rounded-2xl p-4 shadow-2xl"
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium">AI Settings</span>
        <button onClick={onClose} className="text-muted hover:text-white transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted mb-1.5 block">Provider</label>
          <div className="flex gap-2">
            {['anthropic', 'openai'].map(p => (
              <button
                key={p}
                onClick={() => {
                  setAiProvider(p);
                  setAiModel(AI_MODELS[p][0].id);
                }}
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
          <label className="text-xs text-muted mb-1.5 block">Model</label>
          <select
            value={aiModel}
            onChange={e => setAiModel(e.target.value)}
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-border-light"
          >
            {models.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-muted mb-1.5 block">API Key</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder={`${aiProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}`}
              className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-muted focus:outline-none focus:border-border-light"
            />
            <button
              onClick={() => { setAiKey(key); onClose(); }}
              className="bg-white text-black px-3 rounded-lg text-xs font-medium"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function AIPanel() {
  const { project, updateCode, notify, aiProvider, aiKey, aiModel } = useStore();
  const [messages, setMessages] = useState([
    {
      id: 0,
      role: 'assistant',
      content: "Hi! I'm your AI coding assistant. Describe what you want to build or change, and I'll update your code.",
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleApply = (parsed, msgId) => {
    if (parsed.html !== undefined) updateCode('html', parsed.html);
    if (parsed.css !== undefined) updateCode('css', parsed.css);
    if (parsed.js !== undefined) updateCode('js', parsed.js);
    notify('AI changes applied!', 'success');
    setMessages(ms => ms.map(m => m.id === msgId ? { ...m, applied: true } : m));
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    if (!aiKey) {
      setShowSettings(true);
      notify('Add your API key in settings', 'warning');
      return;
    }

    const userMsg = { id: Date.now(), role: 'user', content: input };
    setInput('');
    setLoading(true);

    const streamId = Date.now() + 1;
    const streamMsg = { id: streamId, role: 'assistant', content: '', streaming: true };
    setMessages(ms => [...ms, userMsg, streamMsg]);

    try {
      const parsed = await sendAIMessage({
        provider: aiProvider,
        apiKey: aiKey,
        model: aiModel,
        html: project.html,
        css: project.css,
        js: project.js,
        prompt: input,
        onChunk: (_, fullText) => {
          setMessages(ms => ms.map(m => m.id === streamId ? { ...m, content: fullText } : m));
        },
      });

      setMessages(ms => ms.map(m => m.id === streamId ? {
        ...m,
        streaming: false,
        content: parsed.explanation || 'Here are the changes I made.',
        parsed,
        onApply: () => handleApply(parsed, streamId),
      } : m));
    } catch (err) {
      setMessages(ms => ms.map(m => m.id === streamId ? {
        ...m,
        streaming: false,
        content: `Error: ${err.message}`,
      } : m));
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const SUGGESTIONS = [
    'Add a dark mode toggle',
    'Make it responsive for mobile',
    'Add smooth animations',
    'Create a contact form',
  ];

  return (
    <div className="h-full flex flex-col bg-bg relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-white" />
          <span className="text-sm font-medium">AI Assistant</span>
          {!aiKey && (
            <span className="text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded px-2 py-0.5">
              No key
            </span>
          )}
        </div>
        <button
          onClick={() => setShowSettings(s => !s)}
          className="text-muted hover:text-white transition-colors p-1"
        >
          <Settings size={14} />
        </button>
      </div>

      <AnimatePresence>
        {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {messages.map(msg => (
          <Message key={msg.id} msg={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      {messages.length <= 2 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => setInput(s)}
              className="text-xs bg-surface border border-border rounded-lg px-2.5 py-1.5 text-muted hover:text-white hover:border-border-light transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-3 pb-3 shrink-0">
        <div className="flex items-end gap-2 bg-surface border border-border rounded-2xl p-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you want to build..."
            rows={1}
            className="flex-1 bg-transparent text-sm text-white placeholder-muted resize-none focus:outline-none leading-relaxed py-1 px-2 max-h-32"
            style={{ fieldSizing: 'content' }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="w-8 h-8 bg-white rounded-xl flex items-center justify-center shrink-0 hover:bg-white/90 transition-colors disabled:opacity-30"
          >
            {loading ? <Loader size={13} className="text-black animate-spin" /> : <Send size={13} className="text-black" />}
          </button>
        </div>
        <p className="text-muted text-xs text-center mt-2">Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  );
}
