import { useEffect, useState } from "react";
import { BellRing, Share, Smartphone, X } from "lucide-react";
import { dismissInvite, enableNotifications, inviteDismissed, isIos, isStandalone, promptSnoozed, shouldPrompt, snoozePrompt } from "./deviceNotifications";
import "./NotificationPrompt.css";

const DELAY = 2500;

export default function NotificationPrompt() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const iosInstall = isIos() && !isStandalone();

  useEffect(() => {
    const eligible = iosInstall ? !inviteDismissed() && !promptSnoozed() : shouldPrompt();
    if (!eligible) return undefined;
    const timer = setTimeout(() => setVisible(true), DELAY);
    return () => clearTimeout(timer);
  }, [iosInstall]);

  if (!visible) return null;

  const later = () => {
    snoozePrompt();
    setVisible(false);
  };
  const never = () => {
    dismissInvite();
    setVisible(false);
  };
  const enable = async () => {
    setBusy(true);
    await enableNotifications();
    setBusy(false);
    setVisible(false);
  };

  return (
    <aside className="notify-prompt" role="dialog" aria-label="Bật thông báo">
      <button type="button" className="notify-prompt-close" onClick={later} aria-label="Để sau"><X size={16} /></button>
      <span className="notify-prompt-icon">{iosInstall ? <Smartphone size={22} /> : <BellRing size={22} />}</span>
      <div>
        <b>{iosInstall ? "Cài ứng dụng để nhận thông báo" : "Bật thông báo trên thiết bị này?"}</b>
        {iosInstall ? (
          <p>
            Trên iPhone/iPad, bấm <Share size={13} /> <strong>Chia sẻ</strong> → <strong>Thêm vào Màn hình chính</strong>, rồi mở ứng dụng từ biểu tượng mới để bật thông báo.
          </p>
        ) : (
          <p>Biết ngay khi được giao việc, có kết quả duyệt hoặc đánh giá thi đua — kể cả khi không mở trang này. Có thể tắt bất cứ lúc nào trong Thông tin cá nhân.</p>
        )}
        <span className="notify-prompt-actions">
          {!iosInstall && <button type="button" className="primary-btn" disabled={busy} onClick={enable}>{busy ? "Đang bật..." : "Bật thông báo"}</button>}
          <button type="button" className="secondary-btn" onClick={later}>Để sau</button>
          <button type="button" className="notify-prompt-never" onClick={never}>Không hỏi lại</button>
        </span>
      </div>
    </aside>
  );
}

