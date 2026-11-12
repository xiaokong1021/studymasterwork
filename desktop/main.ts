import { app, BrowserWindow, dialog, Menu, nativeTheme, session, shell } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { loadProviderConfig } from "../server/config.ts";
import { startDesktopServer } from "./runtime.ts";

app.setName("Study Work");
const userDataOverride = process.env.STUDY_WORK_USER_DATA_DIR;
if (userDataOverride) {
  if (!path.isAbsolute(userDataOverride))
    throw new Error("STUDY_WORK_USER_DATA_DIR 必须是绝对路径。");
  mkdirSync(userDataOverride, { recursive: true, mode: 0o700 });
  app.setPath("userData", userDataOverride);
}

let window: BrowserWindow | null = null;
let workspace: Awaited<ReturnType<typeof startDesktopServer>> | undefined;
let stopping = false;
let stopped = false;
const accessToken = randomBytes(32).toString("hex");

async function showExternalLink(url: string) {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return; }
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password)
    return;
  if (parsed.origin === workspace?.origin) return;
  const { response } = await dialog.showMessageBox({
    type: "question",
    title: "在浏览器中打开",
    message: `打开 ${parsed.hostname}？`,
    detail: "此链接将使用你的默认浏览器打开。",
    buttons: ["取消", "打开链接"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  if (response === 1) {
    try { await shell.openExternal(parsed.href); }
    catch { dialog.showErrorBox("无法打开链接", "请检查默认浏览器设置后重试。"); }
  }
}

async function openConfiguration() {
  const file = path.join(app.getPath("userData"), ".env");
  if (!existsSync(file))
    writeFileSync(file, "# 留空时自动读取本机 DeepSeek Harness / CC Switch 配置。\nDEEPSEEK_API_KEY=\nDEEPSEEK_BASE_URL=\nDEEPSEEK_MODEL=\nDSH_PROVIDER=\n", { flag: "wx", mode: 0o600 });
  const error = await shell.openPath(file);
  if (error) dialog.showErrorBox("无法打开配置文件", "请通过“打开数据文件夹”使用文本编辑器编辑 .env 文件。");
}

async function restart() {
  if (workspace?.app.locals.harness.active.size) {
    const { response } = await dialog.showMessageBox({
      type: "question", message: "重启并重新读取模型配置？",
      detail: "正在执行的任务将停止，已有内容会保留。",
      buttons: ["取消", "重启"], defaultId: 0, cancelId: 0,
    });
    if (response !== 1) return;
  }
  app.relaunch();
  app.quit();
}

function installMenu() {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "Study Work", submenu: [
        { role: "about", label: "关于 Study Work" },
        { type: "separator" },
        { label: "打开数据文件夹", click: () => { void shell.openPath(app.getPath("userData")); } },
        { label: "编辑模型配置…", click: () => { void openConfiguration().catch(() => dialog.showErrorBox("无法打开配置", "请检查数据文件夹的写入权限。")); } },
        { label: "重新载入模型配置", click: () => { void restart(); } },
        { type: "separator" },
        { role: "services", label: "服务" },
        { role: "hide", label: "隐藏 Study Work" },
        { role: "hideOthers", label: "隐藏其他应用" },
        { role: "unhide", label: "显示全部" },
        { type: "separator" },
        { role: "quit", label: "退出 Study Work" },
      ],
    },
    { label: "编辑", submenu: [
      { role: "undo", label: "撤销" }, { role: "redo", label: "重做" },
      { type: "separator" }, { role: "cut", label: "剪切" },
      { role: "copy", label: "复制" }, { role: "paste", label: "粘贴" },
      { role: "selectAll", label: "全选" },
    ] },
    { label: "显示", submenu: [
      { role: "reload", label: "刷新窗口" }, { type: "separator" },
      { role: "resetZoom", label: "实际大小" }, { role: "zoomIn", label: "放大" },
      { role: "zoomOut", label: "缩小" }, { type: "separator" },
      { role: "togglefullscreen", label: "进入全屏幕" },
    ] },
    { label: "窗口", submenu: [
      { role: "minimize", label: "最小化" }, { role: "zoom", label: "缩放" },
      { type: "separator" }, { role: "front", label: "前置全部窗口" },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  if (!workspace) return;
  const origin = workspace.origin;
  const instance = new BrowserWindow({
    title: "Study Work", width: 1440, height: 960, minWidth: 920, minHeight: 640,
    backgroundColor: "#111113", show: false,
    webPreferences: {
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webSecurity: true, allowRunningInsecureContent: false,
      webviewTag: false, safeDialogs: true, spellcheck: false,
    },
  });
  window = instance;
  instance.webContents.setWindowOpenHandler(({ url }) => {
    void showExternalLink(url);
    return { action: "deny" };
  });
  const navigation = (event: Electron.Event, url: string) => {
    let allowed = false;
    try { allowed = new URL(url).origin === origin; } catch { /* Reject malformed destinations. */ }
    if (!allowed) {
      event.preventDefault();
      void showExternalLink(url);
    }
  };
  instance.webContents.on("will-navigate", navigation);
  instance.webContents.on("will-redirect", navigation);
  instance.webContents.on("will-attach-webview", (event) => event.preventDefault());
  instance.on("closed", () => { if (window === instance) window = null; });
  instance.once("ready-to-show", () => instance.show());
  await instance.loadURL(origin);
}

async function launch() {
  mkdirSync(app.getPath("userData"), { recursive: true, mode: 0o700 });
  loadEnv({ path: path.join(app.getPath("userData"), ".env"), quiet: true });
  const providerConfig = loadProviderConfig();
  workspace = await startDesktopServer({
    dataDir: path.join(app.getPath("userData"), "workspace"),
    staticDir: path.join(app.getAppPath(), "web"),
    accessToken, providerConfig,
  });
  const origin = workspace.origin;
  const desktopSession = session.defaultSession;
  desktopSession.webRequest.onBeforeSendHeaders({ urls: [`${origin}/*`] }, (details, callback) => {
    callback({ requestHeaders: { ...details.requestHeaders, "X-Study-Work-Token": accessToken } });
  });
  desktopSession.setPermissionRequestHandler((contents, permission, callback) => {
    callback(permission === "clipboard-sanitized-write" && contents.getURL().startsWith(`${origin}/`));
  });
  desktopSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) =>
    permission === "clipboard-sanitized-write" && requestingOrigin === origin);
  desktopSession.on("will-download", (_event, item) => {
    item.setSaveDialogOptions({ title: "保存文件", defaultPath: path.join(app.getPath("downloads"), path.basename(item.getFilename())) });
  });
  nativeTheme.themeSource = "dark";
  app.setAboutPanelOptions({ applicationName: "Study Work", applicationVersion: app.getVersion(), copyright: "Study Work · AI 工作台" });
  installMenu();
  await createWindow();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    } else if (workspace && !stopping) {
      void createWindow();
    }
  });
  app.on("activate", () => {
    if (!window && workspace && !stopping) void createWindow();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", (event) => {
    if (stopped) return;
    event.preventDefault();
    if (stopping) return;
    stopping = true;
    void (async () => {
      try { await workspace?.close(); }
      finally { stopped = true; app.quit(); }
    })();
  });
  void app.whenReady().then(launch).catch(async () => {
    await dialog.showMessageBox({
      type: "error", title: "Study Work 无法启动", message: "本地工作台启动失败。",
      detail: "请检查 DeepSeek Harness 的供应商、模型和密钥配置，以及本机数据目录权限。修改后重新打开应用。",
      buttons: ["退出", "打开 Harness 配置目录"], cancelId: 0,
    }).then(async ({ response }) => {
      if (response === 1) await shell.openPath(path.join(homedir(), ".dsh"));
    });
    app.quit();
  });
}
