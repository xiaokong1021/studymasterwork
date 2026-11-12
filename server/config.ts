import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parseDocument } from "yaml";
import type { ProviderInfo } from "../shared/types.ts";

type Environment = Record<string, string | undefined>;
type Mapping = Record<string, unknown>;
export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  availableModels?: string[];
  providerSource: NonNullable<ProviderInfo["source"]>;
  providerName?: string;
}

const record = (value: unknown): Mapping =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Mapping)
    : {};
const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

function readYaml(file: string, label: string): unknown {
  let source: string;
  try {
    source = readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(`无法读取 ${label}，请检查本地文件权限。`);
  }
  try {
    // Read data only: Harness supports !!js expressions, but we never execute them.
    const document = parseDocument(source);
    if (document.errors.length) throw new Error();
    return document.toJS({ maxAliasCount: 100 }) ?? {};
  } catch {
    // YAML parser errors may contain credential values; never expose their text.
    throw new Error(`${label} 格式无效，请检查 YAML 配置。`);
  }
}

function providersFrom(value: unknown): Mapping {
  if (!Array.isArray(value)) return {};
  const providers: Mapping = {};
  for (const item of value) {
    const entry = record(item);
    if (entry.id === "llm-pi-ai" && entry.disabled !== true)
      Object.assign(providers, record(record(entry.config).providers));
  }
  return providers;
}

function modelsFrom(provider: Mapping): string[] {
  const models = provider.models;
  return (Array.isArray(models) ? models : Object.values(record(models)))
    .map((model) => text(record(model).id))
    .filter(Boolean);
}

/** Resolve one complete provider on startup; credentials never enter browser state. */
export function loadProviderConfig(
  env: Environment = process.env,
  userHome = homedir(),
): ProviderConfig {
  const apiKey = text(env.DEEPSEEK_API_KEY);
  if (apiKey)
    return {
      apiKey,
      baseUrl: text(env.DEEPSEEK_BASE_URL) || "https://api.deepseek.com",
      model: text(env.DEEPSEEK_MODEL) || "deepseek-flash",
      providerSource: "environment",
    };

  const profile = text(env.DSH_PROFILE);
  if (profile && profile !== "web" && profile !== "desktop")
    throw new Error("DSH_PROFILE 只能是 web 或 desktop。");
  const root = text(env.DSH_CONFIG_DIR) || path.join(userHome, ".dsh");
  let providers: Mapping = {};
  for (const name of profile ? [profile] : ["web", "desktop"]) {
    const patch = readYaml(
      path.join(root, "profiles", name, "cordis.patch.yml"),
      `DeepSeek Harness ${name} 配置`,
    );
    if (patch !== undefined && !Array.isArray(patch))
      throw new Error(`DeepSeek Harness ${name} 配置必须是 YAML 列表。`);
    providers = providersFrom(patch);
    if (Object.keys(providers).length) break;
  }
  const requestedProvider = text(env.DSH_PROVIDER);
  const requestedModel = text(env.DEEPSEEK_MODEL);
  if (!Object.keys(providers).length) {
    if (requestedProvider || profile || text(env.DSH_CONFIG_DIR))
      throw new Error("未找到 DeepSeek Harness 供应商配置，请检查配置目录和 profile。");
    return { providerSource: "demo" };
  }
  const candidates = Object.entries(providers).filter(([, value]) => {
    const models = modelsFrom(record(value));
    return requestedModel
      ? models.includes(requestedModel)
      : models.some((model) => /^deepseek/i.test(model));
  });
  const selected = requestedProvider
    ? Object.entries(providers).find(([id]) => id === requestedProvider)
    : candidates.length === 1
      ? candidates[0]
      : undefined;
  if (!selected)
    throw new Error("无法确定 DeepSeek Harness 供应商，请用 DSH_PROVIDER 指定供应商 ID，并检查模型配置。");
  const [id, value] = selected;
  const provider = record(value);
  if (provider.api !== "openai-completions")
    throw new Error("该 Harness 供应商需要使用 openai-completions 协议。");
  const baseUrl = text(provider.baseURL);
  if (!baseUrl) throw new Error("DeepSeek Harness 供应商缺少服务地址。");

  const models = modelsFrom(provider);
  const preferred = ["deepseek-v4-flash", "deepseek-flash", "deepseek-chat", "deepseek-v4-pro"];
  const model = requestedModel || preferred.find((name) => models.includes(name)) ||
    models.find((name) => /^deepseek/i.test(name) && !/vision/i.test(name));
  if (!model || !models.includes(model))
    throw new Error("DeepSeek Harness 中没有所选模型，请检查 DEEPSEEK_MODEL 或供应商模型列表。");

  const keyRef = text(provider.apiKeyEnv);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyRef))
    throw new Error("DeepSeek Harness 供应商缺少有效的 apiKeyEnv 凭据引用。");
  let key = keyRef ? text(env[keyRef]) : "";
  if (!key) {
    const credentials = record(readYaml(path.join(root, ".credentials.yaml"), "DeepSeek Harness 凭据文件"));
    key = text(record(credentials.refs)[keyRef]);
  }
  if (!key) throw new Error("DeepSeek Harness 供应商密钥未配置，请在 CC Switch 中保存密钥后重启服务。");
  return {
    apiKey: key,
    baseUrl,
    model,
    availableModels: models.filter((name) => /^deepseek/i.test(name) && !/vision/i.test(name)),
    providerSource: "harness",
    providerName: text(provider.displayName) || id,
  };
}
