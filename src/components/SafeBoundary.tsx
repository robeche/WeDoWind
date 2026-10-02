"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  name: string;
  children: ReactNode;
  fallback?: ReactNode;
  retryAfterMs?: number;
}

/** Error boundary that logs, shows a fallback, then automatically remounts its children. */
export default class SafeBoundary extends Component<Props, { hasError: boolean }> {
  state = { hasError: false };
  private timer: ReturnType<typeof setTimeout> | undefined;

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.name}]`, error, info.componentStack);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.setState({ hasError: false }), this.props.retryAfterMs ?? 15_000);
  }

  componentWillUnmount() {
    clearTimeout(this.timer);
  }

  render() {
    return this.state.hasError ? (this.props.fallback ?? null) : this.props.children;
  }
}
