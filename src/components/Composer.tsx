import { useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  FileText,
  Layers3,
  Plus,
  ShieldCheck,
  Square,
  Upload,
  X,
} from "lucide-react";
import type {
  ModelMode,
  RunInput,
  Skill,
  WorkspaceFile,
} from "../../shared/types";
import { Dialog } from "./Dialog";
import { api } from "../api";

export function Composer({
  value,
  onChange,
  skills,
  files,
  skillId,
  onSkill,
  running,
  disabled,
  onSend,
  onStop,
  onUpload,
  notify,
}: {
  value: string;
  onChange: (value: string) => void;
  skills: Skill[];
  files: WorkspaceFile[];
  skillId: string;
  onSkill: (id: string) => void;
  running: boolean;
  disabled: boolean;
  onSend: (input: RunInput) => Promise<boolean>;
  onStop: () => void;
  onUpload: () => Promise<void>;
  notify: (text: string) => void;
}) {
  const [attachments, setAttachments] = useState<string[]>([]);
  const [model, setModel] = useState<ModelMode>("auto");
  const [picker, setPicker] = useState<
    "files" | "skills" | "permissions" | null
  >(null);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const selected = skills.find((skill) => skill.id === skillId);
  const attachedFiles = files.filter((file) => attachments.includes(file.id));
  const submit = async () => {
    if (!value.trim() || running || disabled || uploading) return;
    if (
      await onSend({
        prompt: value.trim(),
        fileIds: attachedFiles.map((f) => f.id),
        skillId: skillId || undefined,
        model,
      })
    ) {
      setAttachments([]);
      textarea.current?.focus();
    }
  };
  const upload = async (list: FileList | null) => {
    if (!list) return;
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        if (file.size > 1024 * 1024) throw new Error("每个文件不能超过 1 MB");
        if (!/\.(txt|md|csv|json|log)$/i.test(file.name))
          throw new Error("支持 TXT、Markdown、CSV、JSON 和 LOG 文件");
        const result = await api<WorkspaceFile>("/files", {
          method: "POST",
          body: JSON.stringify({ name: file.name, content: await file.text() }),
        });
        setAttachments((previous) => [...new Set([...previous, result.id])]);
      }
      await onUpload();
      setPicker(null);
      notify("文件已添加到这次任务");
    } catch (error) {
      notify(error instanceof Error ? error.message : "上传失败");
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div className="composer-wrap">
      <div className={`composer ${running ? "is-running" : ""}`}>
        {(selected || attachedFiles.length > 0) && (
          <div className="composer-context">
            {selected && (
              <span className="context-chip skill">
                <Layers3 size={13} />
                {selected.name}
                <button onClick={() => onSkill("")} aria-label="移除技能">
                  <X size={12} />
                </button>
              </span>
            )}
            {attachedFiles.map((file) => (
              <span className="context-chip" key={file.id}>
                <FileText size={13} />
                {file.name}
                <button
                  onClick={() =>
                    setAttachments((ids) => ids.filter((id) => id !== file.id))
                  }
                  aria-label={`移除附件 ${file.name}`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={textarea}
          value={value}
          aria-label="描述你的任务"
          placeholder="描述你的任务，或用 / 选择一个技能"
          rows={2}
          maxLength={20000}
          disabled={disabled}
          onChange={(event) => {
            const text = event.target.value;
            onChange(text);
            if (text === "/") {
              setPicker("skills");
              onChange("");
            }
            if (text === "@") {
              setPicker("files");
              onChange("");
            }
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              !composing.current &&
              event.keyCode !== 229
            ) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <div className="composer-toolbar">
          <div className="composer-tools">
            <button
              className="composer-add icon-button"
              aria-label="添加附件"
              title="添加附件"
              disabled={uploading}
              onClick={() => setPicker("files")}
            >
              <Plus size={19} />
            </button>
            <button
              className="composer-tool"
              onClick={() => setPicker("skills")}
            >
              <Layers3 size={15} />
              <span>技能</span>
            </button>
            <span className="toolbar-divider" />
            <button
              className="permission-control"
              onClick={() => setPicker("permissions")}
            >
              <ShieldCheck size={14} />
              <span>工作区权限</span>
              <ChevronDown size={11} />
            </button>
          </div>
          <div className="composer-actions">
            <label className="model-select">
              <select
                value={model}
                aria-label="选择模型模式"
                onChange={(event) => setModel(event.target.value as ModelMode)}
              >
                <option value="auto">Auto</option>
                <option value="fast">快速回答</option>
                <option value="thinking">深度思考</option>
              </select>
              <ChevronDown size={12} />
            </label>
            {running ? (
              <button
                className="send-button stopping"
                aria-label="停止生成"
                title="停止生成"
                onClick={onStop}
              >
                <Square size={17} fill="currentColor" />
              </button>
            ) : (
              <button
                className="send-button"
                aria-label="发送任务"
                title="发送任务"
                disabled={!value.trim() || disabled || uploading}
                onClick={() => void submit()}
              >
                <ArrowUp size={21} />
              </button>
            )}
          </div>
        </div>
        <input
          ref={input}
          type="file"
          accept=".txt,.md,.csv,.json,.log"
          multiple
          hidden
          onChange={(event) => void upload(event.target.files)}
        />
      </div>
      <div className="composer-footnote">
        <span>AI 也可能出错，请核实重要信息</span>
        <span className="keyboard-tip">Enter 发送 · Shift + Enter 换行</span>
      </div>
      <Dialog
        open={picker === "files"}
        title="添加任务资料"
        onClose={() => setPicker(null)}
      >
        <button
          className="upload-option"
          disabled={uploading}
          onClick={() => input.current?.click()}
        >
          <Upload size={20} />
          <span>
            <strong>{uploading ? "正在上传…" : "从电脑上传"}</strong>
            <small>TXT、Markdown、CSV、JSON、LOG · 单个文件最大 1 MB</small>
          </span>
          <Plus size={16} />
        </button>
        <h3 className="dialog-section-title">工作区文件</h3>
        <div className="file-picker-list">
          {files.map((file) => (
            <button
              key={file.id}
              className="file-picker-item"
              onClick={() =>
                setAttachments((ids) =>
                  ids.includes(file.id)
                    ? ids.filter((id) => id !== file.id)
                    : [...ids, file.id],
                )
              }
            >
              <FileText size={18} />
              <span>{file.name}</span>
              {attachments.includes(file.id) ? (
                <Check size={17} className="accent-text" />
              ) : (
                <Plus size={15} />
              )}
            </button>
          ))}
          {!files.length && (
            <p className="muted">还没有文件，上传一份资料开始吧。</p>
          )}
        </div>
        <div className="dialog-actions">
          <button
            className="button button-primary"
            onClick={() => setPicker(null)}
          >
            完成
            {attachments.length > 0 ? ` · 已选 ${attachments.length} 份` : ""}
          </button>
        </div>
      </Dialog>
      <Dialog
        open={picker === "skills"}
        title="让专业技能加入任务"
        onClose={() => setPicker(null)}
      >
        <p className="dialog-description">
          选择适合的工作方式，AI 会按照技能要求完成任务。
        </p>
        <div className="skill-picker-list">
          {skills.map((skill) => (
            <button
              className="skill-picker-item"
              key={skill.id}
              onClick={() => {
                onSkill(skill.id);
                setPicker(null);
                textarea.current?.focus();
              }}
            >
              <span className="skill-picker-icon">
                <Layers3 size={18} />
              </span>
              <span>
                <strong>{skill.name}</strong>
                <small>{skill.description}</small>
              </span>
              {skill.id === skillId && <Check size={17} />}
            </button>
          ))}
        </div>
      </Dialog>
      <Dialog
        open={picker === "permissions"}
        title="工作区权限"
        onClose={() => setPicker(null)}
      >
        <div className="permission-info">
          <ShieldCheck size={30} />
          <p>AI 可以读取你为任务选择的文件，并将生成的文档保存到文件空间。</p>
          <ul>
            <li>只读取当前任务中引用的资料</li>
            <li>生成的文档可预览、下载和删除</li>
            <li>不会执行终端命令或访问其他本机文件</li>
          </ul>
        </div>
      </Dialog>
    </div>
  );
}
