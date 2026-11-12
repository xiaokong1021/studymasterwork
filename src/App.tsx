import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Download,
  FileText,
  Folder,
  LoaderCircle,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Search,
  Trash2,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Bootstrap, RunInput, Task, WorkspaceFile } from "../shared/types";
import { api, streamTask } from "./api";
import { Sidebar, navigation, type View } from "./components/Sidebar";
import { Composer } from "./components/Composer";
import { Conversation, FileCard } from "./components/Conversation";
import { Dialog } from "./components/Dialog";
import { WorkspacePages } from "./features/WorkspacePages";

export default function App() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<View>("chat");
  const [activeId, setActiveId] = useState<string | null>(() =>
    localStorage.getItem("study-work-active"),
  );
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 768);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [skillId, setSkillId] = useState("");
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editProject, setEditProject] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{
    file: WorkspaceFile;
    content: string;
  } | null>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const sending = useRef(false);
  const task = data?.tasks.find((task) => task.id === activeId);
  const draftKey = activeId ?? "new";
  const draft = drafts[draftKey] ?? "";
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (toast) {
      const timer = window.setTimeout(() => setToast(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const refresh = useCallback(async () => {
    const next = await api<Bootstrap>("/bootstrap");
    setData((current) => {
      if (!current) return next;
      // A refresh must not overwrite text still arriving in a local stream.
      return {
        ...next,
        tasks: next.tasks.map((t) =>
          controllers.current.has(t.id)
            ? (current.tasks.find((old) => old.id === t.id) ?? t)
            : t,
        ),
      };
    });
    setLoadError("");
  }, []);
  useEffect(() => {
    let alive = true;
    api<Bootstrap>("/bootstrap")
      .then((result) => {
        if (!alive) return;
        setData(result);
        setActiveId((id) =>
          result.tasks.some((t) => t.id === id)
            ? id
            : (result.tasks[0]?.id ?? null),
        );
      })
      .catch((error) => {
        if (alive) setLoadError(error.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (activeId) localStorage.setItem("study-work-active", activeId);
    else localStorage.removeItem("study-work-active");
  }, [activeId]);
  useEffect(() => {
    let polling = false;
    let lastError = "";
    const poll = async () => {
      if (document.hidden || polling) return;
      polling = true;
      try {
        await refresh();
        lastError = "";
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "工作区连接已断开";
        if (lastError !== message) notify(message);
        lastError = message;
      } finally {
        polling = false;
      }
    };
    const interval = setInterval(() => void poll(), 3000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [refresh, notify]);
  const changeView = (next: View) => {
    setView(next);
    setDetailsOpen(false);
    if (window.innerWidth <= 768) setSidebarOpen(false);
  };
  const selectTask = (id: string) => {
    setActiveId(id);
    setSkillId("");
    changeView("chat");
  };
  const newTask = () => {
    setActiveId(null);
    setSkillId("");
    changeView("chat");
  };
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setActiveId(null);
        setView("chat");
      }
      if (event.key === "Escape") {
        setDetailsOpen(false);
        if (window.innerWidth <= 768) setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
  const updateTask = useCallback(
    (next: Task) =>
      setData((current) =>
        current
          ? {
              ...current,
              tasks: current.tasks.some((t) => t.id === next.id)
                ? current.tasks.map((t) => (t.id === next.id ? next : t))
                : [next, ...current.tasks],
            }
          : current,
      ),
    [],
  );
  const submit = async (input: RunInput): Promise<boolean> => {
    if (
      sending.current ||
      !data ||
      task?.status === "running" ||
      (activeId && controllers.current.has(activeId))
    )
      return false;
    sending.current = true;
    setPending(true);
    let id = activeId;
    try {
      if (!id) {
        const created = await api<Task>("/tasks", {
          method: "POST",
          body: JSON.stringify({
            title: input.prompt.slice(0, 32),
            project: "个人任务",
          }),
        });
        id = created.id;
        updateTask(created);
        setActiveId(id);
      }
      const runId = id;
      const controller = new AbortController();
      controllers.current.set(runId, controller);
      setDrafts((current) => ({ ...current, [draftKey]: "", [runId]: "" }));
      void streamTask(runId, input, controller.signal, (event) => {
        if (event.type === "task" || event.type === "done")
          updateTask(event.task);
        else if (event.type === "error") {
          if (event.task) updateTask(event.task);
          notify(event.message);
        } else
          setData((current) => {
            if (!current) return current;
            return {
              ...current,
              tasks: current.tasks.map((t) => {
                if (t.id !== runId) return t;
                const assistantIndex = t.messages.findLastIndex(
                  (message) => message.role === "assistant",
                );
                return {
                  ...t,
                  messages: t.messages.map((message, index) => {
                    if (index !== assistantIndex) return message;
                    if (event.type === "delta")
                      return {
                        ...message,
                        content: message.content + event.text,
                      };
                    const steps = message.steps ?? [];
                    return {
                      ...message,
                      steps: steps.some((step) => step.id === event.step.id)
                        ? steps.map((step) =>
                            step.id === event.step.id ? event.step : step,
                          )
                        : [...steps, event.step],
                    };
                  }),
                };
              }),
            };
          });
      })
        .catch((error) => {
          if (error.name !== "AbortError") {
            notify(error.message);
            setDrafts((current) => ({
              ...current,
              [runId]: current[runId] || input.prompt,
            }));
          }
        })
        .finally(() => {
          controllers.current.delete(runId);
          void refresh().catch((error) => notify(error.message));
        });
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "任务创建失败");
      return false;
    } finally {
      sending.current = false;
      setPending(false);
    }
  };
  const stop = async () => {
    if (!activeId) return;
    try {
      await api(`/tasks/${activeId}/stop`, { method: "POST" });
      notify("已请求停止生成");
      await refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "停止失败");
    }
  };
  const retry = (index: number) => {
    const previous = task?.messages
      .slice(0, index)
      .findLast((message) => message.role === "user");
    if (previous)
      void submit({
        prompt: previous.content,
        skillId: previous.skillId,
        fileIds: previous.fileIds,
        modelId: previous.modelId,
        reasoning: previous.reasoning,
      });
  };
  const startTemplate = (prompt: string, chosenSkill?: string) => {
    newTask();
    setSkillId(chosenSkill ?? "");
    setDrafts((current) => ({ ...current, new: prompt }));
    window.setTimeout(
      () =>
        document
          .querySelector<HTMLTextAreaElement>(".composer textarea")
          ?.focus(),
      0,
    );
  };
  const openPreview = async (file: WorkspaceFile) => {
    try {
      const result = await api<{ file: WorkspaceFile; content: string }>(
        `/files/${file.id}`,
      );
      setPreview(result);
    } catch (error) {
      notify(error instanceof Error ? error.message : "无法预览文件");
    }
  };
  const edit = (chosen: Task) => {
    setEditing(chosen);
    setEditTitle(chosen.title);
    setEditProject(chosen.project);
    setConfirmDelete(false);
  };
  const saveTask = async () => {
    if (!editing || !editTitle.trim()) return;
    setSaving(true);
    try {
      const next = await api<Task>(`/tasks/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editTitle.trim(),
          project: editProject.trim() || "个人任务",
        }),
      });
      updateTask(next);
      setEditing(null);
      notify("任务信息已保存");
    } catch (error) {
      notify(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };
  const deleteTask = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api(`/tasks/${editing.id}`, { method: "DELETE" });
      if (activeId === editing.id) setActiveId(null);
      await refresh();
      setEditing(null);
      notify("任务已删除");
    } catch (error) {
      notify(error instanceof Error ? error.message : "删除失败");
    } finally {
      setSaving(false);
    }
  };

  if (!data)
    return (
      <div className="boot-screen">
        <span className="brand-mark">S</span>
        <h1>Study Work</h1>
        {loadError ? (
          <>
            <p>{loadError}</p>
            <button
              className="button"
              onClick={() =>
                void refresh().catch((error) => setLoadError(error.message))
              }
            >
              重新连接
            </button>
          </>
        ) : (
          <>
            <LoaderCircle className="spin" size={20} />
            <p>正在打开你的工作区</p>
          </>
        )}
      </div>
    );
  const title =
    view === "chat"
      ? task?.title || "新建任务"
      : view === "settings"
        ? "工作区设置"
        : navigation.find((item) => item.id === view)?.label || "";
  const searchResults = data.tasks.filter(
    (t) =>
      !query ||
      `${t.title} ${t.messages.map((m) => m.content).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const taskFiles = data.files.filter(
    (file) =>
      file.taskId === task?.id ||
      task?.messages.some(
        (message) =>
          message.fileIds?.includes(file.id) ||
          message.artifactIds?.includes(file.id),
      ),
  );
  return (
    <div
      className={`app-shell ${sidebarOpen ? "sidebar-visible" : "sidebar-hidden"}`}
    >
      <Sidebar
        data={data}
        view={view}
        activeId={activeId}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onView={changeView}
        onNew={newTask}
        onSelect={selectTask}
        onSearch={() => {
          setQuery("");
          setSearchOpen(true);
        }}
        onEdit={edit}
      />
      <main className="main-workspace">
        <header className="topbar">
          <div className="topbar-title">
            {!sidebarOpen && (
              <button
                className="icon-button"
                aria-label="展开侧栏"
                onClick={() => setSidebarOpen(true)}
              >
                <PanelLeft size={19} />
              </button>
            )}
            {view === "chat" && (
              <span className="topbar-section">
                任务
                <ChevronRight size={14} />
              </span>
            )}
            <h1>{title}</h1>
            {task?.demo && view === "chat" && (
              <span className="topbar-example">示例任务</span>
            )}
          </div>
          <div className="topbar-actions">
            {task && view === "chat" && (
              <span
                className={`task-status ${task.status === "running" ? "running" : ""}`}
              >
                <span />
                {task.status === "running"
                  ? "进行中"
                  : task.status === "failed"
                    ? "未完成"
                    : "已保存"}
              </span>
            )}
            <button
              className="icon-button"
              aria-label="搜索任务和对话"
              title="搜索任务和对话"
              onClick={() => {
                setQuery("");
                setSearchOpen(true);
              }}
            >
              <Search size={18} />
            </button>
            {task && view === "chat" && (
              <>
                <button
                  className={`icon-button ${detailsOpen ? "selected" : ""}`}
                  aria-label="任务详情"
                  title="任务详情"
                  onClick={() => setDetailsOpen(!detailsOpen)}
                >
                  <PanelRight size={18} />
                </button>
                <button
                  className="icon-button"
                  aria-label="管理当前任务"
                  title="管理当前任务"
                  onClick={() => edit(task)}
                >
                  <MoreHorizontal size={19} />
                </button>
              </>
            )}
          </div>
        </header>
        {view === "chat" ? (
          <div className="chat-layout">
            <section className="chat-main" aria-label="任务对话">
              <Conversation
                task={task}
                data={data}
                onPreview={(file) => void openPreview(file)}
                onRetry={retry}
                onPrompt={(text) =>
                  setDrafts((current) => ({ ...current, [draftKey]: text }))
                }
                notify={notify}
              />
              <Composer
                key={draftKey}
                value={draft}
                onChange={(text) =>
                  setDrafts((current) => ({ ...current, [draftKey]: text }))
                }
                skills={data.skills}
                provider={data.provider}
                files={data.files.filter(
                  (file) => file.kind === "upload" || file.taskId === activeId,
                )}
                skillId={skillId}
                onSkill={setSkillId}
                running={
                  task?.status === "running" ||
                  (!!activeId && controllers.current.has(activeId))
                }
                disabled={pending}
                onSend={submit}
                onStop={() => void stop()}
                onUpload={refresh}
                notify={notify}
              />
            </section>
            {detailsOpen && task && (
              <aside className="task-detail">
                <div className="detail-header">
                  <h2>任务详情</h2>
                  <button
                    className="icon-button"
                    aria-label="关闭任务详情"
                    onClick={() => setDetailsOpen(false)}
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="detail-body">
                  <span className="detail-label">所属项目</span>
                  <p className="detail-project">
                    <Folder size={16} />
                    {task.project || "未分组"}
                  </p>
                  <span className="detail-label">创建时间</span>
                  <p>{new Date(task.createdAt).toLocaleString("zh-CN")}</p>
                  <span className="detail-label">
                    任务资料 · {taskFiles.length}
                  </span>
                  <div className="detail-files">
                    {taskFiles.map((file) => (
                      <FileCard
                        file={file}
                        key={file.id}
                        onPreview={(f) => void openPreview(f)}
                      />
                    ))}
                    {!taskFiles.length && (
                      <p className="muted">
                        在输入区添加文件，让 AI 获得更多上下文。
                      </p>
                    )}
                  </div>
                  <div className="detail-note">
                    <Check size={16} />
                    <span>任务与文件已保存在本地工作区。</span>
                  </div>
                </div>
              </aside>
            )}
          </div>
        ) : (
          <WorkspacePages
            view={view}
            data={data}
            refresh={refresh}
            onStart={startTemplate}
            onOpenTask={selectTask}
            notify={notify}
          />
        )}
      </main>
      <Dialog
        open={searchOpen}
        title="搜索任务和对话"
        onClose={() => setSearchOpen(false)}
        className="search-dialog"
      >
        <label className="search-input">
          <Search size={18} />
          <input
            autoFocus
            placeholder="输入任务名称或对话内容…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd>ESC</kbd>
        </label>
        <div className="search-results">
          {searchResults.map((result) => (
            <button
              key={result.id}
              onClick={() => {
                selectTask(result.id);
                setSearchOpen(false);
              }}
            >
              <FileText size={17} />
              <span>
                <strong>{result.title}</strong>
                <small>
                  {result.project} ·{" "}
                  {new Date(result.updatedAt).toLocaleDateString("zh-CN")}
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
          {!searchResults.length && (
            <p className="empty-search">没有找到相关任务，试试其他关键词。</p>
          )}
        </div>
      </Dialog>
      <Dialog
        open={!!editing}
        title={confirmDelete ? "删除这条任务？" : "管理任务"}
        onClose={() => !saving && setEditing(null)}
      >
        {confirmDelete ? (
          <>
            <p className="dialog-description">
              「{editing?.title}」的对话历史将被删除，此操作无法撤销。
            </p>
            <div className="dialog-actions">
              <button
                className="button"
                disabled={saving}
                onClick={() => setConfirmDelete(false)}
              >
                返回
              </button>
              <button
                className="button button-danger"
                disabled={saving}
                onClick={() => void deleteTask()}
              >
                确认删除
              </button>
            </div>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveTask();
            }}
          >
            <label className="field-label">
              任务名称
              <input
                value={editTitle}
                autoFocus
                maxLength={100}
                required
                onChange={(event) => setEditTitle(event.target.value)}
              />
            </label>
            <label className="field-label">
              所属项目
              <input
                value={editProject}
                maxLength={60}
                placeholder="例如：内容工作室"
                onChange={(event) => setEditProject(event.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="button danger-text"
                disabled={saving || editing?.status === "running"}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={15} />
                删除任务
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={saving || !editTitle.trim()}
              >
                {saving ? "正在保存…" : "保存修改"}
              </button>
            </div>
          </form>
        )}
      </Dialog>
      <Dialog
        open={!!preview}
        title={preview?.file.name || "文件预览"}
        onClose={() => setPreview(null)}
        className="preview-dialog"
      >
        <div className="file-preview-content markdown">
          {preview?.file.name.endsWith(".md") ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {preview.content}
            </ReactMarkdown>
          ) : (
            <pre>{preview?.content}</pre>
          )}
        </div>
        {preview && (
          <div className="dialog-actions">
            <span className="muted">
              {(preview.file.size / 1024).toFixed(1)} KB · 本地文件
            </span>
            <a
              href={`/api/files/${preview.file.id}/download`}
              className="button"
            >
              <Download size={15} />
              下载文件
            </a>
          </div>
        )}
      </Dialog>
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
