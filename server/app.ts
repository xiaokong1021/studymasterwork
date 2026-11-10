import express from "express";
import type { ErrorRequestHandler, Request, Response } from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
import type { Automation, RunInput } from "../shared/types.ts";
import {
  CONTEXT_LIMITS,
  Harness,
  RunError,
  fileName,
  textContent,
  type HarnessOptions,
} from "./harness.ts";
import { Store, newId, now, skills, validId } from "./store.ts";

const stringId = z.string().refine(validId);
const title = z.string().trim().min(1).max(100);
const prompt = z.string().trim().min(1).max(CONTEXT_LIMITS.prompt);
const runSchema = z
  .object({
    prompt,
    skillId: stringId.optional(),
    fileIds: z.array(stringId).max(20).optional(),
    model: z.enum(["auto", "fast", "thinking"]).optional(),
  })
  .strict();
const automationSchema = z
  .object({
    name: title,
    prompt,
    intervalMinutes: z.number().int().min(1).max(525_600),
    skillId: stringId.optional(),
  })
  .strict();
const automationPatch = automationSchema
  .partial()
  .extend({ enabled: z.boolean().optional() })
  .strict();

export interface AppOptions extends HarnessOptions {
  dataDir?: string;
  staticDir?: string;
  schedulerIntervalMs?: number;
}

/** Construct an isolated local workspace server. app.locals.close() stops all work and the scheduler. */
export function createApp(options: AppOptions = {}) {
  const app = express();
  const store = new Store(options.dataDir ?? path.resolve("data"));
  const harness = new Harness(store, options);
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const host = new URL(`http://${req.get("host") ?? ""}`);
      if (!["127.0.0.1", "localhost", "[::1]"].includes(host.hostname))
        throw new Error();
    } catch {
      res.status(403).json({ error: "仅允许本机访问" });
      return;
    }
    // A browser page from another origin must not read or mutate a local workspace.
    const origin = req.get("origin");
    const fetchSite = req.get("sec-fetch-site");
    if (fetchSite === "cross-site") {
      res.status(403).json({ error: "仅允许从本地工作区访问" });
      return;
    }
    if (origin) {
      try {
        const parsed = new URL(origin);
        const host = req.get("host");
        if (
          parsed.protocol !== "http:" ||
          parsed.host !== host ||
          !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)
        )
          throw new Error();
      } catch {
        res.status(403).json({ error: "仅允许同源工作区请求" });
        return;
      }
    }
    next();
  });
  app.use(express.json({ limit: "7mb", type: "application/json" }));
  const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
    const result = schema.safeParse(body);
    if (!result.success)
      throw new RunError(400, "请求参数无效，请检查输入内容");
    return result.data;
  };
  const paramId = (req: Request) => {
    const id = req.params.id;
    if (typeof id !== "string" || !validId(id))
      throw new RunError(400, "无效的标识");
    return id;
  };
  const getTask = (req: Request) => {
    const task = store.task(paramId(req));
    if (!task) throw new RunError(404, "任务不存在");
    return task;
  };
  const getFile = (req: Request) => {
    const file = store.file(paramId(req));
    if (!file) throw new RunError(404, "文件不存在");
    return file;
  };
  const getAutomation = (req: Request) => {
    const automation = store.automation(paramId(req));
    if (!automation) throw new RunError(404, "自动任务不存在");
    return automation;
  };
  const checkSkill = (skillId?: string) => {
    if (skillId && !skills.some((skill) => skill.id === skillId))
      throw new RunError(400, "技能不存在");
  };
  const mutationBody = (req: Request, _res: Response, next: () => void) => {
    if (!req.is("application/json"))
      throw new RunError(415, "请使用 JSON 请求");
    next();
  };

  app.get("/api/bootstrap", (_req, res) => {
    res.json({
      tasks: [...store.state.tasks].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
      files: store.state.files,
      automations: store.state.automations,
      skills,
      provider: harness.provider,
    });
  });
  app.post("/api/tasks", mutationBody, (req, res) => {
    const data = parse(
      z.object({ title: title.optional(), project: title.optional() }).strict(),
      req.body,
    );
    res.status(201).json(store.createTask(data.title, data.project));
  });
  app.patch("/api/tasks/:id", mutationBody, (req, res) => {
    const task = getTask(req);
    const data = parse(
      z
        .object({ title: title.optional(), project: title.optional() })
        .strict()
        .refine((value) => Object.keys(value).length > 0),
      req.body,
    );
    Object.assign(task, data, { updatedAt: now() });
    store.save();
    res.json(task);
  });
  app.delete("/api/tasks/:id", async (req, res) => {
    const task = getTask(req);
    await harness.stop(task.id);
    store.deleteTask(task.id);
    res.json({ ok: true });
  });
  app.post("/api/tasks/:id/run", mutationBody, (req, res) => {
    const task = getTask(req);
    const input = parse(runSchema, req.body);
    harness.assertRunnable(task.id, input);
    res
      .status(200)
      .set({
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
    res.flushHeaders();
    const heartbeat = setInterval(() => {
      if (!res.destroyed && !res.writableEnded) res.write(": heartbeat\n\n");
    }, 15_000);
    heartbeat.unref();
    const abort = () => {
      void harness.stop(task.id);
    };
    res.on("close", abort);
    const run = harness.start(task.id, input, (event) => {
      if (!res.destroyed && !res.writableEnded)
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    void run.finished.finally(() => {
      clearInterval(heartbeat);
      res.off("close", abort);
      if (!res.writableEnded) res.end();
    });
  });
  app.post("/api/tasks/:id/stop", async (req, res) => {
    const task = getTask(req);
    await harness.stop(task.id);
    res.json(task);
  });
  app.post("/api/files", mutationBody, (req, res) => {
    const data = parse(
      z.object({ name: fileName, content: textContent }).strict(),
      req.body,
    );
    res.status(201).json(store.addFile(data.name, data.content));
  });
  app.get("/api/files/:id", (req, res) => {
    const file = getFile(req);
    res.json({ file, content: store.state.contents[file.id] });
  });
  app.get("/api/files/:id/download", (req, res) => {
    const file = getFile(req);
    // Both an ASCII fallback and RFC 5987 name; never interpolate a raw user name into a header.
    const encoded = encodeURIComponent(file.name).replace(
      /['()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    res.set({
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="download${path.extname(file.name).toLowerCase()}"; filename*=UTF-8''${encoded}`,
    });
    res.send(store.state.contents[file.id]);
  });
  app.delete("/api/files/:id", (req, res) => {
    const file = getFile(req);
    store.deleteFile(file.id);
    res.json({ ok: true });
  });
  app.post("/api/automations", mutationBody, (req, res) => {
    const data = parse(automationSchema, req.body);
    checkSkill(data.skillId);
    const automation: Automation = {
      id: newId(),
      ...data,
      enabled: true,
      nextRunAt: new Date(
        Date.now() + data.intervalMinutes * 60_000,
      ).toISOString(),
    };
    store.state.automations.unshift(automation);
    store.save();
    res.status(201).json(automation);
  });
  app.patch("/api/automations/:id", mutationBody, (req, res) => {
    const automation = getAutomation(req);
    const data = parse(
      automationPatch.refine((value) => Object.keys(value).length > 0),
      req.body,
    );
    checkSkill(data.skillId);
    Object.assign(automation, data);
    if (data.intervalMinutes !== undefined || data.enabled === true)
      automation.nextRunAt = new Date(
        Date.now() + automation.intervalMinutes * 60_000,
      ).toISOString();
    store.save();
    res.json(automation);
  });
  app.delete("/api/automations/:id", (req, res) => {
    const automation = getAutomation(req);
    store.state.automations = store.state.automations.filter(
      (item) => item.id !== automation.id,
    );
    store.save();
    res.json({ ok: true });
  });
  const runningAutomations = new Set<string>();
  const startAutomation = (automation: Automation) => {
    if (
      runningAutomations.has(automation.id) ||
      (automation.lastTaskId && harness.active.has(automation.lastTaskId))
    )
      throw new RunError(409, "该自动任务正在运行");
    checkSkill(automation.skillId);
    const task = store.createTask(automation.name, "自动任务");
    automation.lastRunAt = now();
    automation.nextRunAt = new Date(
      Date.now() + automation.intervalMinutes * 60_000,
    ).toISOString();
    automation.lastTaskId = task.id;
    runningAutomations.add(automation.id);
    store.save();
    const input: RunInput = {
      prompt: automation.prompt,
      skillId: automation.skillId,
    };
    const run = harness.start(task.id, input);
    void run.finished.finally(() => runningAutomations.delete(automation.id));
    return task;
  };
  app.post("/api/automations/:id/run", (req, res) => {
    res.status(201).json(startAutomation(getAutomation(req)));
  });
  const tick = () => {
    for (const automation of store.state.automations) {
      if (
        !automation.enabled ||
        Date.parse(automation.nextRunAt) > Date.now() ||
        runningAutomations.has(automation.id)
      )
        continue;
      try {
        startAutomation(automation);
      } catch (error) {
        if (error instanceof RunError && error.status === 409) continue;
        automation.enabled = false;
        // Static summary only: never print upstream errors, configured credentials or prompts.
        console.error(
          "Study Work: 自动任务启动失败，已停用；请检查任务配置后重新启用。",
        );
        store.save();
      }
    }
  };
  const scheduler = setInterval(tick, options.schedulerIntervalMs ?? 15_000);
  scheduler.unref();
  app.locals.store = store;
  app.locals.harness = harness;
  app.locals.tick = tick;
  app.locals.close = async () => {
    clearInterval(scheduler);
    await harness.close();
  };
  const staticDir = options.staticDir ?? path.resolve("dist");
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "接口不存在" });
  });
  if (existsSync(staticDir)) {
    app.use(express.static(staticDir, { index: false }));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }
  const errorHandler: ErrorRequestHandler = (
    error: unknown,
    _req,
    res,
    _next,
  ) => {
    if (res.headersSent) {
      res.end();
      return;
    }
    if (error instanceof RunError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    const bodyError = error as { type?: string };
    res
      .status(
        bodyError?.type === "entity.too.large"
          ? 413
          : bodyError?.type === "entity.parse.failed"
            ? 400
            : 500,
      )
      .json({
        error:
          bodyError?.type === "entity.too.large"
            ? "请求内容过大"
            : bodyError?.type === "entity.parse.failed"
              ? "JSON 格式无效"
              : "服务暂时无法完成请求，请重试",
      });
  };
  app.use(errorHandler);
  return app;
}
