import "dotenv/config";
import path from "node:path";
import { createApp } from "./app.ts";
import { loadProviderConfig } from "./config.ts";

const port = Number(process.env.PORT ?? 3018);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT 必须是有效端口");
const app = createApp({
  dataDir: process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve("data"),
  ...loadProviderConfig(),
});
const server = app.listen(port, "127.0.0.1", () => {
  console.log(
    `Study Work: http://127.0.0.1:${port} (${app.locals.harness.provider.mode})`,
  );
});
const shutdown = async () => {
  await app.locals.close();
  server.close(() => process.exit(0));
};
process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});
