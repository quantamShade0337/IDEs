import { motion } from 'framer-motion';
import { X, Settings } from 'lucide-react';
import { useStore } from '../store';

function Toggle({ label, value, onChange, description }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
      <div>
        <p className="text-sm text-white">{label}</p>
        {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`w-10 h-5.5 rounded-full transition-colors relative flex-shrink-0 ${value ? 'bg-white' : 'bg-white/10'}`}
        style={{ height: 22, minWidth: 40 }}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full transition-transform bg-black`}
          style={{
            width: 18, height: 18,
            transform: value ? 'translateX(18px)' : 'translateX(0)',
            background: value ? '#000' : '#888',
          }}
        />
      </button>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange }) {
  return (
    <div className="py-2.5 border-b border-border/50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-white">{label}</span>
        <span className="text-xs text-muted font-mono">{value}px</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-white"
      />
    </div>
  );
}

export default function EditorSettings({ onClose }) {
  const {
    editorFontSize, setEditorFontSize,
    editorWordWrap, setEditorWordWrap,
    editorMinimap, setEditorMinimap,
  } = useStore();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface border border-border rounded-2xl w-full max-w-sm shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Settings size={16} />
            <span className="font-medium">Editor Settings</span>
          </div>
          <button onClick={onClose} className="text-muted hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          <Slider
            label="Font Size"
            value={editorFontSize}
            min={10}
            max={24}
            step={1}
            onChange={setEditorFontSize}
          />
          <Toggle
            label="Word Wrap"
            value={editorWordWrap}
            onChange={setEditorWordWrap}
            description="Wrap long lines in the editor"
          />
          <Toggle
            label="Minimap"
            value={editorMinimap}
            onChange={setEditorMinimap}
            description="Show code overview on the right"
          />
        </div>
      </motion.div>
    </div>
  );
}
