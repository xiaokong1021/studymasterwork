import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  openSync,
  fsyncSync,
  closeSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  Automation,
  Skill,
  Task,
  WorkspaceFile,
} from "../shared/types.ts";

export const newId = () => randomUUID();
export const now = () => new Date().toISOString();
export const validId = (value: string) =>
  /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value);
export const textExtension = /\.(txt|md|csv|json|log)$/i;
export const MAX_FILE_BYTES = 1024 * 1024;

export const skills: Skill[] = [
  {
    id: "research",
    name: "深度调研",
    description: "拆解问题、比较方案，整理一份有依据的研究报告。",
    category: "分析",
    icon: "search",
    prompt:
      "你是严谨的研究助理。先澄清研究范围，按维度比较，区分已知事实、推断和待验证信息。没有联网工具时不要声称检索了网络；给出验证路径。产出结构清晰的中文报告。",
    starter: "帮我调研一个行业趋势，比较主要参与者并提炼机会。",
  },
  {
    id: "writing",
    name: "专业写作",
    description: "把零散想法变成表达清晰、重点突出的专业内容。",
    category: "写作",
    icon: "pen",
    prompt:
      "你是中文编辑。围绕读者、目的和关键信息写作，结论先行，删除空话，保留具体事实，不编造数据。",
    starter: "帮我把下面的想法整理成一篇专业、清晰的文章。",
  },
  {
    id: "report",
    name: "周报助手",
    description: "梳理本周进展、风险和下一步行动。",
    category: "效率",
    icon: "clipboard",
    prompt:
      "将用户提供的信息整理为本周成果、进行中事项、风险与所需支持、下周计划。明确负责人和时间；未知信息标记待补充，不虚构工作成果。",
    starter: "帮我整理本周工作周报，突出成果、风险和下周计划。",
  },
  {
    id: "data",
    name: "数据分析",
    description: "从文本表格中识别变化、异常和可执行的建议。",
    category: "分析",
    icon: "chart",
    prompt:
      "你是数据分析师。仅使用实际读取的数据，说明口径、样本和限制，展示关键计算，区分相关和因果。提出可以验证的下一步。",
    starter: "分析我上传的数据，找出主要趋势、异常和可执行建议。",
  },
  {
    id: "meeting",
    name: "会议纪要",
    description: "提炼会议结论、待办事项和负责人。",
    category: "效率",
    icon: "message",
    prompt:
      "根据会议原文整理主题、讨论摘要、已确认决策和行动项。行动项包含负责人、截止时间；缺失则写待确认，保留分歧。",
    starter: "帮我整理这份会议记录，提取决策和行动项。",
  },
  {
    id: "polish",
    name: "文案润色",
    description: "调整语气和结构，让文字更简洁、更有说服力。",
    category: "写作",
    icon: "sparkles",
    prompt:
      "保留用户原意和事实，改善文字结构、准确性和可读性。根据使用场景选择语气，给出润色结果和简短修改说明。",
    starter: "帮我润色这段文字，让表达更简洁自然。",
  },
];

interface State {
  version: 1;
  tasks: Task[];
  files: WorkspaceFile[];
  contents: Record<string, string>;
  automations: Automation[];
}

const seedReport = `> 演示内容 · 以下为示例观察，未进行实时联网检索。

已将 AI 产品调研整理为一份周报，可作为团队讨论的起点。

### 本周值得关注

- **从问答走向任务协作**：用户更期待可交付的结果，过程可见和随时停止成为基础体验。
- **上下文决定实用性**：连接已有文件、历史任务与团队知识，能减少重复说明。
- **质量需要可验证**：清楚标记依据、未知信息和执行结果，有助于降低审查成本。

### 下一步

访谈 5 位目标用户，收集真实任务；用完成质量、审查时间和单任务成本评估方案。当前产品功能与价格仍需查阅官方资料确认。
`;
const seedNotes = `# 产品调研笔记

> 演示资料，供体验附件读取。

观察方向：任务协作、上下文连接、产出可验证。
用户访谈计划：收集 5 位用户最近一次真实工作任务。
评估维度：完成质量、人工审查耗时、单任务成本。
`;

function initialState(): State {
  const createdAt = now();
  const tasks: Task[] = [
    {
      id: "demo-research",
      title: "整理 AI 产品调研，生成一份周报",
      project: "内容工作室",
      createdAt,
      updatedAt: createdAt,
      status: "completed",
      demo: true,
      messages: [
        {
          id: "demo-user",
          role: "user",
          content:
            "请根据产品调研笔记，整理 AI 产品的最新观察，生成一份简洁的周报。",
          fileIds: ["demo-notes"],
          createdAt,
          skillId: "research",
        },
        {
          id: "demo-assistant",
          role: "assistant",
          content: seedReport,
          createdAt,
          status: "completed",
          demo: true,
          durationMs: 4200,
          steps: [
            {
              id: "demo-step-1",
              label: "明确研究范围与分析维度",
              status: "completed",
            },
            {
              id: "demo-step-2",
              label: "整理产品趋势与关键观察",
              status: "completed",
              detail: "演示分析，未进行实时联网检索",
            },
            {
              id: "demo-step-3",
              label: "生成 Markdown 研究报告",
              status: "completed",
            },
          ],
          artifactIds: ["demo-report"],
        },
      ],
    },
    {
      id: "demo-weekly",
      title: "制定下周内容发布计划",
      project: "内容工作室",
      createdAt,
      updatedAt: createdAt,
      status: "idle",
      demo: true,
      messages: [],
    },
    {
      id: "demo-feedback",
      title: "整理会议记录与行动项",
      project: "工作项目",
      createdAt,
      updatedAt: createdAt,
      status: "idle",
      demo: true,
      messages: [],
    },
  ];
  return {
    version: 1,
    tasks,
    files: [
      {
        id: "demo-report",
        name: "AI 产品观察周报.md",
        size: Buffer.byteLength(seedReport),
        createdAt,
        kind: "artifact",
        taskId: tasks[0].id,
      },
      {
        id: "demo-notes",
        name: "产品调研笔记.md",
        size: Buffer.byteLength(seedNotes),
        createdAt,
        kind: "upload",
      },
    ],
    contents: { "demo-report": seedReport, "demo-notes": seedNotes },
    automations: [],
  };
}

/** A single-process store. Every write is flushed before replacing the previous snapshot. */
export class Store {
  readonly state: State;
  readonly filePath: string;
  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    this.filePath = path.join(dataDir, "workspace.json");
    if (existsSync(this.filePath)) {
      const data = JSON.parse(readFileSync(this.filePath, "utf8")) as State;
      if (
        data.version !== 1 ||
        !Array.isArray(data.tasks) ||
        !Array.isArray(data.files) ||
        !Array.isArray(data.automations) ||
        !data.contents ||
        typeof data.contents !== "object"
      )
        throw new Error("工作区数据格式不受支持");
      this.state = data;
    } else this.state = initialState();
    for (const task of this.state.tasks) {
      if (task.status !== "running") continue;
      task.status = "stopped";
      task.updatedAt = now();
      for (const message of task.messages)
        if (message.status === "running") {
          message.status = "stopped";
          message.error =
            "本地服务曾中断，任务已停止；已生成内容已保留，请重新发送继续。";
          for (const step of message.steps ?? [])
            if (step.status === "running") step.status = "failed";
        }
    }
    this.save();
  }
  save() {
    const temp = `${this.filePath}.${process.pid}.${newId()}.tmp`;
    writeFileSync(temp, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    const handle = openSync(temp, "r");
    try {
      fsyncSync(handle);
    } finally {
      closeSync(handle);
    }
    renameSync(temp, this.filePath);
    const directory = openSync(path.dirname(this.filePath), "r");
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  }
  task(id: string) {
    return this.state.tasks.find((task) => task.id === id);
  }
  file(id: string) {
    return this.state.files.find((file) => file.id === id);
  }
  automation(id: string) {
    return this.state.automations.find((item) => item.id === id);
  }
  createTask(title = "新任务", project = "个人工作区") {
    const task: Task = {
      id: newId(),
      title,
      project,
      createdAt: now(),
      updatedAt: now(),
      status: "idle",
      messages: [],
    };
    this.state.tasks.unshift(task);
    this.save();
    return task;
  }
  addFile(name: string, content: string, taskId?: string) {
    const file: WorkspaceFile = {
      id: newId(),
      name,
      size: Buffer.byteLength(content),
      createdAt: now(),
      kind: taskId ? "artifact" : "upload",
      ...(taskId ? { taskId } : {}),
    };
    this.state.files.unshift(file);
    this.state.contents[file.id] = content;
    this.save();
    return file;
  }
  deleteFile(id: string) {
    this.state.files = this.state.files.filter((file) => file.id !== id);
    delete this.state.contents[id];
    for (const task of this.state.tasks)
      for (const message of task.messages) {
        if (message.fileIds)
          message.fileIds = message.fileIds.filter((fileId) => fileId !== id);
        if (message.artifactIds)
          message.artifactIds = message.artifactIds.filter(
            (fileId) => fileId !== id,
          );
      }
    this.save();
  }
  deleteTask(id: string) {
    for (const file of [...this.state.files])
      if (file.taskId === id) this.deleteFile(file.id);
    this.state.tasks = this.state.tasks.filter((task) => task.id !== id);
    for (const automation of this.state.automations)
      if (automation.lastTaskId === id) delete automation.lastTaskId;
    this.save();
  }
}
