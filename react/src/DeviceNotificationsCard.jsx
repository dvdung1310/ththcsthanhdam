import { useEffect, useState } from "react";
import { BellOff, BellRing, Send, Smartphone } from "lucide-react";
import { disableNotifications, enableNotifications, isIos, isStandalone, notificationsActive, notificationsSupported, permission, pushSupported, sendTestNotification, systemSettingsHint } from "./deviceNotifications";

export default function DeviceNotificationsCard() {
  const [state, setState] = useState(() => ({ permission: permission(), active: notificationsActive() }));
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState(null);
  const refresh = () => setState({ permission: permission(), active: notificationsActive() });
  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const toggle = async () => {
    setBusy(true);
    try {
      if (state.active) await disableNotifications();
      else await enableNotifications();
      setTest(null);
    } finally {
      refresh();
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setTest({ sending: true });
    try {
      const via = await sendTestNotification();
      setTest({ sent: via });
    } catch (error) {
      setTest({ error: error.message || "Không gửi được thông báo thử." });
    }
  };

  const iosNeedsInstall = isIos() && !isStandalone();
  const status = !notificationsSupported()
    ? "Trình duyệt này không hỗ trợ thông báo."
    : iosNeedsInstall
      ? "Trên iPhone/iPad, thông báo chỉ hoạt động khi đã thêm ứng dụng vào Màn hình chính: bấm Chia sẻ → “Thêm vào Màn hình chính”, rồi mở ứng dụng từ biểu tượng đó."
      : state.permission === "denied"
        ? "Bạn đã chặn thông báo cho trang này. Mở cài đặt trang của trình duyệt (biểu tượng ổ khóa cạnh địa chỉ) để cho phép lại."
        : state.active
          ? `Đang bật trên thiết bị này${pushSupported() ? " — nhận được cả khi đã đóng trang." : " — chỉ hiện khi trang đang mở."}`
          : "Đang tắt. Bật để biết ngay khi được giao việc, có kết quả duyệt hoặc đánh giá thi đua.";

  return (
    <section className="personal-card device-card">
      <div className="password-title">
        <span>{state.active ? <BellRing size={22} /> : iosNeedsInstall ? <Smartphone size={22} /> : <BellOff size={22} />}</span>
        <div>
          <h3>Thông báo trên thiết bị</h3>
          <p>Áp dụng riêng cho trình duyệt hoặc ứng dụng bạn đang dùng</p>
        </div>
      </div>
      <p className="device-status">{status}</p>
      {notificationsSupported() && !iosNeedsInstall && state.permission !== "denied" && (
        <div className="device-actions">
          <button type="button" className={state.active ? "personal-upload" : "personal-save"} disabled={busy} onClick={toggle}>
            {busy ? "Đang xử lý..." : state.active ? "Tắt thông báo trên thiết bị này" : "Bật thông báo"}
          </button>
          {state.active && (
            <button type="button" className="personal-upload" disabled={busy || test?.sending} onClick={sendTest}>
              <Send size={14} /> {test?.sending ? "Đang gửi..." : "Gửi thử thông báo"}
            </button>
          )}
        </div>
      )}
      {test?.error && <p className="device-test error">{test.error}</p>}
      {test?.sent && (
        <div className="device-test">
          <b>{test.sent === "push" ? "Đã gửi qua máy chủ." : "Đã hiện thông báo thử trên thiết bị."} Thông báo sẽ hiện trong vài giây.</b>
          <span>Không thấy gì? Kiểm tra:</span>
          <ul>
            <li>{systemSettingsHint()}</li>
            <li>Tắt chế độ Không làm phiền / Tập trung nếu đang bật.</li>
            {test.sent === "local" && <li>Máy chủ chưa bật Web Push nên chưa nhận được thông báo khi đã đóng trang.</li>}
          </ul>
        </div>
      )}
    </section>
  );
}
