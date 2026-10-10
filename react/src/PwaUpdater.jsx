import { RefreshCw, X } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import "./PwaUpdater.css";

const HOUR = 60 * 60 * 1000;

export default function PwaUpdater() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => registration.update(), HOUR);
    },
  });

  if (!needRefresh) return null;
  return (
    <div className="pwa-update" role="status">
      <RefreshCw size={16} />
      <span>Có phiên bản mới của hệ thống.</span>
      <button type="button" className="primary-btn" onClick={() => updateServiceWorker(true)}>Tải lại</button>
      <button type="button" className="pwa-update-close" onClick={() => setNeedRefresh(false)} aria-label="Để sau"><X size={15} /></button>
    </div>
  );
}
