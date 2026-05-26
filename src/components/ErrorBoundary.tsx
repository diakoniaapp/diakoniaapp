import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Swallow benign Radix/React portal removeChild races silently
    const msg = error?.message ?? "";
    if (msg.includes("removeChild") || msg.includes("insertBefore")) {
      // Auto-recover from transient DOM mutation races (often caused by
      // browser translation extensions interfering with Radix portals).
      this.setState({ hasError: false });
      return;
    }
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-background">
          <div className="max-w-md text-center space-y-4">
            <h1 className="font-serif text-2xl">Algo deu errado.</h1>
            <p className="text-muted-foreground">Por favor, recarregue a página.</p>
            <Button onClick={() => window.location.reload()}>Recarregar</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;