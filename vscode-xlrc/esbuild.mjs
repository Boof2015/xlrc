import { context } from "esbuild";

const watch = process.argv.includes("--watch");
const buildTests = process.argv.includes("--tests");

const runtimeBuilds = [
  {
    entryPoints: ["src/extension.ts"],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: "dist/extension.js",
    external: ["vscode"],
    sourcemap: true,
    logLevel: "info"
  },
  {
    entryPoints: ["src/webview/main.ts"],
    bundle: true,
    platform: "browser",
    target: "es2020",
    format: "iife",
    outfile: "dist/webview/main.js",
    sourcemap: true,
    logLevel: "info"
  }
];

const testBuilds = [
  {
    entryPoints: ["src/test/runTest.ts"],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: "dist/test/runTest.js",
    external: ["vscode"],
    sourcemap: true,
    logLevel: "info"
  },
  {
    entryPoints: [
      "src/test/suite/index.ts",
      "src/test/suite/extension.test.ts"
    ],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outdir: "dist/test/suite",
    external: ["vscode", "mocha"],
    sourcemap: true,
    logLevel: "info"
  }
];

const builds = buildTests ? testBuilds : runtimeBuilds;
const contexts = await Promise.all(builds.map((options) => context(options)));

if (watch) {
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log("Watching XLRC Editor extension sources...");
} else {
  await Promise.all(contexts.map((ctx) => ctx.rebuild()));
  await Promise.all(contexts.map((ctx) => ctx.dispose()));
}
