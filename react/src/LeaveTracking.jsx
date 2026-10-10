import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  Building2,
  CalendarDays,
  CalendarOff,
  CheckCircle2,
  ClipboardList,
  HeartHandshake,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Tags,
  Trash2,
  TriangleAlert,
  UserX,
  X,
} from "lucide-react";
import { apiJson } from "./api";
import Avatar from "./Avatar";
import Dropdown from "./Dropdown";
import MonthPicker from "./MonthPicker";
import PeoplePicker from "./PeoplePicker";
import TablePagination, { usePagination } from "./TablePagination";
import { useConfirm } from "./ConfirmDialog";
import "./LeaveTracking.css";

const SESSION_LABELS = { am: "Sáng", pm: "Chiều" };
const TYPE_TONES = { excused: "excused", unexcused: "unexcused", regime: "regime" };
const DEDUCTION_HINTS = {
  excused: "Phiếu thi đua gợi ý trừ 1đ/buổi ở tiêu chí Ngày, giờ công.",
  unexcused: "Phiếu thi đua gợi ý trừ 8đ/lần ở tiêu chí Ngày, giờ công.",
  regime: "Nghỉ chế độ không trừ điểm, nhưng không tính ngày công cao.",
};

const pad = (n) => String(n).padStart(2, "0");
const monthKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const shortDate = (value) => {
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
};
const fold = (text) => String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();


export function countSessions(start, startSession, end, endSession) {
  if (!start || !end || end < start) return 0;
  let count = 0;
  const day = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  for (; day <= last; day.setDate(day.getDate() + 1)) {
    const weekday = day.getDay();
    if (weekday === 0 || weekday === 6) continue;
    const key = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
    count += (key === start && startSession === "pm" ? 0 : 1) + (key === end && endSession === "am" ? 0 : 1);
  }
  return count;
}

const periodLabel = (record) =>
  record.starts_on === record.ends_on
    ? record.start_session === record.end_session
      ? `${SESSION_LABELS[record.start_session]} ${shortDate(record.starts_on)}`
      : shortDate(record.starts_on)
    : `${SESSION_LABELS[record.start_session]} ${shortDate(record.starts_on)} → ${SESSION_LABELS[record.end_session]} ${shortDate(record.ends_on)}`;

export default function LeaveTracking() {
  const confirm = useConfirm();
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [keyword, setKeyword] = useState("");
  const [unitId, setUnitId] = useState("");
  const [type, setType] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiJson(`/api/leave-records?month=${month}${unitId ? `&unit_id=${unitId}` : ""}${type ? `&type=${type}` : ""}`));
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [month, unitId, type]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!success) return undefined;
    const timer = setTimeout(() => setSuccess(""), 3500);
    return () => clearTimeout(timer);
  }, [success]);

  const rows = useMemo(
    () => (data?.data ?? []).filter((record) => !keyword.trim() || fold(`${record.employee.name} ${record.employee.code}`).includes(fold(keyword.trim()))),
    [data, keyword],
  );
  const pager = usePagination(rows, 10);
  const abilities = data?.abilities ?? {};
  const wide = abilities.can_view_all || abilities.can_manage;
  const canReport = Boolean(abilities.own_employee_id || abilities.can_manage);

  const stats = useMemo(() => {
    const sum = (kind) => rows.filter((r) => r.type === kind).reduce((total, r) => total + r.sessions_in_month, 0);
    return {
      excused: sum("excused"),
      unexcused: rows.filter((r) => r.type === "unexcused").length,
      regime: sum("regime"),
      people: new Set(rows.map((r) => r.employee.id)).size,
    };
  }, [rows]);

  const remove = async (record) => {
    const ok = await confirm({
      tone: "danger",
      title: "Xóa bản ghi nghỉ?",
      message: `${record.employee.name} · ${periodLabel(record)}`,
      confirmText: "Xóa",
      cancelText: "Hủy",
    });
    if (!ok) return;
    try {
      const payload = await apiJson(`/api/leave-records/${record.id}`, { method: "DELETE" });
      setSuccess(payload.message);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const resetFilters = () => {
    setKeyword("");
    setUnitId("");
    setType("");
    pager.reset();
  };

  const types = data?.types ?? {};
  const regimeKinds = data?.regime_kinds ?? {};

  return (
    <div className="teacher-page leave-page">
      {success && (
        <div className="success-toast" role="status">
          <span>
            <CheckCircle2 size={20} />
          </span>
          <div>
            <b>Thành công</b>
            <small>{success}</small>
          </div>
          <button aria-label="Đóng thông báo" onClick={() => setSuccess("")}>
            <X size={17} />
          </button>
        </div>
      )}
      {error && (
        <div className="teacher-error-toast" role="alert">
          <span>
            <TriangleAlert size={20} />
          </span>
          <div>
            <b>Không thể thực hiện</b>
            <small>{error}</small>
          </div>
          <button aria-label="Đóng thông báo lỗi" onClick={() => setError("")}>
            <X size={17} />
          </button>
        </div>
      )}

      <section className="teacher-stats">
        <article>
          <span className="icon-bubble blue">
            <CalendarDays size={26} strokeWidth={2.1} />
          </span>
          <span>
            <b>{stats.excused}</b>
            <small>Buổi nghỉ có phép</small>
            <em>Gợi ý trừ 1đ/buổi</em>
          </span>
        </article>
        <article>
          <span className="icon-bubble orange">
            <UserX size={26} strokeWidth={2.1} />
          </span>
          <span>
            <b>{stats.unexcused}</b>
            <small>Lần nghỉ không phép</small>
            <em>Gợi ý trừ 8đ/lần</em>
          </span>
        </article>
        <article>
          <span className="icon-bubble green">
            <HeartHandshake size={26} strokeWidth={2.1} />
          </span>
          <span>
            <b>{stats.regime}</b>
            <small>Buổi nghỉ chế độ</small>
            <em>Không trừ điểm</em>
          </span>
        </article>
        <article>
          <span className="icon-bubble purple">
            <ClipboardList size={26} strokeWidth={2.1} />
          </span>
          <span>
            <b>{stats.people}</b>
            <small>{wide ? "Nhân sự có nghỉ" : "Bản ghi của bạn"}</small>
            <em>Tháng {Number(month.slice(5))}/{month.slice(0, 4)}</em>
          </span>
        </article>
      </section>

      <section className="teacher-toolbar-card">
        <div className="teacher-title">
          <div>
            <h2>Theo dõi nghỉ</h2>
            <p>{wide ? "Ghi nhận ngày nghỉ của nhân sự, làm căn cứ gợi ý điểm trừ trên phiếu thi đua" : "Báo các buổi bạn đã xin nghỉ để phiếu thi đua gợi ý đúng điểm trừ"}</p>
          </div>
          <div>
            {canReport && (
              <button className="primary-btn" onClick={() => setEditing({})}>
                <Plus size={17} /> {abilities.can_manage ? "Ghi nhận nghỉ" : "Báo nghỉ"}
              </button>
            )}
          </div>
        </div>
        <div className="filters leave-filters">
          <MonthPicker value={month} onChange={(value) => { setMonth(value); pager.reset(); }} />
          {wide && (
            <label className="teacher-search">
              <Search size={17} />
              <input value={keyword} onChange={(e) => { setKeyword(e.target.value); pager.reset(); }} placeholder="Tìm theo tên hoặc mã nhân sự..." />
            </label>
          )}
          {wide && data?.units?.length > 0 && (
            <Dropdown
              label="Tổ / nhóm"
              icon={Building2}
              value={unitId}
              options={[{ value: "", label: "Tất cả tổ, nhóm" }, ...data.units.map((unit) => ({ value: String(unit.id), label: unit.parent_id ? `— ${unit.name}` : unit.name }))]}
              onChange={(value) => { setUnitId(value); pager.reset(); }}
            />
          )}
          <Dropdown
            label="Loại nghỉ"
            icon={Tags}
            value={type}
            options={[{ value: "", label: "Tất cả loại nghỉ" }, ...Object.entries(types).map(([value, label]) => ({ value, label }))]}
            onChange={(value) => { setType(value); pager.reset(); }}
          />
          {(keyword || unitId || type) && (
            <button className="reset-btn" onClick={resetFilters}>
              <RotateCcw size={15} /> Đặt lại
            </button>
          )}
        </div>
      </section>

      <section className="teacher-table-card">
        <div className="table-wrap">
          <table className="leave-table">
            <thead>
              <tr>
                <th>Nhân sự</th>
                <th>Thời gian nghỉ</th>
                <th className="num">Số buổi</th>
                <th>Loại</th>
                <th>Lý do</th>
                <th>Ghi nhận bởi</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {pager.rows.map((record) => (
                <tr key={record.id}>
                  <td>
                    <div className="teacher-identity">
                      {record.employee.avatar_url ? <img src={record.employee.avatar_url} alt="" /> : <Avatar as="span" name={record.employee.name} />}
                      <div>
                        <b>{record.employee.name}</b>
                        <small>
                          {record.employee.code}
                          {record.employee.units?.[0] ? ` · ${record.employee.units[0]}` : ""}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="leave-period">{periodLabel(record)}</span>
                  </td>
                  <td className="num">
                    <b>{record.sessions}</b>
                    {record.sessions_in_month !== record.sessions && <small className="leave-in-month">{record.sessions_in_month} trong tháng</small>}
                  </td>
                  <td>
                    <span className={`leave-type ${TYPE_TONES[record.type]}`}>
                      {types[record.type]}
                      {record.regime_kind && <em> · {regimeKinds[record.regime_kind]}</em>}
                    </span>
                  </td>
                  <td className="leave-reason">{record.reason || <span className="muted-cell">—</span>}</td>
                  <td>
                    <span className="leave-by">{record.self_reported ? "Tự báo" : record.created_by ?? "—"}</span>
                  </td>
                  <td>
                    {record.can_edit ? (
                      <div className="row-actions">
                        <button title="Chỉnh sửa" onClick={() => setEditing(record)}>
                          <Pencil size={15} />
                        </button>
                        <button title="Xóa" className="delete" onClick={() => remove(record)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ) : (
                      <span className="muted-cell">Chỉ xem</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading ? (
            <div className="empty-state">
              <Activity className="loading-icon" size={36} />
              <b>Đang tải dữ liệu nghỉ…</b>
            </div>
          ) : (
            !rows.length && (
              <div className="empty-state">
                <CalendarOff size={36} />
                <b>Chưa có bản ghi nghỉ nào trong tháng</b>
                <small>{canReport ? "Bấm “" + (abilities.can_manage ? "Ghi nhận nghỉ" : "Báo nghỉ") + "” để thêm." : "Tài khoản chưa có hồ sơ nhân sự."}</small>
              </div>
            )
          )}
        </div>
        <TablePagination pager={pager} noun="bản ghi" />
      </section>

      {editing && data && (
        <LeaveForm
          record={editing.id ? editing : null}
          data={data}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            setSuccess(message);
            load();
          }}
        />
      )}
    </div>
  );
}

function LeaveForm({ record, data, onClose, onSaved }) {
  const { abilities, people, units, types, regime_kinds: regimeKinds } = data;
  const [form, setForm] = useState(() =>
    record
      ? {
          employee_id: record.employee.id,
          type: record.type,
          regime_kind: record.regime_kind ?? "",
          starts_on: record.starts_on,
          start_session: record.start_session,
          ends_on: record.ends_on,
          end_session: record.end_session,
          sessions: record.sessions,
          reason: record.reason ?? "",
        }
      : {
          employee_id: abilities.own_employee_id ?? null,
          type: "excused",
          regime_kind: "",
          starts_on: today(),
          start_session: "am",
          ends_on: today(),
          end_session: "pm",
          sessions: null,
          reason: "",
        },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [picking, setPicking] = useState(false);
  const pickerRef = useRef(null);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const computed = countSessions(form.starts_on, form.start_session, form.ends_on, form.end_session);
  const sessions = form.sessions ?? computed;
  const person = people.find((p) => p.id === form.employee_id) ?? (record ? record.employee : null);
  const typeOptions = Object.entries(types).filter(([value]) => value !== "unexcused" || abilities.can_manage);

  useEffect(() => {
    const escape = (event) => event.key === "Escape" && !picking && onClose();
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose, picking]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = await apiJson(record ? `/api/leave-records/${record.id}` : "/api/leave-records", {
        method: record ? "PUT" : "POST",
        body: {
          ...form,
          employee_id: abilities.can_manage ? form.employee_id : undefined,
          regime_kind: form.type === "regime" ? form.regime_kind : null,
          sessions,
        },
      });
      onSaved(payload.message);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  const sessionToggle = (key) => (
    <div className="leave-session" role="radiogroup">
      {Object.entries(SESSION_LABELS).map(([value, label]) => (
        <label key={value} className={form[key] === value ? "active" : ""}>
          <input type="radio" checked={form[key] === value} onChange={() => set(key, value)} />
          {label}
        </label>
      ))}
    </div>
  );

  return createPortal(
    <div className="leave-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="leave-dialog" role="dialog" aria-modal="true" aria-label={record ? "Sửa bản ghi nghỉ" : "Báo nghỉ"} onSubmit={submit}>
        <header>
          <span>
            <b>{record ? "Sửa bản ghi nghỉ" : abilities.can_manage ? "Ghi nhận nghỉ" : "Báo nghỉ"}</b>
            <small>Chỉ ghi nhận — việc xin phép đã thực hiện trực tiếp với Ban giám hiệu.</small>
          </span>
          <button type="button" className="leave-close" onClick={onClose} aria-label="Đóng">
            <X size={17} />
          </button>
        </header>
        <div className="leave-body">
          {abilities.can_manage && (
            <div className="leave-field">
              <span className="field-label">Người nghỉ <span className="required-mark">*</span></span>
              <button type="button" ref={pickerRef} className="leave-person" onClick={() => setPicking(true)}>
                {person ? (
                  <>
                    {person.avatar_url ? <img src={person.avatar_url} alt="" /> : <Avatar as="span" name={person.name} size={26} />}
                    <span>
                      <b>{person.name}</b>
                      <small>{person.code}</small>
                    </span>
                  </>
                ) : (
                  <span className="muted-cell">Chọn nhân sự…</span>
                )}
                <em>Đổi</em>
              </button>
              {picking && (
                <PeoplePicker
                  people={people}
                  units={units.map((unit) => ({ ...unit, short_name: unit.name }))}
                  selectedPeople={form.employee_id ? [form.employee_id] : []}
                  onTogglePerson={(id) => {
                    set("employee_id", id);
                    setPicking(false);
                  }}
                  title="Chọn người nghỉ"
                  anchorRef={pickerRef}
                  onClose={() => setPicking(false)}
                />
              )}
            </div>
          )}

          <div className="leave-field">
            <span className="field-label">Loại nghỉ</span>
            <div className="leave-types">
              {typeOptions.map(([value, label]) => (
                <label key={value} className={`${TYPE_TONES[value]} ${form.type === value ? "active" : ""}`}>
                  <input type="radio" checked={form.type === value} onChange={() => set("type", value)} />
                  {label}
                </label>
              ))}
            </div>
            <small className="leave-hint">{DEDUCTION_HINTS[form.type]}</small>
          </div>

          {form.type === "regime" && (
            <div className="leave-field">
              <span className="field-label">Loại chế độ <span className="required-mark">*</span></span>
              <Dropdown
                label="Loại chế độ"
                value={form.regime_kind}
                options={[{ value: "", label: "Chọn loại chế độ…", disabled: true }, ...Object.entries(regimeKinds).map(([value, label]) => ({ value, label }))]}
                onChange={(value) => set("regime_kind", value)}
              />
            </div>
          )}

          <div className="leave-range">
            <div className="leave-field">
              <span className="field-label">Từ ngày</span>
              <input
                type="date"
                value={form.starts_on}
                onChange={(e) => setForm((c) => ({ ...c, starts_on: e.target.value, ends_on: c.ends_on < e.target.value ? e.target.value : c.ends_on, sessions: null }))}
                required
              />
              {sessionToggle("start_session")}
            </div>
            <div className="leave-field">
              <span className="field-label">Đến ngày</span>
              <input type="date" value={form.ends_on} min={form.starts_on} onChange={(e) => setForm((c) => ({ ...c, ends_on: e.target.value, sessions: null }))} required />
              {sessionToggle("end_session")}
            </div>
          </div>

          <div className="leave-field leave-count">
            <span className="field-label">Số buổi nghỉ</span>
            <div>
              <input type="number" min={1} value={sessions} onChange={(e) => set("sessions", e.target.value === "" ? null : Number(e.target.value))} />
              <small>
                {form.sessions === null || form.sessions === computed ? (
                  <>Tự tính {computed} buổi (bỏ qua thứ Bảy, Chủ nhật)</>
                ) : (
                  <>
                    Đã sửa tay ·{" "}
                    <button type="button" className="link-btn" onClick={() => set("sessions", null)}>
                      Dùng số tự tính ({computed})
                    </button>
                  </>
                )}
              </small>
            </div>
          </div>

          <div className="leave-field">
            <span className="field-label">Lý do</span>
            <textarea rows={3} value={form.reason} onChange={(e) => set("reason", e.target.value)} placeholder="Ví dụ: việc gia đình, đi khám bệnh…" />
          </div>

          {error && (
            <p className="leave-error" role="alert">
              <TriangleAlert size={15} /> {error}
            </p>
          )}
        </div>
        <footer>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Hủy
          </button>
          <button className="primary-btn" disabled={saving || !form.employee_id || (form.type === "regime" && !form.regime_kind) || sessions < 1}>
            {saving ? "Đang lưu..." : record ? "Lưu thay đổi" : "Ghi nhận"}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
