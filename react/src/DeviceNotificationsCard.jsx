import { useEffect, useState } from "react";
import { BellOff, BellRing, Smartphone } from "lucide-react";
import { disableNotifications, enableNotifications, isIos, isStandalone, notificationsActive, notificationsSupported, permission, pushSupported } from "./deviceNotifications";

export default function DeviceNotificationsCard() {
  const [state, setState] = useState(() => ({ permission: permission(), active: notificationsActive() }));
  const [busy, setBusy] = useState(false);
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
    } finally {
      refresh();
      setBusy(false);
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
        <button type="button" className={state.active ? "personal-upload" : "personal-save"} disabled={busy} onClick={toggle}>
          {busy ? "Đang xử lý..." : state.active ? "Tắt thông báo trên thiết bị này" : "Bật thông báo"}
        </button>
      )}
    </section>
  );
}
