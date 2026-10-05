import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  File as FileIcon,
  FileImage,
  FileText,
  FileWarning,
  Info,
  LoaderCircle,
  Maximize,
  RotateCcw,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { apiFetch } from "./api";
import { downloadFile, formatBytes, openFileInTab } from "./fileUtils";
import "./FilePreview.css";

const TEXT_LIMIT = 2 * 1024 * 1024;
const MIN_SCALE = 0.05;
const MAX_SCALE = 8;

const extensionOf = (name = "") => (name.includes(".") ? name.split(".").pop().toLowerCase() : "");

const KIND_BY_EXTENSION = { pdf: "pdf", jpg: "image", jpeg: "image", png: "image", txt: "text" };
const KIND_BY_MIME = { "application/pdf": "pdf", "image/jpeg": "image", "image/png": "image", "text/plain": "text" };

export function previewKind(name, mime = "") {
  const extension = extensionOf(name);
  return (extension ? KIND_BY_EXTENSION[extension] : KIND_BY_MIME[mime]) ?? null;
}

const KIND_LABELS = { pdf: "Tài liệu PDF", image: "Hình ảnh", text: "Văn bản thuần" };
const KIND_ICONS = { pdf: FileText, image: FileImage, text: FileText };

function decodeText(buffer, truncated) {
  const bytes = new Uint8Array(buffer);
  const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  const body = bytes.subarray(start);
  try {
    return new TextDecoder("utf-8", { fatal: !truncated }).decode(body).normalize("NFC");
  } catch {
    return new TextDecoder("windows-1258").decode(body).normalize("NFC");
  }
}

export default function FilePreview({ files, startIndex = 0, onClose, onDetail }) {
  const [index, setIndex] = useState(startIndex);
  const [state, setState] = useState({ status: "loading" });
  const root = useRef(null);
  const file = files[index];
  const kind = file ? previewKind(file.name, file.mime_type) : null;
  const Icon = KIND_ICONS[kind] ?? FileIcon;

  useEffect(() => {
    if (!file) return undefined;
    if (!kind) {
      setState({ status: "unsupported" });
      return undefined;
    }
    let active = true;
    let objectUrl = null;
    setState({ status: "loading" });
    (async () => {
      try {
        const response = await apiFetch(file.url, { headers: { Accept: file.mime_type || "application/octet-stream" }, silent: true });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.message || "Không thể tải file để xem trước.");
        }
        if (kind === "text") {
          const buffer = await response.arrayBuffer();
          const truncated = buffer.byteLength > TEXT_LIMIT;
          if (active) setState({ status: "ready", text: decodeText(truncated ? buffer.slice(0, TEXT_LIMIT) : buffer, truncated), truncated });
          return;
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(kind === "pdf" ? new File([blob], file.name, { type: "application/pdf" }) : blob);
        if (active) setState({ status: "ready", url: objectUrl });
        else URL.revokeObjectURL(objectUrl);
      } catch (error) {
        if (active) setState({ status: "error", message: error.message });
      }
    })();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, kind]);

  const go = useCallback((step) => setIndex((current) => Math.min(files.length - 1, Math.max(0, current + step))), [files.length]);
  const download = () => downloadFile(file.url, file.name).catch((error) => setState({ status: "error", message: error.message }));
  const openTab = () => openFileInTab(file.url, file.mime_type).catch((error) => setState({ status: "error", message: error.message }));

  useEffect(() => {
    const onKey = (event) => {
      if (event.target.closest?.("input, textarea, select")) return;
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft" && kind !== "image") go(-1);
      else if (event.key === "ArrowRight" && kind !== "image") go(1);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, kind, onClose]);

  useEffect(() => {
    root.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  if (!file) return null;

  return createPortal(
    <div ref={root} tabIndex={-1} className="file-preview" role="dialog" aria-modal="true" aria-label={`Xem trước ${file.name}`}>
      <header className="fp-bar">
        <span className="fp-icon"><Icon size={18} /></span>
        <div className="fp-title">
          <b title={file.name}>{file.name}</b>
          <small>
            {[KIND_LABELS[kind] ?? (extensionOf(file.name).toUpperCase() || "Tệp"), formatBytes(file.size)].join(" · ")}
            {files.length > 1 && <> · {index + 1} / {files.length}</>}
          </small>
        </div>
        <div className="fp-actions">
          <button type="button" onClick={download} title="Tải về"><Download size={17} /><span>Tải về</span></button>
          {kind && <button type="button" onClick={openTab} title="Mở trong tab mới"><ExternalLink size={17} /><span>Tab mới</span></button>}
          {onDetail && <button type="button" onClick={() => onDetail(file)} title="Chi tiết"><Info size={17} /><span>Chi tiết</span></button>}
          <button type="button" className="fp-close" onClick={onClose} aria-label="Đóng" title="Đóng (Esc)"><X size={19} /></button>
        </div>
      </header>

      <main className="fp-stage" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        {state.status === "loading" && (
          <div className="fp-message"><LoaderCircle className="fp-spin" size={30} /><b>Đang tải bản xem trước...</b></div>
        )}
        {state.status === "error" && (
          <div className="fp-card">
            <span className="fp-card-icon error"><FileWarning size={30} /></span>
            <b>Không xem trước được file này</b>
            <p>{state.message}</p>
            <button type="button" className="primary-btn" onClick={download}><Download size={16} /> Tải về</button>
          </div>
        )}
        {state.status === "unsupported" && (
          <div className="fp-card">
            <span className="fp-card-icon"><FileIcon size={30} /></span>
            <b title={file.name}>{file.name}</b>
            <small>{formatBytes(file.size)}</small>
            <p>Định dạng này chưa hỗ trợ xem trước. Vui lòng tải về để mở bằng phần mềm trên máy.</p>
            <button type="button" className="primary-btn" onClick={download}><Download size={16} /> Tải về</button>
          </div>
        )}
        {state.status === "ready" && kind === "pdf" && <iframe className="fp-pdf" src={state.url} title={file.name} onLoad={() => setTimeout(() => root.current?.focus(), 50)} />}
        {state.status === "ready" && kind === "image" && <ImageViewer key={state.url} src={state.url} alt={file.name} onPrev={() => go(-1)} onNext={() => go(1)} />}
        {state.status === "ready" && kind === "text" && (
          <div className="fp-text">
            {state.truncated && <p className="fp-note">File lớn, chỉ hiển thị 2 MB đầu tiên. Tải về để xem toàn bộ.</p>}
            <pre>{state.text || "(File trống)"}</pre>
          </div>
        )}

        {files.length > 1 && (
          <>
            <button type="button" className="fp-nav prev" onClick={() => go(-1)} disabled={index === 0} aria-label="File trước"><ChevronLeft size={26} /></button>
            <button type="button" className="fp-nav next" onClick={() => go(1)} disabled={index === files.length - 1} aria-label="File sau"><ChevronRight size={26} /></button>
          </>
        )}
      </main>
    </div>,
    document.body,
  );
}

function ImageViewer({ src, alt, onPrev, onNext }) {
  const stage = useRef(null);
  const drag = useRef(null);
  const [natural, setNatural] = useState(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [rotation, setRotation] = useState(0);
  const [scale, setScale] = useState(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  useLayoutEffect(() => {
    const element = stage.current;
    const measure = () => setBox({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const sideways = rotation % 180 !== 0;
  const fitScale = natural
    ? Math.min(1, (box.width - 48) / (sideways ? natural.height : natural.width), (box.height - 128) / (sideways ? natural.width : natural.height))
    : 1;
  const current = scale ?? fitScale;

  const zoomTo = useCallback(
    (next, point) => {
      const target = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
      const rect = stage.current.getBoundingClientRect();
      const px = point ? point.x - rect.left - rect.width / 2 : 0;
      const py = point ? point.y - rect.top - rect.height / 2 : 0;
      setOffset((o) => ({ x: px - ((px - o.x) * target) / current, y: py - ((py - o.y) * target) / current }));
      setScale(target);
    },
    [current],
  );
  const fit = useCallback(() => {
    setScale(null);
    setOffset({ x: 0, y: 0 });
  }, []);
  const actual = useCallback(() => zoomTo(1), [zoomTo]);
  const rotate = useCallback((step) => {
    setRotation((r) => (r + step + 360) % 360);
    setScale(null);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const element = stage.current;
    const onWheel = (event) => {
      event.preventDefault();
      zoomTo(current * Math.exp(-event.deltaY * 0.0015), { x: event.clientX, y: event.clientY });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [current, zoomTo]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.target.closest?.("input, textarea, select")) return;
      const keys = {
        "+": () => zoomTo(current * 1.25),
        "=": () => zoomTo(current * 1.25),
        "-": () => zoomTo(current / 1.25),
        0: fit,
        1: actual,
        r: () => rotate(90),
        R: () => rotate(-90),
        ArrowLeft: onPrev,
        ArrowRight: onNext,
      };
      if (!keys[event.key] || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      keys[event.key]();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, zoomTo, fit, actual, rotate, onPrev, onNext]);

  const pointerDown = (event) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    setDragging(true);
  };
  const pointerMove = (event) => {
    if (!drag.current) return;
    setOffset({ x: drag.current.ox + event.clientX - drag.current.x, y: drag.current.oy + event.clientY - drag.current.y });
  };
  const pointerUp = () => {
    drag.current = null;
    setDragging(false);
  };

  return (
    <div className="fp-image">
      <div
        ref={stage}
        className={`fp-image-stage ${dragging ? "dragging" : ""}`}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onDoubleClick={(event) => (scale === null ? zoomTo(1, { x: event.clientX, y: event.clientY }) : fit())}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          style={{
            width: natural?.width,
            height: natural?.height,
            opacity: natural ? 1 : 0,
            transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${current})`,
          }}
        />
      </div>
      <div className="fp-tools" role="toolbar" aria-label="Công cụ ảnh">
        <button type="button" onClick={() => zoomTo(current / 1.25)} title="Thu nhỏ (−)"><ZoomOut size={17} /></button>
        <button type="button" className="fp-zoom-value" onClick={actual} title="Kích thước thật (1)">{Math.round(current * 100)}%</button>
        <button type="button" onClick={() => zoomTo(current * 1.25)} title="Phóng to (+)"><ZoomIn size={17} /></button>
        <i />
        <button type="button" className={scale === null ? "active" : ""} onClick={fit} title="Vừa khung (0)"><Maximize size={16} /></button>
        <button type="button" className={scale === 1 ? "active" : ""} onClick={actual} title="Kích thước thật (1)"><span>1:1</span></button>
        <i />
        <button type="button" onClick={() => rotate(-90)} title="Xoay trái (Shift+R)"><RotateCcw size={16} /></button>
        <button type="button" onClick={() => rotate(90)} title="Xoay phải (R)"><RotateCw size={16} /></button>
        {natural && <small>{natural.width} × {natural.height}</small>}
      </div>
    </div>
  );
}
