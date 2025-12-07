import { Component, ReactNode } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  isWebGLSupported: boolean;
}

/**
 * WebGL Error Boundary
 * 
 * Catches WebGL-related errors and provides fallback UI
 * Checks for WebGL support on mount
 */
export class WebGLErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
      isWebGLSupported: this.checkWebGLSupport(),
    };
  }

  /**
   * Check if WebGL is supported in the current browser
   */
  checkWebGLSupport(): boolean {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      return !!gl;
    } catch (e) {
      return false;
    }
  }

  /**
   * Check if GPU acceleration is available
   */
  checkGPUAcceleration(): string {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') as WebGLRenderingContext;
      
      if (!gl) return 'WebGL not available';

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        return renderer || 'Unknown GPU';
      }
      
      return 'GPU info not available';
    } catch (e) {
      return 'Error detecting GPU';
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      errorMessage: error.message,
    };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('WebGL Error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      errorMessage: '',
    });
  };

  render() {
    if (!this.state.isWebGLSupported) {
      return (
        <Card className="p-8 text-center data-panel border-destructive/50">
          <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-destructive" />
          <h2 className="text-2xl font-black mb-2">WebGL Not Supported</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            {this.props.fallbackMessage || 
              'Your browser does not support WebGL, which is required for GPU-accelerated visualizations. Please use a modern browser like Chrome, Firefox, or Edge.'}
          </p>
          
          <div className="bg-muted/50 p-4 rounded-lg text-left max-w-md mx-auto">
            <div className="technical-label mb-2">System Information</div>
            <div className="font-mono text-sm space-y-1">
              <div>Browser: {navigator.userAgent.split(' ').slice(-2).join(' ')}</div>
              <div>GPU: {this.checkGPUAcceleration()}</div>
            </div>
          </div>

          <div className="mt-6 space-y-2 text-sm text-muted-foreground">
            <p>Recommended browsers:</p>
            <div className="flex gap-4 justify-center font-mono">
              <span>Chrome 90+</span>
              <span>Firefox 88+</span>
              <span>Edge 90+</span>
              <span>Safari 14+</span>
            </div>
          </div>
        </Card>
      );
    }

    if (this.state.hasError) {
      return (
        <Card className="p-8 text-center data-panel border-destructive/50">
          <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-destructive" />
          <h2 className="text-2xl font-black mb-2">WebGL Error</h2>
          <p className="text-muted-foreground mb-4">
            An error occurred while rendering the visualization.
          </p>
          
          <div className="bg-destructive/10 p-4 rounded-lg text-left max-w-md mx-auto mb-6">
            <div className="technical-label mb-2">Error Details</div>
            <div className="font-mono text-sm text-destructive">
              {this.state.errorMessage}
            </div>
          </div>

          <div className="space-y-4">
            <Button onClick={this.handleReset} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Try Again
            </Button>

            <div className="text-sm text-muted-foreground space-y-2">
              <p>If the problem persists, try:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Refreshing the page</li>
                <li>Updating your graphics drivers</li>
                <li>Enabling hardware acceleration in browser settings</li>
                <li>Using a different browser</li>
              </ul>
            </div>
          </div>
        </Card>
      );
    }

    return this.props.children;
  }
}
