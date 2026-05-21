import * as path from "node:path";
import * as vscode from "vscode";
import { parseXLRC } from "../../src";
import { AudioStore } from "./audioStore";
import { getWebviewHtml } from "./webviewHtml";
import { isWebviewToHostMessage, type HostToWebviewMessage } from "./shared/messages";

interface ActiveWebview {
  document: vscode.TextDocument;
  webview: vscode.Webview;
}

export class XlrcEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = "xlrc.editor";

  private readonly audioStore: AudioStore;
  private readonly webviewsByDocument = new Map<string, Set<vscode.Webview>>();
  private readonly documentsByKey = new Map<string, vscode.TextDocument>();
  private activeDocumentKey: string | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.audioStore = new AudioStore(context.workspaceState);
  }

  register(): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(XlrcEditorProvider.viewType, this, {
      webviewOptions: {
        retainContextWhenHidden: true
      },
      supportsMultipleEditorsPerDocument: true
    });
  }

  resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    this.trackWebview(document, webviewPanel);

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "dist")]
    };
    webviewPanel.webview.html = getWebviewHtml(webviewPanel.webview, this.context.extensionUri);

    const disposables: vscode.Disposable[] = [];
    disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() === document.uri.toString()) {
          this.postDocument(document, webviewPanel.webview);
        }
      })
    );
    disposables.push(
      webviewPanel.webview.onDidReceiveMessage(async (rawMessage: unknown) => {
        if (!isWebviewToHostMessage(rawMessage)) {
          return;
        }

        this.activeDocumentKey = document.uri.toString();
        switch (rawMessage.type) {
          case "ready":
            this.postDocument(document, webviewPanel.webview);
            await this.loadRememberedAudio(document, webviewPanel.webview);
            break;
          case "edit":
            await replaceDocumentText(document, rawMessage.text);
            break;
          case "replaceText":
            await replaceDocumentText(document, rawMessage.text);
            break;
          case "save":
            await replaceDocumentText(document, rawMessage.text);
            await document.save();
            break;
          case "loadAudio":
            await this.pickAndLoadAudio(document);
            break;
          case "clearAudio":
            await this.clearRememberedAudio(document);
            break;
          case "openAsText":
            await this.openDocumentAsText(document.uri);
            break;
        }
      })
    );
    disposables.push(
      webviewPanel.onDidChangeViewState((event) => {
        if (event.webviewPanel.active) {
          this.activeDocumentKey = document.uri.toString();
        }
      })
    );
    webviewPanel.onDidDispose(() => {
      disposables.forEach((disposable) => disposable.dispose());
      this.untrackWebview(document, webviewPanel.webview);
    });

    this.activeDocumentKey = document.uri.toString();
  }

  async loadAudioForActiveEditor(): Promise<void> {
    const active = this.getActiveWebview();
    if (!active) {
      vscode.window.showWarningMessage("Open an XLRC editor before loading audio.");
      return;
    }

    await this.pickAndLoadAudio(active.document);
  }

  async clearRememberedAudioForActiveEditor(): Promise<void> {
    const document = this.getActiveDocument();
    if (!document) {
      vscode.window.showWarningMessage("Open an XLRC editor before clearing remembered audio.");
      return;
    }

    await this.clearRememberedAudio(document);
  }

  async openActiveDocumentAsText(): Promise<void> {
    const document = this.getActiveDocument();
    if (!document) {
      vscode.window.showWarningMessage("Open an XLRC file before reopening it as text.");
      return;
    }

    await this.openDocumentAsText(document.uri);
  }

  private trackWebview(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel): void {
    const key = document.uri.toString();
    let webviews = this.webviewsByDocument.get(key);
    if (!webviews) {
      webviews = new Set();
      this.webviewsByDocument.set(key, webviews);
    }

    webviews.add(webviewPanel.webview);
    this.documentsByKey.set(key, document);
  }

  private untrackWebview(document: vscode.TextDocument, webview: vscode.Webview): void {
    const key = document.uri.toString();
    const webviews = this.webviewsByDocument.get(key);
    webviews?.delete(webview);
    if (!webviews || webviews.size === 0) {
      this.webviewsByDocument.delete(key);
      this.documentsByKey.delete(key);
      if (this.activeDocumentKey === key) {
        this.activeDocumentKey = undefined;
      }
    }
  }

  private postDocument(document: vscode.TextDocument, webview: vscode.Webview): void {
    const parsed = parseXLRC(document.getText());
    void post(webview, {
      type: "document",
      text: document.getText(),
      fileName: document.uri.scheme === "untitled" ? "Untitled XLRC" : path.basename(document.uri.fsPath),
      isDirty: document.isDirty,
      warnings: parsed.warnings
    });
  }

  private getActiveWebview(): ActiveWebview | undefined {
    const document = this.getActiveDocument();
    if (!document) {
      return undefined;
    }

    const webview = this.webviewsByDocument.get(document.uri.toString())?.values().next().value;
    return webview ? { document, webview } : undefined;
  }

  private getActiveDocument(): vscode.TextDocument | undefined {
    if (this.activeDocumentKey) {
      const active = this.documentsByKey.get(this.activeDocumentKey);
      if (active) {
        return active;
      }
    }

    const activeTextDocument = vscode.window.activeTextEditor?.document;
    if (activeTextDocument && activeTextDocument.uri.fsPath.toLowerCase().endsWith(".xlrc")) {
      return activeTextDocument;
    }

    return undefined;
  }

  private async pickAndLoadAudio(document: vscode.TextDocument): Promise<void> {
    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      title: "Load audio for XLRC",
      filters: {
        Audio: ["mp3", "flac", "wav", "m4a", "ogg", "aac", "opus"]
      }
    });

    const audioUri = selected?.[0];
    if (!audioUri) {
      return;
    }

    const sent = await this.postAudioToDocumentWebviews(document, audioUri, false);
    if (sent) {
      await this.audioStore.set(document.uri, audioUri);
    }
  }

  private async loadRememberedAudio(document: vscode.TextDocument, webview: vscode.Webview): Promise<void> {
    const remembered = this.audioStore.get(document.uri);
    if (!remembered) {
      return;
    }

    const audioUri = vscode.Uri.parse(remembered);
    const sent = await this.postAudio(webview, audioUri, true);
    if (!sent) {
      await post(webview, {
        type: "audioError",
        message: "Remembered audio could not be loaded."
      });
      vscode.window.showWarningMessage(`XLRC remembered audio could not be loaded: ${audioUri.fsPath}`);
    }
  }

  private async clearRememberedAudio(document: vscode.TextDocument): Promise<void> {
    await this.audioStore.clear(document.uri);
    await this.postToDocumentWebviews(document, { type: "audioCleared" });
  }

  private async postAudioToDocumentWebviews(document: vscode.TextDocument, audioUri: vscode.Uri, remembered: boolean): Promise<boolean> {
    const webviews = [...(this.webviewsByDocument.get(document.uri.toString()) ?? [])];
    if (webviews.length === 0) {
      return false;
    }

    let message: HostToWebviewMessage | undefined;
    try {
      const bytes = await vscode.workspace.fs.readFile(audioUri);
      message = {
        type: "audioData",
        name: path.basename(audioUri.fsPath),
        mime: guessAudioMime(audioUri.fsPath),
        base64: Buffer.from(bytes).toString("base64"),
        remembered
      };
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      vscode.window.showWarningMessage(`XLRC audio could not be loaded: ${details}`);
      await this.postToDocumentWebviews(document, {
        type: "audioError",
        message: "Audio could not be loaded."
      });
      return false;
    }

    await Promise.all(webviews.map((webview) => post(webview, message)));
    return true;
  }

  private async postAudio(webview: vscode.Webview, audioUri: vscode.Uri, remembered: boolean): Promise<boolean> {
    try {
      const bytes = await vscode.workspace.fs.readFile(audioUri);
      return post(webview, {
        type: "audioData",
        name: path.basename(audioUri.fsPath),
        mime: guessAudioMime(audioUri.fsPath),
        base64: Buffer.from(bytes).toString("base64"),
        remembered
      });
    } catch {
      return false;
    }
  }

  private async postToDocumentWebviews(document: vscode.TextDocument, message: HostToWebviewMessage): Promise<void> {
    const webviews = this.webviewsByDocument.get(document.uri.toString()) ?? new Set();
    await Promise.all([...webviews].map((webview) => post(webview, message)));
  }

  private async openDocumentAsText(uri: vscode.Uri): Promise<void> {
    await vscode.commands.executeCommand("vscode.openWith", uri, "default");
  }
}

async function replaceDocumentText(document: vscode.TextDocument, text: string): Promise<void> {
  if (document.getText() === text) {
    return;
  }

  const edit = new vscode.WorkspaceEdit();
  const lastLine = document.lineAt(document.lineCount - 1);
  edit.replace(document.uri, new vscode.Range(new vscode.Position(0, 0), lastLine.range.end), text);
  await vscode.workspace.applyEdit(edit);
}

function guessAudioMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".mp3":
      return "audio/mpeg";
    case ".flac":
      return "audio/flac";
    case ".wav":
      return "audio/wav";
    case ".m4a":
      return "audio/mp4";
    case ".ogg":
      return "audio/ogg";
    case ".aac":
      return "audio/aac";
    case ".opus":
      return "audio/opus";
    default:
      return "application/octet-stream";
  }
}

async function post(webview: vscode.Webview, message: HostToWebviewMessage): Promise<boolean> {
  return webview.postMessage(message);
}
