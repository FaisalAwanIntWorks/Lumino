import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { logSystemError } from '@/lib/error-logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  resetKey?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
  prevResetKey?: string;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  private unlisten: (() => void) | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorId: null, prevResetKey: props.resetKey };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error, errorId: null };
  }

  /**
   * When resetKey changes (i.e. route changed), clear any error so the new
   * page can render. This covers React Router programmatic navigation that
   * does NOT fire the browser `popstate` event.
   */
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== undefined && props.resetKey !== state.prevResetKey) {
      if (state.hasError) {
        return { hasError: false, error: null, errorId: null, prevResetKey: props.resetKey };
      }
      return { prevResetKey: props.resetKey };
    }
    return null;
  }

  componentDidMount() {
    // Reset error state on browser navigation (popstate) so route changes clear errors
    const handler = () => {
      if (this.state.hasError) {
        this.setState({ hasError: false, error: null, errorId: null });
      }
    };
    window.addEventListener('popstate', handler);
    this.unlisten = () => window.removeEventListener('popstate', handler);
  }

  componentWillUnmount() {
    this.unlisten?.();
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const errorId = crypto.randomUUID().slice(0, 8);
    
    logSystemError({
      error_source: 'frontend',
      function_name: 'GlobalErrorBoundary',
      error_type: 'unknown',
      error_message: error.message,
      error_stack: error.stack,
      severity: 'critical',
      request_metadata: {
        componentStack: errorInfo.componentStack,
        errorId,
        url: window.location.href,
        userAgent: navigator.userAgent,
      }
    });

    this.setState({ errorId });
    console.error('[GlobalErrorBoundary] Caught error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleTryAgain = () => {
    this.setState({ hasError: false, error: null, errorId: null });
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorId: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle>Something went wrong</CardTitle>
              <CardDescription>
                We've logged this error and will look into it. Please try refreshing the page.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {this.state.errorId && (
                <div className="text-center text-sm text-muted-foreground">
                  Error ID: <code className="bg-muted px-2 py-1 rounded">{this.state.errorId}</code>
                </div>
              )}
              
              {import.meta.env.DEV && this.state.error && (
                <div className="bg-muted p-3 rounded-lg overflow-auto max-h-40">
                  <pre className="text-xs text-destructive whitespace-pre-wrap">
                    {this.state.error.message}
                  </pre>
                </div>
              )}
              
              <div className="flex gap-2 justify-center">
                <Button onClick={this.handleTryAgain} variant="default">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
                <Button onClick={this.handleReload} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Page
                </Button>
                <Button onClick={this.handleGoHome} variant="outline">
                  Go Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
