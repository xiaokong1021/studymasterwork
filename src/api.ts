import type { RunEvent, RunInput } from "../shared/types";

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("无法读取服务响应，请检查本地服务是否正在运行");
  }
  if (!response.ok) throw new Error(result.error || "请求未完成，请重试");
  return result as T;
}

export async function streamTask(
  id: string,
  input: RunInput,
  signal: AbortSignal,
  onEvent: (event: RunEvent) => void,
) {
  const response = await fetch(`/api/tasks/${encodeURIComponent(id)}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) {
    const body = await response.json();
    throw new Error(body.error || "任务启动失败");
  }
  if (!response.body) throw new Error("浏览器未能连接任务事件流");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal = false;
  const consume = (frame: string) => {
    const raw = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!raw) return;
    const event = JSON.parse(raw) as RunEvent;
    if (event.type === "done" || event.type === "error") terminal = true;
    onEvent(event);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        consume(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
      }
      if (done) break;
    }
    if (buffer.trim()) consume(buffer);
    if (!terminal) throw new Error("连接已中断，请检查任务状态后重试");
  } finally {
    reader.releaseLock();
  }
}
