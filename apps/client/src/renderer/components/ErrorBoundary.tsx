import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  /** Что показать вместо упавшего поддерева. */
  fallback: (error: Error, reset: () => void) => ReactNode;
  /** Метка для console.error — чтобы по логу было понятно, где упало. */
  label: string;
  children: ReactNode;
};

type State = { error: Error | null };

/**
 * Локальный предохранитель: исключение в рендере поддерева не размонтирует
 * всё приложение (что выглядит как чёрный экран и рвёт звонок), а заменяет
 * только это поддерево на fallback.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label}] render crashed`, error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) return this.props.fallback(this.state.error, this.reset);
    return this.props.children;
  }
}
