import { Button } from "@renderer/components/ui/button";
import { Card } from "@renderer/components/ui/card";
import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
          <Card className="flex max-w-md flex-col items-center gap-3 p-8 text-center shadow-lg">
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangleIcon className="size-6 text-destructive" />
            </div>

            <h3 className="text-base font-semibold">Something went wrong</h3>

            <p className="text-sm text-muted-foreground">
              The application encountered an unexpected error. You can try again or start a new
              conversation.
            </p>

            {this.state.error.message && (
              <p className="max-w-full truncate rounded-md bg-muted px-3 py-1.5 font-mono text-xs text-muted-foreground">
                {this.state.error.message}
              </p>
            )}

            <div className="mt-2 flex gap-2">
              <Button variant="default" onClick={this.handleReset}>
                <RefreshCwIcon />
                Try again
              </Button>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
