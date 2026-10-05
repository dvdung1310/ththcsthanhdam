import { apiJson } from "./api";
import { formatBytes } from "./fileUtils";

const FALLBACK = { max_file_bytes: 20 * 1024 * 1024, max_request_bytes: 100 * 1024 * 1024, max_files: 20 };
let pending = null;

export function getUploadLimits() {
  pending ??= apiJson("/api/upload-limits").catch(() => {
    pending = null;
    return FALLBACK;
  });
  return pending;
}

export async function uploadProblem(fileList) {
  const files = [...fileList].filter((file) => file && file.size !== undefined);
  if (!files.length) return null;
  const limits = await getUploadLimits();
  const oversize = files.filter((file) => file.size > limits.max_file_bytes);
  if (oversize.length) {
    const names = oversize.slice(0, 3).map((file) => `“${file.name}” (${formatBytes(file.size)})`).join(", ");
    return `${names}${oversize.length > 3 ? ` và ${oversize.length - 3} file khác` : ""} vượt quá giới hạn ${formatBytes(limits.max_file_bytes)} mỗi file.`;
  }
  if (files.length > limits.max_files) return `Mỗi lần chỉ tải lên tối đa ${limits.max_files} file. Hãy chia thành nhiều lần.`;
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > limits.max_request_bytes * 0.95) {
    return `Tổng dung lượng ${formatBytes(total)} vượt quá giới hạn ${formatBytes(limits.max_request_bytes)} mỗi lần tải. Hãy chia thành nhiều lần.`;
  }
  return null;
}
