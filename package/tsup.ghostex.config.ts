import { defineConfig } from "tsup";
import * as fs from "fs";
import { execSync } from "child_process";
import { scssModulesPlugin } from "./tsup.config";

// One self-contained browser script for Ghostex (see src/ghostex-bundle.ts).
// Built from a clean checkout so the commit in its header is what it contains.
const pkg = JSON.parse(fs.readFileSync("./package.json", "utf-8"));
const commit = execSync("git rev-parse HEAD").toString().trim();
const dirty = execSync("git status --porcelain -- .").toString().trim() !== "";
if (dirty && !process.env.GHOSTEX_BUNDLE_ALLOW_DIRTY) {
  throw new Error("build:ghostex needs a clean checkout so the bundle names the commit it was built from");
}
const license = fs.readFileSync("./LICENSE", "utf-8").trim();

export default defineConfig({
  entry: { "agentation-ghostex": "src/ghostex-bundle.ts" },
  outDir: "dist-ghostex",
  format: ["iife"],
  globalName: "__ghostexAgentation",
  platform: "browser",
  target: "es2020",
  minify: true,
  sourcemap: false,
  dts: false,
  clean: true,
  splitting: false,
  noExternal: [/.*/],
  esbuildPlugins: [scssModulesPlugin()],
  define: {
    __VERSION__: JSON.stringify(pkg.version),
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  outExtension: () => ({ js: ".js" }),
  esbuildOptions(options) {
    options.legalComments = "none";
  },
  banner: {
    js: `/*! Agentation ${pkg.version} (fork maddada/agentation ${commit}${dirty ? "-dirty" : ""}), bundled for Ghostex with React, ReactDOM and modern-screenshot (MIT).\n${license}\n*/`,
  },
});
