import { useEffect, useState } from "react";
import {
  Activity,
  Award,
  Bell,
  Bot,
  BriefcaseBusiness,
  CalendarCheck,
  ChartNoAxesColumnIncreasing,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Database,
  FileBarChart,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Menu,
  MessageCircle,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  TriangleAlert,
  UserRoundCog,
  Users,
  X,
  Plus,
  Pencil,
  Trash2,
  SlidersHorizontal,
  Download,
  Mail,
  Phone,
  UserCheck,
  UserX,
  RotateCcw,
  ChevronLeft,
} from "lucide-react";
import "./App.css";
import "./TeacherManagement.css";
import "./TeacherAvatar.css";
import "./TeacherConfiguration.css";
import "./TeacherErrorToast.css";
import "./Typography.css";
import "./ApiStates.css";
import TaskManagement from "./TaskManagement";
import TaskConfiguration from "./TaskConfiguration";
import RoleManagement from "./RoleManagement";
import KpiReport from "./KpiReport";
import ManagementDashboard from "./ManagementDashboard";
import LoginPage from "./LoginPage";
import NotificationCenter from "./NotificationCenter";
import AiAssistant from "./AiAssistant";
import PersonalProfile from "./PersonalProfile";
import DocumentManagement from "./DocumentManagement";
import { apiFetch, getToken, setToken } from "./api";
import "./PermissionStates.css";
import "./SystemTypography.css";
import "./GlobalLoading.css";
import "./NotificationTaskStates.css";

const navItems = [
  ["Tổng quan", LayoutDashboard],
  ["KPI & Thống kê", ChartNoAxesColumnIncreasing],
  ["Giao việc", ClipboardCheck],
  ["Dữ liệu dùng chung", Database],
  ["Quản lý giáo viên", Users],
  ["Cấu hình giao việc", Settings],
  ["Phân quyền", ShieldCheck],
  ["Thông tin cá nhân", UserRoundCog],
];

const _legacyStats = [
  {
    value: "128",
    label: "Công việc được giao",
    change: "12%",
    positive: true,
    icon: ClipboardCheck,
    tone: "purple",
  },
  {
    value: "64",
    label: "Đang thực hiện",
    change: "8%",
    positive: true,
    icon: Activity,
    tone: "blue",
  },
  {
    value: "42",
    label: "Hoàn thành",
    change: "18%",
    positive: true,
    icon: CheckCircle2,
    tone: "green",
  },
  {
    value: "9",
    label: "Quá hạn",
    change: "25%",
    positive: false,
    icon: Clock3,
    tone: "orange",
  },
  {
    value: "85.6",
    label: "Điểm KPI trung bình",
    change: "6.5 điểm",
    positive: true,
    icon: Star,
    tone: "pink",
  },
];

const _legacyModules = [
  {
    title: "Quản lý giáo viên",
    icon: Users,
    tone: "purple",
    items: [
      "Hồ sơ giáo viên",
      "Phân nhóm tổ / bộ môn / khối",
      "Phân quyền & vai trò",
      "Lịch sử công việc & đánh giá",
    ],
  },
  {
    title: "Giao việc",
    icon: BriefcaseBusiness,
    tone: "blue",
    badge: "8",
    items: [
      "Tạo và giao công việc",
      "Theo dõi tiến độ",
      "Đính kèm tài liệu",
      "Nộp minh chứng & duyệt",
    ],
  },
  {
    title: "KPI giáo viên",
    icon: TrendingUp,
    tone: "green",
    items: [
      "Bộ tiêu chí KPI",
      "Thiết lập trọng số",
      "Tính điểm tự động",
      "Xếp loại giáo viên",
    ],
  },
  {
    title: "Đánh giá công việc",
    icon: Star,
    tone: "orange",
    items: [
      "Tự đánh giá",
      "Tổ trưởng đánh giá",
      "BGH đánh giá",
      "Lịch sử đánh giá",
    ],
  },
  {
    title: "Tiến độ & hoàn thành",
    icon: ChartNoAxesColumnIncreasing,
    tone: "cyan",
    items: [
      "Dashboard tổng quan",
      "Theo dõi tiến độ",
      "Cảnh báo sắp quá hạn",
      "Tỷ lệ hoàn thành",
    ],
  },
  {
    title: "Xếp hạng / Thi đua",
    icon: Award,
    tone: "pink",
    items: [
      "Bảng xếp hạng",
      "Xếp loại giáo viên",
      "Top giáo viên xuất sắc",
      "Lịch sử thi đua",
    ],
  },
  {
    title: "Báo cáo",
    icon: FileBarChart,
    tone: "blue",
    items: [
      "Báo cáo KPI",
      "Báo cáo công việc",
      "Báo cáo theo thời gian",
      "Xuất Excel / PDF",
    ],
  },
  {
    title: "Thông báo & nhắc việc",
    icon: Bell,
    tone: "orange",
    badge: "12",
    items: [
      "Thông báo giao việc",
      "Nhắc việc sắp đến hạn",
      "Cảnh báo quá hạn",
      "Thông báo kết quả",
    ],
  },
  {
    title: "Kho dữ liệu dùng chung",
    icon: Database,
    tone: "purple",
    items: [
      "Kho tài liệu dùng chung",
      "Phân loại theo phòng ban",
      "Tìm kiếm & tra cứu",
      "Lịch sử cập nhật",
    ],
  },
  {
    title: "Xin nghỉ & phê duyệt",
    icon: CalendarCheck,
    tone: "green",
    items: [
      "Giáo viên xin nghỉ",
      "Lãnh đạo phê duyệt",
      "Thông báo dạy thay",
      "Lịch sử nghỉ",
    ],
  },
  {
    title: "Quản lý văn bản",
    icon: FileText,
    tone: "blue",
    items: [
      "Văn bản từ cấp trên",
      "Văn bản nhà trường",
      "Phân loại & tìm kiếm",
      "Liên kết nhiệm vụ",
    ],
  },
  {
    title: "Dạy thay / Dạy bù",
    icon: UserRoundCog,
    tone: "orange",
    items: [
      "Tạo yêu cầu dạy thay",
      "Phân công dạy thay",
      "Theo dõi lịch sử",
      "Tính KPI liên quan",
    ],
  },
];

const _legacyTeams = [
  ["Tổ Toán", 92, "green"],
  ["Tổ Ngữ văn", 78, "teal"],
  ["Tổ Ngoại ngữ", 85, "cyan"],
  ["Tổ KHTN", 71, "blue"],
  ["Tổ Xã hội", 67, "orange"],
];
const _legacyTeachers = [
  ["Trần Văn Nam", "Tổ Toán", "96.5", "#ffd8bd"],
  ["Nguyễn Thị Mai", "Tổ Ngữ văn", "94.2", "#f8cfe0"],
  ["Lê Minh Quân", "Tổ KHTN", "92.1", "#cfe8df"],
  ["Phạm Thu Hà", "Tổ Ngoại ngữ", "91.3", "#d9dcff"],
  ["Hoàng Quốc Bảo", "Tổ Xã hội", "90.4", "#ffe4a8"],
];

const initialTeacherRecords = [
  {
    id: 1,
    code: "GV001",
    name: "Nguyễn Thị Mai",
    email: "mai.nt@thanhdam.edu.vn",
    phone: "0912 345 678",
    department: "Tổ Ngữ văn",
    subject: "Ngữ văn",
    position: "Hiệu trưởng",
    status: "Đang làm việc",
    kpi: 94.2,
  },
  {
    id: 2,
    code: "GV002",
    name: "Trần Văn Nam",
    email: "nam.tv@thanhdam.edu.vn",
    phone: "0988 234 567",
    department: "Tổ Toán",
    subject: "Toán học",
    position: "Tổ trưởng",
    status: "Đang làm việc",
    kpi: 96.5,
  },
  {
    id: 3,
    code: "GV003",
    name: "Lê Minh Quân",
    email: "quan.lm@thanhdam.edu.vn",
    phone: "0905 111 232",
    department: "Tổ KHTN",
    subject: "Vật lý",
    position: "Giáo viên",
    status: "Đang làm việc",
    kpi: 92.1,
  },
  {
    id: 4,
    code: "GV004",
    name: "Phạm Thu Hà",
    email: "ha.pt@thanhdam.edu.vn",
    phone: "0977 420 688",
    department: "Tổ Ngoại ngữ",
    subject: "Tiếng Anh",
    position: "Tổ trưởng",
    status: "Đang làm việc",
    kpi: 91.3,
  },
  {
    id: 5,
    code: "GV005",
    name: "Hoàng Quốc Bảo",
    email: "bao.hq@thanhdam.edu.vn",
    phone: "0934 822 199",
    department: "Tổ Xã hội",
    subject: "Lịch sử",
    position: "Giáo viên",
    status: "Nghỉ phép",
    kpi: 90.4,
  },
  {
    id: 6,
    code: "GV006",
    name: "Vũ Thanh Hương",
    email: "huong.vt@thanhdam.edu.vn",
    phone: "0966 321 455",
    department: "Tổ KHTN",
    subject: "Sinh học",
    position: "Giáo viên",
    status: "Đang làm việc",
    kpi: 88.7,
  },
  {
    id: 7,
    code: "GV007",
    name: "Đỗ Anh Tuấn",
    email: "tuan.da@thanhdam.edu.vn",
    phone: "0903 734 211",
    department: "Tổ Toán",
    subject: "Tin học",
    position: "Giáo viên",
    status: "Tạm nghỉ",
    kpi: 82.6,
  },
  {
    id: 8,
    code: "GV008",
    name: "Bùi Ngọc Lan",
    email: "lan.bn@thanhdam.edu.vn",
    phone: "0918 287 613",
    department: "Tổ Ngữ văn",
    subject: "Ngữ văn",
    position: "Giáo viên",
    status: "Đang làm việc",
    kpi: 89.8,
  },
  {
    id: 9,
    code: "GV009",
    name: "Ngô Đức Huy",
    email: "huy.nd@thanhdam.edu.vn",
    phone: "0982 520 311",
    department: "Tổ Ngoại ngữ",
    subject: "Tiếng Anh",
    position: "Giáo viên",
    status: "Đang làm việc",
    kpi: 87.9,
  },
  {
    id: 10,
    code: "GV010",
    name: "Đặng Minh Anh",
    email: "anh.dm@thanhdam.edu.vn",
    phone: "0938 460 722",
    department: "Tổ Xã hội",
    subject: "Địa lý",
    position: "Giáo viên",
    status: "Đang làm việc",
    kpi: 86.4,
  },
  {
    id: 11,
    code: "GV011",
    name: "Phan Khánh Linh",
    email: "linh.pk@thanhdam.edu.vn",
    phone: "0975 317 266",
    department: "Tổ KHTN",
    subject: "Hóa học",
    position: "Tổ phó",
    status: "Đang làm việc",
    kpi: 90.8,
  },
  {
    id: 12,
    code: "GV012",
    name: "Lương Hoài An",
    email: "an.lh@thanhdam.edu.vn",
    phone: "0908 215 778",
    department: "Tổ Toán",
    subject: "Toán học",
    position: "Giáo viên",
    status: "Nghỉ phép",
    kpi: 84.5,
  },
];

const emptyTeacher = {
  code: "",
  name: "",
  email: "",
  phone: "",
  password: "",
  department: "Tổ Toán",
  position: "Giáo viên",
  status: "Đang làm việc",
  kpi: 0,
};

function TeacherManagement({ canManage, canConfigure }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [keyword, setKeyword] = useState("");
  const [department, setDepartment] = useState("Tất cả tổ");
  const [status, setStatus] = useState("Tất cả trạng thái");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [configuring, setConfiguring] = useState(false);
  const [managementScope, setManagementScope] = useState("school");
  const [teacherConfig, setTeacherConfig] = useState({
    departments: [],
    positions: [],
  });
  const departments = [
    "Tất cả tổ",
    ...teacherConfig.departments.map((item) => item.name),
  ];
  const positions = teacherConfig.positions.map((item) => item.name);
  const filtered = records.filter((item) => {
    const matchKeyword = [item.name, item.code, item.email]
      .join(" ")
      .toLowerCase()
      .includes(keyword.toLowerCase());
    return (
      matchKeyword &&
      (department === "Tất cả tổ" || item.department === department) &&
      (status === "Tất cả trạng thái" || item.status === status)
    );
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );
  const working = records.filter(
    (item) => item.status === "Đang làm việc",
  ).length;
  const leaders = records.filter(
    (item) => item.position !== "Giáo viên",
  ).length;
  const averageKpi = records.length
    ? (
        records.reduce((sum, item) => sum + Number(item.kpi), 0) /
        records.length
      ).toFixed(1)
    : "0.0";

  const loadTeachers = async () => {
    setLoading(true);
    setApiError("");
    try {
      const response = await apiFetch("/api/teachers?per_page=1000", {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Không thể tải dữ liệu giáo viên.");
      const payload = await response.json();
      setRecords(payload.data);
      setManagementScope(payload.management_scope || "school");
    } catch (error) {
      setApiError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTeacherConfig = async () => {
    try {
      const response = await apiFetch("/api/teacher-configuration", {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Không thể tải cấu hình giáo viên.");
      setTeacherConfig(await response.json());
    } catch (error) {
      setApiError(error.message);
    }
  };

  useEffect(() => {
    loadTeachers();
    loadTeacherConfig();
  }, []);
  useEffect(() => {
    if (!successMessage) return undefined;
    const timeout = setTimeout(() => setSuccessMessage(""), 3500);
    return () => clearTimeout(timeout);
  }, [successMessage]);
  useEffect(() => {
    if (!apiError) return undefined;
    const timeout = setTimeout(() => setApiError(""), 5000);
    return () => clearTimeout(timeout);
  }, [apiError]);

  const resetFilters = () => {
    setKeyword("");
    setDepartment("Tất cả tổ");
    setStatus("Tất cả trạng thái");
    setPage(1);
  };
  const saveTeacher = async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setApiError("");
    try {
      const response = await apiFetch(
        editing.id ? `/api/teachers/${editing.id}` : "/api/teachers",
        {
          method: editing.id ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(data),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          Object.values(payload.errors ?? {}).flat()[0] ??
            payload.message ??
            "Không thể lưu giáo viên.",
        );
      setEditing(null);
      await loadTeachers();
      setSuccessMessage(
        payload.message ??
          (editing.id
            ? "Đã cập nhật giáo viên thành công."
            : "Đã thêm giáo viên thành công."),
      );
    } catch (error) {
      setApiError(error.message);
    }
  };

  return (
    <div className="teacher-page">
      {successMessage && (
        <div className="success-toast" role="status">
          <span>
            <CheckCircle2 size={20} />
          </span>
          <div>
            <b>Thành công</b>
            <small>{successMessage}</small>
          </div>
          <button
            aria-label="Đóng thông báo"
            onClick={() => setSuccessMessage("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {apiError && (
        <div className="teacher-error-toast" role="alert">
          <span>
            <TriangleAlert size={20} />
          </span>
          <div>
            <b>Không thể thực hiện</b>
            <small>{apiError}</small>
          </div>
          <button
            aria-label="Đóng thông báo lỗi"
            onClick={() => setApiError("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
      <section className="teacher-stats">
        <article>
          <IconBubble icon={Users} tone="purple" />
          <span>
            <b>{records.length}</b>
            <small>Tổng số giáo viên</small>
            <em>{managementScope === "department" ? "Trong tổ của bạn" : "Toàn trường"}</em>
          </span>
        </article>
        <article>
          <IconBubble icon={UserCheck} tone="green" />
          <span>
            <b>{working}</b>
            <small>Đang làm việc</small>
            <em>{Math.round((working / records.length) * 100)}% nhân sự</em>
          </span>
        </article>
        <article>
          <IconBubble icon={UserRoundCog} tone="blue" />
          <span>
            <b>{leaders}</b>
            <small>Cán bộ quản lý</small>
            <em>BGH, tổ trưởng, tổ phó</em>
          </span>
        </article>
        <article>
          <IconBubble icon={Star} tone="orange" />
          <span>
            <b>{averageKpi}</b>
            <small>KPI trung bình</small>
            <em>Tháng hiện tại</em>
          </span>
        </article>
      </section>

      <section className="teacher-toolbar-card">
        <div className="teacher-title">
          <div>
            <h2>Danh sách giáo viên</h2>
            <p>Quản lý hồ sơ, tổ chuyên môn và trạng thái công tác</p>
          </div>
          <div>
            {canConfigure && (
              <button
                className="secondary-btn"
                onClick={() => setConfiguring(true)}
              >
                <Settings size={16} /> Cấu hình
              </button>
            )}
            <button className="secondary-btn">
              <Download size={16} /> Xuất Excel
            </button>
            {canManage && (
              <button
                className="primary-btn"
                onClick={() =>
                  setEditing({
                    ...emptyTeacher,
                    department: departments[1] ?? "",
                    position: positions[0] ?? "",
                  })
                }
              >
                <Plus size={17} /> Thêm giáo viên
              </button>
            )}
          </div>
        </div>
        <div className="filters">
          <label className="teacher-search">
            <Search size={17} />
            <input
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm theo tên, mã hoặc email..."
            />
          </label>
          <label>
            <SlidersHorizontal size={15} />
            <select
              value={department}
              onChange={(e) => {
                setDepartment(e.target.value);
                setPage(1);
              }}
            >
              {departments.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            <UserCheck size={15} />
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option>Tất cả trạng thái</option>
              <option>Đang làm việc</option>
              <option>Nghỉ phép</option>
              <option>Tạm nghỉ</option>
            </select>
          </label>
          <button className="reset-btn" onClick={resetFilters}>
            <RotateCcw size={15} /> Đặt lại
          </button>
        </div>
      </section>

      <section className="teacher-table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Giáo viên</th>
                <th>Mã GV</th>
                <th>Liên hệ</th>
                <th>Tổ chuyên môn</th>
                <th>Chức vụ</th>
                <th>KPI</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((teacher) => (
                <tr key={teacher.id}>
                  <td>
                    <div className="teacher-identity">
                      {teacher.avatar_url ? <img src={teacher.avatar_url} alt={`Ảnh của ${teacher.name}`} /> : <span>{teacher.name.split(" ").at(-1).charAt(0)}</span>}
                      <div>
                        <b>{teacher.name}</b>
                        <small>{teacher.email}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <code>{teacher.code}</code>
                  </td>
                  <td>
                    <div className="contact-cell">
                      <span>
                        <Mail size={12} />
                        {teacher.email}
                      </span>
                      <span>
                        <Phone size={12} />
                        {teacher.phone}
                      </span>
                    </div>
                  </td>
                  <td>
                    <b className="cell-main">{teacher.department}</b>
                  </td>
                  <td>{teacher.position}</td>
                  <td>
                    <span
                      className={`kpi-chip ${teacher.kpi >= 90 ? "high" : teacher.kpi >= 85 ? "medium" : "low"}`}
                    >
                      {teacher.kpi}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`status-chip ${teacher.status === "Đang làm việc" ? "working" : teacher.status === "Nghỉ phép" ? "leave" : "paused"}`}
                    >
                      <i />
                      {teacher.status}
                    </span>
                  </td>
                  <td>
                    {canManage ? (
                      <div className="row-actions">
                        <button
                          title="Chỉnh sửa"
                          onClick={() => setEditing({ ...teacher })}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="delete"
                          title="Xóa"
                          onClick={() => setDeleting(teacher)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ) : (
                      <span>Chỉ xem</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading ? (
            <div className="empty-state">
              <Activity className="loading-icon" size={36} />
              <b>Đang tải dữ liệu...</b>
            </div>
          ) : (
            visible.length === 0 && (
              <div className="empty-state">
                <UserX size={36} />
                <b>Không tìm thấy giáo viên</b>
                <span>Hãy thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.</span>
              </div>
            )
          )}
        </div>
        <div className="pagination">
          <span>
            Hiển thị{" "}
            <b>
              {filtered.length ? (safePage - 1) * pageSize + 1 : 0}–
              {Math.min(safePage * pageSize, filtered.length)}
            </b>{" "}
            trong {filtered.length} kết quả
          </span>
          <div>
            <label>
              Số dòng{" "}
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option>5</option>
                <option>10</option>
                <option>20</option>
              </select>
            </label>
            <button
              disabled={safePage === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: totalPages }, (_, index) => (
              <button
                key={index}
                className={safePage === index + 1 ? "active" : ""}
                onClick={() => setPage(index + 1)}
              >
                {index + 1}
              </button>
            ))}
            <button
              disabled={safePage === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {editing && (
        <div className="modal-backdrop">
          <div className="teacher-modal">
            <div className="modal-head">
              <div>
                <h3>
                  {editing.id ? "Cập nhật giáo viên" : "Thêm giáo viên mới"}
                </h3>
                <p>Nhập đầy đủ thông tin hồ sơ giáo viên</p>
              </div>
              <button onClick={() => setEditing(null)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={saveTeacher}>
              <div className="form-grid">
                <label>
                  Họ và tên
                  <input name="name" required defaultValue={editing.name} />
                </label>
                <label>
                  Mã giáo viên
                  <input name="code" required defaultValue={editing.code} />
                </label>
                <label>
                  Email đăng nhập
                  <input
                    name="email"
                    type="email"
                    required
                    defaultValue={editing.email}
                  />
                </label>
                <label>
                  Số điện thoại
                  <input name="phone" required defaultValue={editing.phone} />
                </label>
                <label>
                  {editing.id
                    ? "Mật khẩu mới (không bắt buộc)"
                    : "Mật khẩu đăng nhập"}
                  <input
                    name="password"
                    type="password"
                    minLength="8"
                    required={!editing.id}
                    placeholder={
                      editing.id
                        ? "Để trống nếu không đổi"
                        : "Tối thiểu 8 ký tự"
                    }
                  />
                </label>
                <label>
                  Tổ chuyên môn
                  <select
                    name="department"
                    defaultValue={editing.department}
                    required
                  >
                    {departments.slice(1).map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Chức vụ
                  <select
                    name="position"
                    defaultValue={editing.position}
                    required
                  >
                    {positions.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Trạng thái
                  <select name="status" defaultValue={editing.status}>
                    <option>Đang làm việc</option>
                    <option>Nghỉ phép</option>
                    <option>Tạm nghỉ</option>
                  </select>
                </label>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setEditing(null)}
                >
                  Hủy bỏ
                </button>
                <button className="primary-btn">
                  {editing.id ? "Lưu thay đổi" : "Thêm giáo viên"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {configuring && (
        <TeacherConfigurationModal
          data={teacherConfig}
          onClose={() => setConfiguring(false)}
          onChanged={async (message) => {
            await loadTeacherConfig();
            await loadTeachers();
            setSuccessMessage(message);
          }}
          setError={setApiError}
        />
      )}
      {deleting && (
        <div className="modal-backdrop">
          <div className="confirm-modal">
            <span>
              <Trash2 size={24} />
            </span>
            <h3>Xóa giáo viên?</h3>
            <p>
              Bạn có chắc muốn xóa hồ sơ <b>{deleting.name}</b>? Thao tác này
              không thể hoàn tác.
            </p>
            <div>
              <button
                className="secondary-btn"
                onClick={() => setDeleting(null)}
              >
                Hủy bỏ
              </button>
              <button
                className="danger-btn"
                onClick={async () => {
                  try {
                    const response = await apiFetch(
                      `/api/teachers/${deleting.id}`,
                      {
                        method: "DELETE",
                        headers: { Accept: "application/json" },
                      },
                    );
                    const payload = await response.json();
                    if (!response.ok)
                      throw new Error(
                        payload.message ?? "Không thể xóa giáo viên.",
                      );
                    setDeleting(null);
                    await loadTeachers();
                    setSuccessMessage(
                      payload.message ?? "Đã xóa giáo viên thành công.",
                    );
                  } catch (error) {
                    setDeleting(null);
                    setApiError(error.message);
                  }
                }}
              >
                Xóa giáo viên
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TeacherConfigurationModal({ data, onClose, onChanged, setError }) {
  const [tab, setTab] = useState("departments");
  const [editingItem, setEditingItem] = useState(null);
  const items = data[tab] ?? [];
  const label = tab === "departments" ? "tổ chuyên môn" : "chức vụ";
  const baseUrl =
    tab === "departments" ? "teacher-departments" : "teacher-positions";

  const save = async (event) => {
    event.preventDefault();
    setError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = { name: form.get("name") };
    if (tab === "positions") {
      body.is_manager = form.get("is_manager") === "on";
      body.level = Number(form.get("level"));
    }
    try {
      const response = await apiFetch(
        `/api/${baseUrl}${editingItem?.id ? `/${editingItem.id}` : ""}`,
        {
          method: editingItem?.id ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          Object.values(payload.errors ?? {}).flat()[0] ?? payload.message,
        );
      setEditingItem(null);
      formElement.reset();
      await onChanged(payload.message);
    } catch (error) {
      setError(error.message);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Xóa ${label} “${item.name}”?`)) return;
    setError("");
    try {
      const response = await apiFetch(`/api/${baseUrl}/${item.id}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message);
      await onChanged(payload.message);
    } catch (error) {
      setError(error.message);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="teacher-config-modal">
        <div className="modal-head">
          <div>
            <h3>Cấu hình giáo viên</h3>
            <p>Quản lý danh mục dùng trong hồ sơ giáo viên</p>
          </div>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="teacher-config-tabs">
          <button
            className={tab === "departments" ? "active" : ""}
            onClick={() => {
              setTab("departments");
              setEditingItem(null);
            }}
          >
            Tổ chuyên môn
          </button>
          <button
            className={tab === "positions" ? "active" : ""}
            onClick={() => {
              setTab("positions");
              setEditingItem(null);
            }}
          >
            Chức vụ
          </button>
        </div>
        <form
          className={`teacher-config-form ${tab}`}
          onSubmit={save}
          key={`${tab}-${editingItem?.id ?? "new"}`}
        >
          <label>
            Tên {label}
            <input
              name="name"
              required
              autoFocus
              defaultValue={editingItem?.name ?? ""}
              placeholder={`Nhập tên ${label}...`}
            />
          </label>
          {tab === "positions" && (
            <>
              <label>
                Cấp bậc (1 cao nhất, 6 thấp nhất)
                <select name="level" defaultValue={editingItem?.level ?? 6} required>
                  {[1, 2, 3, 4, 5, 6].map((level) => <option key={level} value={level}>Cấp {level}</option>)}
                </select>
              </label>
              <label className="manager-check">
                <input
                  name="is_manager"
                  type="checkbox"
                  defaultChecked={editingItem?.is_manager ?? false}
                />{" "}
                Cán bộ quản lý
              </label>
            </>
          )}
          <button className="primary-btn">
            {editingItem ? "Lưu thay đổi" : "Thêm mới"}
          </button>
          {editingItem && (
            <button
              type="button"
              className="secondary-btn"
              onClick={() => setEditingItem(null)}
            >
              Hủy
            </button>
          )}
        </form>
        <div className="teacher-config-list">
          {items.map((item) => (
            <div key={item.id}>
              <span>
                <b>{item.name}</b>
                <small>
                  {item.code}
                  {tab === "positions" ? ` · Cấp ${item.level}` : ""}
                  {tab === "positions" && item.is_manager
                    ? " · Cán bộ quản lý"
                    : ""}
                </small>
              </span>
              <div>
                <button
                  title="Chỉnh sửa danh mục"
                  onClick={() => setEditingItem(item)}
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="delete"
                  title="Xóa danh mục"
                  onClick={() => remove(item)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
          {!items.length && <p>Chưa có {label}.</p>}
        </div>
      </div>
    </div>
  );
}

function IconBubble({ icon: Icon, tone }) {
  return (
    <span className={`icon-bubble ${tone}`}>
      <Icon size={26} strokeWidth={2.1} />
    </span>
  );
}

function App() {
  const [apiLoadingCount, setApiLoadingCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [active, setActive] = useState("Tổng quan");
  const [query, setQuery] = useState("");
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState(null);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);

  useEffect(() => {
    const openFilteredTasks = (event) => {
      setSelectedTask({ filter: event.detail, token: Date.now() });
      setActive("Giao việc");
    };
    window.addEventListener("dashboard:task-filter", openFilteredTasks);
    return () => window.removeEventListener("dashboard:task-filter", openFilteredTasks);
  }, []);

  useEffect(() => {
    const updateLoading = (event) =>
      setApiLoadingCount((count) => Math.max(0, count + event.detail));
    window.addEventListener("api:loading", updateLoading);
    return () => window.removeEventListener("api:loading", updateLoading);
  }, []);

  useEffect(() => {
    if (!authUser || !authUser.permissions.includes("tasks.view")) return undefined;
    const loadTaskBadge = async () => {
      try {
        const response = await apiFetch("/api/tasks?per_page=5", { headers: { Accept: "application/json" }, silent: true });
        if (!response.ok) return;
        const payload = await response.json();
        setPendingTaskCount(Number(payload.stats?.pending || 0));
      } catch {
        // Giữ số gần nhất nếu việc làm mới huy hiệu tạm thời thất bại.
      }
    };
    const updateFromTaskStats = (event) => setPendingTaskCount(Number(event.detail?.pending || 0));
    loadTaskBadge();
    const interval = window.setInterval(loadTaskBadge, 30000);
    window.addEventListener("task-stats:updated", updateFromTaskStats);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("task-stats:updated", updateFromTaskStats);
    };
  }, [authUser]);


  useEffect(() => {
    const verify = async () => {
      if (!getToken()) {
        setAuthLoading(false);
        return;
      }
      try {
        const response = await apiFetch("/api/auth/me", {
          headers: { Accept: "application/json" },
        });
        const payload = await response.json();
        if (response.ok) setAuthUser(payload.user);
        else setToken(null);
      } finally {
        setAuthLoading(false);
      }
    };
    verify();
    const expired = () => setAuthUser(null);
    window.addEventListener("auth:expired", expired);
    return () => window.removeEventListener("auth:expired", expired);
  }, []);

  const logout = async () => {
    await apiFetch("/api/auth/logout", {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    setToken(null);
    setAuthUser(null);
  };
  if (authLoading)
    return (
      <div className="auth-loading">
        <ShieldCheck size={34} />
        <span>Đang xác thực tài khoản...</span>
      </div>
    );
  if (!authUser)
    return (
      <>
        <LoginPage onLogin={setAuthUser} />
        {apiLoadingCount > 0 && (
          <div className="global-api-loading" role="status">
            <span />
            <div>
              <Activity size={17} /> Đang xử lý...
            </div>
          </div>
        )}
      </>
    );
  const can = (permission) => authUser.permissions.includes(permission);
  const canConfigureTasks = authUser.permissions.includes("tasks.assign");
  const navPermissions = {
    "KPI & Thống kê": "kpi.view",
    "Quản lý giáo viên": "teachers.view",
    "Giao việc": "tasks.view",
    "Dữ liệu dùng chung": "documents.view",
    "Cấu hình giao việc": "tasks.assign",
    "Phân quyền": "roles.manage",
  };
  const visibleNavItems = navItems.filter(
    ([label]) => label === "Cấu hình giao việc" ? canConfigureTasks : (!navPermissions[label] || can(navPermissions[label])),
  );

  return (
    <div className="app-shell">
      {apiLoadingCount > 0 && (
        <div className="global-api-loading" role="status">
          <span />
          <div>
            <Activity size={17} /> Đang xử lý...
          </div>
        </div>
      )}
      {sidebarOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Đóng menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          <span className="brand-logo">
            <GraduationCap size={27} />
          </span>
          <span>
            <strong>TH-THCS THANH ĐÀM</strong>
            <small>Hệ thống quản lý nội bộ</small>
          </span>
          <button className="close-menu" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <nav className="nav-list">
          {visibleNavItems.map(([label, Icon]) => (
            <div className="nav-entry" key={label}>
              <button
                className={active === label ? "active" : ""}
                onClick={() => {
                  setActive(label);
                  setSidebarOpen(false);
                }}
              >
                <Icon size={18} />
                <span>{label}</span>
                {label === "Giao việc" && <em>{pendingTaskCount}</em>}
              </button>
            </div>
          ))}
        </nav>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="page-heading">
            <button
              className="menu-button"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={24} />
            </button>
            <h1>{active}</h1>
          </div>
          <div className="top-actions">
            <label className="search-box">
              <Search size={18} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm kiếm (Ctrl + /)"
              />
            </label>
            <NotificationCenter
              user={authUser}
              onOpenTask={(taskId) => {
                setSelectedTask({ id: taskId, token: Date.now() });
                setActive("Giao việc");
              }}
            />
            <div className="profile">
              {authUser.avatar_url ? <img className="avatar avatar-image" style={{ objectFit: "cover" }} src={authUser.avatar_url} alt="Ảnh đại diện" /> : <span className="avatar">{authUser.name.charAt(0)}</span>}
              <span>
                <strong>{authUser.name}</strong>
                <small>{authUser.current_position ?? authUser.roles[0]?.name ?? "Người dùng"}</small>
              </span>
              <button className="logout-button" onClick={logout}>
                Đăng xuất
              </button>
            </div>
          </div>
        </header>

        {active === "KPI & Thống kê" ? (
          <KpiReport canManage={can("kpi.manage")} onTask={(id) => { setSelectedTask({ id, token: Date.now() }); setActive("Giao việc"); }} />
        ) : active === "Quản lý giáo viên" ? (
          <TeacherManagement
            canManage={can("teachers.manage")}
            canConfigure={authUser.permissions.includes("roles.manage")}
          />
        ) : active === "Cấu hình giao việc" ? (
          <TaskConfiguration canManage={canConfigureTasks} />
        ) : active === "Giao việc" ? (
          <TaskManagement
            canAssign={can("tasks.assign")}
            canUpdate={can("tasks.update")}
            selectedTask={selectedTask}
          />
        ) : active === "Dữ liệu dùng chung" ? (
          <DocumentManagement canManage={can("documents.manage")} />
        ) : active === "Phân quyền" ? (
          <RoleManagement />
        ) : active === "Thông tin cá nhân" ? (
          <PersonalProfile user={authUser} onUserChanged={setAuthUser} />
        ) : (
          <ManagementDashboard onTask={(id) => { setSelectedTask({ id, token: Date.now() }); setActive("Giao việc"); }} onKpi={() => setActive("KPI & Thống kê")} />
        )}
      </main>
      {authUser.has_ai_assistant && <AiAssistant />}
    </div>
  );
}

export default App;
