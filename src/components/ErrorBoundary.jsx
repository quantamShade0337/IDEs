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

    const compact = Boolean(this.props.compact);

    return (
      <div className={`${compact ? 'h-full' : 'min-h-screen'} bg-bg flex items-center justify-center px-4`}>
        <div className={`text-center ${compact ? 'max-w-sm py-6' : 'max-w-md'}`}>
          <div className={`rounded-2xl bg-white/5 border border-border flex items-center justify-center mx-auto ${compact ? 'w-10 h-10 mb-4' : 'w-12 h-12 mb-6'}`}>
            <Code2 size={20} className="text-muted" />
          </div>
          <h1 className={`font-display tracking-tight ${compact ? 'text-lg mb-2' : 'text-2xl font-700 mb-2'}`}>Something went wrong</h1>
          <p className={`text-muted ${compact ? 'text-xs mb-4' : 'text-sm mb-6'} leading-relaxed`}>
            {compact
              ? 'This panel hit an unexpected error. Try reopening it.'
              : 'An unexpected error occurred. Refreshing the page will usually fix it.'}
          </p>
          <p className={`text-xs font-mono text-muted/60 bg-surface border border-border rounded-xl px-4 py-3 ${compact ? 'mb-4 max-h-24' : 'mb-6 max-h-32'} text-left overflow-auto`}>
            {this.state.error?.message || 'Unknown error'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className={`flex items-center gap-2 bg-white text-black rounded-xl font-medium hover:bg-white/90 transition-colors mx-auto ${compact ? 'px-4 py-2 text-xs' : 'px-5 py-2.5 text-sm'}`}
          >
            <RefreshCw size={compact ? 12 : 14} /> {compact ? 'Reload panel' : 'Reload page'}
          </button>
        </div>
      </div>
    );
  }
}
