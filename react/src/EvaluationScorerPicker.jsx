import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Search, UserCheck, X } from "lucide-react";
import Avatar from "./Avatar";

const fold = (text) => String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

export default function EvaluationScorerPicker({ title, subject, candidates, selected, defaultScorers, saving, onSave, onClose, bulk = false }) {
  const [picked, setPicked] = useState(() => new Set(selected));
  const [search, setSearch] = useState("");
  useEffect(() => {
    const escape = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose]);
  const toggle = (id) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const query = fold(search.trim());
  const shown = candidates.filter((candidate) => !query || fold(`${candidate.name} ${candidate.roles.join(" ")}`).includes(query));

  return createPortal(
    <div className="ev-scorer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="ev-scorer-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <span>
            <b>{title}</b>
            {subject && <small>{subject}</small>}
          </span>
          <button type="button" className="ev-scorer-close" onClick={onClose} aria-label="Đóng">
            <X size={17} />
          </button>
        </header>
        <p className="ev-scorer-default">
          <UserCheck size={14} />
          <span>
            {bulk ? (
              <>Chọn người dưới đây để chỉ định riêng cho các phiếu đã chọn — khi đó chỉ những người được chọn mới chấm được. Phiếu của chính người được chọn sẽ tự bỏ qua.</>
            ) : (
              <>Mặc định theo kỳ: {defaultScorers?.length ? <b>{defaultScorers.join(", ")}</b> : <em>chưa có người chấm</em>}. Chọn người dưới đây để chỉ định riêng cho phiếu này — khi đó chỉ những người được chọn mới chấm được.</>
            )}
          </span>
        </p>
        <label className="ev-scorer-search">
          <Search size={15} />
          <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên hoặc vai trò..." />
        </label>
        <div className="ev-scorer-options">
          {shown.map((candidate) => {
            const active = picked.has(candidate.id);
            return (
              <button key={candidate.id} type="button" className={active ? "active" : ""} onClick={() => toggle(candidate.id)} aria-pressed={active}>
                <span className="ev-scorer-check">{active && <Check size={12} strokeWidth={3} />}</span>
                <Avatar src={candidate.avatar_url} name={candidate.name} size={30} />
                <span>
                  <b>{candidate.name}</b>
                  <small>{candidate.roles.slice(0, 2).join(" · ")}</small>
                </span>
              </button>
            );
          })}
          {!shown.length && <p className="ev-muted">Không có người phù hợp.</p>}
        </div>
        <footer>
          <button type="button" className="secondary-btn" disabled={saving || (!bulk && !picked.size && !selected.length)} onClick={() => onSave([])}>
            {bulk ? "Trả về mặc định" : "Dùng mặc định"}
          </button>
          <span>{picked.size ? `Đã chọn ${picked.size} người` : "Chưa chỉ định riêng"}</span>
          <button type="button" className="primary-btn" disabled={saving || !picked.size} onClick={() => onSave([...picked])}>
            {saving ? "Đang lưu..." : "Chỉ định"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
