import { apiFetch } from "./api";

export async function openFileInTab(url, mime, loadingText = "Đang mở file...") {
  const tab = window.open("", "_blank");
  if (tab) tab.document.body.innerHTML = `<p style="font-family:sans-serif;padding:24px">${loadingText}</p>`;
  try {
    const response = await apiFetch(url, { headers: { Accept: mime || "application/octet-stream" } });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || "Không thể mở file.");
    }
    const blobUrl = URL.createObjectURL(await response.blob());
    if (tab) tab.location.href = blobUrl;
    else window.open(blobUrl, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}

export function formatBytes(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
