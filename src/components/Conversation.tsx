import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Copy,
  FileText,
  RotateCcw,
  Sparkles,
  Square,
  Workflow,
} from "lucide-react";
import type {
  Bootstrap,
  Message,
  Task,
  WorkspaceFile,
} from "../../shared/types";

export function FileCard({
  file,
  onPreview,
}: {
  file: WorkspaceFile;
  onPreview: (file: WorkspaceFile) => void;
}) {
  return (
    <div className="artifact-card">
      <button className="artifact-main" onClick={() => onPreview(file)}>
        <span className="document-icon">
          <FileText size={24} />
        </span>
        <span>
          <strong>{file.name}</strong>
          <small>
            {file.kind === "artifact" ? "任务交付物" : "参考资料"} ·{" "}
            {(file.size / 1024).toFixed(1)} KB
          </small>
        </span>
      </button>
      <a
        className="icon-button"
        title="下载文件"
        aria-label={`下载 ${file.name}`}
        href={`/api/files/${file.id}/download`}
      >
        <ArrowDownToLine size={17} />
      </a>
    </div>
  );
}

function AssistantMessage({
  message,
  files,
  onPreview,
  onRetry,
  notify,
  running,
}: {
  message: Message;
  files: WorkspaceFile[];
  onPreview: (file: WorkspaceFile) => void;
  onRetry: () => void;
  notify: (text: string) => void;
  running: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const steps = message.steps ?? [];
  const failed = message.status === "failed";
  const active = message.status === "running";
  const stopped = message.status === "stopped";
  const duration = message.durationMs
    ? `${Math.max(1, Math.round(message.durationMs / 1000))} 秒`
    : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      notify("已复制回答");
    } catch {
      notify("复制失败，请选择文本后复制");
    }
  };
  return (
    <article className="assistant-message">
      <div className="assistant-identity">
        <span className="assistant-avatar">
          <Workflow size={17} />
        </span>
        <strong>Study Work</strong>
        {message.demo && <span className="demo-label">示例</span>}
      </div>
      {steps.length > 0 && (
        <div className={`execution ${expanded ? "expanded" : ""}`}>
          <button
            className="execution-summary"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {failed ? (
              <CircleAlert size={15} />
            ) : active ? (
              <span className="status-dot pulse" />
            ) : stopped ? (
              <Square size={13} />
            ) : (
              <Check size={16} />
            )}
            <span>
              {active
                ? "正在处理任务"
                : failed
                  ? "任务未完成"
                  : stopped
                    ? "已停止"
                    : "已完成"}
              {duration ? ` · ${duration}` : ""}
              <span className="execution-separator">·</span>
              {steps.length} 个步骤
            </span>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {expanded && (
            <ol className="execution-steps">
              {steps.map((step) => (
                <li key={step.id}>
                  {step.status === "completed" ? (
                    <Check size={13} />
                  ) : step.status === "failed" ? (
                    <CircleAlert size={13} />
                  ) : (
                    <span className="status-dot pulse" />
                  )}
                  <span>
                    {step.label}
                    {step.detail && <small>{step.detail}</small>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      {message.content ? (
        <div className="markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
          {active && <span className="stream-cursor" />}
        </div>
      ) : active ? (
        <div className="thinking-state">
          <span />
          <span />
          <span />
          <span className="sr-only">正在生成回答</span>
        </div>
      ) : (
        <p className="muted">
          {stopped
            ? "本次生成已停止，你可以继续补充任务。"
            : failed
              ? "任务执行失败，请重试。"
              : "本次任务没有返回文本。"}
        </p>
      )}
      {message.error && (
        <div className="message-error" role="alert">
          <CircleAlert size={16} />
          <span>{message.error}</span>
        </div>
      )}
      {(message.artifactIds ?? []).map((id) => {
        const file = files.find((file) => file.id === id);
        return file ? (
          <FileCard key={id} file={file} onPreview={onPreview} />
        ) : null;
      })}
      {!active && (
        <div className="message-actions">
          <button
            className="icon-button"
            aria-label="复制回答"
            title="复制回答"
            disabled={!message.content}
            onClick={() => void copy()}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
          <button
            className="icon-button"
            aria-label="重新生成"
            title="重新生成"
            onClick={onRetry}
            disabled={running}
          >
            <RotateCcw size={15} />
          </button>
          <span className="message-model">
            {message.demo ? "演示模式" : "DeepSeek"}
            <i />
            {failed ? "执行失败" : stopped ? "手动停止" : "任务已保存"}
          </span>
        </div>
      )}
    </article>
  );
}

export function Conversation({
  task,
  data,
  onPreview,
  onRetry,
  onPrompt,
  notify,
}: {
  task: Task | undefined;
  data: Bootstrap;
  onPreview: (file: WorkspaceFile) => void;
  onRetry: (messageIndex: number) => void;
  onPrompt: (text: string) => void;
  notify: (message: string) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const [showBottom, setShowBottom] = useState(false);
  const last = task?.messages.at(-1);
  useEffect(() => {
    follow.current = true;
    setShowBottom(false);
    scroll.current?.scrollTo({ top: 0 });
  }, [task?.id]);
  useEffect(() => {
    if (follow.current && task?.status === "running")
      scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
  }, [last?.content, last?.steps?.length, task?.status]);
  if (!task || task.messages.length === 0)
    return (
      <div className="welcome">
        <span className="welcome-mark">
          <Workflow size={34} strokeWidth={1.5} />
        </span>
        <span className="welcome-greeting">你的 AI 工作搭档，准备就绪</span>
        <h1>今天，我们一起完成什么？</h1>
        <p>从一个想法、一份资料，或一个待办开始。</p>
        <div className="starter-prompts">
          <button
            onClick={() =>
              onPrompt("帮我梳理一个新项目的目标、里程碑和下一步行动。")
            }
          >
            <Sparkles size={17} />
            <span>把想法变成行动计划</span>
            <ArrowRight size={15} />
          </button>
          <button
            onClick={() =>
              onPrompt("请根据我上传的资料，提炼重点并整理成一份清晰的总结。")
            }
          >
            <FileText size={17} />
            <span>读懂资料，整理重点</span>
            <ArrowRight size={15} />
          </button>
          <button
            onClick={() =>
              onPrompt("帮我写一份本周工作总结，请先询问你需要的信息。")
            }
          >
            <Workflow size={17} />
            <span>写一份有条理的周报</span>
            <ArrowRight size={15} />
          </button>
        </div>
        <span className="welcome-tip">也可以输入 / ，发现更多专业技能</span>
      </div>
    );
  return (
    <div
      className="conversation-scroll"
      ref={scroll}
      onScroll={() => {
        const node = scroll.current;
        if (node) {
          follow.current =
            node.scrollHeight - node.scrollTop - node.clientHeight < 100;
          setShowBottom(!follow.current);
        }
      }}
    >
      <div className="conversation">
        <div className="conversation-date">
          <span />
          {new Date(task.createdAt).toLocaleDateString("zh-CN", {
            month: "long",
            day: "numeric",
          })}
          <span />
        </div>
        {task.messages.map((message, index) =>
          message.role === "user" ? (
            <article key={message.id} className="user-message">
              <div className="user-content">
                {message.skillId && (
                  <span className="user-skill">
                    <Sparkles size={13} />
                    {data.skills.find((s) => s.id === message.skillId)?.name ||
                      "任务技能"}
                  </span>
                )}
                <p>{message.content}</p>
              </div>
              {(message.fileIds ?? []).length > 0 && (
                <div className="user-attachments">
                  {message.fileIds?.map((id) => {
                    const file = data.files.find((f) => f.id === id);
                    return (
                      file && (
                        <button key={id} onClick={() => onPreview(file)}>
                          <FileText size={14} />
                          {file.name}
                        </button>
                      )
                    );
                  })}
                </div>
              )}
            </article>
          ) : (
            <AssistantMessage
              key={message.id}
              message={message}
              files={data.files}
              onPreview={onPreview}
              onRetry={() => onRetry(index)}
              notify={notify}
              running={task.status === "running"}
            />
          ),
        )}
        {task.status !== "running" &&
          last?.role === "assistant" &&
          last.status !== "failed" && (
            <div className="followup-row">
              <span>继续探索</span>
              <button
                onClick={() =>
                  onPrompt("把以上内容整理成一份可执行的行动清单。")
                }
              >
                整理成行动清单
                <ArrowRight size={13} />
              </button>
              <button
                onClick={() => onPrompt("基于以上内容，给出下一步的建议。")}
              >
                下一步建议
                <ArrowRight size={13} />
              </button>
            </div>
          )}
      </div>
      {showBottom && (
        <button
          className="jump-bottom icon-button"
          aria-label="滚动到底部"
          onClick={() => {
            follow.current = true;
            scroll.current?.scrollTo({
              top: scroll.current.scrollHeight,
              behavior: "smooth",
            });
          }}
        >
          <ArrowDown size={17} />
        </button>
      )}
    </div>
  );
}
