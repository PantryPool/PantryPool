import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Sparkles } from 'lucide-react';
import { telemetry } from '../lib/telemetry';
import { isChunkLoadError, triggerChunkReload, CHUNK_RELOAD_STORAGE_KEY } from '../lib/lazyWithRetry';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  isChunkError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    isChunkError: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      errorInfo: null,
      isChunkError: isChunkLoadError(error),
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[React ErrorBoundary Caught Error]:', error, errorInfo);
    this.setState({ errorInfo });

    // Handle chunk/MIME skew after new production deployments
    if (isChunkLoadError(error)) {
      triggerChunkReload(error);
      // Deployment chunk skew is normal operational turnover during updates; do not log to error telemetry
      return;
    }

    // Telemetry operational crash report (for genuine application runtime errors only)
    telemetry.trackError('react_render_crash', error, {
      component_stack: errorInfo.componentStack?.slice(0, 800),
      location: typeof window !== 'undefined' ? window.location.href : '',
    });
  }

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(CHUNK_RELOAD_STORAGE_KEY);
      } catch {
        // noop
      }
      window.location.reload();
    }
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, isChunkError: false });
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.state.isChunkError) {
        return (
          <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-4 sm:p-6 text-[#2D2D2D]">
            <div className="max-w-md w-full bg-white border border-[#E0DAD1] rounded-2xl p-6 sm:p-8 shadow-lg text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-[#EBF5EE] text-[#2E7D32] flex items-center justify-center mx-auto">
                <Sparkles className="w-6 h-6" />
              </div>

              <div className="space-y-1">
                <h2 className="text-lg font-bold text-[#2D2D2D]">
                  Update Available
                </h2>
                <p className="text-xs text-[#6B6B6B] leading-relaxed">
                  A new version of PantryPool was just deployed. Please refresh to load the latest improvements and features.
                </p>
              </div>

              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  onClick={this.handleReload}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#E8694A] hover:bg-[#D45A3D] text-white rounded-full text-xs font-medium transition cursor-pointer shadow-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Update &amp; Reload</span>
                </button>

                <button
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      window.location.href = '/';
                    }
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-[#F0EBE3] text-[#2D2D2D] border border-[#E0DAD1] rounded-full text-xs font-medium transition cursor-pointer"
                >
                  <Home className="w-3.5 h-3.5" />
                  <span>Home</span>
                </button>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-4 sm:p-6 text-[#2D2D2D]">
          <div className="max-w-md w-full bg-white border border-[#E0DAD1] rounded-2xl p-6 sm:p-8 shadow-lg text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#FDF0EC] text-[#E8694A] flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-bold text-[#2D2D2D]">
                {this.props.fallbackTitle || 'Something went wrong'}
              </h2>
              <p className="text-xs text-[#6B6B6B] leading-relaxed">
                An unexpected interface issue occurred. Our telemetry engine has recorded the diagnostics so we can investigate.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 bg-[#FAFAF8] border border-[#EDE8E0] rounded-lg text-left text-[11px] font-mono-financial text-[#6B6B6B] overflow-x-auto max-h-32">
                {this.state.error.message}
              </div>
            )}

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={this.handleReload}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#E8694A] hover:bg-[#D45A3D] text-white rounded-full text-xs font-medium transition cursor-pointer shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload App</span>
              </button>

              <button
                onClick={this.handleReset}
                className="flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-[#F0EBE3] text-[#2D2D2D] border border-[#E0DAD1] rounded-full text-xs font-medium transition cursor-pointer"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Try Again</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
