export type RunStatus = "idle" | "running" | "completed" | "failed" | "stopped";
export type ModelMode = "auto" | "fast" | "thinking";
export type ReasoningLevel = "off" | "high";
export interface Step {
  id: string;
  label: string;
  status: "running" | "completed" | "failed";
  detail?: string;
}
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  status?: RunStatus;
  steps?: Step[];
  fileIds?: string[];
  artifactIds?: string[];
  skillId?: string;
  durationMs?: number;
  demo?: boolean;
  error?: string;
  modelId?: string;
  reasoning?: ReasoningLevel;
}
export interface Task {
  id: string;
  title: string;
  project: string;
  createdAt: string;
  updatedAt: string;
  status: RunStatus;
  messages: Message[];
  demo?: boolean;
}
export interface WorkspaceFile {
  id: string;
  name: string;
  size: number;
  createdAt: string;
  kind: "upload" | "artifact";
  taskId?: string;
}
export interface Skill {
  id: string;
  name: string;
  description: string;
  category: "写作" | "分析" | "效率";
  icon: string;
  prompt: string;
  starter: string;
}
export interface Automation {
  id: string;
  name: string;
  prompt: string;
  intervalMinutes: number;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt?: string;
  lastTaskId?: string;
  skillId?: string;
}
export interface ProviderInfo {
  mode: "demo" | "live";
  model: string;
  configured: boolean;
  source?: "environment" | "harness" | "demo";
  name?: string;
  models?: string[];
}
export interface Bootstrap {
  tasks: Task[];
  files: WorkspaceFile[];
  automations: Automation[];
  skills: Skill[];
  provider: ProviderInfo;
}
export interface RunInput {
  prompt: string;
  skillId?: string;
  fileIds?: string[];
  model?: ModelMode;
  modelId?: string;
  reasoning?: ReasoningLevel;
}
export type RunEvent =
  | { type: "task"; task: Task }
  | { type: "delta"; text: string }
  | { type: "step"; step: Step }
  | { type: "done"; task: Task }
  | { type: "error"; message: string; task?: Task };
