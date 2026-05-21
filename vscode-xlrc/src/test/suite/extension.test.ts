import * as assert from "node:assert";
import * as path from "node:path";
import * as vscode from "vscode";

suite("XLRC extension", () => {
  test("registers the XLRC language and diagnostics", async () => {
    const document = await vscode.workspace.openTextDocument({
      language: "xlrc",
      content: "[00:99.00]bad timestamp\n"
    });

    await vscode.window.showTextDocument(document);
    await waitForDiagnostics(document.uri);

    const diagnostics = vscode.languages.getDiagnostics(document.uri);
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === "malformed-timestamp"));
  });

  test("opens fixture files with xlrc language id", async () => {
    const fixture = getFixtureUri("basic.xlrc");
    const document = await vscode.workspace.openTextDocument(fixture);

    assert.strictEqual(document.languageId, "xlrc");
  });

  test("opens fixture files with the custom editor", async () => {
    const fixture = getFixtureUri("basic.xlrc");

    await vscode.commands.executeCommand("vscode.openWith", fixture, "xlrc.editor");
    await waitFor(() => vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputCustom);

    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    assert.ok(input instanceof vscode.TabInputCustom);
    assert.strictEqual(input.viewType, "xlrc.editor");
  });

  test("contributes the custom editor command path", async () => {
    const commands = await vscode.commands.getCommands(true);

    assert.ok(commands.includes("xlrc.openAsText"));
    assert.ok(commands.includes("xlrc.loadAudio"));
    assert.ok(commands.includes("xlrc.clearRememberedAudio"));
  });
});

function getFixtureUri(name: string): vscode.Uri {
  const extension = vscode.extensions.getExtension("boof2015.xlrc-editor");
  assert.ok(extension);

  return vscode.Uri.file(path.join(extension.extensionPath, "test-fixtures", "workspace", name));
}

async function waitForDiagnostics(uri: vscode.Uri): Promise<void> {
  await waitFor(() => vscode.languages.getDiagnostics(uri).length > 0);
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
