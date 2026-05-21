import * as vscode from "vscode";
import { XlrcDiagnostics } from "./diagnostics";
import { XlrcEditorProvider } from "./xlrcEditorProvider";

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = new XlrcDiagnostics();
  const editorProvider = new XlrcEditorProvider(context);

  context.subscriptions.push(
    diagnostics,
    editorProvider.register(),
    vscode.commands.registerCommand("xlrc.openAsText", async () => editorProvider.openActiveDocumentAsText()),
    vscode.commands.registerCommand("xlrc.loadAudio", async () => editorProvider.loadAudioForActiveEditor()),
    vscode.commands.registerCommand("xlrc.clearRememberedAudio", async () =>
      editorProvider.clearRememberedAudioForActiveEditor()
    ),
    vscode.workspace.onDidOpenTextDocument((document) => diagnostics.refresh(document)),
    vscode.workspace.onDidChangeTextDocument((event) => diagnostics.refresh(event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => diagnostics.clear(document.uri))
  );

  vscode.workspace.textDocuments.forEach((document) => diagnostics.refresh(document));
}

export function deactivate(): void {
  // VS Code disposes subscriptions registered in activate.
}
