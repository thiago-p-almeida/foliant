import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcDir = path.join(root, "src");
const distDir = path.join(root, "dist");

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

await cp(path.join(srcDir, "index.html"), path.join(distDir, "index.html"));
await cp(path.join(srcDir, "styles.css"), path.join(distDir, "styles.css"));
await cp(path.join(srcDir, "assets"), path.join(distDir, "assets"), { recursive: true });

await build({
  entryPoints: [path.join(srcDir, "main.js")],
  bundle: true,
  format: "esm",
  outfile: path.join(distDir, "main.js"),
  target: "es2021",
});
