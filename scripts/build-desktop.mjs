import { builtinModules, createRequire } from "node:module";
import { access, cp, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(root, "desktop-package");
const web = path.join(root, "dist");
const entry = path.join(root, "desktop/main.ts");

async function buildDesktop() {
  try {
    const require = createRequire(import.meta.url);
    await access(require("electron"));
  } catch (cause) {
    throw new Error("Electron runtime is missing. Run node node_modules/electron/install.js before packaging (ELECTRON_MIRROR may be set for your network).", { cause });
  }
  await Promise.all([access(path.join(web, "index.html")), access(entry)]);
  const source = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const staging = await mkdtemp(path.join(root, ".desktop-package-"));

  try {
    const result = await build({
      absWorkingDir: root,
      entryPoints: [entry],
      outfile: path.join(staging, "main.cjs"),
      bundle: true,
      platform: "node",
      target: "node22",
      format: "cjs",
      external: ["electron"],
      sourcemap: false,
      metafile: true,
      logLevel: "info",
    });

    const allowed = new Set(["electron", ...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
    const unbundled = Object.values(result.metafile.outputs)
      .flatMap((output) => output.imports)
      .filter((dependency) => dependency.external && !allowed.has(dependency.path));
    if (unbundled.length) {
      throw new Error(`Desktop requires unbundled dependencies: ${unbundled.map((entry) => entry.path).join(", ")}`);
    }

    await cp(web, path.join(staging, "web"), { recursive: true });
    await writeFile(path.join(staging, "package.json"), `${JSON.stringify({
      name: source.name,
      version: source.version,
      private: true,
      description: "Study Work desktop workspace",
      author: "Study Work",
      main: "main.cjs",
      dependencies: {},
    }, null, 2)}\n`);
    await rm(destination, { recursive: true, force: true });
    await rename(staging, destination);
    console.log("Desktop staging ready: bundled application and web interface only.");
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

// Custom electronDist preserves Electron's example app; remove it before signing.
export default async function afterPack(context) {
  if (context.electronPlatformName === "darwin") {
    const resources = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources");
    await rm(path.join(resources, "default_app.asar"), { force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildDesktop();
}
