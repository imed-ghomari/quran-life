import React from 'react';

export class PluginErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, info: any) {
    console.error('[QuranLife] React error', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, color: 'var(--text-error)', background: 'var(--background-primary)' }}>
          <h3 style={{ margin: '0 0 8px' }}>Something went wrong</h3>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8em', opacity: 0.8 }}>{String(this.state.error?.message || this.state.error)}</pre>
          <p style={{ fontSize: '0.85em', opacity: 0.7 }}>Check developer console (Ctrl+Shift+I) for details. Try Reload app without saving.</p>
          <button onClick={() => this.setState({ hasError: false, error: null })} style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--background-modifier-border)' }}>Retry</button>
        </div>
      );
    }
    return this.props.children as any;
  }
}
