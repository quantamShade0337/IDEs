import { Component } from 'react';
import { Code2, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-border flex items-center justify-center mx-auto mb-6">
            <Code2 size={20} className="text-muted" />
          </div>
          <h1 className="font-display text-2xl font-700 tracking-tight mb-2">Something went wrong</h1>
          <p className="text-muted text-sm mb-6 leading-relaxed">
            An unexpected error occurred. Refreshing the page will usually fix it.
          </p>
          <p className="text-xs font-mono text-muted/60 bg-surface border border-border rounded-xl px-4 py-3 mb-6 text-left overflow-auto max-h-32">
            {this.state.error?.message || 'Unknown error'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 bg-white text-black px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-white/90 transition-colors mx-auto"
          >
            <RefreshCw size={14} /> Reload page
          </button>
        </div>
      </div>
    );
  }
}
