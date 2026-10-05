import { useEffect, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from "react-router";
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
import TaskStats from "./TaskStats";
import ManagementDashboard from "./ManagementDashboard";
import LoginPage from "./LoginPage";
import NotificationCenter from "./NotificationCenter";
import AiAssistant from "./AiAssistant";
import PersonalProfile from "./PersonalProfile";
import DataLibrary from "./DataLibrary";
import EvaluationHome from "./EvaluationHome";
import EvaluationSheet from "./EvaluationSheet";
import { apiFetch, getToken, setToken } from "./api";
import "./PermissionStates.css";
import "./SystemTypography.css";
import "./GlobalLoading.css";
import "./NotificationTaskStates.css";

const navItems = [
  ["Tổng quan", LayoutDashboard, "/"],
  ["Thống kê", ChartNoAxesColumnIncreasing, "/stats"],
  ["Giao việc", ClipboardCheck, "/tasks"],
  ["Kho dữ liệu", Database, "/library"],
  ["Đánh giá thi đua", Award, "/evaluations"],
  ["Quản lý nhân sự", Users, "/personnel"],
  ["Cấu hình giao việc", Settings, "/task-settings"],
  ["Vai trò & quyền", ShieldCheck, "/roles"],
  ["Thông tin cá nhân", UserRoundCog, "/profile"],
];

const APP_NAME = "TH-THCS Thanh Đàm";

const matchNav = (pathname) =>
  navItems.find(([, , path]) => (path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`)));

function TaskRoute(props) {
  const { taskCode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  if (taskCode && !/^[A-Za-z0-9-]+$/.test(taskCode)) return <RouteNotice kind="missing" />;
  const onRouteTaskChange = (code, { replace = false } = {}) => {
    if (code) navigate(`/tasks/${code}`, { replace, state: replace ? location.state : { fromList: true } });
    else if (!replace && location.state?.fromList) navigate(-1);
    else navigate("/tasks", { replace: true });
  };
  return <TaskManagement {...props} routeTaskCode={taskCode ?? null} onRouteTaskChange={onRouteTaskChange} />;
}

const slugify = (name = "") =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");

const folderPath = (id, name) => {
  const slug = slugify(name);
  return `/library/folders/${id}${slug ? `-${slug}` : ""}`;
};

function LibraryRoute() {
  const rest = useParams()["*"] ?? "";
  const navigate = useNavigate();
  const location = useLocation();
  const folder = rest.match(/^folders\/(\d+)(?:-[^/]*)?$/);
  if (rest && rest !== "mine" && !folder) return <RouteNotice kind="missing" />;
  const onNavigate = (view, folderId = null, { replace = false, select = null } = {}) =>
    navigate(view === "mine" ? "/library/mine" : folderId ? `/library/folders/${folderId}` : "/library", { replace, state: select ? { select } : null });
  const onFolderLoaded = (id, name) => {
    const path = folderPath(id, name);
    if (location.pathname !== path) navigate(path, { replace: true, state: location.state });
  };
  return <DataLibrary view={rest === "mine" ? "mine" : "library"} folderId={folder ? Number(folder[1]) : null} selectId={location.state?.select ?? null} onNavigate={onNavigate} onFolderLoaded={onFolderLoaded} />;
}

function RouteNotice({ kind }) {
  const forbidden = kind === "forbidden";
  return (
    <section className="route-notice">
      <span>{forbidden ? <ShieldCheck size={30} /> : <Search size={30} />}</span>
      <h2>{forbidden ? "Bạn không có quyền xem trang này" : "Không tìm thấy trang"}</h2>
      <p>{forbidden ? "Tài khoản của bạn chưa được cấp quyền cho chức năng này. Liên hệ quản trị viên nếu bạn cần truy cập." : "Đường dẫn không tồn tại hoặc đã bị thay đổi."}</p>
      <Link className="primary-btn" to="/">Về trang Tổng quan</Link>
    </section>
  );
}

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
  const [query, setQuery] = useState("");
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState(null);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  const location = useLocation();
  const navigate = useNavigate();
  const current = matchNav(location.pathname);
  const pageLabel = authLoading ? null : !authUser ? "Đăng nhập" : current?.[0] ?? "Không tìm thấy trang";

  useEffect(() => {
    const title = pageLabel ? `${pageLabel} · ${APP_NAME}` : APP_NAME;
    document.title = authUser && unreadCount ? `(${unreadCount}) ${title}` : title;
  }, [pageLabel, unreadCount, authUser]);

  useEffect(() => {
    const openFilteredTasks = (event) => {
      setSelectedTask({ filter: event.detail, token: Date.now() });
      navigate("/tasks");
    };
    window.addEventListener("dashboard:task-filter", openFilteredTasks);
    return () => window.removeEventListener("dashboard:task-filter", openFilteredTasks);
  }, [navigate]);

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
    navigate("/", { replace: true });
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
  const can = (permission) => permission.split("|").some((code) => authUser.permissions.includes(code));
  const canConfigureTasks = authUser.access_scope === "school" && authUser.permissions.includes("tasks.assign");
  const navPermissions = {
    "Thống kê": "kpi.view",
    "Quản lý nhân sự": "teachers.view",
    "Giao việc": "tasks.view",
    "Kho dữ liệu": "library.view",
    "Đánh giá thi đua": "evaluation.view|evaluation.score|evaluation.manage",
    "Cấu hình giao việc": "tasks.assign",
    "Vai trò & quyền": "roles.manage",
  };
  const allowed = (label) => (label === "Cấu hình giao việc" ? canConfigureTasks : !navPermissions[label] || can(navPermissions[label]));
  const visibleNavItems = navItems.filter(([label]) => allowed(label));
  const guard = (label, element) => (allowed(label) ? element : <RouteNotice kind="forbidden" />);
  const openTask = (code) => navigate(`/tasks/${code}`);

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
          {visibleNavItems.map(([label, Icon, path]) => (
            <div className="nav-entry" key={label}>
              <NavLink to={path} end={path === "/"} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`} onClick={() => setSidebarOpen(false)}>
                <Icon size={18} />
                <span>{label}</span>
                {label === "Giao việc" && <em>{pendingTaskCount}</em>}
              </NavLink>
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
            <h1>{current?.[0] ?? "Không tìm thấy trang"}</h1>
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
              onOpenTask={openTask}
              onOpenLink={(link) => navigate(link)}
              onUnreadChange={setUnreadCount}
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

        <Routes>
          <Route path="/" element={<ManagementDashboard onTask={openTask} onKpi={() => navigate("/stats")} />} />
          <Route path="/stats" element={guard("Thống kê", <TaskStats onTask={openTask} />)} />
          <Route path="/tasks/:taskCode?" element={guard("Giao việc", <TaskRoute canAssign={can("tasks.assign")} canUpdate={can("tasks.update")} selectedTask={selectedTask} />)} />
          <Route path="/library/*" element={guard("Kho dữ liệu", <LibraryRoute />)} />
          <Route path="/evaluations" element={guard("Đánh giá thi đua", <EvaluationHome />)} />
          <Route path="/evaluations/:evaluationId" element={guard("Đánh giá thi đua", <EvaluationSheet />)} />
          <Route path="/personnel" element={guard("Quản lý nhân sự", <PersonnelManagement />)} />
          <Route path="/task-settings" element={guard("Cấu hình giao việc", <TaskConfiguration />)} />
          <Route path="/roles" element={guard("Vai trò & quyền", <RolePermissionMatrix />)} />
          <Route path="/profile" element={<PersonalProfile user={authUser} onUserChanged={setAuthUser} />} />
          <Route path="*" element={<RouteNotice kind="missing" />} />
        </Routes>
      </main>
      {authUser.has_ai_assistant && <AiAssistant />}
    </div>
  );
}

export default App;
