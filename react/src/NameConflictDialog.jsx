import { useCallback, useState } from "react";
import { CopyPlus, FileWarning, Replace, SkipForward } from "lucide-react";
import "./NameConflictDialog.css";

export function useNameConflicts() {
  const [pending, setPending] = useState(null);
  const ask = useCallback((conflicts) => new Promise((resolve) => setPending({ conflicts, resolve })), []);
  const element = pending ? (
    <NameConflictDialog
      conflicts={pending.conflicts}
      onDone={(answers) => {
        pending.resolve(answers);
        setPending(null);
      }}
    />
  ) : null;
  return [ask, element];
}

function NameConflictDialog({ conflicts, onDone }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [applyAll, setApplyAll] = useState(false);
  const current = conflicts[index];
  const remaining = conflicts.length - index;

  const choose = (action) => {
    const next = [...answers];
    const targets = applyAll ? conflicts.slice(index) : [current];
    targets.forEach((conflict) => {
      next.push({ ...conflict, resolution: action === "replace" && !conflict.can_replace ? "keep" : action });
    });
    if (next.length >= conflicts.length) return onDone(next);
    setAnswers(next);
    setIndex(next.length);
  };

  const isFolder = current.existing_type === "folder";

  return (
    <div className="modal-backdrop name-conflict-backdrop">
      <div className="name-conflict-dialog" role="alertdialog" aria-modal="true" aria-label="Trùng tên">
        <header>
          <span>
            <FileWarning size={20} />
          </span>
          <div>
            <h3>{isFolder ? "Đã có thư mục cùng tên" : "File đã tồn tại"}</h3>
            <p>
              Thư mục đích đã có {isFolder ? "thư mục" : "mục"} tên <b>“{current.name}”</b>.
              {conflicts.length > 1 && ` (${index + 1}/${conflicts.length})`}
            </p>
          </div>
        </header>
        <div className="ncd-options">
          {current.can_replace && (
            <button type="button" onClick={() => choose("replace")}>
              <Replace size={18} />
              <span>
                <b>Thay thế</b>
                <small>Giữ nguyên chia sẻ, mô tả và liên kết công việc; chỉ đổi nội dung file.</small>
              </span>
            </button>
          )}
          <button type="button" onClick={() => choose("keep")}>
            <CopyPlus size={18} />
            <span>
              <b>Giữ cả hai</b>
              <small>Mục mới sẽ có tên “{current.suggested_name}”.</small>
            </span>
          </button>
          <button type="button" onClick={() => choose("skip")}>
            <SkipForward size={18} />
            <span>
              <b>Bỏ qua</b>
              <small>Không thêm mục này vào thư mục đích.</small>
            </span>
          </button>
        </div>
        <footer>
          {remaining > 1 ? (
            <label>
              <input type="checkbox" checked={applyAll} onChange={(event) => setApplyAll(event.target.checked)} />
              Áp dụng cho {remaining - 1} mục trùng tên còn lại
            </label>
          ) : (
            <span />
          )}
          <button type="button" className="secondary-btn" onClick={() => onDone(null)}>
            Hủy thao tác
          </button>
        </footer>
      </div>
    </div>
  );
}
