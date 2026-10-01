import React from 'react';
import { RefreshCw } from './Icons';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Shown instead of the default panel when provided. */
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time failures so one broken view cannot take down the app.
 *
 * Without this, any exception thrown while rendering a recipe (a malformed
 * stored entry, a null deref) unmounted the whole tree and the user was left
 * staring at a blank page with no way back other than a reinstall.
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Keep the detail in the console for debugging; the UI stays generic so a
    // stack trace cannot leak vault contents.
    console.error('[zenv] render error', error, info.componentStack);
  }

  private reset = (): void => this.setState({ error: null });

  override render(): React.ReactNode {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (!error) return children;
    if (fallback) return fallback;

    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-lg font-semibold text-white">This view could not be displayed.</p>
        <p className="text-sm text-zinc-400 max-w-sm">
          Your vault is intact. Reload the view to continue.
        </p>
        <button
          onClick={this.reset}
          className="flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-black"
        >
          <RefreshCw size={16} /> Try again
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;