"use client";

import { Component } from "react";
import { reportError } from "@/lib/errors";

/**
 * Catches render errors in a subtree (e.g. the 3D Canvas or a game module) so one
 * failing feature doesn't take down the whole room. `fallback` receives
 * ({ error, reset }).
 */
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    reportError(error, { componentStack: info.componentStack, boundary: this.props.name });
    this.props.onError?.(error);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) return this.props.fallback({ error: this.state.error, reset: this.reset });
    return this.props.children;
  }
}
