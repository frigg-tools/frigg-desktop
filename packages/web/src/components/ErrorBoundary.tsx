import { Component, type ErrorInfo, type ReactNode } from 'react';
import { webError } from '../logging/web-logger';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    webError('React error boundary', error, { componentStack: info.componentStack });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-full items-center justify-center text-zinc-400">
          <p>Something went wrong. Check the logs for details.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
