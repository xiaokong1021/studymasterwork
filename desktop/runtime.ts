import type { AddressInfo } from "node:net";
import { createApp } from "../server/app.ts";
import type { ProviderConfig } from "../server/config.ts";

export interface DesktopServerOptions {
  dataDir: string;
  staticDir: string;
  accessToken: string;
  providerConfig?: ProviderConfig;
}

/** Each desktop instance owns its port, authorization token and durable workspace. */
export async function startDesktopServer(options: DesktopServerOptions) {
  if (options.accessToken.length < 32)
    throw new Error("桌面服务需要至少 32 字符的访问令牌。");
  const app = createApp({
    ...options.providerConfig,
    dataDir: options.dataDir,
    staticDir: options.staticDir,
    accessToken: options.accessToken,
  });
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
  } catch (error) {
    await app.locals.close();
    throw error;
  }
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let closing: Promise<void> | undefined;
  const close = () => {
    closing ??= (async () => {
      await app.locals.close();
      const stopped = new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      server.closeAllConnections();
      await stopped;
    })();
    return closing;
  };
  return { origin, app, close };
}
