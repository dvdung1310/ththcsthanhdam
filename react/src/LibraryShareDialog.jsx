import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Globe2, Plus, Share2, Users, X } from "lucide-react";
import { apiJson } from "./api";
import { useConfirm } from "./ConfirmDialog";
import PeoplePicker, { useOutsideClose } from "./PeoplePicker";
import "./LibraryShareDialog.css";
import Avatar from "./Avatar";

export const ACCESS_LABELS = { read: "Xem", edit: "Chỉnh sửa" };

const keyOf = (row) => (row.user_id ? `u${row.user_id}` : row.department_id ? `d${row.department_id}` : "all");

export default function LibraryShareDialog({ node, onClose, onSaved }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState(null);
  const [baseline, setBaseline] = useState("[]");
  const [inherited, setInherited] = useState([]);
  const [canEveryone, setCanEveryone] = useState(false);
  const [options, setOptions] = useState({ people: [], units: [] });
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const close = useCallback(() => setPicking(false), []);
  const pickerRef = useOutsideClose(picking, close);
  const anchorRef = useRef(null);

  useEffect(() => {
    Promise.all([apiJson(`/api/library/nodes/${node.id}/shares`), apiJson("/api/library/share-options")])
      .then(([shares, opts]) => {
        const direct = shares.data.map((row) => ({ ...row, key: keyOf(row) }));
        setRows(direct);
        setBaseline(JSON.stringify(direct.map(({ key, access }) => [key, access])));
        setInherited(shares.inherited);
        setCanEveryone(shares.can_share_everyone);
        setOptions(opts);
      })
      .catch((e) => setError(e.message));
  }, [node.id]);

  const dirty = rows && JSON.stringify(rows.map(({ key, access }) => [key, access])) !== baseline;
  const peopleById = useMemo(() => Object.fromEntries(options.people.map((p) => [p.id, p])), [options.people]);
  const unitsById = useMemo(() => Object.fromEntries(options.units.map((u) => [u.id, u])), [options.units]);

  const toggleRow = (row) =>
    setRows((current) => (current.some((r) => r.key === row.key) ? current.filter((r) => r.key !== row.key) : [...current, { ...row, access: "read" }]));
  const setAccess = (key, access) => setRows((current) => current.map((r) => (r.key === key ? { ...r, access } : r)));

  const requestClose = async () => {
    if (dirty && !(await confirm({ tone: "warning", title: "Bỏ các thay đổi chia sẻ?", message: "Những thay đổi quyền bạn vừa chọn sẽ không được lưu.", confirmText: "Bỏ thay đổi", cancelText: "Tiếp tục chỉnh sửa" }))) return;
    onClose();
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = await apiJson(`/api/library/nodes/${node.id}/shares`, {
        method: "PUT",
        body: { shares: rows.map((r) => ({ user_id: r.user_id ?? null, department_id: r.department_id ?? null, access: r.access })) },
      });
      onSaved?.(payload.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const everyone = rows?.find((r) => r.key === "all");

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && requestClose()}>
      <div className="library-share-dialog" role="dialog" aria-modal="true" aria-label={`Chia sẻ ${node.name}`}>
        <header>
          <span>
            <Share2 size={19} />
          </span>
          <div>
            <h3>Chia sẻ “{node.name}”</h3>
            <p>{node.type === "folder" ? "Quyền áp dụng cho toàn bộ nội dung bên trong thư mục." : "Quyền áp dụng cho file này."}</p>
          </div>
          <button type="button" onClick={requestClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </header>

        {!rows ? (
          <p className="lsd-loading">{error || "Đang tải..."}</p>
        ) : (
          <>
            <div className="lsd-add" ref={pickerRef}>
              <button type="button" ref={anchorRef} className="lsd-add-btn" onClick={() => setPicking(!picking)} aria-expanded={picking}>
                <Plus size={16} /> Thêm tổ / nhóm / cá nhân
              </button>
              {canEveryone && (
                <label className="lsd-everyone">
                  <input type="checkbox" checked={!!everyone} onChange={() => toggleRow({ key: "all", kind: "everyone", user_id: null, department_id: null, name: "Mọi người trong trường" })} />
                  <Globe2 size={15} /> Mọi người trong trường
                </label>
              )}
              {picking && (
                <PeoplePicker
                  title="Chọn người được chia sẻ"
                  anchorRef={anchorRef}
                  people={options.people}
                  units={options.units}
                  selectedPeople={rows.filter((r) => r.user_id).map((r) => r.user_id)}
                  selectedUnits={rows.filter((r) => r.department_id).map((r) => r.department_id)}
                  onTogglePerson={(id) => toggleRow({ key: `u${id}`, kind: "user", user_id: id, department_id: null, name: peopleById[id]?.name, avatar_url: peopleById[id]?.avatar_url })}
                  onToggleUnit={(id) => toggleRow({ key: `d${id}`, kind: "unit", user_id: null, department_id: id, name: unitsById[id]?.name })}
                />
              )}
            </div>

            <div className="lsd-list">
              {rows.map((row) => (
                <div className="lsd-row" key={row.key}>
                  <SubjectIcon row={row} />
                  <b>{row.name}</b>
                  <select value={row.access} onChange={(event) => setAccess(row.key, event.target.value)}>
                    {Object.entries(ACCESS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => toggleRow(row)} disabled={row.key === "all" && !canEveryone} aria-label="Bỏ chia sẻ">
                    <X size={15} />
                  </button>
                </div>
              ))}
              {!rows.length && <p className="lsd-empty">Chưa chia sẻ trực tiếp cho ai.</p>}
            </div>

            {!!inherited.length && (
              <div className="lsd-inherited">
                <h4>Kế thừa từ thư mục cha</h4>
                {inherited.map((row) => (
                  <div className="lsd-row muted" key={`${row.id}`}>
                    <SubjectIcon row={row} />
                    <b>
                      {row.name}
                      <small>từ “{row.from}”</small>
                    </b>
                    <em>{ACCESS_LABELS[row.access]}</em>
                  </div>
                ))}
              </div>
            )}

            <p className="lsd-legend">
              <b>Xem</b>: mở và tải về · <b>Chỉnh sửa</b>: thêm file, tạo thư mục, đổi tên, di chuyển và chia sẻ tiếp
            </p>
            {error && <p className="lsd-error">{error}</p>}
          </>
        )}

        <footer>
          <button type="button" className="secondary-btn" onClick={requestClose}>
            Hủy
          </button>
          <button type="button" className="primary-btn" onClick={save} disabled={!dirty || saving}>
            {saving ? "Đang lưu..." : "Lưu chia sẻ"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function SubjectIcon({ row }) {
  if (row.kind === "everyone") return <i className="lsd-icon everyone"><Globe2 size={15} /></i>;
  if (row.kind === "unit") return <i className="lsd-icon unit"><Users size={15} /></i>;
  return row.avatar_url ? <img className="lsd-icon" src={row.avatar_url} alt="" /> : <Avatar className="lsd-icon user" name={row.name} />;
}
