import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CircleHelp, TriangleAlert, Trash2 } from "lucide-react";
import "./ConfirmDialog.css";

const ConfirmContext = createContext(null);

const TONE_ICONS = { danger: Trash2, warning: TriangleAlert, primary: CircleHelp };

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);

  const close = useCallback((result) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setDialog(null);
  }, []);

  const confirm = useCallback((options) => {
    resolverRef.current?.(false);
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setDialog({ tone: "primary", confirmText: "Đồng ý", cancelText: "Hủy", ...options });
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && <ConfirmDialog {...dialog} onResult={close} />}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside ConfirmProvider");
  return confirm;
}

function ConfirmDialog({ title, message, details, tone, icon, confirmText, cancelText, onResult }) {
  const confirmRef = useRef(null);
  const cancelRef = useRef(null);
  const Icon = icon ?? TONE_ICONS[tone] ?? CircleHelp;

  useEffect(() => {
    (tone === "danger" ? cancelRef : confirmRef).current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onResult(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [tone, onResult]);

  return (
    <div className="confirm-backdrop" onMouseDown={() => onResult(false)}>
      <div
        className={`confirm-dialog tone-${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="confirm-icon">
          <Icon size={22} />
        </span>
        <div className="confirm-body">
          <h3 id="confirm-dialog-title">{title}</h3>
          {message && <div className="confirm-message">{message}</div>}
          {details?.length > 0 && (
            <ul className="confirm-details">
              {details.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="confirm-actions">
          {cancelText && (
            <button ref={cancelRef} type="button" className="secondary-btn" onClick={() => onResult(false)}>
              {cancelText}
            </button>
          )}
          <button ref={confirmRef} type="button" className={tone === "danger" ? "confirm-danger-btn" : "primary-btn"} onClick={() => onResult(true)}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
