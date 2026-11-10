import {
  ArrowUpRight,
  ChevronDown,
  ChevronsUpDown,
  Clock3,
  FolderOpen,
  Layers3,
  MessageSquare,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Workflow,
} from "lucide-react";
import { useState } from "react";
import type { Bootstrap, Task } from "../../shared/types";
import type { PageView } from "../features/WorkspacePages";

export type View = "chat" | PageView;
export const navigation = [
  { id: "automations", label: "自动任务", icon: Clock3 },
  { id: "skills", label: "技能中心", icon: Layers3 },
  { id: "files", label: "文件空间", icon: FolderOpen },
  { id: "workflows", label: "AI 工作流", icon: Workflow },
] as const;

export function Sidebar({
  data,
  view,
  activeId,
  open,
  onClose,
  onView,
  onNew,
  onSelect,
  onSearch,
  onEdit,
}: {
  data: Bootstrap;
  view: View;
  activeId: string | null;
  open: boolean;
  onClose: () => void;
  onView: (view: View) => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onSearch: () => void;
  onEdit: (task: Task) => void;
}) {
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [recentOpen, setRecentOpen] = useState(true);
  const [project, setProject] = useState<string | null>(null);
  const projects = [
    ...new Set(data.tasks.map((task) => task.project).filter(Boolean)),
  ];
  const tasks = data.tasks
    .filter((task) => !project || task.project === project)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <>
      {open && (
        <button
          className="sidebar-scrim"
          aria-label="关闭侧栏"
          onClick={onClose}
        />
      )}
      <aside className={`sidebar ${open ? "is-open" : ""}`} aria-label="主导航">
        <div className="brand-row">
          <button
            className="brand"
            onClick={onNew}
            aria-label="Study Work 新建任务"
          >
            <span className="brand-mark">
              <Workflow size={20} strokeWidth={2.5} />
            </span>
            <span>
              Study<span className="brand-light"> Work</span>
            </span>
          </button>
          <button
            className="icon-button sidebar-collapse"
            onClick={onClose}
            title="收起侧栏"
            aria-label="收起侧栏"
          >
            <PanelLeftClose size={17} />
          </button>
        </div>
        <button className="workspace-switch" onClick={() => onView("settings")}>
          <span className="workspace-avatar">S</span>
          <span>个人工作区</span>
          <ChevronsUpDown size={13} />
        </button>
        <div className="sidebar-primary">
          <button className="new-task" onClick={onNew}>
            <Plus size={18} />
            <span>新建任务</span>
            <kbd>⌘ N</kbd>
          </button>
          <button
            className="sidebar-search icon-button"
            title="搜索任务 ⌘ K"
            aria-label="搜索任务"
            onClick={onSearch}
          >
            <Search size={18} />
          </button>
        </div>
        <nav className="main-navigation">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              onClick={() => onView(item.id)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.id === "skills" && (
                <span className="nav-count">{data.skills.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-scroll">
          <button
            className="section-label"
            aria-expanded={projectsOpen}
            onClick={() => setProjectsOpen(!projectsOpen)}
          >
            项目
            <ChevronDown
              size={13}
              className={!projectsOpen ? "rotate-back" : ""}
            />
          </button>
          {projectsOpen && (
            <div className="project-list">
              {projects.map((name, index) => (
                <button
                  key={name}
                  className={`project-row ${project === name ? "selected" : ""}`}
                  onClick={() => {
                    setProject(project === name ? null : name);
                    onView("chat");
                  }}
                >
                  <span className={`project-dot project-${index % 3}`} />
                  <span>{name}</span>
                  <span className="project-total">
                    {data.tasks.filter((t) => t.project === name).length}
                  </span>
                </button>
              ))}
              {!projects.length && (
                <span className="sidebar-empty">创建任务后在这里整理</span>
              )}
            </div>
          )}
          <button
            className="section-label recent-label"
            aria-expanded={recentOpen}
            onClick={() => setRecentOpen(!recentOpen)}
          >
            {project ? `${project}的任务` : "最近任务"}
            <ChevronDown
              size={13}
              className={!recentOpen ? "rotate-back" : ""}
            />
          </button>
          {recentOpen && (
            <div className="recent-list">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className={`task-row ${view === "chat" && activeId === task.id ? "active" : ""}`}
                >
                  <button
                    className="task-select"
                    onClick={() => onSelect(task.id)}
                  >
                    <MessageSquare size={15} />
                    <span>{task.title}</span>
                    {task.status === "running" && (
                      <span className="status-dot pulse" />
                    )}
                  </button>
                  <button
                    className="task-more icon-button"
                    aria-label={`管理任务：${task.title}`}
                    onClick={() => onEdit(task)}
                  >
                    <MoreHorizontal size={15} />
                  </button>
                </div>
              ))}
              {!tasks.length && (
                <span className="sidebar-empty">
                  你的下一件作品，从这里开始
                </span>
              )}
            </div>
          )}
        </div>
        <div className="sidebar-footer">
          <button className="provider-card" onClick={() => onView("settings")}>
            <span className="provider-card-top">
              <Sparkles size={16} />
              <strong>
                {data.provider.configured
                  ? "DeepSeek 已配置"
                  : "让想法，成为下一步"}
              </strong>
              <ArrowUpRight size={15} />
            </span>
            <span>
              {data.provider.configured
                ? data.provider.model
                : "连接 DeepSeek，开启你的 AI 工作台"}
            </span>
            <span
              className={`connection-badge ${data.provider.configured ? "live" : ""}`}
            >
              <i />
              {data.provider.configured ? "服务已配置" : "当前为演示模式"}
            </span>
          </button>
          <div className="account-row">
            <button className="account-main" onClick={() => onView("settings")}>
              <span className="account-avatar">S</span>
              <span>
                <strong>我的工作空间</strong>
                <small>本地保存 · 个人使用</small>
              </span>
            </button>
            <button
              className="icon-button"
              aria-label="设置与帮助"
              onClick={() => onView("settings")}
            >
              <Settings2 size={17} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
