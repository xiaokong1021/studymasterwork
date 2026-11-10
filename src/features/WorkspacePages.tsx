import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  FolderOpen,
  Info,
  Loader2,
  Play,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  Workflow,
  X,
} from "lucide-react";
import type {
  Automation,
  Bootstrap,
  Skill,
  Task,
  WorkspaceFile,
} from "../../shared/types";
import { api } from "../api";

export type PageView =
  "skills" | "files" | "automations" | "workflows" | "settings";
interface Props {
  view: PageView;
  data: Bootstrap;
  refresh: () => Promise<void>;
  onStart: (prompt: string, skillId?: string) => void;
  onOpenTask: (id: string) => void;
  notify: (message: string) => void;
}

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "操作失败，请重试。";
const date = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
const size = (value: number) =>
  value < 1024
    ? `${value} B`
    : value < 1024 * 1024
      ? `${(value / 1024).toFixed(1)} KB`
      : `${(value / (1024 * 1024)).toFixed(1)} MB`;
const intervals: Record<number, string> = {
  15: "每 15 分钟",
  60: "每小时",
  1440: "每天",
  10080: "每周",
};

function Modal({
  title,
  onClose,
  children,
  wide = false,
  busy = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`workspace-dialog${wide ? " workspace-dialog-wide" : ""}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="workspace-dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="关闭弹窗"
          onClick={onClose}
          disabled={busy}
        >
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="page-error" role="alert">
      <Info size={17} />
      <span>{children}</span>
    </div>
  );
}
function Empty({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="page-empty">
      {icon}
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="page-search">
      <Search size={17} />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </label>
  );
}

export function WorkspacePages(props: Props) {
  return (
    <section
      className={`workspace-page workspace-page-${props.view}`}
      key={props.view}
    >
      {props.view === "skills" && <SkillsPage {...props} />}
      {props.view === "files" && <FilesPage {...props} />}
      {props.view === "automations" && <AutomationsPage {...props} />}
      {props.view === "workflows" && <WorkflowsPage {...props} />}
      {props.view === "settings" && <SettingsPage {...props} />}
    </section>
  );
}

function SkillsPage({ data, onStart }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [selected, setSelected] = useState<Skill | null>(null);
  const skills = data.skills.filter(
    (skill) =>
      (category === "全部" || skill.category === category) &&
      `${skill.name} ${skill.description}`
        .toLowerCase()
        .includes(query.toLowerCase().trim()),
  );
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>技能</h1>
          <p>为任务选择一套合适的方法。</p>
        </div>
        <span className="page-count">{data.skills.length} 个技能</span>
      </header>
      <div className="page-toolbar">
        <div className="page-tabs" role="group" aria-label="技能分类">
          {["全部", "写作", "分析", "效率"].map((item) => (
            <button
              className={category === item ? "selected" : ""}
              key={item}
              onClick={() => setCategory(item)}
              aria-pressed={category === item}
            >
              {item}
            </button>
          ))}
        </div>
        <SearchBox value={query} onChange={setQuery} placeholder="搜索技能" />
      </div>
      {skills.length ? (
        <div className="skill-list">
          {skills.map((skill) => (
            <button
              className="skill-item"
              key={skill.id}
              onClick={() => setSelected(skill)}
            >
              <span className="skill-symbol">
                <Sparkles size={21} />
              </span>
              <span className="skill-copy">
                <span className="skill-title">
                  {skill.name}
                  <span className="page-tag">{skill.category}</span>
                </span>
                <span className="skill-description">{skill.description}</span>
              </span>
              <ChevronRight className="skill-chevron" size={18} />
            </button>
          ))}
        </div>
      ) : (
        <Empty icon={<Search size={28} />} title="没有找到匹配的技能">
          试试其他关键词，或切换到全部分类。
        </Empty>
      )}
      <div className="page-footnote">
        <Info size={15} />
        <span>技能会为新任务补充方法和要求，你仍可以调整任务内容。</span>
      </div>
      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)}>
          <span className="page-tag">{selected.category}</span>
          <p className="dialog-description">{selected.description}</p>
          <div className="skill-detail">
            <h3>执行方法</h3>
            <p>{selected.prompt}</p>
            <h3>从这个任务开始</h3>
            <p>{selected.starter}</p>
          </div>
          <div className="dialog-actions">
            <button className="button" onClick={() => setSelected(null)}>
              取消
            </button>
            <button
              className="button button-primary"
              onClick={() => onStart(selected.starter, selected.id)}
            >
              使用技能 <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function FilesPage({ data, refresh, notify, onOpenTask }: Props) {
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<WorkspaceFile | null>(null);
  const [content, setContent] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [deleteFile, setDeleteFile] = useState<WorkspaceFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const previewRequest = useRef(0);
  const files = data.files.filter((file) =>
    file.name.toLowerCase().includes(query.toLowerCase().trim()),
  );
  useEffect(
    () => () => {
      previewRequest.current += 1;
    },
    [],
  );
  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setUploading(true);
    setError("");
    let count = 0;
    const errors: string[] = [];
    for (const file of Array.from(list)) {
      try {
        if (!/\.(txt|md|csv|json|log)$/i.test(file.name))
          throw new Error(
            `${file.name}：支持 txt、md、csv、json 和 log 文件。`,
          );
        if (file.size > 1024 * 1024)
          throw new Error(`${file.name}：文件大小不能超过 1 MB。`);
        const fileContent = await file.text();
        if (fileContent.includes("\u0000"))
          throw new Error(`${file.name}：请上传 UTF-8 文本文件。`);
        await api<WorkspaceFile>("/files", {
          method: "POST",
          body: JSON.stringify({ name: file.name, content: fileContent }),
        });
        count++;
      } catch (err) {
        errors.push(messageOf(err));
      }
    }
    try {
      if (count) await refresh();
    } catch (err) {
      errors.push(messageOf(err));
    }
    setError(errors.join(" "));
    if (count) notify(`已上传 ${count} 个文件`);
    setUploading(false);
    if (input.current) input.current.value = "";
  }
  async function openPreview(file: WorkspaceFile) {
    const request = ++previewRequest.current;
    setPreview(file);
    setContent("");
    setPreviewError("");
    setLoadingPreview(true);
    try {
      const result = await api<{ file: WorkspaceFile; content: string }>(
        `/files/${encodeURIComponent(file.id)}`,
      );
      if (request === previewRequest.current) setContent(result.content);
    } catch (err) {
      if (request === previewRequest.current) setPreviewError(messageOf(err));
    } finally {
      if (request === previewRequest.current) setLoadingPreview(false);
    }
  }
  async function removeFile() {
    if (!deleteFile) return;
    setDeleting(true);
    setError("");
    try {
      await api(`/files/${encodeURIComponent(deleteFile.id)}`, {
        method: "DELETE",
      });
      await refresh();
      setDeleteFile(null);
      notify("文件已删除");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setDeleting(false);
    }
  }
  async function download(file: WorkspaceFile) {
    setDownloading(file.id);
    setError("");
    try {
      const response = await fetch(
        `/api/files/${encodeURIComponent(file.id)}/download`,
      );
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "下载失败，请重试。");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      const message = messageOf(err);
      setError(message);
      notify(message);
    } finally {
      setDownloading(null);
    }
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>文件</h1>
          <p>保留任务资料，也收好每一次交付。</p>
        </div>
        <button
          className="button button-primary"
          disabled={uploading}
          onClick={() => input.current?.click()}
        >
          {uploading ? (
            <Loader2 className="page-spin" size={16} />
          ) : (
            <Upload size={16} />
          )}{" "}
          {uploading ? "正在上传…" : "上传文件"}
        </button>
        <input
          ref={input}
          className="visually-hidden"
          tabIndex={-1}
          type="file"
          accept=".md,.txt,.csv,.json,.log"
          multiple
          onChange={(event) => void upload(event.target.files)}
        />
      </header>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="page-toolbar">
        <span className="page-count">共 {data.files.length} 个文件</span>
        <SearchBox value={query} onChange={setQuery} placeholder="搜索文件" />
      </div>
      <p className="file-upload-hint">
        支持 Markdown、TXT、CSV、JSON、LOG，可一次选择多个文件，每个不超过 1
        MB。
      </p>
      {files.length ? (
        <div className="file-list">
          <div className="file-list-labels">
            <span>名称</span>
            <span>大小</span>
            <span>添加时间</span>
            <span className="visually-hidden">操作</span>
          </div>
          {files.map((file) => (
            <div className="file-row" key={file.id}>
              <button
                className="file-name"
                onClick={() => void openPreview(file)}
              >
                <span className="file-symbol">
                  <FileText size={19} />
                </span>
                <span>
                  <strong>{file.name}</strong>
                  <small>
                    {file.kind === "artifact" ? "任务交付物" : "上传的资料"}
                  </small>
                </span>
              </button>
              <span className="file-size">{size(file.size)}</span>
              <time className="file-date" dateTime={file.createdAt}>
                {date(file.createdAt)}
              </time>
              <div className="file-actions">
                <button
                  className="icon-button"
                  disabled={downloading !== null}
                  onClick={() => void download(file)}
                  aria-label={`下载 ${file.name}`}
                  title="下载"
                >
                  {downloading === file.id ? (
                    <Loader2 className="page-spin" size={17} />
                  ) : (
                    <Download size={17} />
                  )}
                </button>
                <button
                  className="icon-button"
                  aria-label={`删除 ${file.name}`}
                  title="删除"
                  onClick={() => {
                    setError("");
                    setDeleteFile(file);
                  }}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          icon={<FolderOpen size={30} />}
          title={query ? "没有找到这个文件" : "把任务需要的资料放在这里"}
        >
          {query
            ? "换一个文件名试试。"
            : "上传文本文件后，可以在任务输入框中将它添加为参考资料。"}
        </Empty>
      )}
      {preview && (
        <Modal
          title={preview.name}
          wide
          onClose={() => {
            previewRequest.current += 1;
            setPreview(null);
          }}
        >
          <div className="preview-meta">
            {size(preview.size)} · {date(preview.createdAt)}
          </div>
          {loadingPreview ? (
            <div className="preview-loading" role="status">
              <div />
              <div />
              <div />
              <span>正在读取文件…</span>
            </div>
          ) : previewError ? (
            <>
              <ErrorNote>{previewError}</ErrorNote>
              <button
                className="button"
                onClick={() => void openPreview(preview)}
              >
                重新读取
              </button>
            </>
          ) : (
            <pre className="file-preview" tabIndex={0}>
              {content || "（空文件）"}
            </pre>
          )}
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="dialog-actions">
            {preview.taskId && (
              <button
                className="button"
                onClick={() => onOpenTask(preview.taskId!)}
              >
                查看原任务 <ArrowRight size={15} />
              </button>
            )}
            <button
              className="button button-primary"
              disabled={downloading !== null}
              onClick={() => void download(preview)}
            >
              {downloading === preview.id ? (
                <Loader2 className="page-spin" size={16} />
              ) : (
                <Download size={16} />
              )}
              下载文件
            </button>
          </div>
        </Modal>
      )}
      {deleteFile && (
        <Modal
          title="删除文件？"
          onClose={() => setDeleteFile(null)}
          busy={deleting}
        >
          <p className="dialog-description">
            将永久删除「{deleteFile.name}」。之后任务将无法读取此文件。
          </p>
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="dialog-actions">
            <button
              className="button"
              disabled={deleting}
              onClick={() => setDeleteFile(null)}
            >
              取消
            </button>
            <button
              className="button page-danger-button"
              disabled={deleting}
              onClick={() => void removeFile()}
            >
              {deleting ? "正在删除…" : "删除文件"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function AutomationsPage({ data, refresh, onOpenTask, notify }: Props) {
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Automation | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function perform(
    id: string,
    action: "toggle" | "run" | "delete",
    enabled?: boolean,
  ) {
    setPending(id);
    setError("");
    try {
      if (action === "run") {
        const task = await api<Task>(
          `/automations/${encodeURIComponent(id)}/run`,
          { method: "POST" },
        );
        await refresh();
        onOpenTask(task.id);
        notify("已创建自动化任务");
      } else {
        await api(`/automations/${encodeURIComponent(id)}`, {
          method: action === "toggle" ? "PATCH" : "DELETE",
          ...(action === "toggle" ? { body: JSON.stringify({ enabled }) } : {}),
        });
        await refresh();
        if (action === "delete") {
          setDeleting(null);
          notify("自动化已删除");
        }
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPending(null);
    }
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>自动化</h1>
          <p>把重复的任务安排好，按时开始。</p>
        </div>
        <button
          className="button button-primary"
          onClick={() => {
            setError("");
            setCreating(true);
          }}
        >
          <Plus size={17} />
          创建自动化
        </button>
      </header>
      <div className="automation-notice">
        <Clock3 size={19} />
        <p>
          自动化由本地服务按间隔执行。请保持服务运行；服务关闭期间不会执行，重新启动后会继续检查计划。
        </p>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {data.automations.length ? (
        <div className="automation-list">
          {data.automations.map((item) => (
            <article className="automation-item" key={item.id}>
              <div className="automation-main">
                <span className="automation-icon">
                  <Clock3 size={21} />
                </span>
                <div>
                  <h2>{item.name}</h2>
                  <p>{item.prompt}</p>
                  <div className="automation-meta">
                    <span>
                      {intervals[item.intervalMinutes] ||
                        `每 ${item.intervalMinutes} 分钟`}
                    </span>
                    <span>
                      {item.enabled
                        ? `下次：${date(item.nextRunAt)}`
                        : "已暂停"}
                    </span>
                    {item.lastRunAt && (
                      <span>上次：{date(item.lastRunAt)}</span>
                    )}
                  </div>
                  {item.lastTaskId && (
                    <button
                      className="page-text-button"
                      onClick={() => onOpenTask(item.lastTaskId!)}
                    >
                      查看上次任务 <ChevronRight size={14} />
                    </button>
                  )}
                </div>
              </div>
              <div className="automation-actions">
                <button
                  className="page-switch"
                  role="switch"
                  aria-checked={item.enabled}
                  aria-label={`${item.enabled ? "暂停" : "启用"} ${item.name}`}
                  disabled={pending !== null}
                  onClick={() => void perform(item.id, "toggle", !item.enabled)}
                >
                  <span />
                </button>
                <button
                  className="icon-button"
                  title="立即运行"
                  aria-label={`立即运行 ${item.name}`}
                  disabled={pending !== null}
                  onClick={() => void perform(item.id, "run")}
                >
                  {pending === item.id ? (
                    <Loader2 size={17} className="page-spin" />
                  ) : (
                    <Play size={17} />
                  )}
                </button>
                <button
                  className="icon-button"
                  title="删除自动化"
                  aria-label={`删除自动化 ${item.name}`}
                  disabled={pending !== null}
                  onClick={() => {
                    setError("");
                    setDeleting(item);
                  }}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty icon={<Clock3 size={30} />} title="安排你的第一个例行任务">
          例如每天整理一份工作计划，或每周生成复盘提纲。
        </Empty>
      )}
      {creating && (
        <AutomationForm
          skills={data.skills}
          onClose={() => setCreating(false)}
          onCreated={async () => {
            await refresh();
            setCreating(false);
            notify("自动化已创建");
          }}
        />
      )}
      {deleting && (
        <Modal
          title="删除自动化？"
          onClose={() => setDeleting(null)}
          busy={pending !== null}
        >
          <p className="dialog-description">
            「{deleting.name}」将不再定时执行。已经创建的任务可以继续查看。
          </p>
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="dialog-actions">
            <button
              className="button"
              disabled={pending !== null}
              onClick={() => setDeleting(null)}
            >
              取消
            </button>
            <button
              className="button page-danger-button"
              disabled={pending !== null}
              onClick={() => void perform(deleting.id, "delete")}
            >
              {pending ? "正在删除…" : "删除自动化"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function AutomationForm({
  skills,
  onClose,
  onCreated,
}: {
  skills: Skill[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [interval, setInterval] = useState("1440");
  const [skillId, setSkillId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !prompt.trim()) {
      setError("请填写名称和任务内容。");
      return;
    }
    setPending(true);
    setError("");
    try {
      if (!saved) {
        await api<Automation>("/automations", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            prompt: prompt.trim(),
            intervalMinutes: Number(interval),
            ...(skillId ? { skillId } : {}),
          }),
        });
        setSaved(true);
      }
      await onCreated();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal title="创建自动化" onClose={onClose} busy={pending}>
      <form className="page-form" onSubmit={(event) => void submit(event)}>
        <label>
          名称
          <input
            autoFocus
            required
            maxLength={100}
            value={name}
            disabled={pending || saved}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：每周资料回顾"
          />
        </label>
        <label>
          任务内容
          <textarea
            required
            maxLength={20000}
            rows={5}
            value={prompt}
            disabled={pending || saved}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="描述你希望完成的工作，以及结果应包含什么。"
          />
        </label>
        <div className="page-form-columns">
          <label>
            执行间隔
            <select
              value={interval}
              disabled={pending || saved}
              onChange={(event) => setInterval(event.target.value)}
            >
              {[15, 60, 1440, 10080].map((value) => (
                <option key={value} value={value}>
                  {intervals[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            使用技能
            <select
              value={skillId}
              disabled={pending || saved}
              onChange={(event) => setSkillId(event.target.value)}
            >
              <option value="">不指定技能</option>
              {skills.map((skill) => (
                <option value={skill.id} key={skill.id}>
                  {skill.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="form-hint">
          首次执行将在创建后的一个间隔开始。也可以创建后立即手动运行。
        </p>
        {error && (
          <ErrorNote>
            {saved ? `自动化已保存，列表刷新失败：${error}` : error}
          </ErrorNote>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="button"
            disabled={pending}
            onClick={onClose}
          >
            取消
          </button>
          <button className="button button-primary" disabled={pending}>
            {pending ? "正在保存…" : saved ? "重新刷新列表" : "创建自动化"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const workflows = [
  {
    name: "从资料到研究简报",
    description: "整理已有材料，提炼证据、结论和待确认的问题。",
    icon: BookOpen,
    stages: ["梳理资料", "交叉分析", "形成简报"],
    prompt:
      "请根据我接下来提供的资料，完成一份研究简报。先列出关键问题，再梳理证据与不同观点，明确区分事实和推断，最后输出结论、资料缺口和下一步建议。请先询问研究主题、受众和我可以提供的材料，不要在缺少资料时编造来源。",
  },
  {
    name: "把想法写成一份方案",
    description: "从目标和约束出发，让初步想法变成可讨论的文档。",
    icon: FileText,
    stages: ["明确目标", "比较方案", "写出初稿"],
    prompt:
      "请帮我把一个初步想法整理为可执行的方案。先向我确认目标、受众、资源和时间约束，再提出两到三个可比较的方向，说明取舍，最后形成包含目标、实施步骤、风险与验收标准的方案初稿。请先问我这次要解决什么问题。",
  },
  {
    name: "每周工作复盘",
    description: "回顾完成的工作，找到阻碍，安排下一周的重点。",
    icon: Clock3,
    stages: ["回顾进展", "识别阻碍", "安排下周"],
    prompt:
      "请引导我完成本周工作复盘。先让我提供本周目标、完成事项、未完成事项和遇到的困难，再按成果、偏差原因、经验和下周行动整理。下周行动要包含优先级和可验证的结果。请先给我一个简洁的资料收集提纲。",
  },
  {
    name: "整理一份决策对比",
    description: "对齐评价标准，清楚呈现选项之间的差异。",
    icon: Workflow,
    stages: ["定义标准", "比较选项", "记录决策"],
    prompt:
      "请协助我做一份决策对比。先确认需要选择什么、有哪些候选项、预算和不可妥协的约束，再一起确定评价维度和权重，用表格比较各方案。未知信息应明确标注，最后给出有条件的建议和决定前还需验证的事项。请先询问我面临的选择。",
  },
];
function WorkflowsPage({ onStart }: Props) {
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>工作流</h1>
          <p>从一个清楚的流程开始，把工作向前推进。</p>
        </div>
      </header>
      <div className="workflow-list">
        {workflows.map((item) => (
          <article className="workflow-item" key={item.name}>
            <div className="workflow-title">
              <item.icon size={22} />
              <h2>{item.name}</h2>
            </div>
            <p>{item.description}</p>
            <ol className="workflow-stages">
              {item.stages.map((stage) => (
                <li key={stage}>
                  <Check size={13} />
                  {stage}
                </li>
              ))}
            </ol>
            <button className="button" onClick={() => onStart(item.prompt)}>
              开始这个流程 <ArrowRight size={16} />
            </button>
          </article>
        ))}
      </div>
      <div className="page-footnote">
        <Info size={15} />
        <span>流程会创建一条可编辑的任务提示。AI 会先和你确认必要的信息。</span>
      </div>
    </>
  );
}

function SettingsPage({ data, refresh, notify }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function reload() {
    setPending(true);
    setError("");
    try {
      await refresh();
      notify("配置状态已刷新");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>设置</h1>
          <p>查看当前运行环境和模型连接状态。</p>
        </div>
      </header>
      <div className="settings-section">
        <div className="settings-section-title">
          <Settings2 size={19} />
          <h2>模型连接</h2>
        </div>
        <dl className="settings-values">
          <div>
            <dt>运行模式</dt>
            <dd>
              <span
                className={`provider-status ${data.provider.mode === "live" ? "is-live" : ""}`}
              >
                <span />
                {data.provider.mode === "live" ? "真实模型" : "演示模式"}
              </span>
            </dd>
          </div>
          <div>
            <dt>模型</dt>
            <dd>{data.provider.model || "尚未指定"}</dd>
          </div>
          <div>
            <dt>服务端密钥</dt>
            <dd>{data.provider.configured ? "已配置" : "未配置"}</dd>
          </div>
        </dl>
        <p className="settings-description">
          {data.provider.mode === "demo"
            ? "当前使用本地演示回复，用于体验任务、文件和执行流程。连接 DeepSeek 后将调用真实模型。"
            : "任务由服务端调用 DeepSeek 执行，调用费用由模型服务提供商按用量收取。"}
        </p>
        <button
          className="button"
          onClick={() => void reload()}
          disabled={pending}
        >
          {pending ? "正在检查…" : "刷新配置状态"}
        </button>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
      <div className="settings-section">
        <h2>连接 DeepSeek</h2>
        <ol className="settings-instructions">
          <li>
            在项目根目录创建或编辑 <code>.env</code> 文件，填入你的服务端配置。
          </li>
          <li>
            <pre>
              {"DEEPSEEK_API_KEY=你的 API 密钥\nDEEPSEEK_MODEL=deepseek-flash"}
            </pre>
          </li>
          <li>重新启动本地服务，然后点击上方的「刷新配置状态」。</li>
        </ol>
        <p className="settings-description">
          密钥仅保存在服务端环境文件中。请妥善保存，避免提交到代码仓库或分享给他人。
        </p>
      </div>
      <div className="settings-section">
        <h2>工作区与数据</h2>
        <p className="settings-description">
          任务、文件和自动化保存在本机服务的数据目录中，刷新浏览器后仍可继续。文件页可以下载资料与任务交付物。
        </p>
        <div className="settings-summary">
          <span>{data.tasks.length} 个任务</span>
          <span>{data.files.length} 个文件</span>
          <span>{data.automations.length} 个自动化</span>
        </div>
        <p className="settings-description">
          自动化需要本地服务持续运行。当前工作区供单人本地使用。
        </p>
      </div>
    </>
  );
}
