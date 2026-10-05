import { apiFetch } from "./api";

export function formatBytes(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export async function downloadFile(url, name) {
  const response = await apiFetch(url, { headers: { Accept: "application/octet-stream" } });
  if (!response.ok) throw new Error("Không thể tải file.");
  const blobUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = name || "file";
  link.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
}
