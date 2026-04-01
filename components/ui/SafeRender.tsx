'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * SafeRender provides a local Error Boundary for agent-generated components.
 * This prevents a partial UI crash from breaking the entire page.
 */
export class SafeRender extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`SafeRender [${this.props.name || 'Component'}]:`, error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-4 border border-red-500/20 bg-red-500/5 rounded-md text-red-400 text-sm font-mono overflow-auto">
          <p className="font-bold mb-1">⚠️ Render Error in {this.props.name || 'Component'}</p>
          <p className="opacity-80">{this.state.error?.message}</p>
        </div>
      );
    }

    return this.props.children;
  }
}
