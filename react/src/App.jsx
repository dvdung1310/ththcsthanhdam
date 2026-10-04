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
  UserRoundCog,
  Users,
  X,
} from "lucide-react";
import "./App.css";
import "./TeacherManagement.css";
import "./TeacherAvatar.css";
import "./TeacherErrorToast.css";
import "./Typography.css";
import "./ApiStates.css";
import TaskManagement from "./TaskManagement";
import TaskConfiguration from "./TaskConfiguration";
import RolePermissionMatrix from "./RolePermissionMatrix";
import PersonnelManagement from "./PersonnelManagement";
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
  ["Quản lý nhân sự", Users],
  ["Cấu hình giao việc", Settings],
  ["Vai trò & quyền", ShieldCheck],
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
    "Quản lý nhân sự": "teachers.view",
    "Giao việc": "tasks.view",
    "Dữ liệu dùng chung": "documents.view",
    "Cấu hình giao việc": "tasks.assign",
    "Vai trò & quyền": "roles.manage",
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
        ) : active === "Quản lý nhân sự" ? (
          <PersonnelManagement />
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
        ) : active === "Vai trò & quyền" ? (
          <RolePermissionMatrix />
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
