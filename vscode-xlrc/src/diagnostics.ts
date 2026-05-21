import * as vscode from "vscode";
import { parseXLRC } from "../../src";
import { createDiagnosticData } from "./diagnosticData";

export class XlrcDiagnostics implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection("xlrc");

  refresh(document: vscode.TextDocument): void {
    if (!isXlrcDocument(document)) {
      return;
    }

    const text = document.getText();
    const parsed = parseXLRC(text);
    const diagnostics = createDiagnosticData(parsed.warnings, text).map((data) => {
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(
          data.range.startLine,
          data.range.startCharacter,
          data.range.endLine,
          data.range.endCharacter
        ),
        data.message,
        vscode.DiagnosticSeverity.Warning
      );
      diagnostic.code = data.code;
      diagnostic.source = "XLRC";
      return diagnostic;
    });

    this.collection.set(document.uri, diagnostics);
  }

  clear(uri: vscode.Uri): void {
    this.collection.delete(uri);
  }

  dispose(): void {
    this.collection.dispose();
  }
}

export function isXlrcDocument(document: vscode.TextDocument): boolean {
  return document.languageId === "xlrc" || document.uri.fsPath.toLowerCase().endsWith(".xlrc");
}
