import { Component } from "react";

/**
 * Error boundary that catches render errors in a section of the UI
 * and shows a fallback instead of crashing the whole app.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[ErrorBoundary${this.props.name ? ` - ${this.props.name}` : ""}]`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div
          role="alert"
          style={{
            padding: "20px",
            textAlign: "center",
            color: "var(--muted, #7a7670)",
            fontSize: "14px",
          }}
        >
          <p style={{ marginBottom: "8px" }}>
            Something went wrong{this.props.name ? ` in ${this.props.name}` : ""}.
          </p>
          <button
            className="btn small"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
