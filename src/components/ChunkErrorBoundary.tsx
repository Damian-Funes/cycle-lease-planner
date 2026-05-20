import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

const CHUNK_ERROR_PATTERNS = [
  "Importing a module script failed",
  "Failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "Loading chunk",
  "Loading CSS chunk",
];

const isChunkError = (error: unknown): boolean => {
  const message =
    (error as { message?: string })?.message ?? String(error ?? "");
  return CHUNK_ERROR_PATTERNS.some((p) => message.includes(p));
};

/**
 * Recarrega a página automaticamente quando um chunk lazy fica obsoleto
 * (acontece após deploy novo enquanto o usuário está com a aba aberta).
 * Usa sessionStorage para evitar loop de reload.
 */
export default class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    if (isChunkError(error)) {
      const key = "__chunk_reload_at";
      const last = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - last > 10000) {
        sessionStorage.setItem(key, String(Date.now()));
        window.location.reload();
      }
    }
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    if (!isChunkError(error)) {
      console.error("[ChunkErrorBoundary]", error);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Atualizando para a versão mais recente...
              </p>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
