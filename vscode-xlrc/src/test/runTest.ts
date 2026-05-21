import * as path from "node:path";
import { downloadAndUnzipVSCode, runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
  delete process.env.ELECTRON_RUN_AS_NODE;

  const extensionDevelopmentPath = path.resolve(__dirname, "../..");
  const extensionTestsPath = path.resolve(__dirname, "suite", "index");
  const vscodeVersion = process.env.VSCODE_TEST_VERSION ?? "1.92.2";
  const vscodeExecutablePath = await downloadAndUnzipVSCode(vscodeVersion);

  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: ["--disable-extensions"]
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
