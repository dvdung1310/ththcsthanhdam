import { useEffect, useState } from "react";
import { Link, Route, Routes, useLocation, useNavigate, useParams } from "react-router";
import {
  Activity,
  Award,
  Bell,
  Bot,
  BriefcaseBusiness,
  CalendarCheck,
  ChartNoAxesColumnIncreasing,
  Check,
  ChevronDown,
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
import { PageErrorBoundary } from "./AppError";
import PersonalProfile from "./PersonalProfile";
import DataLibrary from "./DataLibrary";
import EvaluationHome from "./EvaluationHome";
import EvaluationSheet from "./EvaluationSheet";
import EvaluationSummary from "./EvaluationSummary";
import EvaluationTemplates from "./EvaluationTemplates";
import EvaluationPeriodEditor from "./EvaluationPeriodEditor";
import { apiFetch, getToken, setToken } from "./api";
import "./PermissionStates.css";
import "./SystemTypography.css";
import "./GlobalLoading.css";
import "./NotificationTaskStates.css";
import LeaveTracking from "./LeaveTracking";
import Avatar from "./Avatar";

const navTree = [
  { key: "dashboard", label: "Tổng quan", icon: LayoutDashboard, path: "/" },
  { key: "stats", label: "Thống kê", icon: ChartNoAxesColumnIncreasing, path: "/stats", permission: "kpi.view" },
  {
    key: "tasks-group",
    label: "Công việc",
    icon: ClipboardCheck,
    children: [
      { key: "tasks", label: "Danh sách công việc", title: "Công việc", path: "/tasks", permission: "tasks.view", badge: true },
      { key: "task-settings", label: "Cấu hình", title: "Cấu hình công việc", path: "/task-settings", permission: "tasks.assign", schoolOnly: true },
    ],
  },
  { key: "library", label: "Kho dữ liệu", icon: Database, path: "/library", permission: "library.view" },
  {
    key: "evaluation-group",
    label: "Đánh giá thi đua",
    icon: Award,
    children: [
      { key: "evaluation-summary", label: "Tổng hợp", title: "Tổng hợp thi đua", path: "/evaluations/summary", permission: "evaluation.manage" },
      { key: "evaluations", label: "Đánh giá tháng", title: "Đánh giá thi đua", path: "/evaluations", permission: "evaluation.view|evaluation.score|evaluation.manage" },
      { key: "evaluation-templates", label: "Bộ tiêu chí", title: "Bộ tiêu chí đánh giá", path: "/evaluations/templates", permission: "evaluation.manage" },
    ],
  },
  {
    key: "personnel-group",
    label: "Nhân sự",
    icon: Users,
    children: [
      { key: "personnel", label: "Danh sách nhân sự", title: "Nhân sự", path: "/personnel", permission: "personnel.view" },
      { key: "structure", label: "Cơ cấu tổ chức", path: "/personnel/structure", permission: "personnel.view" },
      { key: "leave", label: "Theo dõi nghỉ", path: "/personnel/leave" },
    ],
  },
  { key: "roles", label: "Vai trò & quyền", icon: ShieldCheck, path: "/roles", permission: "roles.manage" },
  { key: "profile", label: "Thông tin cá nhân", icon: UserRoundCog, path: "/profile" },
];

const navLeaves = navTree.flatMap((item) => item.children?.map((child) => ({ ...child, group: item })) ?? [item]);

const APP_NAME = "TH-THCS Thanh Đàm";

const matchNav = (pathname) =>
  navLeaves
    .filter((leaf) => (leaf.path === "/" ? pathname === "/" : pathname === leaf.path || pathname.startsWith(`${leaf.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0];

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
  ["Phạm Thu Hà", "Tổ Ngoại ngữ", "91.3", "#dce5f4"],
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
  const pageTitle = current ? current.title ?? current.label : "Không tìm thấy trang";
  const pageLabel = authLoading ? null : !authUser ? "Đăng nhập" : pageTitle;
  const [openGroups, setOpenGroups] = useState([]);
  const currentGroup = current?.group?.key;

  useEffect(() => {
    if (currentGroup) setOpenGroups((groups) => (groups.includes(currentGroup) ? groups : [...groups, currentGroup]));
  }, [currentGroup]);

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
    }).catch(() => null);
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
  const allowed = (leaf) => (leaf.schoolOnly && !canConfigureTasks ? false : !leaf.permission || can(leaf.permission));
  const guard = (key, element) => (allowed(navLeaves.find((leaf) => leaf.key === key)) ? element : <RouteNotice kind="forbidden" />);
  const toggleGroup = (key) => setOpenGroups((groups) => (groups.includes(key) ? groups.filter((g) => g !== key) : [...groups, key]));
  const closeSidebar = () => setSidebarOpen(false);
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
          {navTree.map((item) => {
            const Icon = item.icon;
            const children = item.children?.filter(allowed);
            if (item.children ? !children.length : !allowed(item)) return null;
            if (!item.children || children.length === 1) {
              const leaf = item.children ? children[0] : item;
              return (
                <div className="nav-entry" key={item.key}>
                  <Link to={leaf.path} className={`nav-link ${current?.key === leaf.key ? "active" : ""}`} onClick={closeSidebar}>
                    <Icon size={18} />
                    <span>{item.label}</span>
                    {leaf.badge && <em>{pendingTaskCount}</em>}
                  </Link>
                </div>
              );
            }
            const open = openGroups.includes(item.key);
            return (
              <div className="nav-entry nav-group" key={item.key}>
                <button type="button" className={`nav-link nav-parent ${current?.group?.key === item.key ? "in-group" : ""}`} aria-expanded={open} onClick={() => toggleGroup(item.key)}>
                  <Icon size={18} />
                  <span>{item.label}</span>
                  {!open && children.some((child) => child.badge) && <em>{pendingTaskCount}</em>}
                  <ChevronDown size={15} className="nav-chevron" />
                </button>
                {open && (
                  <div className="nav-children">
                    {children.map((child) => (
                      <Link key={child.key} to={child.path} className={`nav-link ${current?.key === child.key ? "active" : ""}`} onClick={closeSidebar}>
                        <span>{child.label}</span>
                        {child.badge && <em>{pendingTaskCount}</em>}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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
            <h1>{pageTitle}</h1>
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
              {authUser.avatar_url ? <img className="avatar avatar-image" style={{ objectFit: "cover" }} src={authUser.avatar_url} alt="Ảnh đại diện" /> : <Avatar as="span" className="avatar" name={authUser.name} />}
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

        <PageErrorBoundary resetKey={location.pathname}>
        <Routes>
          <Route path="/" element={<ManagementDashboard onTask={openTask} onKpi={() => navigate("/stats")} />} />
          <Route path="/stats" element={guard("stats", <TaskStats onTask={openTask} />)} />
          <Route path="/tasks/:taskCode?" element={guard("tasks", <TaskRoute canAssign={can("tasks.assign")} canUpdate={can("tasks.update")} selectedTask={selectedTask} />)} />
          <Route path="/library/*" element={guard("library", <LibraryRoute />)} />
          <Route path="/evaluations" element={guard("evaluations", <EvaluationHome />)} />
          <Route path="/evaluations/periods/new" element={guard("evaluation-templates", <EvaluationPeriodEditor />)} />
          <Route path="/evaluations/periods/:periodId/edit" element={guard("evaluation-templates", <EvaluationPeriodEditor />)} />
          <Route path="/evaluations/summary" element={guard("evaluation-summary", <EvaluationSummary />)} />
          <Route path="/evaluations/:evaluationId" element={guard("evaluations", <EvaluationSheet />)} />
          <Route path="/evaluations/templates/:templateId?" element={guard("evaluation-templates", <EvaluationTemplates />)} />
          <Route path="/personnel" element={guard("personnel", <PersonnelManagement view="people" />)} />
          <Route path="/personnel/structure" element={guard("structure", <PersonnelManagement view="structure" />)} />
          <Route path="/personnel/leave" element={guard("leave", <LeaveTracking />)} />
          <Route path="/task-settings" element={guard("task-settings", <TaskConfiguration />)} />
          <Route path="/roles" element={guard("roles", <RolePermissionMatrix />)} />
          <Route path="/profile" element={<PersonalProfile user={authUser} onUserChanged={setAuthUser} />} />
          <Route path="*" element={<RouteNotice kind="missing" />} />
        </Routes>
        </PageErrorBoundary>
      </main>
      {authUser.has_ai_assistant && <AiAssistant />}
    </div>
  );
}

export default App;
