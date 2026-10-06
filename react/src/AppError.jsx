import { Component } from "react";
import { useRouteError } from "react-router";
import { Home, RotateCcw, TriangleAlert } from "lucide-react";

function describe(error) {
  if (!error) return "Lỗi không xác định.";
  if (typeof error === "string") return error;
  if (error.status) return `${error.status} ${error.statusText ?? ""}`.trim();
  return error.message || String(error);
}

export function ErrorNotice({ error, onRetry }) {
  return (
    <section className="route-notice app-error" role="alert">
      <span><TriangleAlert size={30} /></span>
      <h2>Đã có lỗi xảy ra</h2>
      <p>Trang này gặp sự cố khi hiển thị. Hãy thử tải lại; nếu vẫn lỗi, hãy gửi nội dung trong phần “Chi tiết” cho quản trị viên.</p>
      <div className="app-error-actions">
        <button type="button" className="primary-btn" onClick={onRetry ?? (() => window.location.reload())}>
          <RotateCcw size={16} /> Tải lại trang
        </button>
        <a className="secondary-btn" href="/">
          <Home size={16} /> Về trang Tổng quan
        </a>
      </div>
      <details className="app-error-details">
        <summary>Chi tiết</summary>
        <code>{describe(error)}</code>
        {import.meta.env.DEV && error?.stack && <pre>{error.stack}</pre>}
      </details>
    </section>
  );
}

export class PageErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Page crashed", error, info?.componentStack);
  }

  componentDidUpdate(previous) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <ErrorNotice error={this.state.error} onRetry={() => window.location.reload()} />;
  }
}

export function RouterErrorPage() {
  const error = useRouteError();
  return (
    <div className="app-error-page">
      <ErrorNotice error={error} />
    </div>
  );
}
