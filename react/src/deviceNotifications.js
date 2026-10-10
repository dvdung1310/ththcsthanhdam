import { apiFetch, apiJson } from "./api";

const OFF_KEY = "thanhdam_device_notifications_off";
const DISMISS_KEY = "thanhdam_device_notifications_dismissed";
const SNOOZE_KEY = "thanhdam_device_notifications_snooze";
const SNOOZE_DAYS = 7;

export const notificationsSupported = () => typeof window !== "undefined" && "Notification" in window;
export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
export const permission = () => (notificationsSupported() ? Notification.permission : "unsupported");
export const turnedOff = () => localStorage.getItem(OFF_KEY) === "1";
export const inviteDismissed = () => localStorage.getItem(DISMISS_KEY) === "1";
export const dismissInvite = () => localStorage.setItem(DISMISS_KEY, "1");
export const promptSnoozed = () => Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now();
export const snoozePrompt = () => localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86400000));
export const shouldPrompt = () => notificationsSupported() && permission() === "default" && !inviteDismissed() && !promptSnoozed();
export const notificationsActive = () => permission() === "granted" && !turnedOff();

const registration = async () => (pushSupported() ? (await navigator.serviceWorker.getRegistration()) ?? null : null);

const toKey = (base64) => {
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};

export async function syncPushSubscription() {
  if (!notificationsActive()) return false;
  const reg = await registration();
  if (!reg) return false;
  const { public_key: key } = await apiJson("/api/push-subscriptions/key").catch(() => ({}));
  if (!key) return false;
  let subscription = await reg.pushManager.getSubscription();
  if (subscription && subscription.options?.applicationServerKey) {
    const current = btoa(String.fromCharCode(...new Uint8Array(subscription.options.applicationServerKey))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (current !== key.replace(/=+$/, "")) {
      await subscription.unsubscribe();
      subscription = null;
    }
  }
  subscription ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) });
  if (!notificationsActive()) {
    await subscription.unsubscribe().catch(() => null);
    return false;
  }
  const json = subscription.toJSON();
  await apiJson("/api/push-subscriptions", {
    method: "POST",
    body: { endpoint: json.endpoint, keys: json.keys, content_encoding: (window.PushManager?.supportedContentEncodings ?? ["aes128gcm"])[0] },
  });
  return true;
}

export async function enableNotifications() {
  if (!notificationsSupported()) return "unsupported";
  const result = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (result !== "granted") return result;
  localStorage.removeItem(OFF_KEY);
  await syncPushSubscription().catch(() => false);
  return "granted";
}

export async function releaseDevice() {
  const reg = await registration().catch(() => null);
  const subscription = await reg?.pushManager.getSubscription().catch(() => null);
  if (!subscription) return;
  await apiFetch("/api/push-subscriptions", {
    method: "DELETE",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
    silent: true,
  }).catch(() => null);
  await subscription.unsubscribe().catch(() => null);
}

export async function disableNotifications() {
  localStorage.setItem(OFF_KEY, "1");
  await releaseDevice();
}

const TEST_TITLE = "Thông báo thử";
const TEST_BODY = "Thiết bị này đã nhận được thông báo từ TH-THCS Thanh Đàm.";

export async function sendTestNotification() {
  const reg = await registration().catch(() => null);
  const options = { body: TEST_BODY, tag: "device-test", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", lang: "vi", data: { url: "/profile" } };
  const send = async () => {
    const pushed = await syncPushSubscription();
    const subscription = pushed ? await reg.pushManager.getSubscription() : null;
    if (!subscription) {
      if (reg) await reg.showNotification(TEST_TITLE, options);
      else new Notification(TEST_TITLE, options);
      return "local";
    }
    await apiJson("/api/push-subscriptions/test", { method: "POST", body: { endpoint: subscription.endpoint } });
    return "push";
  };
  try {
    return await send();
  } catch (error) {
    if (![404, 410].includes(error.status)) throw error;
    await (await reg.pushManager.getSubscription())?.unsubscribe().catch(() => null);
    return send();
  }
}

export function systemSettingsHint() {
  const agent = navigator.userAgent;
  if (isIos()) return "Cài đặt → Thông báo → Thanh Đàm → bật Cho phép thông báo.";
  if (/android/i.test(agent)) return "Cài đặt → Ứng dụng → Chrome (hoặc ứng dụng Thanh Đàm) → Thông báo → bật.";
  if (/mac/i.test(navigator.platform)) return "Cài đặt hệ thống → Thông báo → trình duyệt bạn đang dùng → bật Cho phép thông báo.";
  if (/win/i.test(navigator.platform)) return "Settings → System → Notifications → bật cho trình duyệt bạn đang dùng.";
  return "Mở cài đặt thông báo của hệ điều hành và cho phép trình duyệt bạn đang dùng.";
}

export async function showDeviceNotification({ title, body, url, tag }) {
  if (!notificationsActive() || document.visibilityState === "visible") return;
  const options = { body, tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", lang: "vi", data: { url } };
  const reg = await registration().catch(() => null);
  if (reg) {
    await reg.showNotification(title, options);
    return;
  }
  const notification = new Notification(title, options);
  notification.onclick = () => {
    window.focus();
    window.dispatchEvent(new CustomEvent("device-notification:open", { detail: url }));
    notification.close();
  };
}
