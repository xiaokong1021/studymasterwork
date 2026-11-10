import "dotenv/config";
import path from "node:path";
import { createApp } from "./app.ts";

const port = Number(process.env.PORT ?? 3018);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT 必须是有效端口");
const app = createApp({
  dataDir: process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve("data"),
  apiKey: process.env.DEEPSEEK_API_KEY,
  model: process.env.DEEPSEEK_MODEL || "deepseek-flash",
  baseUrl: process.env.DEEPSEEK_BASE_URL,
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
