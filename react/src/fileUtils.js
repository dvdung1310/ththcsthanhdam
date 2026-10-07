import { File, FileImage, FileSpreadsheet, FileText, Presentation } from "lucide-react";
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

export function fileIcon(mime = "") {
  if (mime.startsWith("image/")) return FileImage;
  if (mime.includes("sheet") || mime.includes("excel")) return FileSpreadsheet;
  if (mime.includes("presentation") || mime.includes("powerpoint")) return Presentation;
  if (mime.includes("pdf") || mime.includes("word") || mime.startsWith("text/")) return FileText;
  return File;
}

export function fileTone(mime = "") {
  if (mime.startsWith("image/")) return "image";
  if (mime.includes("sheet") || mime.includes("excel")) return "sheet";
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "slide";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("word")) return "word";
  return "other";
}

export function fileKind(name = "", mime = "") {
  const extension = name.includes(".") ? name.split(".").pop().toUpperCase() : "";
  if (mime.startsWith("image/")) return `Hình ảnh ${extension}`.trim();
  if (mime.includes("pdf")) return "Tài liệu PDF";
  if (mime.includes("word")) return "Tài liệu Word";
  if (mime.includes("sheet") || mime.includes("excel")) return "Bảng tính Excel";
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "Bản trình chiếu";
  if (mime.startsWith("text/")) return "Văn bản thuần";
  return extension ? `Tệp ${extension}` : "Tệp";
}
