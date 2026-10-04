import { useState } from "react";
import {
  Activity,
  CalendarClock,
  ClipboardCheck,
  Clock3,
  UserRoundCheck,
  Search,
  SlidersHorizontal,
  RotateCcw,
} from "lucide-react";
import "./TaskActionToolbar.css";

export const emptyActionFilters = {
  search: "",
  status: "",
  teacher_id: "",
  deadline: "",
  priority: "",
  category_id: "",
  action: "",
  created_by: "",
  organization_id: "",
  assigned_from: "",
  assigned_to: "",
  due_from: "",
  due_to: "",
  late: "",
};
const statuses = {
  not_started: "Chưa thực hiện",
  in_progress: "Đang thực hiện",
  waiting_approval: "Chờ duyệt",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
};

export function TaskActionCards({ stats, action, onSelect }) {
  return (
    <section className="task-action-cards">
      {[
        [
          "not_started",
          "Chưa thực hiện",
          ClipboardCheck,
          "purple",
          "Cần bắt đầu xử lý",
        ],
        [
          "in_progress",
          "Đang thực hiện",
          Activity,
          "blue",
          "Tiếp tục thực hiện",
        ],
        ["soon", "Sắp đến hạn", CalendarClock, "orange", "Còn tối đa 24 giờ"],
        ["overdue", "Quá hạn", Clock3, "red", "Cần xử lý ngay"],
        [
          "my_review",
          "Chờ tôi duyệt",
          UserRoundCheck,
          "pink",
          "Các việc bạn có quyền duyệt",
        ],
      ].map(([key, label, Icon, tone, note]) => (
        <button
          key={key}
          className={`${tone} ${action === key ? "selected" : ""}`}
          aria-pressed={action === key}
          onClick={() => onSelect(action === key ? "" : key)}
        >
          <i>
            <Icon size={23} />
          </i>
          <div>
            <b>{stats[key] || 0}</b>
            <strong>{label}</strong>
            <small>{note}</small>
          </div>
        </button>
      ))}
    </section>
  );
}

export default function TaskActionFilters({
  filters,
  refs,
  onChange,
  onReset,
}) {
  const [advanced, setAdvanced] = useState(false);
  const change = (key, value) => {
    const next = { ...filters, [key]: value };
    if (["status", "deadline"].includes(key))
      next.action = "";
    if (key === "deadline") {
      if (value === "custom") setAdvanced(true);
      else {
        next.due_from = "";
        next.due_to = "";
      }
    }
    onChange(next);
  };
  const select = (key, title, options) => (
    <select
      aria-label={title}
      value={filters[key]}
      onChange={(e) => change(key, e.target.value)}
    >
      <option value="">{title}</option>
      {options.map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
  const advancedKeys = [
    "created_by",
    "organization_id",
    "assigned_from",
    "assigned_to",
    "due_from",
    "due_to",
    "late",
  ];
  const count = advancedKeys.filter((key) => filters[key] !== "").length;
  const dateField = (key, title) => (
    <label>
      {title}
      <input
        type="date"
        value={filters[key]}
        onChange={(e) => change(key, e.target.value)}
      />
    </label>
  );
  return (
    <div className="task-action-filter-area">
      <div className="task-action-main-filters">
        <label className="action-task-search">
          <Search size={17} />
          <input
            aria-label="Tìm kiếm công việc"
            value={filters.search}
            onChange={(e) => change("search", e.target.value)}
            placeholder="Tìm kiếm công việc…"
          />
        </label>
        {select("status", "Trạng thái", Object.entries(statuses))}
        {select(
          "teacher_id",
          "Người thực hiện",
          (refs.filter_teachers || []).map((t) => [t.id, t.name]),
        )}
        {select("deadline", "Thời hạn", [
          ["today", "Hôm nay"],
          ["tomorrow", "Ngày mai"],
          ["next7", "7 ngày tới"],
          ["soon", "Sắp quá hạn (<24h)"],
          ["overdue", "Đã quá hạn"],
          ["custom", "Tùy chọn thời gian"],
        ])}
        {select("priority", "Ưu tiên", [
          ["low", "Thấp"],
          ["normal", "Bình thường"],
          ["high", "Cao"],
          ["urgent", "Khẩn cấp"],
        ])}
        {select(
          "category_id",
          "Loại nhiệm vụ",
          (refs.filter_categories || []).map((t) => [t.id, t.name]),
        )}
        <button
          className={advanced || count ? "active" : ""}
          aria-expanded={advanced}
          onClick={() => setAdvanced(!advanced)}
        >
          <SlidersHorizontal size={15} /> Bộ lọc +{" "}
          {count > 0 ? `(${count})` : ""}
        </button>
        <button onClick={onReset}>
          <RotateCcw size={15} /> Đặt lại
        </button>
      </div>
      {advanced && (
        <div className="task-action-advanced">
          <label>
            Người giao việc
            {select(
              "created_by",
              "Tất cả người giao",
              (refs.reviewers || []).map((u) => [u.id, u.name]),
            )}
          </label>
          <label>
            Tổ / nhóm
            {select(
              "organization_id",
              "Tất cả tổ, nhóm",
              (refs.filter_departments || refs.departments || []).map((d) => [
                d.id,
                d.name,
              ]),
            )}
          </label>
          {dateField("assigned_from", "Ngày giao từ")}
          {dateField("assigned_to", "Ngày giao đến")}
          {dateField("due_from", "Hạn hoàn thành từ")}
          {dateField("due_to", "Hạn hoàn thành đến")}
          <label>
            Trễ hạn
            {select("late", "Có / không bị trễ", [
              ["yes", "Có bị trễ"],
              ["no", "Không bị trễ"],
            ])}
          </label>
          <p>Khoảng ngày bao gồm cả ngày đầu và ngày cuối.</p>
        </div>
      )}
      {filters.action && (
        <div className="task-action-active">
          Đang lọc theo thẻ:{" "}
          <b>
            {
              {
                not_started: "Chưa thực hiện",
                in_progress: "Đang thực hiện",
                soon: "Sắp đến hạn",
                overdue: "Quá hạn",
                my_review: "Chờ tôi duyệt",
              }[filters.action]
            }
          </b>
          <button onClick={() => change("action", "")}>Bỏ lọc thẻ</button>
        </div>
      )}
    </div>
  );
}
